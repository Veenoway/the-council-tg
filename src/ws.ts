import WebSocket from 'ws';
import { sendTelegram, sendTelegramPhoto } from './telegram.js';
import { isBotId, getBotToken, BOT_NAMES } from './bots.js';
import {
  formatNewToken,
  formatTrade,
  formatVerdict,
} from './formatters.js';

const WS_URL = process.env.WS_URL!;

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30_000;

// ============================================================
// MESSAGE FILTERS
// ============================================================

const IGNORED_PATTERNS = [
  /^got \d+/i,
  /^bought \d+/i,
  /^sold \d+/i,
  /wanted in but insufficient/i,
  /^insufficient balance/i,
  /^executing .* trade/i,
  /^trade confirmed/i,
  /^swapped \d+/i,
];

function shouldIgnoreMessage(content: string): boolean {
  return IGNORED_PATTERNS.some((re) => re.test(content.trim()));
}

// Dedup trades by txHash
const recentTradeHashes = new Set<string>();

function isNewTrade(trade: any): boolean {
  const key = trade.txHash;
  if (!key) return false;
  if (recentTradeHashes.has(key)) return false;
  recentTradeHashes.add(key);
  setTimeout(() => recentTradeHashes.delete(key), 60_000);
  return true;
}

// Dedup messages (same bot + same content within 30s)
const recentMessages = new Set<string>();

function isNewMessage(botId: string, content: string): boolean {
  const key = `${botId}:${content.slice(0, 80)}`;
  if (recentMessages.has(key)) return false;
  recentMessages.add(key);
  setTimeout(() => recentMessages.delete(key), 30_000);
  return true;
}

// ============================================================
// HANDLE INCOMING WS MESSAGES
// ============================================================

let currentTokenAddress: string | null = null;

async function handleMessage(msg: any): Promise<void> {
  const type = msg.type;

  switch (type) {
    // ---- Bot chat messages → each bot posts as themselves ----
    case 'message':
    case 'chat': {
      const botId = msg.botId || msg.data?.botId;
      const content = msg.content || msg.data?.content || msg.data?.message;

      if (!botId || !content || !isBotId(botId)) break;
      if (shouldIgnoreMessage(content)) break;
      if (!isNewMessage(botId, content)) break;

      const token = getBotToken(botId);
      console.log(`📨 botId=${botId} token=${token ? 'YES' : 'NO'} content=${content?.slice(0, 30)}`);

      if (token) {
        sendTelegram(content, token);
      } else {
        sendTelegram(`<b>${BOT_NAMES[botId] || botId}:</b> ${content}`);
      }
      break;
    }

    // ---- New token → image priority: DexScreener chart > NadFun logo > text ----
    case 'new_token':
    case 'token': {
      const tokenData = msg.token || msg.data;
      if (!tokenData) break;

      if (tokenData.address !== currentTokenAddress) {
        currentTokenAddress = tokenData.address;

        const text = formatNewToken(tokenData);
        let imageUrl: string | null = null;

        if (tokenData.address) {
          // 1) DexScreener: chart image (openGraph) > token logo (imageUrl)
          try {
            const dsRes = await fetch(
              `https://api.dexscreener.com/token-pairs/v1/monad/${tokenData.address}`
            );
            if (dsRes.ok) {
              const dsData = await dsRes.json();
              const pairs = Array.isArray(dsData) ? dsData : dsData?.pairs || [];
              console.log(`📊 DexScreener: ${pairs.length} pairs`);

              if (pairs.length > 0) {
                const pair = pairs[0];
                imageUrl = pair.info?.openGraph || pair.info?.imageUrl || null;
                if (imageUrl) console.log(`📊 DexScreener image found`);
              }
            }
          } catch (err) {
            console.warn('📊 DexScreener failed:', err);
          }

          // 2) Token image from WS payload
          if (!imageUrl && tokenData.image) {
            imageUrl = tokenData.image;
            console.log(`📊 Using WS token image`);
          }

          // 3) NadFun fallback
          if (!imageUrl) {
            try {
              const nadRes = await fetch(
                `https://api.nadapp.net/token/${tokenData.address}`
              );
              if (nadRes.ok) {
                const nadData = await nadRes.json();
                imageUrl = nadData?.token_info?.image_uri || nadData?.image || null;
                if (imageUrl) console.log(`📊 Using NadFun image`);
              }
            } catch {}
          }
        }

        // Send with image or text only
        if (imageUrl) {
          sendTelegramPhoto(imageUrl, text);
        } else {
          console.log(`📊 No image found, sending text only`);
          sendTelegram(text);
        }
      }
      break;
    }

    // ---- Trade → main bot posts ----
    case 'trade': {
      const trade = msg.trade || msg.data;
      if (trade && isBotId(trade.botId) && trade.txHash && isNewTrade(trade)) {
        sendTelegram(formatTrade(trade));
      }
      break;
    }

    // ---- Verdict → main bot posts ----
    case 'verdict':
    case 'vote_result': {
      const data = msg.data || msg;
      sendTelegram(formatVerdict(data));
      break;
    }

    default:
      break;
  }
}

// ============================================================
// CONNECT + AUTO-RECONNECT
// ============================================================

export function connect(): void {
  console.log(`🔌 Connecting to ${WS_URL}...`);

  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✅ Connected to Council WebSocket');
    reconnectAttempts = 0;
  });

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleMessage(msg);
    } catch {}
  });

  ws.on('close', () => {
    console.log('🔌 Disconnected');
    scheduleReconnect();
  });

  ws.on('error', (err: Error) => {
    console.error('❌ WS error:', err.message);
  });
}

function scheduleReconnect(): void {
  const delay = Math.min(
    1000 * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );
  reconnectAttempts++;
  console.log(
    `🔄 Reconnecting in ${(delay / 1000).toFixed(0)}s (attempt ${reconnectAttempts})...`
  );
  setTimeout(connect, delay);
}