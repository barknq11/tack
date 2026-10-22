# Tack

A minimal, friendly task manager for Windows and Linux, inspired by [Taskwarrior](https://taskwarrior.org).
Type tasks in plain English, watch them get done, and keep a little thumbtack cheering you on.

## Install

Everything is on the [latest release](../../releases/latest) page.

### Windows

1. Download **`Tack-Setup-<version>.exe`** and run it.
2. Tack installs for your user (no admin needed), adds Desktop and Start menu shortcuts, and opens.

The installer isn't code-signed, so Windows may show **"Windows protected your PC"**. Click **More info → Run anyway**.

### Linux

- **Ubuntu, Debian, Linux Mint, Pop!_OS:** download **`Tack-<version>-linux-amd64.deb`** and open it with your
  software installer, or run:

  ```
  sudo apt install ./Tack-<version>-linux-amd64.deb
  ```

  Tack then appears in your app menu.
- **Any other distribution:** download **`Tack-<version>-linux-x86_64.AppImage`**, then:

  ```
  chmod +x Tack-*.AppImage
  ./Tack-*.AppImage
  ```

  If it fails with a sandbox error (common on Ubuntu 24.04 and newer), run it as `./Tack-*.AppImage --no-sandbox`,
  or use the `.deb`. If it complains about FUSE, install `libfuse2` (`libfuse2t64` on Ubuntu 24.04).

On Linux, **Pin on top** works best on X11 sessions; some Wayland desktops don't allow apps to keep a window above others.

### Updating

Download the newer version and install it the same way. Your tasks stay exactly as they are.

## Your tasks are safe

- Everything is saved right after each change, using crash-safe writes, to `%APPDATA%\Tack\store.json` on Windows
  or `~/.config/Tack/store.json` on Linux.
- The version before your last change is kept as `store.prev.json`, and a copy is made every day in `backups\` (last 30 days).
- On Windows, every install or update first copies your tasks to `backups\before-update-<date>.json`.
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
npm run dist        # Windows: dist\Tack-Setup-<version>.exe
npm run dist:linux  # Linux (run on Linux): dist/Tack-<version>-linux-*.deb and .AppImage
```

Releases are built by GitHub Actions: bump `version` in `package.json`, then push a matching tag (for example `v1.1.1`).
The workflow builds Windows and Linux on their own machines. On Windows it checks that installing, updating and
uninstalling keep a task file intact; on Ubuntu it installs the `.deb`, starts Tack (and the AppImage) on a virtual
screen and checks they load a task file and leave it intact. Only if both pass is the release published.
