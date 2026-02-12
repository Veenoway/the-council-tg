// ============================================================
// TELEGRAM POLLING — Listen for user messages in the group
// ============================================================

import { getBotToken, BOT_NAMES } from './bots.js';

const MAIN_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const BACKEND_URL = process.env.BACKEND_URL!;

let lastUpdateId = 0;

// Rate limit: max messages per user per minute
const MAX_MESSAGES_PER_MINUTE = 3;
const userMessageTimestamps = new Map<number, number[]>();

function isRateLimited(userId: number): boolean {
  const now = Date.now();
  const timestamps = userMessageTimestamps.get(userId) || [];

  // Keep only timestamps from last 60s
  const recent = timestamps.filter((t) => now - t < 60_000);
  userMessageTimestamps.set(userId, recent);

  if (recent.length >= MAX_MESSAGES_PER_MINUTE) {
    return true;
  }

  recent.push(now);
  return false;
}

// Map TG bot usernames → internal bot IDs
const USERNAME_TO_BOT_ID: Record<string, string> = {
  JamesCouncilBot: 'chad',
  KeoneCouncilBot: 'quantum',
  PortdevCouncilBot: 'sensei',
  HarpalCouncilBot: 'sterling',
  MikeCouncilBot: 'oracle',
};

// All our bot user IDs (to ignore their messages)
const OUR_BOT_IDS = new Set<number>();

// ============================================================
// DETECT WHICH BOT IS MENTIONED
// ============================================================

function detectTargetBot(text: string): string | null {
  // Check @mentions
  for (const [username, botId] of Object.entries(USERNAME_TO_BOT_ID)) {
    if (text.toLowerCase().includes(`@${username.toLowerCase()}`)) {
      return botId;
    }
  }

  // Check name mentions (James, Keone, Portdev, Harpal, Mike)
  for (const [botId, name] of Object.entries(BOT_NAMES)) {
    if (text.toLowerCase().includes(name.toLowerCase())) {
      return botId;
    }
  }

  return null;
}

// ============================================================
// FORWARD USER MESSAGE TO BACKEND
// ============================================================

async function forwardToBackend(
  message: string,
  username: string,
  targetBotId: string | null
): Promise<{ botId: string; botName: string; response: string } | null> {
  try {
    const url = `${BACKEND_URL}/api/telegram/chat`;
    console.log(`📤 Forwarding to backend: "${message.slice(0, 50)}..." target=${targetBotId || 'random'}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, username, targetBotId }),
    });

    if (!res.ok) {
      console.error(`❌ Backend returned ${res.status}: ${await res.text()}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('❌ Failed to forward to backend:', err);
    return null;
  }
}

// ============================================================
// POLL FOR UPDATES
// ============================================================

async function pollUpdates(): Promise<void> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${MAIN_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30&allowed_updates=["message"]`
    );

    if (!res.ok) return;

    const data = await res.json();
    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;

      const msg = update.message;
      if (!msg?.text) continue;

      // Only process messages from our group
      if (String(msg.chat.id) !== CHAT_ID) continue;

      // Ignore messages from bots (our own bots posting)
      if (msg.from?.is_bot) continue;

      const text = msg.text;
      const username = msg.from?.first_name || msg.from?.username || 'anon';

      console.log(`💬 TG user ${username}: ${text.slice(0, 60)}`);

      // Rate limit check
      if (isRateLimited(msg.from.id)) {
        console.log(`⏳ Rate limited: ${username}`);
        continue;
      }
      // Detect if a specific bot is mentioned
      let targetBotId = detectTargetBot(text);

      // If replying to one of our bots, target that bot
      if (!targetBotId && msg.reply_to_message?.from?.is_bot) {
        const replyUsername = msg.reply_to_message.from.username || '';
        targetBotId = USERNAME_TO_BOT_ID[replyUsername] || null;
      }

      // targetBotId can be null → backend picks a random bot

      // Forward to backend and get response
      const result = await forwardToBackend(text, username, targetBotId);

      if (result?.response) {
        console.log(`✅ ${result.botName} replied to ${username} (via WSS)`);
      }
    }
  } catch (err) {
    console.error('❌ Polling error:', err);
  }
}

// ============================================================
// START POLLING LOOP
// ============================================================

export function startPolling(): void {
  if (!BACKEND_URL) {
    console.warn('⚠️ BACKEND_URL not set, skipping Telegram polling');
    return;
  }

  console.log('👂 Starting Telegram polling for user messages...');
  console.log(`   Backend: ${BACKEND_URL}`);
  console.log(`   Chat ID: ${CHAT_ID}`);

  async function loop() {
    while (true) {
      await pollUpdates();
      // Small delay between polls (long polling handles the wait via timeout=30)
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  loop().catch((err) => {
    console.error('❌ Polling loop crashed:', err);
    // Restart after 5s
    setTimeout(startPolling, 5000);
  });
}