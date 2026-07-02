# Supabase Bus 15 Telegram Scheduler

This project can run entirely on Supabase:

- Supabase Edge Function: checks LTA and sends Telegram
- Supabase Cron: invokes the function on weekday mornings
- Supabase Secrets and Vault: stores private keys

## 1. Edge Function Secrets

In the Supabase Dashboard, open:

`Project Settings` > `Edge Functions` > `Secrets`

Add these secrets:

| Name | Value |
| --- | --- |
| `LTA_ACCOUNT_KEY` | Your LTA DataMall AccountKey |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `CRON_SECRET` | A long random string that you also store in Vault as `bus15_cron_secret` |
| `SERVICE_NO` | `15` |
| `BUS_STOP_CODE` | `75591` |
| `WALK_MINUTES` | `10` |
| `BUFFER_MINUTES` | `2` |

## 2. Vault Secrets For Cron

In the Supabase SQL Editor, run:

```sql
select vault.create_secret('https://dqcfmnghiehggsosjkdj.supabase.co', 'bus15_supabase_project_url');
select vault.create_secret('PASTE_THE_SAME_CRON_SECRET_HERE', 'bus15_cron_secret');
```

Use the exact same `CRON_SECRET` value in both places.

## 3. Schedule

Supabase Cron uses UTC in the migration:

| UTC cron | Singapore time |
| --- | --- |
| `15,30,45 0 * * 1-5` | 8:15, 8:30, 8:45 AM weekdays |
| `0,15 1 * * 1-5` | 9:00, 9:15 AM weekdays |

Singapore does not use daylight saving time, so this mapping is stable.

## 4. Avoid Duplicate Alerts

Disable the old schedulers after Supabase is working:

- GitHub Actions workflow
- Codex Automations for Bus 15
