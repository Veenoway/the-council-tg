// ============================================================
// TELEGRAM API — Send messages with rate limiting
// Multi-bot: each council member has their own TG bot
// ============================================================

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const MAIN_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

// ============================================================
// RATE-LIMITED QUEUE (Telegram: ~20 msg/min for groups)
// ============================================================

const queue: (() => Promise<void>)[] = [];
let processing = false;

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const fn = queue.shift();
    if (fn) {
      await fn();
      await sleep(400);
    }
  }

  processing = false;
}

function enqueue(fn: () => Promise<void>): void {
  queue.push(fn);
  processQueue();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// SEND AS SPECIFIC BOT (or main bot if no token)
// ============================================================

export async function sendTelegram(
  text: string,
  botToken?: string | null
): Promise<void> {
  const token = botToken || MAIN_BOT_TOKEN;

  enqueue(async () => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        console.error('❌ TG send error:', err.description || err);
      }
    } catch (err) {
      console.error('❌ TG send failed:', err);
    }
  });
}

// ============================================================
// SEND PHOTO (always via main bot)
// ============================================================

export async function sendTelegramPhoto(
  photoUrl: string,
  caption: string
): Promise<void> {
  enqueue(async () => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${MAIN_BOT_TOKEN}/sendPhoto`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            photo: photoUrl,
            caption,
            parse_mode: 'HTML',
          }),
        }
      );

      if (!res.ok) {
        console.warn('⚠️ Photo send failed, falling back to text');
        await fetch(
          `https://api.telegram.org/bot${MAIN_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: TELEGRAM_CHAT_ID,
              text: caption,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          }
        );
      }
    } catch (err) {
      console.error('❌ TG photo failed:', err);
    }
  });
}