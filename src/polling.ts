// ============================================================
// TELEGRAM POLLING — Listen for user messages in the group
// ============================================================

import { getBotToken, BOT_NAMES, BOT_TOKEN_KEYS } from './bots.js';
import { sendTelegram } from './telegram.js';

const MAIN_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const BACKEND_URL = process.env.BACKEND_URL || process.env.WS_URL?.replace('wss://', 'https://').replace('ws://', 'http://') || 'http://localhost:3005';

let lastUpdateId = 0;

// Map TG bot usernames to internal bot IDs
const USERNAME_TO_BOT_ID: Record<string, string> = {
  'JamesCouncilBot': 'chad',
  'KeoneCouncilBot': 'quantum',
  'PortdevCouncilBot': 'sensei',
  'HarpalCouncilBot': 'sterling',
  'MikeCouncilBot': 'oracle',
};

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

  // Check name mentions
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

async function forwardToBackend(message: string, username: string, targetBotId: string | null): Promise<{
  botId: string;
  botName: string;
  response: string;
} | null> {
  try {
    const url = `${BACKEND_URL}/api/telegram/chat`;
    console.log(`📤 Forwarding to backend: "${message.slice(0, 40)}..." target=${targetBotId || 'auto'}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        username,
        targetBotId,
      }),
    });

    if (!res.ok) {
      console.error(`❌ Backend returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    return {
      botId: data.botId,
      botName: data.botName,
      response: data.response,
    };
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

      // Ignore messages from bots (our own bots)
      if (msg.from?.is_bot) continue;

      const text = msg.text;
      const username = msg.from?.username || msg.from?.first_name || 'anon';

      console.log(`💬 TG user @${username}: ${text.slice(0, 50)}`);

      // Detect if a specific bot is mentioned
      const targetBotId = detectTargetBot(text);

      // Only respond if a bot is mentioned or it's a reply to a bot
      const isReplyToBot = msg.reply_to_message?.from?.is_bot;

      if (!targetBotId && !isReplyToBot) {
        // User didn't mention a bot, skip
        continue;
      }

      // If replying to a bot, figure out which one
      let resolvedTarget = targetBotId;
      if (!resolvedTarget && isReplyToBot) {
        const replyUsername = msg.reply_to_message?.from?.username || '';
        resolvedTarget = USERNAME_TO_BOT_ID[replyUsername] || null;
      }

      // Forward to backend and get response
      const result = await forwardToBackend(text, username, resolvedTarget);

      if (result?.response) {
        // Send response as the correct bot
        const botToken = getBotToken(result.botId);
        if (botToken) {
          sendTelegram(result.response, botToken);
        } else {
          sendTelegram(`<b>${result.botName}:</b> ${result.response}`);
        }
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
  console.log('👂 Starting Telegram polling for user messages...');

  async function loop() {
    while (true) {
      await pollUpdates();
      // Small delay between polls (long polling handles the wait)
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  loop().catch((err) => {
    console.error('❌ Polling loop crashed:', err);
    // Restart after 5s
    setTimeout(startPolling, 5000);
  });
}