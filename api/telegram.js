const {
  PAUSE_COMMANDS,
  RESUME_COMMANDS,
  normalizeCommand,
  sendTelegramMessage,
} = require("../lib/bus15");
const { readConfig } = require("../lib/config");
const {
  isAuthorizedTelegramWebhook,
  readJsonBody,
  sendJson,
} = require("../lib/http");
const {
  pauseToday,
  resumeToday,
  singaporeDateString,
} = require("../lib/pause-store");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    const config = readConfig();

    if (!isAuthorizedTelegramWebhook(req, config.cronSecret)) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" });
    }

    const update = await readJsonBody(req);
    const message = update?.message ?? update?.edited_message;
    const chatId = message?.chat?.id?.toString();
    const text = typeof message?.text === "string" ? message.text : "";

    if (chatId !== config.telegramChatId) {
      return sendJson(res, 200, { ok: true, ignored: "unauthorized_chat" });
    }

    const today = singaporeDateString(new Date());
    const command = normalizeCommand(text);

    if (PAUSE_COMMANDS.has(command)) {
      await pauseToday(today, chatId);
      await sendTelegramMessage(
        config,
        "Paused Bus 15 alerts for today. They will resume tomorrow.",
      );
      return sendJson(res, 200, { ok: true, command, paused: today });
    }

    if (RESUME_COMMANDS.has(command)) {
      await resumeToday(today);
      await sendTelegramMessage(config, "Bus 15 alerts are active again for today.");
      return sendJson(res, 200, { ok: true, command, resumed: today });
    }

    await sendTelegramMessage(
      config,
      "Use stop, pause, or done to pause today. Use resume or start to reactivate today.",
    );
    return sendJson(res, 200, {
      ok: true,
      command: command || null,
      help: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(message);
    return sendJson(res, 500, { ok: false, error: message });
  }
};
