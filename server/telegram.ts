// Telegram affiliate bot — webhook handler (runs inside the same Worker).
//
// Flow:
//   1. Student sends their registered name to the bot  → bot matches it against
//      the site's students table (Persian-normalized, disambiguated with inline
//      buttons when several students share a name) → returns a unique channel
//      invite link (one per student, stored in `referrals`).
//   2. Anyone joining the channel through that link triggers a `chat_member`
//      update that carries the invite_link → we find the referral, and the
//      FIRST time that Telegram account joins (unique per account) we add
//      REFERRAL_POINTS to the student via saveActivity (visible on the public
//      board + team points, exactly like manual activities).
//
// v2 (SaaS multi-tenant): EVERY school connects its OWN bot via the panel
// (Settings tab → token + channel). Config lives in `school_settings` per
// school and the webhook is registered as /api/telegram-webhook/<schoolId>
// with a per-school secret. The legacy env-only path (/api/telegram-webhook
// without an id) keeps working for the single-tenant deployment.
//
// The bot must be an ADMIN of the channel with the "Invite Users via Link"
// permission, and the webhook must be registered with allowed_updates
// containing "chat_member".

import {
  findStudentsByName,
  getOrCreateReferral,
  getReferralByCode,
  getReferralByInviteLink,
  getLatestReferralByTelegramUser,
  recordReferralJoin,
  countReferralJoins,
  claimReferralLeave,
  getReferralSettings,
  setReferralInviteLink,
  upsertBotGroup,
  hasTelegramReferral,
  canPromptTelegramUser,
  markTelegramPrompt,
  REFERRAL_POINTS,
  saveActivity,
  getSchoolTelegram,
  setSchoolTelegram,
  clearSchoolTelegram,
  findSchoolIdByBotToken,
} from "./db";

// ---------- config ----------
const CHANNEL_FALLBACK = "@takrahtop";

// پیکربندی مؤثر تلگرام یک مدرسه (یا مسیر قدیمی env برای تک‌مدرسه‌ای)
export type TgCfg = { schoolId: number | null; token: string; channelId: string; webhookSecret: string };

function envCfg(): TgCfg {
  return {
    schoolId: null,
    token: process.env.TELEGRAM_BOT_TOKEN ?? "",
    channelId: process.env.TELEGRAM_CHANNEL_ID?.trim() || CHANNEL_FALLBACK,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  };
}

// پیکربندی مدرسه از DB — اگر مدرسه تنظیم نکرده باشد، توکن خالی برمی‌گردد
// (یعنی «بات تنظیم نشده» — نه سقوط به env مدرسه‌های دیگر!)
export async function loadTgCfg(schoolId: number | null): Promise<TgCfg> {
  if (schoolId == null) return envCfg();
  try {
    const row = await getSchoolTelegram(schoolId);
    if (!row?.botToken) return { schoolId, token: "", channelId: "", webhookSecret: row?.webhookSecret ?? "" };
    return { schoolId, token: row.botToken, channelId: row.channelId?.trim() || "", webhookSecret: row.webhookSecret ?? "" };
  } catch {
    return { schoolId, token: "", channelId: "", webhookSecret: "" };
  }
}

function genWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

// امتیاز مؤثر هر دعوت: تنظیم مدیر مدرسه (DB) ← سکرت env ← پیش‌فرض ۳
async function referralPoints(schoolId: number | null): Promise<number> {
  try { return (await getReferralSettings(schoolId)).points; }
  catch { const n = Number(process.env.TELEGRAM_REFERRAL_POINTS ?? REFERRAL_POINTS); return Number.isFinite(n) && n > 0 ? Math.max(0.1, Math.round(n * 100) / 100) : REFERRAL_POINTS; }
}

// ---------- Telegram API ----------
async function tg(cfg: TgCfg, method: string, body: unknown): Promise<any> {
  if (!cfg.token) return { ok: false, error_code: 501, description: "بات تلگرام برای این مدرسه تنظیم نشده است" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json().catch(() => ({ ok: false, description: "invalid JSON from Telegram" }));
  } catch (e: any) {
    return { ok: false, description: String(e?.message ?? e) };
  }
}

