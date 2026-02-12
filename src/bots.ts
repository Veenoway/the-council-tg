// ============================================================
// BOT CONFIG
// ============================================================

export const BOT_NAMES: Record<string, string> = {
  chad: 'James',
  quantum: 'Keone',
  sensei: 'Portdev',
  sterling: 'Harpal',
  oracle: 'Mike',
};

export const BOT_ROLES: Record<string, string> = {
  chad: 'Chart Analyst',
  quantum: 'Quant Analyst',
  sensei: 'Community Analyst',
  sterling: 'Risk Manager',
  oracle: 'Whale Tracker',
};

// Maps botId → env var name for their Telegram bot token
export const BOT_TOKEN_KEYS: Record<string, string> = {
  chad: 'JAMES_BOT_TOKEN',
  quantum: 'KEONE_BOT_TOKEN',
  sensei: 'PORTDEV_BOT_TOKEN',
  sterling: 'HARPAL_BOT_TOKEN',
  oracle: 'MIKE_BOT_TOKEN',
};

export function getBotToken(botId: string): string | null {
  const envKey = BOT_TOKEN_KEYS[botId];
  if (!envKey) return null;
  return process.env[envKey] || null;
}

export function isBotId(id: string): boolean {
  return id in BOT_NAMES;
}