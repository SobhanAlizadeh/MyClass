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
  setReferralInviteLink,
  REFERRAL_POINTS,
  saveActivity,
} from "./db";

// ---------- config ----------
const CHANNEL_FALLBACK = "@takrahtop";
function botToken(): string { return process.env.TELEGRAM_BOT_TOKEN ?? ""; }
function channelId(): string { return process.env.TELEGRAM_CHANNEL_ID?.trim() || CHANNEL_FALLBACK; }
function webhookSecret(): string { return process.env.TELEGRAM_WEBHOOK_SECRET ?? ""; }
function referralPoints(): number { const n = Number(process.env.TELEGRAM_REFERRAL_POINTS ?? REFERRAL_POINTS); return Number.isFinite(n) && n > 0 ? Math.trunc(n) : REFERRAL_POINTS; }

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

// ---------- helpers ----------
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function displayName(u: any): string {
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  return name || (u?.username ? `@${u.username}` : "کاربر");
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
  const pts = referralPoints();
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
}

// ---------- update handlers ----------
async function handleMessage(msg: any): Promise<void> {
  const chatId = msg?.chat?.id;
  const from = msg?.from;
  if (!chatId || !from) return;
  const text: string = String(msg?.text ?? "").trim();

  if (text.startsWith("/start") || text.startsWith("/link") || text.startsWith("/mylink")) {
    const existing = await getLatestReferralByTelegramUser(from.id);
    if (existing?.inviteLink) {
      const pts = referralPoints();
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
  const newMember = cu?.new_chat_member;
  const inviteLink = cu?.invite_link;
  if (!newMember || newMember.status !== "member") return; // فقط عضویت (نه خروج/محرومیت)
  if (newMember.user?.is_bot) return;
  if (!inviteLink?.invite_link) return; // عضویت با لینک عمومی کانال — بدون امتیاز

  const link: string = String(inviteLink.invite_link);
  let ref = await getReferralByInviteLink(link);
  if (!ref && typeof inviteLink.name === "string" && inviteLink.name.startsWith("ref-")) {
    ref = await getReferralByCode(inviteLink.name.slice(4));
  }
  if (!ref) return;

  const tgUserId = Number(newMember.user?.id);
  if (!Number.isFinite(tgUserId) || tgUserId <= 0) return;
  const isNew = await recordReferralJoin(ref.id, tgUserId, displayName(newMember.user));
  if (!isNew) return; // همان اکانت قبلاً امتیاز گرفته

  const pts = referralPoints();
  try {
    await saveActivity({
      studentId: ref.studentId,
      date: todayISO(),
      title: "دعوت دوست به کانال تلگرام",
      description: `عضویت ${displayName(newMember.user)} از طریق لینک اختصاصی (${ref.code})`,
      kind: "positive",
      points: pts,
    });
  } catch (e) {
    console.error("[telegram] failed to save referral activity:", e);
    return;
  }

  if (cu?.from?.id && ref.inviteLink) {
    const total = await countReferralJoins(ref.id);
    // اطلاع به دعوت‌کننده (اگر خودش عضو نشده باشد)
    if (Number(cu.from.id) !== tgUserId) {
      await sendMessage(cu.from.id, [
        "🎉 آفرین!",
        `${displayName(newMember.user)} با لینک شما عضو کانال شد؛ ${pts} امتیاز گرفتنید.`,
        `مجموع دعوت‌های موفق شما: ${total}`,
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
  } catch (e) {
    console.error("[telegram] update processing error:", e);
  }
  return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