const sendMessage = (cfg: TgCfg, chatId: number | string, text: string, replyMarkup?: unknown) =>
  tg(cfg, "sendMessage", { chat_id: chatId, text, reply_markup: replyMarkup });

// ابطال لینک دعوت از سمت تلگرام — بعد از اینکه ادمین لینک را از پنل حذف کرد،
// حتی اگر کسی لینک را ذخیره کرده باشد دیگر با آن عضو کانال نمی‌شود.
export async function revokeTelegramInviteLink(cfg: TgCfg, link: string): Promise<boolean> {
  if (!link || !cfg.channelId) return false;
  const res = await tg(cfg, "revokeChatInviteLink", { chat_id: cfg.channelId, invite_link: link });
  return Boolean(res?.ok);
}

// برچسب کانال برای متن‌های بات — @username اگر موجود باشد، وگرنه «کانال مدرسه»
function channelLabel(cfg: TgCfg): string {
  return cfg.channelId.startsWith("@") ? `کانال ${cfg.channelId}` : "کانال مدرسه";
}

// ---------- helpers ----------
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function displayName(u: any): string {
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  return name || (u?.username ? `@${u.username}` : "کاربر");
}

// ---------- معرفی افیلیت در گروه‌ها/کانال‌ها ----------
// محدودیت Telegram: بات نمی‌تواند لیست اعضای گروه را بگیرد و به کسی که ربات را
// استارت نکرده نمی‌تواند پیام خصوصی بدهد (403). راه‌حل: اعضا را از chat_member
// و پیام‌های گروه یاد می‌گیریم و به هر کسی که لینک نساخته یک‌بار پیام خصوصی می‌زنیم؛
// به کسانی که هنوز استارت نکرده‌اند، به‌محض اولین /start یا پیام دوباره تلاش می‌شود.
let _botUsernameCache = new Map<string, string>();
async function botUsername(cfg: TgCfg): Promise<string> {
  const cached = _botUsernameCache.get(cfg.token);
  if (cached) return cached;
  try { const me = await tg(cfg, "getMe", {}); if (me?.ok && me.result?.username) { const u = `@${me.result.username}`; _botUsernameCache.set(cfg.token, u); return u; } } catch { /* fallback below */ }
  return _botUsernameCache.get(cfg.token) ?? "بات مدرسه";
}
function isGroupLike(chat: any): boolean { const t = String(chat?.type ?? ""); return t === "group" || t === "supergroup"; }
function isAffiliateChat(cfg: TgCfg, chatId: number, chat: any): boolean {
  if (!cfg.channelId) return false;
  if (cfg.channelId.startsWith("@")) return String(chat?.username ?? "").toLowerCase() === cfg.channelId.slice(1).toLowerCase();
  return chatId === Number(cfg.channelId);
}

// پیام خصوصی به عضوی که هنوز لینک افیلیت نساخته: مزایا + آموزش گام‌به‌گام
async function sendAffiliatePitch(cfg: TgCfg, user: any, sourceChatId: number | null, sourceTitle: string | null, sourceKind: "group" | "channel"): Promise<void> {
  const tgUserId = Number(user?.id);
  if (!Number.isFinite(tgUserId) || tgUserId <= 0 || user?.is_bot) return;
  try {
    if (await hasTelegramReferral(tgUserId)) { await markTelegramPrompt(tgUserId, "has_link", sourceChatId, sourceTitle); return; }
    if (!(await canPromptTelegramUser(tgUserId))) return; // قبلاً پیام رفته یا تلاش اخیر ناموفق بوده
    const pts = await referralPoints(cfg.schoolId);
    const uname = await botUsername(cfg);
    const chLabel = channelLabel(cfg);
    const where = sourceTitle ? `${sourceKind === "group" ? "گروه" : "کانال"} «${sourceTitle}»` : sourceKind === "channel" ? "کانال" : "گروه";
    const res = await sendMessage(cfg, tgUserId, [
      `سلام ${displayName(user)} 👋`,
      "",
      `دیدم که در ${where} هستی، ولی هنوز لینک دعوت اختصاصی نساختی.`,
      "",
      "🎁 مزایای لینک افیلیت:",
      `• هر کس با لینک شما عضو ${chLabel} شود، ${pts} امتیاز می‌گیرید`,
      "• امتیازها به‌صورت خودکار در تابلوی دفترکلاس ثبت می‌شود",
      "• هرچقدر بیشتر دعوت کنید، امتیازتان بیشتر می‌شود",
      "",
      "📚 ساخت لینک فقط ۳۰ ثانیه طول می‌کشد:",
      `۱) روی من (${uname}) بزنید و دکمه Start را بزنید`,
      "۲) نام و نام خانوادگی خود را دقیقاً مطابق سایت دفترکلاس بفرستید",
      "۳) لینک اختصاصی‌تان را می‌گیرید؛ آن را برای دوستانتان بفرستید",
      "",
      "همین حالا /start را بفرستید تا لینک‌تان ساخته شود! 🚀",
    ].join("\n"));
    await markTelegramPrompt(tgUserId, res?.ok ? "sent" : "unreachable", sourceChatId, sourceTitle);
  } catch (e) {
    console.error("[telegram] affiliate pitch failed:", e);
  }
}

