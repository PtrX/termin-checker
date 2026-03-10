# 🚗 KFZ-Termin-Checker Köln

Automatische Überwachung der Terminvergabe der KFZ-Zulassungsstelle Köln.

## Schnellstart

```bash
# 1. Abhängigkeiten installieren
npm install playwright
npx playwright install chromium

# 2. Einmalig prüfen
node termin-checker.js

# 3. Automatisch alle 2 Minuten prüfen (Watch-Modus)
node termin-checker.js --watch

# 4. Eigenes Intervall (z.B. alle 5 Minuten)
node termin-checker.js --watch 5
```

## Telegram-Benachrichtigung einrichten

1. Schreibe auf Telegram: `@BotFather` → `/newbot` → Token kopieren
2. Schreibe: `@userinfobot` → deine Chat-ID kopieren
3. In `termin-checker.js` eintragen:
   ```js
   telegram: {
     enabled: true,
     botToken: 'dein-token-hier',
     chatId: 'deine-chat-id',
   }
   ```

## Tipps

- **Morgens zwischen 7–8 Uhr** werden täglich neue Termine freigeschaltet
- Das Skript speichert Screenshots und Debug-Dateien bei jedem Check
- Bei `headless: false` siehst du den Browser beim Arbeiten
- Bei Fund wird automatisch der Browser geöffnet (macOS)

## Wichtig: Erste Ausführung

Beim ersten Lauf analysiert das Skript die Seitenstruktur. Prüfe die Konsolenausgabe und die Debug-Dateien (`page-debug.html`, `page-debug.txt`), um ggf. die Selektoren in der Konfiguration anzupassen. Jedes Terminportal ist etwas anders aufgebaut.

## Cronjob (optional)

Für automatische Prüfung morgens um 7:00:
```bash
crontab -e
# Folgende Zeile hinzufügen:
0 7 * * 1-5 cd /pfad/zum/skript && node termin-checker.js --watch 2 >> termin-log.txt 2>&1
```
