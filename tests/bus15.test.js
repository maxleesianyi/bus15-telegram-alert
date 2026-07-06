const assert = require("node:assert/strict");
const { composeMessage, normalizeCommand, parseArrivals } = require("../lib/bus15");
const {
  secondsUntilNextSingaporeDay,
  singaporeDateString,
} = require("../lib/pause-store");

const config = {
  serviceNo: "15",
  busStopCode: "75591",
  walkMinutes: 10,
  bufferMinutes: 2,
};

const now = new Date("2026-07-06T00:15:00.000Z");
const payload = {
  Services: [
    {
      NextBus: { EstimatedArrival: "2026-07-06T00:22:00+08:00" },
      NextBus2: { EstimatedArrival: "2026-07-06T00:34:00+08:00" },
      NextBus3: { EstimatedArrival: "" },
    },
  ],
};

const arrivals = parseArrivals(payload, now);
assert.deepEqual(arrivals, [
  { label: "Next", etaMinutes: 0 },
  { label: "Subsequent", etaMinutes: 0 },
  { label: "Third", etaMinutes: null },
]);

const betterPayload = {
  Services: [
    {
      NextBus: { EstimatedArrival: "2026-07-06T08:22:00+08:00" },
      NextBus2: { EstimatedArrival: "2026-07-06T08:34:00+08:00" },
      NextBus3: { EstimatedArrival: "" },
    },
  ],
};

const betterArrivals = parseArrivals(betterPayload, now);
const message = composeMessage(config, betterArrivals, now);
assert.match(message, /Next: 7 min/);
assert.match(message, /Subsequent: 19 min/);
assert.match(message, /Best catchable: subsequent bus/);

assert.equal(normalizeCommand("/pause@my_bot now"), "pause");
assert.equal(normalizeCommand("DONE"), "done");
assert.equal(singaporeDateString(now), "2026-07-06");
assert.ok(secondsUntilNextSingaporeDay(now) > 0);

console.log("Bus15 tests passed");
