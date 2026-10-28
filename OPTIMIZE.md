# Cutting Supabase traffic (what changed, what to do)

## First, what the 47.6 GB is
"Logs Query" = data scanned when someone READS logs (Logs Explorer / API / CLI). The app cannot cause it.
Your app causes log INGEST (every request = log lines). Less traffic -> fewer logs -> every log query scans less.
Allowance = 100 x ingest. Stop leaving Logs Explorer / live log views open, use short time ranges + filters.

## What I changed in index.html (all measured by simulating timers for 1 visible tab, 1 hour)
| situation                       | requests before | after | fewer |
|---------------------------------|----------------:|------:|------:|
| realtime up, using the app      | 303             | 34    | 89%   |
| realtime DOWN, using the app    | 1332            | 362   | 73%   |
| realtime up, idle tab           | 303             | 20    | 93%   |
| realtime DOWN, idle tab         | 1332            | 182   | 86%   |
(Hidden tabs already did nothing. Multiply by your open devices. These are simulated timer counts, not live Supabase measurements.)

1. Change-check poll: every 3 s (realtime down) / 21 s (up)  ->  every 15 s (down) / 3 min (up); 5x slower again when you have not touched the app for 5 min.
2. Full re-download of every row every 5 min -> every 30 min (changes arrive via realtime / the cheap poll).
3. Switching back to a tab downloaded every value -> now fetches only rows that changed.
4. Encrypted tasks/meds sync: every 30 s -> reacts to realtime events immediately, safety poll every 5 min while realtime is up (30 s only if realtime is down).
5. Notes sync: 5 edits = 25 calls -> 5. Quota cached 60 s, incoming pull at most 1/min, folders/labels pushed only when changed, errored notes retried every 10 min instead of every minute.
Pomodoro sync was already efficient (writes only on start/pause/phase change) - untouched, still instant across devices via realtime.

## Biggest remaining lever: make sure Realtime is really ON
Run `supabase/realtime_check.sql`. If user_data is not in the realtime publication, every device polls (the "DOWN" rows above).
You can also check in the browser console after signing in: type `_rtLive` -> must be `true`.

## Things I could NOT do
* The browser extension: its code was not uploaded. Send manifest.json + its background/service-worker + hub scripts and I will apply the same rules (no timers faster than needed, listen instead of poll, keep state in chrome.storage.local).
* I cannot see your Supabase dashboard or logs; check Organization > Usage to see Egress and Logs Ingest after a few days.
* Pushes of the other (push.js / reminder) server are separate from Supabase and untouched.

## Optional next steps (tell me if you want them)
* A Settings switch "Sync: instant / every few minutes / manual" for users who want the lowest traffic.
* Merge the several per-key writes into one batched write.
* Stop syncing low-value keys (e.g. theme / UI-layout) that change often.