// بات به گروه/کانال اضافه (یا از آن حذف) شد
async function handleMyChatMember(cfg: TgCfg, mm: any): Promise<void> {
  const chat = mm?.chat;
  const chatId = Number(chat?.id);
  if (!chat || !Number.isFinite(chatId)) return;
  const oldStatus = String(mm?.old_chat_member?.status ?? "");
  const newStatus = String(mm?.new_chat_member?.status ?? "");
  const active = newStatus === "member" || newStatus === "administrator";
  try { await upsertBotGroup(chatId, String(chat.type ?? "group"), chat.title ?? null, active); } catch (e) { console.error("[telegram] bot_groups upsert failed:", e); }
  if (!active) return; // حذف/خروج ربات — فقط در دیتابیس غیرفعال می‌شود
  if (isAffiliateChat(cfg, chatId, chat)) return; // کانال اصلی افیلیت — اعلام لازم ندارد
  if (!(oldStatus === "left" || oldStatus === "kicked")) return; // فقط اضافه‌شدن تازه اعلام شود
  const pts = await referralPoints(cfg.schoolId);
  const uname = await botUsername(cfg);
  const chLabel = channelLabel(cfg);
  await sendMessage(cfg, chatId, [
    "سلام! 👋 ربات دعوت دفترکلاس به این‌جا اضافه شد.",
    "",
    `🎁 هر کس لینک دعوت اختصاصی بسازد و دوستانش با آن عضو ${chLabel} شوند، ${pts} امتیاز می‌گیرد.`,
    "",
    "📚 ساخت لینک (فقط ۳۰ ثانیه):",
    `۱) در پیام خصوصی روی من (${uname}) بزنید و Start را بزنید`,
    "۲) نام و نام خانوادگی خود را دقیقاً مطابق سایت دفترکلاس بفرستید",
    "۳) لینک اختصاصی را می‌گیرید و برای دوستانتان می‌فرستید",
    "",
    "به اعضایی که هنوز لینک ندارند، در پیام خصوصی یادآوری می‌کنم. ✅",
  ].join("\n"));
}

function candidateKeyboard(candidates: { id: number; firstName: string; lastName: string; className: string | null }[]) {
  return {
    inline_keyboard: candidates.map(c => [{
      text: `${c.firstName} ${c.lastName}${c.className ? ` — ${c.className}` : ""}`,
      callback_data: `ref:${c.id}`,
    }]),
  };
}

