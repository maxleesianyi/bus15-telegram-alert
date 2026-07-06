# Changelog

All notable changes to this project are documented here.

This project follows semantic versioning:

- `MAJOR`: incompatible setup or behavior changes
- `MINOR`: new scheduler/backend/features
- `PATCH`: fixes, wording, small reliability improvements

## [0.5.0] - 2026-07-07

### Added

- Added Vercel Functions implementation for `/api/health`, `/api/check`, and `/api/telegram`.
- Added Upstash Redis pause-state storage for same-day `stop`, `pause`, and `done` replies.
- Added QStash schedule setup script with stable schedule IDs:
  - `bus15-alert-8am-sgt`
  - `bus15-alert-9am-sgt`
- Added Node test coverage for the Vercel implementation.
- Added Vercel deployment configuration and QStash setup documentation.

### Changed

- Made Vercel + QStash the current live runtime and scheduler.
- Moved away from Supabase Cron for the live weekday schedule.
- Updated README to describe the current production architecture and testing path.

### Notes

- Vercel Hobby cron cannot run this multi-check morning schedule, so QStash is used for the scheduler.
- Supabase cron is disabled but older Supabase files remain in the repository for release history.
- Do not commit `.env`, Telegram bot tokens, LTA AccountKeys, Redis tokens, QStash tokens, or `CRON_SECRET` values.

## [0.4.0] - 2026-07-04

### Added

- Added Telegram reply commands to pause alerts for the current Singapore calendar day.
- Added `stop`, `pause`, and `done` commands.
- Added `resume` and `start` commands to reactivate alerts for the same day.
- Added `bus15_daily_pauses` Supabase table for date-based pause state.
- Added Telegram webhook handling to the existing `bus15-telegram-alert` Edge Function.
- Added command safety so only the configured `TELEGRAM_CHAT_ID` can pause or resume alerts.

### Changed

- Scheduled Supabase Cron runs now check `bus15_daily_pauses` before sending alerts.
- When paused for the day, scheduled runs stay silent and only log a skipped response.

### Notes

- Telegram webhook registration is required once for reply commands to work.
- The same `CRON_SECRET` is used as the Telegram webhook secret token.

## [0.3.0] - 2026-07-03

### Added

- Added Supabase Edge Function `bus15-telegram-alert` to check LTA bus arrivals and send Telegram alerts.
- Added Supabase Cron migration with weekday schedules for:
  - 8:15, 8:30, 8:45 AM Singapore time
  - 9:00, 9:15 AM Singapore time
- Added Supabase Vault-based cron authentication using `bus15_cron_secret`.
- Added `SUPABASE_SETUP.md` with setup steps for Edge Function secrets, Vault secrets, and duplicate-alert cleanup.

### Changed

- Made Supabase the primary live scheduler.
- Changed GitHub Actions to manual-test only by removing scheduled triggers.
- Updated `README.md` to describe the Supabase architecture.

### Notes

- Do not commit `.env` or any secret values.
- Disable old GitHub Actions schedules and Codex Automations after confirming Supabase works.

## [0.2.0] - 2026-06-29

### Changed

- Simplified Telegram messages by hiding LTA load/type codes.
- Kept only the next and subsequent arrival times plus best catchable bus guidance.

### Fixed

- Improved local `.env` loading on Windows.

## [0.1.0] - 2026-06-28

### Added

- Added initial Python script for Bus 15 arrival checks.
- Added GitHub Actions workflow for weekday morning Telegram alerts.
- Added local `.env.example`, `.gitignore`, README, and unit tests.
