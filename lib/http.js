function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function isAuthorizedCron(req, cronSecret) {
  const headerSecret = req.headers["x-cron-secret"];
  const authorization = req.headers.authorization;

  return (
    headerSecret === cronSecret ||
    authorization === `Bearer ${cronSecret}`
  );
}

function isAuthorizedTelegramWebhook(req, cronSecret) {
  return req.headers["x-telegram-bot-api-secret-token"] === cronSecret;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

module.exports = {
  isAuthorizedCron,
  isAuthorizedTelegramWebhook,
  readJsonBody,
  sendJson,
};
