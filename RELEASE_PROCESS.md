# Release Process

Use this checklist whenever the project changes meaningfully.

## 1. Update Files

Update the relevant project files, then make sure secrets are not included:

- Do not commit `.env`.
- Do not commit Telegram bot tokens.
- Do not commit LTA AccountKeys.
- Do not commit `CRON_SECRET` values.

## 2. Update The Changelog

Edit `CHANGELOG.md` and add a new version section at the top.

Recommended versioning:

- Patch release: `0.3.1`
  - Small fixes, docs cleanup, message wording
- Minor release: `0.4.0`
  - New scheduler, new notification channel, new configuration
- Major release: `1.0.0`
  - Stable version you are happy to show as production-ready

## 3. Test

For the Python local/GitHub test path:

```bash
python -m unittest discover -v
```

For Supabase:

1. Confirm Edge Function secrets are set.
2. Confirm Vault secrets are set.
3. Run the manual SQL test from `SUPABASE_SETUP.md`.
4. Confirm Telegram receives the message.

## 4. Commit

Use a short, meaningful commit message.

Examples:

```text
Add Supabase scheduler for Bus 15 alerts
Simplify Telegram alert copy
Fix Supabase cron setup notes
```

## 5. Create A GitHub Release

In GitHub:

1. Open the repository.
2. Click **Releases**.
3. Click **Draft a new release**.
4. Create a new tag, for example `v0.3.0`.
5. Release title:

```text
v0.3.0 - Supabase scheduler
```

6. Paste the matching `CHANGELOG.md` section into the release notes.
7. Publish the release.

## Current Recommended Release

Create:

```text
v0.4.0 - Telegram pause commands
```

Release notes:

```text
Adds Telegram reply commands so stop, pause, or done pauses Bus 15 alerts for the current Singapore day, with resume/start to reactivate alerts.
```
