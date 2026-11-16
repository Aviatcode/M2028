# M2028

A personal study-and-life dashboard that runs as one web page (`index.html`) and installs as a PWA on phones and desktops. It is local-first: everything works offline and is stored on the device, with optional cloud sync.

---

## What's inside

### Tabs

| Group | Tab | Notes |
|---|---|---|
| Today | **Home** | Daily dashboard: streak, screen-time hub, habits, calendar |
| Today | **Pomodoro** | Focus / break timer, synced with the browser extension |
| Today | **Notes** | Local-first notes with folders, labels, files and photos |
| Today | **Draw** | Whiteboard / sketchpad (new, see below) |
| Today | **Wallpaper** | Wallpaper picker |
| Study | **UPSC Books**, **AI Courses**, **Timetable & Calendar** | Study planning |
| Track | **Money**, **Roadmap**, **Block Sites**, **Body**, **Period** | Tracking |

Tabs can be hidden and reordered from the customize window. On phones the bottom bar shows the first few; the rest are under **More**.

### Themes

**Dark**, **White**, **Girl** and **Journal**. The theme button is in Customize.

* **Stickers** (Customize → 🌸 Stickers) scatter a collage of stickers behind the page.
  * **Girl** mode: as before.
  * **Journal** mode: the same stickers at **50% opacity**, lying behind the paper sheets so text stays readable. The switch turns them on and off.
* The Draw tab keeps its own clean canvas, so stickers don't show through it.

### Journal: hand-drawn everywhere
The cards' hand-made line work is now used on everything else in Journal, in the theme's own pen colour so it follows every paper colour:

* **menus and modals** (More menu, Customize, profile…) get the uneven pen outline, a second wobbly pass of the pen, the pencil-offset shadow and uneven corners; the More menu is held up by a strip of washi tape
* modal titles get a wavy pen line instead of a plain rule, and menu entries get a marker-pen highlight
* **buttons, chips and switches** share the same pen line and offset shadow, which "presses flat" when tapped
* the notes composer, note cards, toasts, the bottom bar (phones) and the Draw tools use the same style

The Draw canvas itself stays a clean drawing surface.

---

## Pomodoro

### Notification schedule
The same schedule is used for push alerts (works with the app closed, including iPhone) and for the on-page live notification (desktop / Android):

| Time left in the phase | Notification |
|---|---|
| more than 10 min | every 2 minutes |
| 10 min | one notification (covers 10 → 5) |
| 5 min | one notification (covers 5 → 3) |
| 3, 2, 1 min | one every minute |

The "**2 min left**" warning is separate and unchanged. At the 2-minute mark you get that warning, not a second countdown alert.

### Opening the app
If a Pomodoro session exists when you open the app, whether it is **running, or paused here, in the extension, or on another device**, the app opens on the **Pomodoro** tab. With no session it opens on **Home**.

* A paused session older than 12 hours counts as finished.
* A finished cycle, or a timer that was never started, counts as "no session".
* It only switches away from Home, never overrides a tab you opened yourself, and waits while the first-run tour is showing.
* Returning to the app after 2+ minutes in the background applies the same rule (from Home only).

### Phone audio (keep-alive)
On phones a silent audio track keeps the timer alive in the background. It now starts only when you press the Pomodoro start button.

## Susurrus (NSDR audio)

* The lock-screen "Now Playing" card shows **only while Susurrus is playing**, and clears when you pause or it ends. Previously it was set at page load, so iOS showed it whenever any silent audio played.
* While a Pomodoro runs on a phone, the card reads "Focus session running" / "Break running".
* When Susurrus is paused and the app goes to the background or the screen locks, the audio is released so iOS drops the card. Your position is restored when you return.

## Notifications: what can appear
Only: the Pomodoro live / push alerts above, and reminders (tasks, medicines, notes). Nothing else.

---

## Notes

Local-first (IndexedDB on the device). Items can stay local or be saved to the cloud. Photos and files can be attached, and on iPhone the **Share → M2028** shortcut (`save-to-notes.shortcut`) sends links, text and photos into Notes.

**Drawings in Notes:** Draw → *Save to Notes* creates a note with a **JPG preview** and the editable **`.excalidraw` file** attached. Saving again updates the same note. Open it later with *Open from Notes* in the Draw menu, or the **Edit in Draw** button inside the note.

---

## Draw

An Excalidraw-style whiteboard that fits every theme. Drawings autosave on the device.

