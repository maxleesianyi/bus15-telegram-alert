import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LTA_BUS_ARRIVAL_URL = "https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival";
const SINGAPORE_TIME_ZONE = "Asia/Singapore";

type BusArrival = {
  label: string;
  etaMinutes: number | null;
};

type Config = {
  ltaAccountKey: string;
  telegramBotToken: string;
  telegramChatId: string;
  serviceNo: string;
  busStopCode: string;
  walkMinutes: number;
  bufferMinutes: number;
  cronSecret: string;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required secret: ${name}`);
  }
  return value;
}

function readConfig(): Config {
  return {
    ltaAccountKey: requiredEnv("LTA_ACCOUNT_KEY"),
    telegramBotToken: requiredEnv("TELEGRAM_BOT_TOKEN"),
    telegramChatId: requiredEnv("TELEGRAM_CHAT_ID"),
    serviceNo: Deno.env.get("SERVICE_NO")?.trim() || "15",
    busStopCode: Deno.env.get("BUS_STOP_CODE")?.trim() || "75591",
    walkMinutes: Number(Deno.env.get("WALK_MINUTES") || "10"),
    bufferMinutes: Number(Deno.env.get("BUFFER_MINUTES") || "2"),
    cronSecret: requiredEnv("CRON_SECRET"),
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function assertAuthorized(req: Request, config: Config): Response | null {
  const providedSecret = req.headers.get("x-cron-secret")?.trim();
  if (providedSecret !== config.cronSecret) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }
  return null;
}

function minutesUntil(arrivalTime: Date | null, now: Date): number | null {
  if (!arrivalTime) return null;
  const minutes = Math.round((arrivalTime.getTime() - now.getTime()) / 60000);
  return Math.max(0, minutes);
}

function parseLtaArrival(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatSingaporeTime(date: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).toUpperCase();
}

function formatEta(arrival: BusArrival): string {
  if (arrival.etaMinutes === null) return "not available";
  return `${arrival.etaMinutes} min`;
}

function parseArrivals(payload: any, now: Date): BusArrival[] {
  const services = Array.isArray(payload?.Services) ? payload.Services : [];
  if (services.length === 0) return [];

  const service = services[0];
  const arrivalKeys: Array<[string, string]> = [
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

function firstCatchableArrival(arrivals: BusArrival[], walkMinutes: number): BusArrival | null {
  return arrivals.find((arrival) => arrival.etaMinutes !== null && arrival.etaMinutes >= walkMinutes) || null;
}

function composeMessage(config: Config, arrivals: BusArrival[], now: Date): string {
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

async function fetchBusArrivals(config: Config): Promise<any> {
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

  return await response.json();
}

async function sendTelegramMessage(config: Config, text: string): Promise<void> {
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

Deno.serve(async (req: Request) => {
  try {
    const config = readConfig();
    const authError = assertAuthorized(req, config);
    if (authError) return authError;

    const now = new Date();
    const payload = await fetchBusArrivals(config);
    const arrivals = parseArrivals(payload, now);
    const message = composeMessage(config, arrivals, now);
    await sendTelegramMessage(config, message);

    return jsonResponse({
      ok: true,
      checkedAt: now.toISOString(),
      sent: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
