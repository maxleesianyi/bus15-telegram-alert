import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LTA_BUS_ARRIVAL_URL = "https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival";
const SINGAPORE_TIME_ZONE = "Asia/Singapore";
const PAUSE_COMMANDS = new Set(["stop", "pause", "done"]);
const RESUME_COMMANDS = new Set(["resume", "start"]);

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
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
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
    supabaseUrl: requiredEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isCronRequest(req: Request, config: Config): boolean {
  return req.headers.get("x-cron-secret")?.trim() === config.cronSecret;
}

function isTelegramWebhookRequest(req: Request, config: Config): boolean {
  return req.headers.get("x-telegram-bot-api-secret-token")?.trim() === config.cronSecret;
}

function singaporeDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
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

function normalizeCommand(text: string): string {
  const firstWord = text.trim().toLowerCase().split(/\s+/)[0] || "";
  return firstWord.replace(/^\/+/, "").split("@")[0];
}

async function supabaseFetch(config: Config, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", config.supabaseServiceRoleKey);
  headers.set("Authorization", `Bearer ${config.supabaseServiceRoleKey}`);
  headers.set("Content-Type", "application/json");

  return await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
  });
}

async function isPausedToday(config: Config, date: string): Promise<boolean> {
  const response = await supabaseFetch(
    config,
    `bus15_daily_pauses?pause_date=eq.${encodeURIComponent(date)}&select=pause_date&limit=1`,
  );

  if (!response.ok) {
    throw new Error(`Pause lookup returned ${response.status}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function pauseToday(config: Config, date: string, chatId: string): Promise<void> {
  const response = await supabaseFetch(config, "bus15_daily_pauses", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      pause_date: date,
      reason: "telegram_command",
      source_chat_id: chatId,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Pause write returned ${response.status}`);
  }
}

async function resumeToday(config: Config, date: string): Promise<void> {
  const response = await supabaseFetch(config, `bus15_daily_pauses?pause_date=eq.${encodeURIComponent(date)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Pause delete returned ${response.status}`);
  }
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

async function handleCron(config: Config): Promise<Response> {
  const now = new Date();
  const today = singaporeDateString(now);

  if (await isPausedToday(config, today)) {
    return jsonResponse({
      ok: true,
      checkedAt: now.toISOString(),
      skipped: "paused_for_today",
    });
  }

  const payload = await fetchBusArrivals(config);
  const arrivals = parseArrivals(payload, now);
  const message = composeMessage(config, arrivals, now);
  await sendTelegramMessage(config, message);

  return jsonResponse({
    ok: true,
    checkedAt: now.toISOString(),
    sent: true,
  });
}

async function handleTelegramWebhook(req: Request, config: Config): Promise<Response> {
  const update = await req.json();
  const message = update?.message ?? update?.edited_message;
  const chatId = message?.chat?.id?.toString();
  const text = typeof message?.text === "string" ? message.text : "";

  if (chatId !== config.telegramChatId) {
    return jsonResponse({ ok: true, ignored: "unauthorized_chat" });
  }

  const today = singaporeDateString(new Date());
  const command = normalizeCommand(text);

  if (PAUSE_COMMANDS.has(command)) {
    await pauseToday(config, today, chatId);
    await sendTelegramMessage(config, "Paused Bus 15 alerts for today. They will resume tomorrow.");
    return jsonResponse({ ok: true, command, paused: today });
  }

  if (RESUME_COMMANDS.has(command)) {
    await resumeToday(config, today);
    await sendTelegramMessage(config, "Bus 15 alerts are active again for today.");
    return jsonResponse({ ok: true, command, resumed: today });
  }

  await sendTelegramMessage(
    config,
    "Use stop, pause, or done to pause today. Use resume or start to reactivate today.",
  );
  return jsonResponse({ ok: true, command: command || null, help: true });
}

Deno.serve(async (req: Request) => {
  try {
    const config = readConfig();

    if (isCronRequest(req, config)) {
      return await handleCron(config);
    }

    if (isTelegramWebhookRequest(req, config)) {
      return await handleTelegramWebhook(req, config);
    }

    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