async function sendReferralLink(cfg: TgCfg, chatId: number, studentId: number, tgUser: any): Promise<void> {
  const ref = await getOrCreateReferral(studentId, {
    userId: tgUser?.id,
    chatId,
    username: tgUser?.username,
  });
  if (!ref) {
    await sendMessage(cfg, chatId, "⚠️ خطا در ثبت لینک؛ کمی بعد دوباره تلاش کنید.");
    return;
  }
  let link = ref.inviteLink;
  if (!link) {
    if (!cfg.channelId || !cfg.token) {
      await sendMessage(cfg, chatId, "⚠️ بات مدرسه هنوز کامل تنظیم نشده است؛ از مدیر مدرسه بپرسید در پنل، بخش تنظیمات، بات تلگرام را وصل کند.");
      return;
    }
    const created = await tg(cfg, "createChatInviteLink", { chat_id: cfg.channelId, name: `ref-${ref.code}` });
    if (created?.ok && created.result?.invite_link) {
      link = String(created.result.invite_link);
      await setReferralInviteLink(ref.id, link);
    } else {
      await sendMessage(cfg, chatId, [
        "⚠️ ساخت لینک اختصاصی ممکن نشد.",
        "",
        `دلیل فنی: ${created?.description ?? "نامشخص"}`,
        "",
        "معمولاً یعنی بات هنوز ادمین کانال با مجوز «Invite Users via Link» نیست.",
      ].join("\n"));
      return;
    }
  }
  const pts = await referralPoints(cfg.schoolId);
  await sendMessage(cfg, chatId, [
    `سلام ${ref.studentName} 👋`,
    "",
    "این لینک اختصاصی شما برای عضویت در کانال است:",
    link,
    "",
    `هر کس با این لینک عضو کانال شود، ${pts} امتیاز به شما اضافه می‌شود. لینک را برای دوستانتان بفرستید!`,
    "",
    `کد شما: ${ref.code}`,
  ].join("\n"));
  // این اکانت حالا لینک دارد — دیگر پیام معرفی افیلیت برایش نمی‌رود
  if (Number(tgUser?.id) > 0) await markTelegramPrompt(Number(tgUser.id), "has_link", chatId, null).catch(() => {});
}

// ---------- update handlers ----------
async function handleMessage(cfg: TgCfg, msg: any): Promise<void> {
  const chat = msg?.chat;
  const chatId = chat?.id;
  const from = msg?.from;
  if (!chatId || !from || from.is_bot) return;
  const text: string = String(msg?.text ?? "").trim();
  const chatType = String(chat?.type ?? "private");

  // در گروه/سوپرگروه: جریان «نام» فقط مخصوص پیام خصوصی است (وگرنه ربات به هر
  // پیام معمولی گروه جواب نام‌یابی می‌داد!). این‌جا فقط اعضا را برای پیچ افیلیت
  // ردیابی می‌کنیم و به /start پاسخ کوتاه آموزشی می‌دهیم.
  if (isGroupLike(chat)) {
    void upsertBotGroup(chatId, chatType, chat?.title ?? null, true).catch(() => {});
    await sendAffiliatePitch(cfg, from, chatId, chat?.title ?? null, "group");
    if (text.startsWith("/start") || text.startsWith("/link") || text.startsWith("/mylink")) {
      const pts = await referralPoints(cfg.schoolId);
      const uname = await botUsername(cfg);
      await sendMessage(cfg, chatId, [
        "برای ساخت لینک دعوت اختصاصی:",
        `۱) در پیام خصوصی به من (${uname}) دکمه Start را بزنید`,
        "۲) نام و نام خانوادگی خود را مطابق سایت دفترکلاس بفرستید",
        `۳) هر عضو از طریق لینک شما = ${pts} امتیاز`,
      ].join("\n"));
    }
    return;
  }
  if (chatType !== "private") return;

  if (text.startsWith("/start") || text.startsWith("/link") || text.startsWith("/mylink")) {
    const existing = await getLatestReferralByTelegramUser(from.id, cfg.schoolId);
    if (existing?.inviteLink) {
      const pts = await referralPoints(cfg.schoolId);
      await sendMessage(cfg, chatId, [
        `${existing.studentName} عزیز 👋`,
        "",
        "لینک اختصاصی شما:",
        existing.inviteLink,
        "",
        `هر عضو از طریق این لینک = ${pts} امتیاز برای شما. کد شما: ${existing.code}`,
      ].join("\n"));
      return;
    }
    await sendMessage(cfg, chatId, [
      "سلام! 👋",
      "",
      "برای گرفتن لینک اختصاصی دعوت، نام و نام خانوادگی خود را دقیقاً همان‌طور که در سایت دفترکلاس ثبت شده بفرستید.",
      "",
      "مثال: پارسا مقدوری",
    ].join("\n"));
    return;
  }

  if (!text) {
    await sendMessage(cfg, chatId, "لطفاً نام و نام خانوادگی خود را به صورت متنی بفرستید (مطابق سایت).");
    return;
  }

  const candidates = await findStudentsByName(text, cfg.schoolId);
  if (candidates.length === 0) {
    await sendMessage(cfg, chatId, [
      "❌ کسی با این نام در سایت پیدا نشد.",
      "",
      "لطفاً نام و نام خانوادگی را دقیقاً مطابق سایت بنویسید (مثلاً «پارسا مقدوری»).",
      "اگر مطمئن هستید نامتان ثبت شده، از مدیر کلاس بپرسید.",
    ].join("\n"));
    return;
  }
  if (candidates.length === 1) {
    await sendReferralLink(cfg, chatId, candidates[0].id, from);
    return;
  }
  await sendMessage(cfg, chatId, `${candidates.length} نفر با این نام پیدا شد؛ کدام شما هستید؟`, candidateKeyboard(candidates));
}

