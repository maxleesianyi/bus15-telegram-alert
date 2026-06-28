# Bus 15 Telegram Alert

A small GitHub Actions automation that checks real-time LTA bus arrivals for Bus 15 at stop `75591` on weekday mornings, then sends a private Telegram message with the next and subsequent bus timings.

The alert is designed around a 10 minute walk to the bus stop plus a 2 minute safety buffer. If the next bus is too soon to catch, it recommends the subsequent bus instead.

## Schedule

The workflow runs on weekdays at these Singapore times:

- 8:15 AM
- 8:30 AM
- 8:45 AM
- 9:00 AM
- 9:15 AM

GitHub schedules are based on UTC, so the workflow file stores these as `00:15`, `00:30`, `00:45`, `01:00`, and `01:15` UTC. GitHub may occasionally start scheduled jobs a minute or two late.

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

## GitHub Setup

1. Create a new GitHub repository.
2. Upload the contents of this folder as the repository contents.
3. In the repository, open **Settings**.
4. Open **Secrets and variables** > **Actions**.
5. Add these repository secrets:

| Secret name | Value |
| --- | --- |
| `LTA_ACCOUNT_KEY` | Your LTA DataMall AccountKey |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from BotFather |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |

6. Open the **Actions** tab.
7. Select **Bus 15 Telegram Alert**.
8. Use **Run workflow** to send a manual test message.

After that, the weekday schedule will run automatically.

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

You can change the behavior in `.github/workflows/bus15-alert.yml`:

| Setting | Default |
| --- | --- |
| `SERVICE_NO` | `15` |
| `BUS_STOP_CODE` | `75591` |
| `WALK_MINUTES` | `10` |
| `BUFFER_MINUTES` | `2` |

The script uses the official LTA DataMall Bus Arrival endpoint and does not scrape the SBS Transit website.
