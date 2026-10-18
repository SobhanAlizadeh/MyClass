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
// Required env/secrets (set with `wrangler secret put`):
//   TELEGRAM_BOT_TOKEN       – from @BotFather
//   TELEGRAM_CHANNEL_ID      – @takrahtop (or numeric -100… id)
//   TELEGRAM_WEBHOOK_SECRET  – random string; Telegram echoes it in
//                              `X-Telegram-Bot-Api-Secret-Token`
//   TELEGRAM_REFERRAL_POINTS – optional, default 3
//
// The bot must be an ADMIN of the channel with the "Invite Users via Link"
// permission, and the webhook must be registered with allowed_updates
// containing "chat_member" (see scripts/telegram-setup.mjs).

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
} from "./db";

// ---------- config ----------
const CHANNEL_FALLBACK = "@takrahtop";
function botToken(): string { return process.env.TELEGRAM_BOT_TOKEN ?? ""; }
function channelId(): string { return process.env.TELEGRAM_CHANNEL_ID?.trim() || CHANNEL_FALLBACK; }
function webhookSecret(): string { return process.env.TELEGRAM_WEBHOOK_SECRET ?? ""; }
// امتیاز مؤثر هر دعوت: تنظیم ادمین (DB) ← سکرت env ← پیش‌فرض ۳
async function referralPoints(): Promise<number> {
  try { return (await getReferralSettings()).points; }
  catch { const n = Number(process.env.TELEGRAM_REFERRAL_POINTS ?? REFERRAL_POINTS); return Number.isFinite(n) && n > 0 ? Math.max(0.1, Math.round(n * 100) / 100) : REFERRAL_POINTS; }
}

// ---------- Telegram API ----------
async function tg(method: string, body: unknown): Promise<any> {
  const token = botToken();
  if (!token) return { ok: false, error_code: 501, description: "TELEGRAM_BOT_TOKEN not configured" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json().catch(() => ({ ok: false, description: "invalid JSON from Telegram" }));
  } catch (e: any) {
    return { ok: false, description: String(e?.message ?? e) };
  }
}

const sendMessage = (chatId: number | string, text: string, replyMarkup?: unknown) =>
  tg("sendMessage", { chat_id: chatId, text, reply_markup: replyMarkup });

