# M2028 - Personal Master Planner

A single-file Progressive Web App (PWA) that puts your habits, focus timer, tasks, study tracking and body goals in one clean dashboard. No frameworks, no build step — just open `index.html`.

## Features

| Feature | What it does |
|---|---|
| **Daily Habits** | Build habits with a custom day picker, one-tap check-off, per-habit streaks and a monthly scorecard |
| **Streak Milestones** | Celebrations with confetti and sound at 7, 15, 30, 50, 100 days and beyond |
| **Pomodoro Timer** | 50 / 10 focus-break cycles, long break after a full round, subject tagging, weekly session log, five alert sounds |
| **Live Timer Notification** | An ongoing notification shows the running timer and your next tasks |
| **Tasks** | Due dates and times, reminders before and at the deadline, overdue alerts, completed section |
| **Book Tracker** | Chapter-by-chapter progress, up to 10 revision rounds per book, add / edit / remove books |
| **Course Tracker** | Ordered learning track with progress bars, links and drag-to-reorder |
| **Project Log** | Track personal projects with status, tech stack, links and a dated progress log |
| **Timetable** | Four editable schedules (Mon/Wed/Fri, Tue/Thu, Sat, Sun) |
| **Calendar** | Tap any date to see what was done or missed; days are colour-coded |
| **Roadmap** | Fully editable multi-phase plan — add, edit, delete and reorder phases |
| **Body Tracker** | Body-fat log, measurements and editable milestones |
| **Cycle Tracker** | Predictions, fertile window and history (shown in Girl mode) |
| **Guided Relaxation Player** | Built-in 10-minute audio player for downtime between sessions |

### Dashboard widgets
Rearrange and resize everything on the home screen, and add your own widgets:
- Countdown timers
- Note pads (paste or attach photos)
- Link buttons
- Checklists with sub-items and drag-to-reorder

### Themes & personalisation
- **Dark**, **Light** and **Girl mode** (falling leaves, sparkle cursor trail, shimmer effects)
- Your last theme is remembered on each device
- Custom background / text / accent colours for every theme, with quick presets
- Wallpaper support with an adjustable dim level, plus a full-screen wallpaper tab
- Rename, hide and reorder the navigation tabs
- Responsive layouts: bottom bar on phones, labelled top bar on tablets, full dashboard on desktop

### Accounts & sync
- Email + password sign-in through Supabase, or **guest mode** (local only, no account)
- Changes sync across your devices in real time and merge safely when edited in two places
- Everything works from local storage first, so the app opens instantly

### Offline & performance
- Installable on Android, iOS and desktop
- A service worker saves the app on your device: opens instantly, works offline, refreshes quietly in the background
- Reminders and midnight auto-reset keep habits and tasks fresh each day
- Single HTML file, no external JS frameworks

## Tech stack

