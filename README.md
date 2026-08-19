# The Chamber

A pixel-art Victorian study that works as a personal organizer. One self-contained
HTML file — no build step, no frameworks, no CDN links. Open it and it runs.

**Live:** https://makumochi.github.io/chamber/

![single file](https://img.shields.io/badge/single%20file-yes-c9a227?style=flat-square)
![dependencies](https://img.shields.io/badge/dependencies-zero-4f6b3a?style=flat-square)

---

## Your data is yours, and it is local

Everything you write lives in **your browser's IndexedDB**, on your machine.
Nothing is uploaded, and this repo contains no personal data — only the app itself.

> **Storage is per-origin.** Notes saved at `localhost:8777` are a *different
> store* from notes saved at `makumochi.github.io`. Moving between the two does
> not carry your data across. Use **Settings → EXPORT JSON** on the old address
> and **IMPORT JSON** on the new one.

Because browsers can evict site data under storage pressure, the app asks for
persistent storage on load and shows the result in **Settings → Storage & Backup**
as a green *PERSISTED* or amber *LOCAL (evictable)* badge. If it reads amber,
export a JSON backup now and then.

**Never commit an exported backup to this repo** — it contains every note, chat
message and pasted image. `.gitignore` already blocks `chamber-backup-*.json`.

---

## Running it

**Online:** just visit the live link above. Nothing to install.

**Locally:** double-click `Open The Chamber.bat`, which starts a small server in
this folder and opens the room.

Or by hand:

```bash
py -m http.server 8777
```

then open http://localhost:8777/

**Do not open `index.html` straight from disk.** On a `file://` page Chrome
switches off IndexedDB and the File System Access API, and the app drops to a
degraded localStorage mode with no file links, no audio and no image previews.
It will warn you when this happens.

---

## What's in the room

| Object | What it does |
| --- | --- |
| **Writing desk** | Education & work tracker. Paper stack grows with unfinished tasks. |
| **Bookshelf** | Files, notes and reading log. Spines are generated from real entries, coloured by progress. |
| **Wardrobe** | Quick links and the daily plan. |
| **Wastepaper basket** | Deleted items, restorable for 30 days. |
| **Gramophone** | Upload local audio (MP3/WAV/OGG/FLAC), stored as blobs. Notes drift from the horn while playing. |
| **Wall frames** | Bookmarks. Right-click to assign a URL, click to open it. |
| **Wall clock & calendar** | Live, ticking, and today's date. |
| **Custom sprites** | Upload any image or animated GIF as decor. Flag one as a **Pet** and it talks back. |

### Features

- Markdown notes with clickable `- [ ]` checkboxes (hand-rolled parser, no library)
- A "Chat to Myself" thread on every entry and category — paste images straight in with `Ctrl+V`
- Time-of-day sky through the gothic window, with a rain cycle
- Procedural ambience synthesised with the Web Audio API — fireplace, rain, clock
- Drag-and-drop furniture rearranging, saved permanently
- Custom wallpaper upload
- `Ctrl+K` command palette, fuzzy-searching every entry and chat message
- Rolling backups, schema migrations, and JSON export/import

---

## Editing it by hand

`index.html` is heavily commented and laid out in labelled sections. Search for
the bracketed tags:

| Tag | What lives there |
| --- | --- |
| `[SECTION: PALETTE]` | every colour in the app |
| `[SECTION: FLOOR BASELINE]` | the one line all furniture stands on |
| `[SECTION: OBJECT GEOMETRY]` | size and position of each object |
| `[SECTION: SPRITE SWAP]` | where to drop in your own artwork |
| `[SECTION: CONFIG]` | tunable numbers (autosave delay, trash retention, typing speed) |
| `[SECTION: SCHEMA]` | the data shape |
| `[SECTION: MIGRATIONS]` | the ordered upgrade chain |
| `[SECTION: PET DIALOGUE]` | the bundled pet lines |

The room is built in three depth planes: the far wall, the mid plane holding the
floor and everything standing on it, and the foreground curtains and candle.
Furniture is anchored to a single floor-line variable so it can never drift off
the floor during a parallax move.

---

## Browser support

Built for Chrome. Needs IndexedDB, and uses the File System Access API for
attachment links where available (Chromium only) with a metadata-only fallback
everywhere else.
