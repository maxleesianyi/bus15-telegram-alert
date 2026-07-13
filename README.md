# Bus 15 Telegram Alert

A small private automation that checks real-time LTA bus arrivals for Bus 15 at stop `75591`, then sends a Telegram alert on weekday mornings.

The alert is designed around a 10 minute walk to the bus stop plus a 2 minute safety buffer. If the next bus is too soon to catch, it recommends the subsequent bus instead.

You can also reply to the Telegram bot with `stop`, `pause`, or `done` to silence the remaining alerts for the current Singapore calendar day. Reply `resume` or `start` to reactivate alerts for the same day. Send a message such as `Bus 20 76953` to get the next two arrivals for any bus service and stop.

## Current Setup

The live version now uses:

- Vercel Functions for the Bus 15 check endpoint and Telegram webhook
- QStash for the weekday morning schedule
- Upstash Redis for same-day pause state
- Telegram for notifications and reply commands

Supabase cron has been disabled. The older Supabase files are kept in this repository for release history, but Supabase is no longer the live scheduler.

## Live Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/api/health` | Public health check |
| `/api/check` | Secured bus check endpoint |
| `/api/telegram` | Secured Telegram webhook |

Production URL:

```text
https://bus15-telegram-alert.vercel.app
```

## Schedule

QStash runs the live weekday schedule directly against `/api/check`.

| Singapore time | QStash cron |
| --- | --- |
| 7:45 AM weekdays | `CRON_TZ=Asia/Singapore 45 7 * * 1-5` |
| 8:00, 8:15, 8:30 AM weekdays | `CRON_TZ=Asia/Singapore 0,15,30 8 * * 1-5` |

The active QStash schedule IDs are:

- `bus15-alert-745am-sgt`
- `bus15-alert-8am-sgt`

## What The Telegram Message Includes

Example:

```text
Bus 15 at stop 75591 checked 8:15 AM SGT

Next: 7 min
Subsequent: 18 min

Best catchable: subsequent bus. Leave around 8:21 AM (6 min from now).
```

If no arrival data is available, the alert asks you to check the SBS/LTA app before leaving.

## Telegram Commands

| Telegram message | Result |
| --- | --- |
| `Bus 20 76953` | Instantly returns the next and subsequent Bus 20 arrivals at stop 76953. |
| `stop`, `pause`, or `done` | Silences only the remaining Bus 15 scheduled alerts for today. |
| `resume` or `start` | Reactivates Bus 15 scheduled alerts for today. |

## Required Secrets

Set these in Vercel project environment variables:

```text
LTA_ACCOUNT_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
CRON_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
SERVICE_NO=15
BUS_STOP_CODE=75591
WALK_MINUTES=10
BUFFER_MINUTES=2
```

Set these only locally when creating or updating QStash schedules:

```text
QSTASH_TOKEN=
QSTASH_BASE_URL=https://qstash-us-east-1.upstash.io
```

Do not commit `.env`, Telegram bot tokens, LTA AccountKeys, `CRON_SECRET`, Redis tokens, or QStash tokens.

## Setup And Test

Install dependencies:

```bash
pnpm install
```

Run tests:

```bash
pnpm test
```

Create or update the QStash schedules:

```bash
pnpm run setup:qstash
```

Test the live endpoint without sending Telegram:

```bash
curl "https://bus15-telegram-alert.vercel.app/api/check?dryRun=1" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Test the live endpoint and send Telegram:

```bash
curl -X POST "https://bus15-telegram-alert.vercel.app/api/check" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

## Releases

See [CHANGELOG.md](CHANGELOG.md) for version history and [RELEASE_PROCESS.md](RELEASE_PROCESS.md) for the release checklist.

Release note drafts are kept in [releases](releases/).

## Legacy Versions

- `v0.1.0`: Initial GitHub Actions scheduler
- `v0.2.0`: Simplified Telegram message and improved local script
- `v0.3.0`: Supabase scheduler
- `v0.4.0`: Telegram pause commands
- `v0.5.0`: Vercel + QStash scheduler

The script uses the official LTA DataMall Bus Arrival endpoint and does not scrape the SBS Transit website.
