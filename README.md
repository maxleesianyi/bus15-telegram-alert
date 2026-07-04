# Bus 15 Telegram Alert

A small Supabase scheduler that checks real-time LTA bus arrivals for Bus 15 at stop `75591` on weekday mornings, then sends a private Telegram message with the next and subsequent bus timings.

The alert is designed around a 10 minute walk to the bus stop plus a 2 minute safety buffer. If the next bus is too soon to catch, it recommends the subsequent bus instead.

You can also reply to the Telegram bot with `stop`, `pause`, or `done` to silence the remaining alerts for the current Singapore calendar day. Reply `resume` or `start` to reactivate alerts for the same day.

## Current Setup

This project now uses Supabase as the reliable scheduler:

- Supabase Edge Function: `bus15-telegram-alert`
- Supabase Cron jobs:
  - `bus15-alert-8am`
  - `bus15-alert-9am`
- Telegram reply commands for pausing/resuming the current day
- GitHub Actions: manual testing only

The old GitHub scheduled trigger has been removed because GitHub Actions scheduled jobs can run late.

## Schedule

Supabase Cron runs on weekdays at these Singapore times:

- 8:15 AM
- 8:30 AM
- 8:45 AM
- 9:00 AM
- 9:15 AM

The cron expressions are stored in UTC:

| UTC cron | Singapore time |
| --- | --- |
| `15,30,45 0 * * 1-5` | 8:15, 8:30, 8:45 AM weekdays |
| `0,15 1 * * 1-5` | 9:00, 9:15 AM weekdays |

## What The Telegram Message Includes

Example:

```text
Bus 15 at stop 75591 checked 8:15 AM SGT

Next: 7 min
Subsequent: 18 min

Best catchable: subsequent bus. Leave around 8:21 AM (6 min from now).
```

If it is already time to leave, the message says:

```text
Leave now for the next bus. It arrives in 11 min.
```

## Supabase Setup

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the Edge Function, Cron, Vault, and secret setup.

## Releases

See [CHANGELOG.md](CHANGELOG.md) for version history and [RELEASE_PROCESS.md](RELEASE_PROCESS.md) for the release checklist.

Release note drafts are kept in [releases](releases/).

## GitHub Actions

The GitHub workflow is kept only for manual testing from the **Actions** tab. It does not run on a schedule.

If you use Supabase as the live scheduler, do not re-enable the GitHub scheduled trigger unless you want duplicate Telegram alerts.

## Local Test

Create a local `.env` file from `.env.example`, fill in your values, then run:

```bash
python bus15_alert.py
```

To print the message without sending it to Telegram, set:

```text
DRY_RUN=true
```

## Adjusting The Automation

For the Supabase scheduler, update these values in Supabase Edge Function secrets:

| Setting | Default |
| --- | --- |
| `SERVICE_NO` | `15` |
| `BUS_STOP_CODE` | `75591` |
| `WALK_MINUTES` | `10` |
| `BUFFER_MINUTES` | `2` |

The script uses the official LTA DataMall Bus Arrival endpoint and does not scrape the SBS Transit website.
