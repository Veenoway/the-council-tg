import 'dotenv/config';
import { connect } from './ws.js';
import { sendTelegram } from './telegram.js';


const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, WS_URL } = process.env;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !WS_URL) {
  console.error('❌ Missing env vars. Need: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, WS_URL');
  process.exit(1);
}

console.log(`
╔═══════════════════════════════════════════╗
║  📡 Council Telegram Relay               ║
║  Forwarding live discussions to TG       ║
╚═══════════════════════════════════════════╝
`);
console.log(`  Chat ID: ${TELEGRAM_CHAT_ID}`);
console.log(`  WS URL:  ${WS_URL}`);
console.log('');

// Send startup message
sendTelegram('🏛️ <b>The Council is now live!</b>\n\nBot discussions will be relayed here in real-time.');

// Connect to WSS
connect();