async function handleCallbackQuery(cfg: TgCfg, cq: any): Promise<void> {
  const chatId = cq?.message?.chat?.id;
  const from = cq?.from;
  const data = String(cq?.data ?? "");
  if (!chatId || !from || !data.startsWith("ref:")) return;
  const studentId = Number(data.slice(4));
  await tg(cfg, "answerCallbackQuery", { callback_query_id: cq.id });
  if (!Number.isInteger(studentId) || studentId <= 0) {
    await sendMessage(cfg, chatId, "این انتخاب معتبر نیست؛ دوباره نام خود را بفرستید.");
    return;
  }
  await sendReferralLink(cfg, chatId, studentId, from);
}

async function handleChatMemberUpdate(cfg: TgCfg, cu: any): Promise<void> {
  const chat = cu?.chat;
  const chatId = Number(chat?.id);
  const oldMember = cu?.old_chat_member;
  const newMember = cu?.new_chat_member;
  const user = newMember?.user ?? oldMember?.user;
  if (!chat || !Number.isFinite(chatId) || !user || user.is_bot) return;
  const oldStatus = String(oldMember?.status ?? "");
  const newStatus = String(newMember?.status ?? "");

  // گروه/کانال دیگری که بات در آن عضو است: ورود عضو → پیام خصوصی معرفی افیلیت
  if (!isAffiliateChat(cfg, chatId, chat)) {
    if ((newStatus === "member" || newStatus === "administrator") && (oldStatus === "left" || oldStatus === "kicked")) {
      await sendAffiliatePitch(cfg, user, chatId, chat?.title ?? null, String(chat?.type ?? "") === "channel" ? "channel" : "group");
    }
    return;
  }

  // --- از این‌جا به بعد: کانال اصلی افیلیت (منطق امتیاز) ---
  // عضویت جدید در کانال → امتیاز به دعوت‌کننده
  if (newStatus === "member") {
    const inviteLink = cu?.invite_link;
    if (!inviteLink?.invite_link) {
      // عضویت با لینک عمومی کانال — امتیازی ندارد، ولی چون هنوز لینک اختصاصی
      // نساخته، در پیام خصوصی مزایا و روش ساخت لینک برایش فرستاده می‌شود
      await sendAffiliatePitch(cfg, user, chatId, chat?.title ?? null, "channel");
      return;
    }

    const link: string = String(inviteLink.invite_link);
    let ref = await getReferralByInviteLink(link);
    if (!ref && typeof inviteLink.name === "string" && inviteLink.name.startsWith("ref-")) {
      ref = await getReferralByCode(inviteLink.name.slice(4));
    }
    if (!ref) return;

    const tgUserId = Number(user.id);
    if (!Number.isFinite(tgUserId) || tgUserId <= 0) return;
    const isNew = await recordReferralJoin(ref.id, tgUserId, displayName(user));
    if (!isNew) return; // همان اکانت قبلاً امتیاز گرفته

    const pts = await referralPoints(cfg.schoolId);
    try {
      await saveActivity({
        studentId: ref.studentId,
        date: todayISO(),
        title: "دعوت دوست به کانال تلگرام",
        description: `عضویت ${displayName(user)} از طریق لینک اختصاصی (${ref.code})`,
        kind: "positive",
        points: pts,
      });
    } catch (e) {
      console.error("[telegram] failed to save referral activity:", e);
      return;
    }

    // اطلاع به دعوت‌کننده (اگر خودش عضو نشده باشد)
    if (cu?.from?.id && ref.inviteLink && Number(cu.from.id) !== tgUserId) {
      const total = await countReferralJoins(ref.id);
      await sendMessage(cfg, cu.from.id, [
        "🎉 آفرین!",
        `${displayName(user)} با لینک شما عضو کانال شد؛ ${pts} امتیاز گرفتنید.`,
        `مجموع دعوت‌های موفق شما: ${total}`,
      ].join("\n"));
    }
    return;
  }

  // خروج یا محرومیت عضو از کانال → کسر امتیاز از دعوت‌کننده (فقط یک‌بار)
  if ((newStatus === "left" || newStatus === "kicked") && (oldStatus === "member" || oldStatus === "administrator" || oldStatus === "restricted")) {
    const settings = await getReferralSettings(cfg.schoolId).catch(() => null);
    if (!settings?.leavePenalty) return; // کسر امتیاز توسط ادمین خاموش شده

    const info = await claimReferralLeave(Number(user.id), cfg.schoolId);
    if (!info) return; // عضو قبلاً کسر شده یا اصلاً با لینک دعوت نیامده بود

    try {
      await saveActivity({
        studentId: info.studentId,
        date: todayISO(),
        title: "خروج عضو دعوت‌شده از کانال",
        description: `${displayName(user)} که با لینک اختصاصی (${info.code}) عضو شده بود کانال را ترک کرد؛ ${settings.points} امتیاز کسر شد`,
        kind: "negative",
        points: -settings.points,
      });
    } catch (e) {
      console.error("[telegram] failed to save leave penalty:", e);
      return;
    }

    // اطلاع به دعوت‌کننده
    if (info.referrerChatId) {
      await sendMessage(cfg, info.referrerChatId, [
        "⚠️ کسر امتیاز",
        `${displayName(user)} که با لینک شما عضو کانال شده بود، کانال را ترک کرد؛ ${settings.points} امتیاز از شما کسر شد.`,
      ].join("\n"));
    }
  }
}