### Canvas
* "Almost infinite": **24,000 × 24,000 units**, with scroll indicators; the edge turns red when you near it.
* Zoom about **5% → 800%**. Wheel scrolls, **Ctrl + wheel** or **pinch** zooms, **Space + drag** or the hand tool pans.
* Full-screen button, grid, snap-to-grid, zen mode, light / dark canvas, canvas background colours.

### Tools
Selection, hand, rectangle, diamond, ellipse, arrow (sharp / round / elbow, sticks to shapes), line (multi-point), pen, text, sticky note, eraser. More tools (⋮): image, frame, web-link card, **draw to shape** (tidies a rough shape), laser pointer, bucket fill, lasso. **Mermaid to diagram** turns pasted flowcharts into shapes.

Style panel: stroke, background, fill (hachure / cross-hatch / solid), width, stroke style, sloppiness (architect / artist / cartoonist), edges, arrowheads, fonts (hand-drawn, normal, code), size, alignment, opacity, layers, duplicate, delete, link, group.

Also: undo / redo, copy / paste, alt-drag duplicate, groups, labels inside shapes (double-click), **library** of reusable items, **find on canvas**, **present** (each frame is a slide), command palette.

### Keyboard
| | |
|---|---|
| Tools | `V` select · `H` hand · `R` rect · `D` diamond · `O` ellipse · `A` arrow · `L` line · `P` pen · `T` text · `N` note · `E` eraser · `F` frame · `K` laser · `B` bucket · `9` image · `Shift+X` draw-to-shape · `Q` keep tool |
| Edit | `Ctrl+Z` / `Ctrl+Shift+Z` · `Ctrl+C/X/V` · `Ctrl+D` duplicate · `Ctrl+A` · `Delete` · `Ctrl+G` group · `Ctrl+[` / `]` layers |
| View | `Shift+1` fit all · `Shift+2` zoom to selection · `Ctrl+'` grid · `Alt+Z` zen · `?` help |
| Files | `Ctrl+S` save to Notes · `Ctrl+O` open · `Ctrl+Shift+E` export · `Ctrl+F` find · `Ctrl+/` command palette |

### Pencil, stylus and palm rejection
* **Pressure:** Apple Pencil and other pressure-sensitive styluses vary the line width. Tapered ends, smoothed strokes, and high-rate samples (about 240 per second on Apple Pencil) are used.
* **Palm rejection:**
  * touches are ignored while the pen is touching the screen and for about 0.7 s after it lifts;
  * very large (palm-sized) contacts are ignored on devices that report contact size.
* **Finger vs pencil:** the first time a stylus is detected, fingers stop drawing: **one finger scrolls, two fingers pinch-zoom**, and the pencil draws and selects. Turn finger drawing back on any time from **Menu → Finger drawing**. The choice is remembered.
* **Eraser end:** a stylus with an eraser end (or eraser button) erases wherever you drag it, whatever tool is active.
* Hovering, double-tap and squeeze gestures of the Apple Pencil are not available to web pages.

### Paste and drag-and-drop from anywhere
Press **Ctrl+V** (or right-click → Paste) or drag things in from other apps. Several items are laid out together and pasting again in the same place staggers the copies.

| You paste / drop | You get |
|---|---|
| a screenshot, an image file, or a picture dragged from a web page | an image (large ones are scaled down so they fit in storage) |
| SVG markup | an image |
| plain, rich or tabular text | a text block |
| a link, or a link dragged from the address bar | a link card (a link to an image becomes the image) |
| text and code files (`.txt .md .csv .json .py .js .html` …) | the file's text |
| `.excalidraw` files | a choice to **add them to the canvas or replace it** |
| `.excalidrawlib` files | imported into the library |
| anything else (PDF, Word, Excel, audio, video, zip …) | a **file card**; files up to 400 KB are kept inside the drawing and save with a double-click, bigger ones keep just the card |

While you drag, the canvas shows a drop target. Right-click → **Copy as image** puts the selection on the clipboard as a picture.

### Saving and exporting
* **JPG, PDF, PNG** from *Export* (`Ctrl+Shift+E`): choose everything or selection, background, light / dark look, 1× / 2× / 3×, and PDF page (fit drawing or A4). **Copy PNG** is also there.
* **Save to Notes** (above) and **`.excalidraw`** files (open on excalidraw.com; labels and sticky notes carry over as text).
* Where it lives on the device: `m2028_draw_v1` (scene), `m2028_draw_files_v1` (images), `m2028_draw_lib_v1` (library). These are not sent to the cloud automatically.

