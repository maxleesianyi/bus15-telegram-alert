const { Redis } = require("@upstash/redis");

const SINGAPORE_TIME_ZONE = "Asia/Singapore";

let redis;

function getRedis() {
  if (!redis) {
    redis = Redis.fromEnv();
  }
  return redis;
}

function singaporeDateString(date) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function secondsUntilNextSingaporeDay(now) {
  const date = singaporeDateString(now);
  const [year, month, day] = date.split("-").map(Number);
  const nextUtc = Date.UTC(year, month - 1, day + 1, 0, 0, 0);

  const sgOffsetSeconds = 8 * 60 * 60;
  const nextSingaporeMidnightUtc = nextUtc - sgOffsetSeconds * 1000;
  const seconds = Math.ceil((nextSingaporeMidnightUtc - now.getTime()) / 1000);

  return Math.max(seconds, 60);
}

function pauseKey(date) {
  return `bus15:pause:${date}`;
}

async function isPausedToday(date) {
  const value = await getRedis().get(pauseKey(date));
  return value !== null;
}

async function pauseToday(date, chatId, now = new Date()) {
  await getRedis().set(
    pauseKey(date),
    {
      reason: "telegram_command",
      sourceChatId: chatId,
      updatedAt: now.toISOString(),
    },
    { ex: secondsUntilNextSingaporeDay(now) },
  );
}

async function resumeToday(date) {
  await getRedis().del(pauseKey(date));
}

module.exports = {
  isPausedToday,
  pauseToday,
  resumeToday,
  secondsUntilNextSingaporeDay,
  singaporeDateString,
};