// ---------- webhook entry ----------
// مسیرها:
//   POST /api/telegram-webhook            → مسیر قدیمی (پیکربندی env — تک‌مدرسه‌ای)
//   POST /api/telegram-webhook/<schoolId> → نسخه ۲ (پیکربندی per-school از DB)
export async function handleTelegramWebhook(req: Request, schoolId: number | null = null): Promise<Response> {
  const cfg = await loadTgCfg(schoolId);
  const expectedSecret = cfg.webhookSecret || (schoolId == null ? process.env.TELEGRAM_WEBHOOK_SECRET ?? "" : "");
  if (expectedSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expectedSecret) return new Response("forbidden", { status: 403 });
  }
  let update: any = null;
  try { update = await req.json(); } catch { return new Response("ok"); }

  // پردازش را await می‌کنیم (همه فراخوانی‌ها HTTP سریع هستند) و همیشه ok برمی‌گردانیم
  try {
    if (update?.message) await handleMessage(cfg, update.message);
    else if (update?.callback_query) await handleCallbackQuery(cfg, update.callback_query);
    else if (update?.chat_member) await handleChatMemberUpdate(cfg, update.chat_member);
    else if (update?.my_chat_member) await handleMyChatMember(cfg, update.my_chat_member);
  } catch (e) {
    console.error("[telegram] update processing error:", e);
  }
  return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
}

// ---------- panel-driven bot management (نسخه ۲ — تب تنظیمات) ----------------

