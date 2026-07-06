const LTA_BUS_ARRIVAL_URL =
  "https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival";
const SINGAPORE_TIME_ZONE = "Asia/Singapore";
const PAUSE_COMMANDS = new Set(["stop", "pause", "done"]);
const RESUME_COMMANDS = new Set(["resume", "start"]);

function minutesUntil(arrivalTime, now) {
  if (!arrivalTime) return null;
  const minutes = Math.round((arrivalTime.getTime() - now.getTime()) / 60000);
  return Math.max(0, minutes);
}

function parseLtaArrival(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatSingaporeTime(date) {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).toUpperCase();
}

function formatEta(arrival) {
  if (arrival.etaMinutes === null) return "not available";
  return `${arrival.etaMinutes} min`;
}

function parseArrivals(payload, now) {
  const services = Array.isArray(payload?.Services) ? payload.Services : [];
  if (services.length === 0) return [];

  const service = services[0];
  const arrivalKeys = [
    ["Next", "NextBus"],
    ["Subsequent", "NextBus2"],
    ["Third", "NextBus3"],
  ];

  return arrivalKeys.map(([label, key]) => {
    const arrivalTime = parseLtaArrival(service?.[key]?.EstimatedArrival);
    return {
      label,
      etaMinutes: minutesUntil(arrivalTime, now),
    };
  });
}

function firstCatchableArrival(arrivals, walkMinutes) {
  return arrivals.find(
    (arrival) => arrival.etaMinutes !== null && arrival.etaMinutes >= walkMinutes,
  ) || null;
}

function composeMessage(config, arrivals, now) {
  const header =
    `Bus ${config.serviceNo} at stop ${config.busStopCode} checked ${formatSingaporeTime(now)} SGT`;

  if (arrivals.length === 0) {
    return `${header}\n\nNo arrival data is available right now. Check the SBS/LTA app before leaving.`;
  }

  const lines = [
    header,
    "",
    ...arrivals.slice(0, 2).map((arrival) => `${arrival.label}: ${formatEta(arrival)}`),
    "",
  ];

  const best = firstCatchableArrival(arrivals, config.walkMinutes);
  if (!best || best.etaMinutes === null) {
    lines.push(
      `No catchable bus is shown yet for a ${config.walkMinutes} min walk. Check again before leaving.`,
    );
    return lines.join("\n");
  }

  const leaveThresholdMinutes = config.walkMinutes + config.bufferMinutes;
  const minutesToLeave = best.etaMinutes - leaveThresholdMinutes;

  if (minutesToLeave <= 0) {
    lines.push(`Leave now for the ${best.label.toLowerCase()} bus. It arrives in ${best.etaMinutes} min.`);
  } else {
    const leaveAt = new Date(now.getTime() + minutesToLeave * 60000);
    lines.push(
      `Best catchable: ${best.label.toLowerCase()} bus. ` +
        `Leave around ${formatSingaporeTime(leaveAt)} (${minutesToLeave} min from now).`,
    );
  }

  return lines.join("\n");
}

function normalizeCommand(text) {
  const firstWord = text.trim().toLowerCase().split(/\s+/)[0] || "";
  return firstWord.replace(/^\/+/, "").split("@")[0];
}

async function fetchBusArrivals(config) {
  const url = new URL(LTA_BUS_ARRIVAL_URL);
  url.searchParams.set("BusStopCode", config.busStopCode);
  url.searchParams.set("ServiceNo", config.serviceNo);

  const response = await fetch(url, {
    headers: {
      AccountKey: config.ltaAccountKey,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`LTA API returned ${response.status}`);
  }

  return response.json();
}

async function sendTelegramMessage(config, text) {
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram API returned ${response.status}`);
  }
}

module.exports = {
  PAUSE_COMMANDS,
  RESUME_COMMANDS,
  composeMessage,
  fetchBusArrivals,
  normalizeCommand,
  parseArrivals,
  sendTelegramMessage,
};
