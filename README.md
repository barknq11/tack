# Tack

A minimal, friendly task manager for Windows, inspired by [Taskwarrior](https://taskwarrior.org).
Type tasks in plain English, watch them get done, and keep a little thumbtack cheering you on.

## Install

1. Open the [latest release](../../releases/latest) and download **`Tack-Setup-<version>.exe`**.
2. Run it. Tack installs for your user (no admin needed), adds Desktop and Start menu shortcuts, and opens.

The installer isn't code-signed, so Windows may show **"Windows protected your PC"**. Click **More info → Run anyway**.

To update, download the newer `Tack-Setup` and run it. Your tasks stay exactly as they are.

## Your tasks are safe

- Everything is saved to `%APPDATA%\Tack\store.json` right after each change, using crash-safe writes.
- The version before your last change is kept as `store.prev.json`, and a copy is made every day in `backups\` (last 30 days).
- Every install or update first copies your tasks to `backups\before-update-<date>.json`.
- Uninstalling Tack never deletes your tasks.
- If `store.json` is ever damaged or missing, Tack sets it aside and loads the newest good copy.
- A save can never quietly drop tasks that are already on disk: if one would remove several at once, Tack keeps them and reloads.
- If the window can't reach your data, Tack retries once, then shows a red warning and saves nothing.
- `tack.log` in the same folder records each start (where it looked, how many tasks it found) and any errors.

In the app: color dot (bottom-left) → **Where my tasks are saved** opens that folder. **Export tasks** saves a
Taskwarrior-compatible JSON file, and **Import tasks** reads one (including `task export` output).

## Using Tack

Type a task and press Enter. Tack understands:

| You type | It means |
| --- | --- |
| `Call mom tomorrow at 6pm` | due tomorrow, 18:00 |
| `Pay rent every month` | repeats; the next one appears when you finish |
| `Report in 3 days`, `next week`, `weekend`, `dec 5` | due dates |
| `#errand`, `@home.garden` | tag, project (dots nest) |
| `!`, `!!`, `!!!` | low, medium, high priority |
| `/milk` | search |

Taskwarrior commands work too: `3 done`, `2 modify fri !!`, `4 annotate …`, `undo`.

**Keys:** `n` new task · `j`/`k` move · `Enter` open · `d` done · `s` focus timer · `x` delete · `u` undo ·
`p` pin on top · `[` sidebar · `1`–`6` views · `?` help. **Right-click** anything for more.

**Pin (📌 or `p`)** swaps the full window for a small always-on-top window with your focus timer and next tasks.

## Building it yourself

```
npm ci
npm start        # run from source
npm run dist     # build dist\Tack-Setup-<version>.exe
```

Releases are built by GitHub Actions: bump `version` in `package.json`, then push a matching tag (for example `v1.0.1`).
The workflow builds the installer, checks on a clean Windows machine that installing, updating and uninstalling keep a
task file intact, and publishes the release.