// تست اعتبار توکن بات (getMe) — بدون ذخیره چیزی؛ برای دکمه «تست اتصال» پنل
export async function testBotToken(token: string): Promise<{ ok: boolean; botUsername?: string; botName?: string; error?: string }> {
  const clean = token.trim();
  if (!/^\d+:[\w-]{30,}$/.test(clean)) return { ok: false, error: "فرمت توکن درست نیست؛ توکن را کامل از @BotFather کپی کنید (مثل 123456789:AAE...)" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${clean}/getMe`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const json: any = await res.json().catch(() => null);
    if (json?.ok && json.result?.username) return { ok: true, botUsername: `@${json.result.username}`, botName: [json.result.first_name, json.result.last_name].filter(Boolean).join(" ") };
    return { ok: false, error: json?.description ?? "تلگرام این توکن را نپذیرفت" };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

function webhookBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.WORKER_ORIGIN || "").replace(/\/+$/, "");
}

// ثبت/به‌روزرسانی وب‌هوک بات مدرسه به سمت همین سرور با سکرت اختصاصی مدرسه
export async function registerSchoolWebhook(schoolId: number): Promise<{ ok: boolean; url?: string; info?: any; error?: string }> {
  const row = await getSchoolTelegram(schoolId);
  if (!row?.botToken) return { ok: false, error: "ابتدا توکن بات را ذخیره کنید" };
  const base = webhookBaseUrl();
  if (!base) return { ok: false, error: "آدرس عمومی سرور تنظیم نشده است (PUBLIC_BASE_URL)" };
  const cfg = await loadTgCfg(schoolId);
  const hookUrl = `${base}/api/telegram-webhook/${schoolId}`;
  const secret = row.webhookSecret || genWebhookSecret();
  const res = await tg(cfg, "setWebhook", {
    url: hookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "chat_member", "my_chat_member"],
    drop_pending_updates: false,
  });
  if (!res?.ok) return { ok: false, error: res?.description ?? "ثبت وب‌هوک ناموفق بود", url: hookUrl };
  await setSchoolTelegram(schoolId, { webhookSecret: secret, webhookUrl: hookUrl });
  const info = await tg(cfg, "getWebhookInfo", {});
  return { ok: true, url: hookUrl, info: info?.result ?? null };
}

// وضعیت وب‌هوک فعلی بات مدرسه (برای نمایش در پنل تنظیمات)
export async function getSchoolWebhookInfo(schoolId: number): Promise<any | null> {
  const cfg = await loadTgCfg(schoolId);
  if (!cfg.token) return null;
  const res = await tg(cfg, "getWebhookInfo", {});
  return res?.ok ? res.result ?? null : null;
}

// حذف وب‌هوک بات (هنگام قطع اتصال) + پاک‌کردن پیکربندی مدرسه
export async function disconnectSchoolBot(schoolId: number): Promise<{ ok: boolean; error?: string }> {
  const row = await getSchoolTelegram(schoolId);
  if (row?.botToken) {
    const cfg = await loadTgCfg(schoolId);
    await tg(cfg, "deleteWebhook", { drop_pending_updates: false }).catch(() => {});
  }
  await clearSchoolTelegram(schoolId);
  return { ok: true };
}

// ذخیره پیکربندی جدید بات مدرسه (اعتبارسنجی + سد توکن تکراری بین مدارس)
export async function saveSchoolBotConfig(schoolId: number, botToken: string, channelId: string): Promise<{ ok: boolean; botUsername?: string; botName?: string; error?: string; conflictSchoolId?: number }> {
  const cleanToken = botToken.trim();
  const cleanChannel = channelId.trim();
  const check = await testBotToken(cleanToken);
  if (!check.ok) return { ok: false, error: check.error };
  const conflict = await findSchoolIdByBotToken(cleanToken, schoolId);
  if (conflict != null) return { ok: false, conflictSchoolId: conflict, error: "این بات قبلاً برای مدرسه دیگری تنظیم شده است؛ هر مدرسه باید بات مخصوص خودش را از @BotFather بسازد." };
  await setSchoolTelegram(schoolId, { botToken: cleanToken, channelId: cleanChannel || null, botUsername: check.botUsername ?? null });
  _botUsernameCache.delete(cleanToken);
  return { ok: true, botUsername: check.botUsername, botName: check.botName };
}
