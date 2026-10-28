# M2028 Notes — setup, status, limits

## Files
| File | Where it goes |
|---|---|
| `index.html` (top level) | **The ready file.** Replace your current `index.html` with it. Notes code and styles are built in; nothing else is needed for local notes. |
| `notes-feature/notes.js`, `notes.css` | Readable source of what is built into `index.html` (only needed if you want to edit it) |
| `notes-feature/supabase/notes_schema.sql` | run once in the Supabase SQL editor |
| `notes-feature/worker/` | deploy to Cloudflare, then set `window.M2028_NOTES_CONFIG.workerUrl` near the end of `index.html` |
| `notes-feature/native/`, `share-target-pwa.md` | share-sheet integration (scaffolds, see status below) |

## UI map
* Main page: ☰ (opens a left drawer), title, search, a swipeable toolbar (Sort ▾, List/Grid view, Select, Folders, Labels, Storage & settings), "Take a note…" (+ for checklist / photo), notes.
* ☰ left drawer: All / Inbox / Starred / Reminders, your folders and labels, and Photos / Files / Links / Lists / Archive / Trash.
* Note editor: Attach, Checklist toggle, ⋯ (pin, star, archive, format, link, reminder, folder, labels, storage, duplicate, delete), Done.

## Cloud setup (≈15 min)
1. Run `notes_schema.sql`. Per-user quota (default **100 MB**), per-file cap (**25,000,000 bytes**) and a service-wide cap are rows in `notes_config` — edit them any time, no code change. Override one user: insert into `user_quota`.
2. Cloudflare: create a **private** R2 bucket `m2028-notes` (no public domain). `cd worker && npx wrangler secret put SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY`; set `ALLOWED_ORIGIN` in `wrangler.toml`; `npx wrangler deploy`.
3. Put the Worker URL in `index.html`. The service key lives only in the Worker secret store — never in the browser.

## Verified facts behind the limits (checked Oct 2026)
* Gmail: **25 MB** per sent email (50 MB receive). The app caps each file at 25,000,000 bytes, applied to raw file size (Gmail's MIME encoding makes its real limit lower; the cap is conservative about the spec, not about Gmail's overhead).
* Cloudflare R2 free tier: **10 GB-month** storage, 1M Class A / 10M Class B ops, zero egress — account-wide, not per user. Hence the per-user quota and the 9 GB service cap enforced in SQL.
* Supabase free: 500 MB database, 1 GB file storage, 50 MB max upload — database and file storage are separate; the app keeps only metadata in Postgres and files in R2.
Re-check pricing before launch; providers change it.

## What was actually tested (headless Chromium, mocked cloud)
* Real `index.html` loads with the patch, no console errors; fresh guest sees only Home / Pomodoro / Timetable & Calendar; Notes is an opt-in tab.
* Notes: create, checklist convert/tick, autosave, search, folders, grid/list, multi-select bulk, trash + undo, persistence across reload (IndexedDB).
* Home cleanup: hub Notes tab and Note Pad widget hidden; their content copied (once) into Notes; original `m_hubNotes` / `m_customWidgets` untouched.
* Share ingest (text, URL, image, PDF) creates one note each; oversize file is rejected without touching other notes; pending prompt, "Decide later", local choice, and cloud-without-sign-in refusal.
* Cloud path against a **mock** Worker/Supabase: quota bar, reserve→upload→synced, over-quota blocked before any upload with Cancel / Manage / Keep-on-device, local items excluded from usage.

## NOT tested / not done — read this
* **Native Android/iOS share without opening the app: scaffolds only.** Not compiled, not run on a device. A website alone cannot do this; the PWA share target opens the app (Android Chrome only; none on iOS).
* The SQL, the Worker and real Supabase RLS were **not run** against live services (no network here). Test with two accounts to confirm one user cannot read the other's rows/files.
* Real multi-device pull/conflict handling is implemented but only exercised against an empty mock.
* Reminders fire only while the app is open (no background push).
* Cloud file storage stays off until the Worker URL is set; until then Cloud works for note text only and files stay on the device with a clear message.
* Not built: end-to-end encryption (provider encryption at rest only), tag auto-categorisation beyond the Photos/Files/Links/Lists filters, document preview beyond open-in-new-tab.
* "Calendar" is your existing "Timetable & Calendar" tab. Existing users keep their current tab visibility; the 3-tab default applies to new guests only (so signed-in users' synced settings are never overwritten).

## Bug audit (latest round)
Fixed in Notes: Home notes were never migrated when data arrived after first load (and the old widget stayed visible) · migration now re-checks, and only hides widgets whose content is already in Notes · the Home "Notes" hub shortcut opened a blank panel · shared items could be lost if saving failed (inbox now cleared only after saving) · duplicated notes re-uploaded / double-counted the same file · removing an attachment or switching a note from cloud to device left the file in the cloud (still counted) · opening a note without editing re-stamped it and could re-sync it · a permanently deleted note could be resurrected by the editor's close-save · an empty new checklist could sync to the cloud · links broke on quotes / trailing punctuation and `javascript:` links were not blocked · quick-add notes could vanish from the current view and tapping away created stray notes · due dates had no button · no Esc to close · blank screen if the browser blocked storage · sync could miss edits when device clocks differ.
Fixed in SQL/Worker: re-runnable policies, server-side timestamps, function permissions tightened, repeat uploads are no-ops.
Found in your original index.html (not changed): one unclosed `<div id="appShell">` (browsers auto-close it, harmless); `push.js` and `leaf-icons.css` were referenced but not in the upload (expected to live in your repo). No script errors, no undefined inline handlers, no duplicate ids; all 11 tabs load.
Still open / by design: new accounts (not guests) still start with every tab visible · reminders fire only while the app is open · trashed cloud notes keep using cloud space until emptied from Trash · expired partial uploads can leave orphan objects in R2 (run a periodic cleanup) · native share-sheet code is untested.
