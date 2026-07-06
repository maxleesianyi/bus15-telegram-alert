const {
  composeMessage,
  fetchBusArrivals,
  parseArrivals,
  sendTelegramMessage,
} = require("../lib/bus15");
const { readConfig } = require("../lib/config");
const { isAuthorizedCron, sendJson } = require("../lib/http");
const { isPausedToday, singaporeDateString } = require("../lib/pause-store");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    const config = readConfig();

    if (!isAuthorizedCron(req, config.cronSecret)) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" });
    }

    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const dryRun = url.searchParams.get("dryRun") === "1";
    const now = new Date();
    const today = singaporeDateString(now);

    if (await isPausedToday(today)) {
      return sendJson(res, 200, {
        ok: true,
        checkedAt: now.toISOString(),
        skipped: "paused_for_today",
      });
    }

    const payload = await fetchBusArrivals(config);
    const arrivals = parseArrivals(payload, now);
    const message = composeMessage(config, arrivals, now);
    if (!dryRun) {
      await sendTelegramMessage(config, message);
    }

    return sendJson(res, 200, {
      ok: true,
      checkedAt: now.toISOString(),
      sent: !dryRun,
      dryRun,
      message: dryRun ? message : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(message);
    return sendJson(res, 500, { ok: false, error: message });
  }
};
