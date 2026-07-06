function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberEnv(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for ${name}: ${raw}`);
  }
  return parsed;
}

function readConfig() {
  return {
    ltaAccountKey: requiredEnv("LTA_ACCOUNT_KEY"),
    telegramBotToken: requiredEnv("TELEGRAM_BOT_TOKEN"),
    telegramChatId: requiredEnv("TELEGRAM_CHAT_ID"),
    cronSecret: requiredEnv("CRON_SECRET"),
    serviceNo: process.env.SERVICE_NO?.trim() || "15",
    busStopCode: process.env.BUS_STOP_CODE?.trim() || "75591",
    walkMinutes: numberEnv("WALK_MINUTES", 10),
    bufferMinutes: numberEnv("BUFFER_MINUTES", 2),
  };
}

module.exports = {
  readConfig,
  requiredEnv,
};
