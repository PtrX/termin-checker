# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Install Playwright browser (one-time setup)
npx playwright install chromium

# Single check
node termin-checker.js

# Watch mode (checks every 2 minutes by default)
node termin-checker.js --watch

# Watch mode with custom interval (e.g. 5 minutes)
node termin-checker.js --watch 5
```

## Architecture

Single-file script (`termin-checker.js`) using Playwright to automate the Köln appointment portal.

**Flow:**
1. Navigate to the pre-configured URL (Kfz-Zulassungsstelle, Standort Max-Glomsda-Str. 4)
2. Page 1 ("Dienstleistung wählen"): Find the `<tr>` row matching `CONFIG.dienstleistung` text, set its `<select>` to `CONFIG.anzahl`, click "Weiter"
3. Page 2 ("Auswahl des Termins"): Extract all `DD.MM.YYYY` date matches from body text
4. Classify dates: `priorityUntil` (this week, triggers Telegram alert + watch-stop) vs. `maxDate` (next 14 days, shown as info)

**Watch mode** loops `checkTermine()` every N minutes; stops and opens the browser on macOS when a priority-window appointment is found.

**Telegram notifications** use the Bot API directly via `fetch()`. Config in `CONFIG.telegram`.

**Debug output** on every run: `page-debug.html`, `page-debug.txt`, `termin-check-<timestamp>.png` (or `error-screenshot.png` on failure).

## Key Config (top of file)

| Field | Purpose |
|---|---|
| `url` | Full booking URL with pre-selected location |
| `dienstleistung` | Text to find in service table row (default: `'Gebrauchtfahrzeug'`) |
| `anzahl` | Quantity string for the select (`'1'`) |
| `maxDate` | Upper display cutoff (14 days out) |
| `priorityUntil` | End of current week Friday — triggers alert/stop |
| `headless` | Set `false` to watch the browser |

## Known Quirks

- Service `<option>` values are `0/1/2/3` (not service names) — the text is in the `<tr>` row
- URL already pre-selects 1× Gebrauchtfahrzeug, so the `select` manipulation is redundant but kept for safety
- After setting the select, a `change` event must be dispatched before clicking "Weiter"