// ابطال لینک دعوت از سمت تلگرام — بعد از اینکه ادمین لینک را از پنل حذف کرد،
// حتی اگر کسی لینک را ذخیره کرده باشد دیگر با آن عضو کانال نمی‌شود.
export async function revokeTelegramInviteLink(link: string): Promise<boolean> {
  if (!link) return false;
  const res = await tg("revokeChatInviteLink", { chat_id: channelId(), invite_link: link });
  return Boolean(res?.ok);
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
const AFFILIATE_CHANNEL_NAME = "تک راه (@takrahTop)";
let _botUsername: string | null = null;
async function botUsername(): Promise<string> {
  if (_botUsername) return _botUsername;
  try { const me = await tg("getMe", {}); if (me?.ok && me.result?.username) _botUsername = `@${me.result.username}`; } catch { /* fallback below */ }
  return _botUsername ?? "@TakrahAffilateBot";
}
function isGroupLike(chat: any): boolean { const t = String(chat?.type ?? ""); return t === "group" || t === "supergroup"; }
function isAffiliateChat(chatId: number, chat: any): boolean {
  const cfg = channelId();
  if (cfg.startsWith("@")) return String(chat?.username ?? "").toLowerCase() === cfg.slice(1).toLowerCase();
  return chatId === Number(cfg);
}

// پیام خصوصی به عضوی که هنوز لینک افیلیت نساخته: مزایا + آموزش گام‌به‌گام
async function sendAffiliatePitch(user: any, sourceChatId: number | null, sourceTitle: string | null, sourceKind: "group" | "channel"): Promise<void> {
  const tgUserId = Number(user?.id);
  if (!Number.isFinite(tgUserId) || tgUserId <= 0 || user?.is_bot) return;
  try {
    if (await hasTelegramReferral(tgUserId)) { await markTelegramPrompt(tgUserId, "has_link", sourceChatId, sourceTitle); return; }
    if (!(await canPromptTelegramUser(tgUserId))) return; // قبلاً پیام رفته یا تلاش اخیر ناموفق بوده
    const pts = await referralPoints();
    const uname = await botUsername();
    const where = sourceTitle ? `${sourceKind === "group" ? "گروه" : "کانال"} «${sourceTitle}»` : sourceKind === "channel" ? "کانال" : "گروه";
    const res = await sendMessage(tgUserId, [
      `سلام ${displayName(user)} 👋`,
      "",
      `دیدم که در ${where} هستی، ولی هنوز لینک دعوت اختصاصی نساختی.`,
      "",
      "🎁 مزایای لینک افیلیت:",
      `• هر کس با لینک شما عضو کانال ${AFFILIATE_CHANNEL_NAME} شود، ${pts} امتیاز می‌گیرید`,
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
async function handleMyChatMember(mm: any): Promise<void> {
  const chat = mm?.chat;
  const chatId = Number(chat?.id);
  if (!chat || !Number.isFinite(chatId)) return;
  const oldStatus = String(mm?.old_chat_member?.status ?? "");
  const newStatus = String(mm?.new_chat_member?.status ?? "");
  const active = newStatus === "member" || newStatus === "administrator";
  try { await upsertBotGroup(chatId, String(chat.type ?? "group"), chat.title ?? null, active); } catch (e) { console.error("[telegram] bot_groups upsert failed:", e); }
  if (!active) return; // حذف/خروج ربات — فقط در دیتابیس غیرفعال می‌شود
  if (isAffiliateChat(chatId, chat)) return; // کانال اصلی افیلیت — اعلام لازم ندارد
  if (!(oldStatus === "left" || oldStatus === "kicked")) return; // فقط اضافه‌شدن تازه اعلام شود
  const pts = await referralPoints();
  const uname = await botUsername();
  await sendMessage(chatId, [
    "سلام! 👋 ربات افیلیت «تک راه» به این‌جا اضافه شد.",
    "",
    `🎁 هر کس لینک دعوت اختصاصی بسازد و دوستانش با آن عضو کانال ${AFFILIATE_CHANNEL_NAME} شوند، ${pts} امتیاز می‌گیرد.`,
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

async function sendReferralLink(chatId: number, studentId: number, tgUser: any): Promise<void> {
  const ref = await getOrCreateReferral(studentId, {
    userId: tgUser?.id,
    chatId,
    username: tgUser?.username,
  });
  if (!ref) {
    await sendMessage(chatId, "⚠️ خطا در ثبت لینک؛ کمی بعد دوباره تلاش کنید.");
    return;
  }
  let link = ref.inviteLink;
  if (!link) {
    const created = await tg("createChatInviteLink", { chat_id: channelId(), name: `ref-${ref.code}` });
    if (created?.ok && created.result?.invite_link) {
      link = String(created.result.invite_link);
      await setReferralInviteLink(ref.id, link);
    } else {
      await sendMessage(chatId, [
        "⚠️ ساخت لینک اختصاصی ممکن نشد.",
        "",
        `دلیل فنی: ${created?.description ?? "نامشخص"}`,
        "",
        "معمولاً یعنی بات هنوز ادمین کانال با مجوز «Invite Users via Link» نیست.",
      ].join("\n"));
      return;
    }
  }
  const pts = await referralPoints();
  await sendMessage(chatId, [
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
async function handleMessage(msg: any): Promise<void> {
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
    await sendAffiliatePitch(from, chatId, chat?.title ?? null, "group");
    if (text.startsWith("/start") || text.startsWith("/link") || text.startsWith("/mylink")) {
      const pts = await referralPoints();
      const uname = await botUsername();
      await sendMessage(chatId, [
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
    const existing = await getLatestReferralByTelegramUser(from.id);
    if (existing?.inviteLink) {
      const pts = await referralPoints();
      await sendMessage(chatId, [
        `${existing.studentName} عزیز 👋`,
        "",
        "لینک اختصاصی شما:",
        existing.inviteLink,
        "",
        `هر عضو از طریق این لینک = ${pts} امتیاز برای شما. کد شما: ${existing.code}`,
      ].join("\n"));
      return;
    }
    await sendMessage(chatId, [
      "سلام! 👋",
      "",
      "برای گرفتن لینک اختصاصی دعوت، نام و نام خانوادگی خود را دقیقاً همان‌طور که در سایت دفترکلاس ثبت شده بفرستید.",
      "",
      "مثال: پارسا مقدوری",
    ].join("\n"));
    return;
  }

  if (!text) {
    await sendMessage(chatId, "لطفاً نام و نام خانوادگی خود را به صورت متنی بفرستید (مطابق سایت).");
    return;
  }

  const candidates = await findStudentsByName(text);
  if (candidates.length === 0) {
    await sendMessage(chatId, [
      "❌ کسی با این نام در سایت پیدا نشد.",
      "",
      "لطفاً نام و نام خانوادگی را دقیقاً مطابق سایت بنویسید (مثلاً «پارسا مقدوری»).",
      "اگر مطمئن هستید نامتان ثبت شده، از مدیر کلاس بپرسید.",
    ].join("\n"));
    return;
  }
  if (candidates.length === 1) {
    await sendReferralLink(chatId, candidates[0].id, from);
    return;
  }
  await sendMessage(chatId, `${candidates.length} نفر با این نام پیدا شد؛ کدام شما هستید؟`, candidateKeyboard(candidates));
}

async function handleCallbackQuery(cq: any): Promise<void> {
  const chatId = cq?.message?.chat?.id;
  const from = cq?.from;
  const data = String(cq?.data ?? "");
  if (!chatId || !from || !data.startsWith("ref:")) return;
  const studentId = Number(data.slice(4));
  await tg("answerCallbackQuery", { callback_query_id: cq.id });
  if (!Number.isInteger(studentId) || studentId <= 0) {
    await sendMessage(chatId, "این انتخاب معتبر نیست؛ دوباره نام خود را بفرستید.");
    return;
  }
  await sendReferralLink(chatId, studentId, from);
}

async function handleChatMemberUpdate(cu: any): Promise<void> {
  const chat = cu?.chat;
  const chatId = Number(chat?.id);
  const oldMember = cu?.old_chat_member;
  const newMember = cu?.new_chat_member;
  const user = newMember?.user ?? oldMember?.user;
  if (!chat || !Number.isFinite(chatId) || !user || user.is_bot) return;
  const oldStatus = String(oldMember?.status ?? "");
  const newStatus = String(newMember?.status ?? "");

  // گروه/کانال دیگری که بات در آن عضو است: ورود عضو → پیام خصوصی معرفی افیلیت
  if (!isAffiliateChat(chatId, chat)) {
    if ((newStatus === "member" || newStatus === "administrator") && (oldStatus === "left" || oldStatus === "kicked")) {
      await sendAffiliatePitch(user, chatId, chat?.title ?? null, String(chat?.type ?? "") === "channel" ? "channel" : "group");
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
      await sendAffiliatePitch(user, chatId, chat?.title ?? null, "channel");
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

    const pts = await referralPoints();
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
      await sendMessage(cu.from.id, [
        "🎉 آفرین!",
        `${displayName(user)} با لینک شما عضو کانال شد؛ ${pts} امتیاز گرفتنید.`,
        `مجموع دعوت‌های موفق شما: ${total}`,
      ].join("\n"));
    }
    return;
  }

  // خروج یا محرومیت عضو از کانال → کسر امتیاز از دعوت‌کننده (فقط یک‌بار)
  if ((newStatus === "left" || newStatus === "kicked") && (oldStatus === "member" || oldStatus === "administrator" || oldStatus === "restricted")) {
    const settings = await getReferralSettings().catch(() => null);
    if (!settings?.leavePenalty) return; // کسر امتیاز توسط ادمین خاموش شده

    const info = await claimReferralLeave(Number(user.id));
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
      await sendMessage(info.referrerChatId, [
        "⚠️ کسر امتیاز",
        `${displayName(user)} که با لینک شما عضو کانال شده بود، کانال را ترک کرد؛ ${settings.points} امتیاز از شما کسر شد.`,
      ].join("\n"));
    }
  }
}

// ---------- entry ----------
export async function handleTelegramWebhook(req: Request): Promise<Response> {
  if (webhookSecret()) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== webhookSecret()) return new Response("forbidden", { status: 403 });
  }
  let update: any = null;
  try { update = await req.json(); } catch { return new Response("ok"); }

  // پردازش را await می‌کنیم (همه فراخوانی‌ها HTTP سریع هستند) و همیشه ok برمی‌گردانیم
  try {
    if (update?.message) await handleMessage(update.message);
    else if (update?.callback_query) await handleCallbackQuery(update.callback_query);
    else if (update?.chat_member) await handleChatMemberUpdate(update.chat_member);
    else if (update?.my_chat_member) await handleMyChatMember(update.my_chat_member);
  } catch (e) {
    console.error("[telegram] update processing error:", e);
  }
  return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
