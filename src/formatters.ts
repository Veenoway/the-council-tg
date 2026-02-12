// ============================================================
// MESSAGE FORMATTERS
// ============================================================

import { BOT_NAMES } from './bots.js';

// ============================================================
// ESCAPE HTML
// ============================================================

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================
// FORMAT NUMBERS
// ============================================================

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

// ============================================================
// NEW TOKEN
// ============================================================

export function formatNewToken(token: any): string {
  const symbol = token.symbol || '???';
  const name = token.name || 'Unknown';
  const price = token.price ? `$${Number(token.price).toFixed(8)}` : 'N/A';
  const mcap = token.mcap ? formatUsd(Number(token.mcap)) : 'N/A';
  const liq = token.liquidity ? formatUsd(Number(token.liquidity)) : 'N/A';
  const holders = token.holders || 'N/A';

  const change24h = token.priceChange24h
    ? `${Number(token.priceChange24h) >= 0 ? '🟢' : '🔴'} ${Number(token.priceChange24h).toFixed(1)}%`
    : '';

  return [
    `🔍 <b>New Token: $${escapeHtml(symbol)}</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `<b>Name:</b> ${escapeHtml(name)}`,
    `<b>Price:</b> ${price} ${change24h}`,
    `<b>MCap:</b> ${mcap}`,
    `<b>Liquidity:</b> ${liq}`,
    `<b>Holders:</b> ${holders}`,
    token.address ? `<b>CA:</b> <code>${token.address}</code>` : '',
    ``,
    token.address ? `📈 <a href="https://dexscreener.com/monad/${token.address}">DexScreener</a> · <a href="https://nad.fun/tokens/${token.address}">NadFun</a>` : '',
    `⏳ <i>The Council is now analyzing this token...</i>`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ============================================================
// TRADE
// ============================================================

export function formatTrade(trade: any): string {
  const botName = BOT_NAMES[trade.botId] || trade.botId;
  const symbol = trade.tokenSymbol || '???';
  const amount = trade.amountIn
    ? `${Number(trade.amountIn).toFixed(2)} MON`
    : '?';
  const side = trade.side === 'sell' ? '📉 SELL' : '📈 BUY';

  const lines = [
    `${side} — <b>${botName}</b>`,
    `Token: <b>$${escapeHtml(symbol)}</b>`,
    `Amount: ${amount}`,
  ];

  if (trade.txHash) {
    lines.push(`🔗 <a href="https://monad.socialscan.io/tx/${trade.txHash}">View TX</a>`);
  }

  return lines.join('\n');
}

// ============================================================
// VERDICT
// ============================================================

export function formatVerdict(data: any): string {
  const verdict = (data.verdict || 'unknown').toUpperCase();
  const emoji = verdict === 'BUY' ? '✅' : '❌';
  const symbol = data.token?.symbol || data.tokenSymbol || data.symbol || '???';

  const lines = [
    ``,
    `${emoji} <b>COUNCIL VERDICT: ${verdict}</b> — $${escapeHtml(symbol)}`,
    `━━━━━━━━━━━━━━━━━━`,
  ];

  // Individual opinions
  const opinions = data.opinions || data.votes;
  if (opinions && typeof opinions === 'object') {
    for (const [botId, opinion] of Object.entries(opinions as Record<string, string>)) {
      const name = BOT_NAMES[botId] || botId;
      lines.push(`${name}: <b>${opinion.toUpperCase()}</b>`);
    }
  }

  return lines.join('\n');
}

// ============================================================
// CHAT MESSAGES (batched)
// ============================================================

export function formatChatBatch(
  messages: { botId: string; content: string }[]
): string {
  // Group consecutive messages from same bot
  const grouped: { botId: string; lines: string[] }[] = [];

  for (const msg of messages) {
    const last = grouped[grouped.length - 1];
    if (last && last.botId === msg.botId) {
      last.lines.push(msg.content);
    } else {
      grouped.push({ botId: msg.botId, lines: [msg.content] });
    }
  }

  return grouped
    .map((g) => {
      const name = BOT_NAMES[g.botId] || g.botId;
      const content = g.lines.map((l) => escapeHtml(l)).join('\n');
      return `<b>${name}</b>\n${content}`;
    })
    .join('\n\n');
}