- **Frontend:** vanilla HTML, CSS and JavaScript
- **Auth & sync:** [Supabase](https://supabase.com) (PostgreSQL + Row Level Security)
- **Hosting:** GitHub Pages (any static host works)
- **Storage:** `localStorage` first, background cloud sync
- **PWA:** web manifest + service worker

## Project files

| File | Purpose |
|---|---|
| `index.html` | The whole app |
| `sw.js` | Service worker: offline caching and the live timer notification |
| `manifest.json` | Install details (name, icons, colours) |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png` | App icons |
| `sussurus1.mp3` | Audio for the relaxation player |

## Install the browser extension

The installer scripts are different for Windows vs. macOS/Linux — **use the one that matches your OS and terminal.** Running the Bash command in PowerShell (or vice versa) is the most common installation failure, since PowerShell's `curl` is an alias for `Invoke-WebRequest` and doesn't understand Bash flags like `-fsSL`.

**Windows (PowerShell 5.1+):**
```powershell
& ([scriptblock]::Create((irm 'https://aviatcode.github.io/M2028/install.ps1'))) brave
```
Replace `brave` with `chrome` or `edge` if you use a different browser. This runs `install.ps1` — do not use the `curl | bash` command below in PowerShell.

**macOS / Linux (bash/zsh):**
```bash
curl -fsSL https://aviatcode.github.io/M2028/install.sh | bash -s -- brave
```
Replace `brave` with `chrome` or `edge` if needed.

**Security note:** both commands pipe a remotely-hosted script straight into an interpreter. That's convenient, but it means you're trusting whatever is currently published at that URL at the moment you run it. If you'd rather review the script first, download it and read it before running:
```bash
# macOS/Linux
curl -fsSL https://aviatcode.github.io/M2028/install.sh -o install.sh && less install.sh && bash install.sh brave
```
```powershell
# Windows
irm https://aviatcode.github.io/M2028/install.ps1 -OutFile install.ps1; notepad install.ps1; .\install.ps1 brave
```

Either installer downloads the extension files to a staging folder first, validates them (including the manifest), and only then replaces your existing install — so a failed or interrupted run won't leave you with a broken extension. After it finishes:
- **First install:** open your browser's extensions page, turn on Developer mode, click "Load unpacked", and select the folder the script printed (`%LOCALAPPDATA%\M2028-Extension` on Windows, `~/M2028-Extension` on macOS/Linux).
- **Update:** click the reload arrow on the M2028 card on the extensions page — the script does not do this automatically, since browsers don't expose that to a script.

The installers only prepare and update a locally-loaded ("unpacked") extension; they cannot publish it to the Chrome Web Store or Edge Add-ons, bypass the "Load unpacked" step, or silently enable it — that's a one-time manual action by design, for browser security.

### Optional: stop running the command by hand

Add `-Schedule` (Windows) or `--schedule` (macOS/Linux) to the install command to set up a background job that silently re-downloads the extension files once a day, so they never go stale without you doing anything. This does **not** make updates fully automatic — Chromium only reloads an unpacked extension's code when you click the reload arrow on its extensions page, and that one click can't be scripted away for a developer-mode install (it's the same restriction that stops any webpage from silently rewriting code running with your browser's permissions). What it does remove is the "copy a command into a terminal" step: with `--schedule` on, all that's left is clicking reload when the Screen Time & Hub widget shows **Update available**.

```powershell
# Windows — uses Task Scheduler, no admin rights needed
& ([scriptblock]::Create((irm 'https://aviatcode.github.io/M2028/install.ps1'))) brave -Schedule
```
```bash
# macOS/Linux — uses launchd / cron, no sudo needed
curl -fsSL https://aviatcode.github.io/M2028/install.sh | bash -s -- brave --schedule
```

Turn it back off with `-Unschedule` / `--unschedule` (same syntax, no browser name needed).

This has no cost and needs no account of any kind — unlike genuine silent auto-updates, which Chromium only grants to extensions listed on the Chrome Web Store (a one-time $5 developer fee) or Edge Add-ons (free). If that tradeoff is ever worth it to you, Edge Add-ons gets you real zero-click updates for Edge users at no cost; Chrome/Brave auto-updates require the Web Store, which also covers Brave since it's Chromium-based.

## Run it locally

No setup needed for guest mode: open `index.html` in a browser. Service-worker features (offline mode, live notification) need the page served over `http://localhost` or `https`, for example:

```bash
python3 -m http.server 8000
```

## Set up your own sync (optional)

1. Create a project at [supabase.com](https://supabase.com).
2. Run this once in the **SQL Editor**:

```sql
create table if not exists user_data (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  data_key text not null,
  data_value jsonb,
  updated_at timestamp default now(),
  unique(user_id, data_key)
);

alter table user_data enable row level security;

create policy "own" on user_data for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

3. In `index.html`, replace the `SUPA_URL` and `SUPA_KEY` constants with your project's URL and anon key.
4. In **Authentication → URL Configuration**, set the Site URL to where you host the app, and update the `emailRedirectTo` address in `index.html` to match.
5. Optional: turn off **Enable email confirmations** if you want instant sign-up.

## Deploying

Upload the files in this repo to any static host. On GitHub Pages: **Settings → Pages → Deploy from branch → `main`**.

After you publish an update, open the app twice to see the new version (the first open downloads it in the background). To force everyone onto a fresh copy right away, bump `VERSION` at the top of `sw.js`.

Built with 💚 for the grind.