### Not included
Excalidraw's AI tools (Text to diagram, Wireframe to code), live collaboration and comments. Web-link cards open in a new tab rather than embedding the page.

---

## Browser extension

### Usage limits and screen time (fixed in 2.5.7)
**Symptom:** minutes spent on a site with a daily usage limit stopped counting.

**Cause:** Chrome shuts an extension's background worker down after about 30 seconds of quiet and starts a fresh one for the next event. The tracker kept "which site, since when" only in memory, so after each restart the time since the last 30-second heartbeat was thrown away. If the worker was restarted before every heartbeat, nothing was ever counted.

**Fix (`background.js`):**
* the tracker now saves its state and restores it when the worker restarts, so the gap is counted
* a long gap (sleep, hibernation, lid closed) is still **not** counted
* the "is the user active" flag now follows Chrome's real idle state, so a missed idle/active event can no longer leave counting switched off
* the 30-second heartbeat alarm is only created when missing; creating it again on every wake-up restarted its countdown

Tested by simulating the worker restarting before every heartbeat: 10 minutes on a limited site counted as **0 s before** and **600 s after**, the limit triggered at the right moment, 45 minutes of sleep counted as nothing, and an unfocused browser counted as nothing. `manifest.json` is now **2.5.7**. Reload the extension (or run the installer) after updating the files.

### Theme sync between the extension and the website (2.5.8)
**Symptom:** choosing a theme in the extension did nothing on the website, and was undone the next time the website opened.

**Cause:** the extension only copied the theme *from* the website, and did so every time the site loaded, so the website's old theme always overwrote the extension's. An open website was never told about the change, and the extension's two theme keys (`theme` / `m_theme`) could end up disagreeing.

**Fix:** each side now records when the theme was changed; the newer choice wins.
* a theme chosen in the extension is applied to an open website straight away, and wins when the website is opened later
* a theme changed on the website is copied to the extension as before
* the two extension keys are kept identical
* with no timestamps (old data) it behaves as before

Tested with the real `background.js` and `content.js` running together: a popup toggle with the site open, a toggle with the site closed and then opened, the website being newer, a toggle on the website, and old data.

> Two things in the popup can't be fixed from these files: how its theme button cycles (it must include **journal**) and the dot on the profile picture; both live in `popup.html / popup.js / popup.css`.

## Files the app expects next to `index.html`

`manifest.json`, `push.js`, `ios-share.js`, `stickers.js` (the sticker artwork), `leaf-icons.css`, `pom-duo.webp`, `sussurus1.mp3`, icons (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png`), `save-to-notes.shortcut`. The browser extension (popup, options, offscreen page) is an optional companion for Pomodoro and screen-time sync.

> `stickers.js` is needed for the sticker collage. Without it Journal and Girl mode show no background stickers.

## Browser notes
* Draw uses pointer events, so it works with mouse, touch and pen. Tested at desktop and phone sizes; Apple Pencil behaviour was verified with simulated pen and touch input, not on an iPad.
* The hand-drawn font (Caveat) loads from Google Fonts; offline, Draw falls back to a system handwriting / cursive font.
* Canvas exports are capped to about 14 megapixels so they work on iPhone.

---

## Changelog

### This release
* **Fixed** extension usage limits not counting minutes (extension 2.5.7, see above).
* **Fixed** extension theme toggle (extension 2.5.8, see above).
* **Changed** Journal: menus, modals, buttons and tools now use the same hand-drawn pen line, wobble, pencil-offset shadow, wavy rules and washi tape as the cards (the paper-texture experiment was removed).
* **Changed** Journal stickers use only the Girl-theme sticker layer at 50% (the built-in fallback set was removed).
* **New** Draw: paste and drag-and-drop of images, text, links, SVG, code and any file; add-or-replace for dropped drawings; copy as image.

### Earlier
* **Fixed** the "Susurrus" lock-screen card appearing when nothing was playing.
* **Changed** Pomodoro notifications: 2-minute steps, then 10 / 5 / 3 / 2 / 1 minutes left in the last stretch.
* **New** Opening the app lands on the Pomodoro tab when a session exists (paused or running), Home otherwise.
* **New** **Draw** tab in every theme: full whiteboard, JPG / PDF / PNG export, save to and open from Notes, bounded zoomable canvas.
* **New** Pencil / stylus pressure, palm rejection, finger-scroll mode and eraser end in Draw.
* **New** Background stickers in the Journal theme at 50% opacity.
