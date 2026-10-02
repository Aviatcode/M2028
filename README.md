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
