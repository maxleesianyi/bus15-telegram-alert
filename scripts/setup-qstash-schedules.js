const fs = require("fs");
const path = require("path");

const DEFAULT_DESTINATION = "https://bus15-telegram-alert.vercel.app/api/check";
const DEFAULT_QSTASH_BASE_URL = "https://qstash-us-east-1.upstash.io";

const schedules = [
  {
    id: "bus15-alert-745am-sgt",
    window: "7:45am",
    cron: "CRON_TZ=Asia/Singapore 45 7 * * 1-5",
  },
  {
    id: "bus15-alert-8am-sgt",
    window: "8am",
    cron: "CRON_TZ=Asia/Singapore 0,15,30 8 * * 1-5",
  },
];
const obsoleteScheduleIds = ["bus15-alert-9am-sgt"];

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local or set it before running this script.`);
  }
  return value;
}

async function qstashFetch(pathname, options) {
  const baseUrl = process.env.QSTASH_BASE_URL || DEFAULT_QSTASH_BASE_URL;
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`QStash request failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function upsertSchedule(schedule, destination, qstashToken, cronSecret) {
  return qstashFetch(`/v2/schedules/${destination}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${qstashToken}`,
      "Content-Type": "application/json",
      "Upstash-Cron": schedule.cron,
      "Upstash-Forward-Authorization": `Bearer ${cronSecret}`,
      "Upstash-Method": "POST",
      "Upstash-Retries": "3",
      "Upstash-Schedule-Id": schedule.id,
    },
    body: JSON.stringify({
      source: "qstash",
      window: schedule.window,
    }),
  });
}

async function listMatchingSchedules(qstashToken) {
  const result = await qstashFetch("/v2/schedules", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${qstashToken}`,
    },
  });

  const allSchedules = Array.isArray(result) ? result : [];
  return allSchedules.filter((schedule) =>
    schedules.some((expected) => expected.id === schedule.scheduleId)
  );
}

async function deleteObsoleteSchedules(qstashToken) {
  const result = await qstashFetch("/v2/schedules", {
    method: "GET",
    headers: { Authorization: `Bearer ${qstashToken}` },
  });
  const existingIds = new Set(
    (Array.isArray(result) ? result : []).map((schedule) => schedule.scheduleId),
  );

  for (const scheduleId of obsoleteScheduleIds) {
    if (!existingIds.has(scheduleId)) continue;
    await qstashFetch(`/v2/schedules/${scheduleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${qstashToken}` },
    });
    console.log(`Removed obsolete ${scheduleId}`);
  }
}

async function main() {
  loadDotEnv(path.join(process.cwd(), ".env.local"));

  const qstashToken = requiredEnv("QSTASH_TOKEN");
  const cronSecret = requiredEnv("CRON_SECRET");
  const destination = process.env.QSTASH_DESTINATION || DEFAULT_DESTINATION;

  for (const schedule of schedules) {
    await upsertSchedule(schedule, destination, qstashToken, cronSecret);
    console.log(`Upserted ${schedule.id}: ${schedule.cron}`);
  }

  await deleteObsoleteSchedules(qstashToken);

  const activeSchedules = await listMatchingSchedules(qstashToken);
  console.log(
    JSON.stringify(
      activeSchedules.map((schedule) => ({
        scheduleId: schedule.scheduleId,
        cron: schedule.cron,
        destination: schedule.destination,
        isPaused: schedule.isPaused,
      })),
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
