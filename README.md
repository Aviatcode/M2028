M2028 — Personal Master Planner

A single-file Progressive Web App (PWA) built for Ava — a BCA student targeting AI Engineering by January 2028 and UPSC CSE, while tracking fitness goals.

Live:https://aviatcode.github.io/M2028/

What it does

M2028 is an all-in-one personal productivity dashboard that replaces 6+ apps:

| Feature | Description |
|---|---|
|Daily Habits| Step-by-step habit builder with day picker, streak counter, one-tap check-off |
|Pomodoro Timer| 50-min focus / 10-min break, subject tagging, session log, sounds + notifications |
|Tasks| Due date + time, overdue alerts, notifications, completed section |
|UPSC Book Tracker| All 36 books across 9 subjects, chapter-by-chapter progress, tier guidance |
|AI Courses| 8-course track from CS50 → Harvard → Azure, adjusted around college exam blackouts |
|Timetable| 4 schedules (MWF / TTh / Sat / Sun), tap-to-edit rows |
|Calendar| Tap any date to see that day's habits done/missed, mark study/workout days |
|Roadmap| 6-phase 2-year plan, fully editable (add/edit/delete/reorder phases) |
|Body Tracker Body fat log, measurements, editable milestones (18% → 15%) |
|Dashboard Widgets| Customisable homepage — countdown timers, note pads, link buttons, checklists |

Tech Stack

- Frontend:Vanilla HTML + CSS + JavaScript — single file, no frameworks, no build step
- Auth + Sync:[Supabase](https://supabase.com) (PostgreSQL + Row Level Security)
- Hosting:[Github] https://aviatcode.github.io/M2028/
- Offline:localStorage cache — works instantly without network, syncs in background
- PWA:Installable on Android home screen via PWABuilder

Features

🔐 Authentication
- Email + password via Supabase Auth
- Guest mode (local-only, no account needed)
- Returning users bypass login screen — app loads instantly from cache
- Cloud sync happens in background after homepage is visible

🎨 Themes
- Dark(default) — deep dark background
- Light— clean white
- Pink / Girls Mode— rose-black with floating emoji animations, sparkle cursor trail, shimmer effects

⚡ Performance
- Single 350KB HTML file — no external JS frameworks
- Instant load from localStorage cache for returning users
- Supabase data syncs silently in background
- Midnight auto-reset — habits/tasks refresh at 12:00 AM without manual reload

🔔 Notifications
- Daily study reminders (6:30 AM, 4:30 PM, 6 PM, 7:30 PM, 8:30 PM)
- Task reminders fire at exact scheduled time
- Pomodoro session complete + break over alerts (with Web Audio API sounds)
- Re-schedules at midnight automatically

Database Setup (Supabase)

Run this SQL once in Supabase SQL Editor:

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

Then:
1. Authentication → Settings** → Disable "Enable email confirmations"
2. Authentication → URL Configuration


Roadmap (inside the app)

| Phase | Period | Focus |
|---|---|---|
| Foundation | May–Sep 2026 | CS50, Python basics, Polity + History NCERTs |
| Exam Blackout 1 | Oct–Dec 2026 | College exams, revise only |
| AI Depth | Jan–May 2027 | CS50 AI, HarvardX Data Science, Economics |
| Engineering | Jun–Aug 2027 | HarvardX ML, MongoDB, Projects 1 & 2 |
| Azure + Internship | Sep–Dec 2027 | 3 Azure certs, 20+ applications |
| Consolidation | Dec 2027–Jan 2028 | All 36 books revised, AI baseline complete |

Goal by Jan 2028:2 Harvard certs + 3 Azure certs, all 36 UPSC books read, 2 live projects, 15% body fat, internship active.

Local Development

No setup needed. Just open `index.html` in any browser.

For Supabase features, you'll need to set your own project URL and anon key in the JS constants at the bottom of the file.

Built with 💚 for the 2028 grind.
