/**
 * 🚗 KFZ-Zulassung Köln - Termin-Checker
 *
 * Prüft automatisch die Terminseite der Stadt Köln auf freie Termine
 * für die Zulassung eines Gebrauchtwagens.
 *
 * Voraussetzungen:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Nutzung:
 *   node termin-checker.js              # Einmalige Prüfung
 *   node termin-checker.js --watch      # Wiederholte Prüfung alle 2 Min
 *   node termin-checker.js --watch 5    # Wiederholte Prüfung alle 5 Min
 *
 * Optional: Telegram-Benachrichtigung einrichten (siehe Konfiguration unten)
 */

const { chromium } = require('playwright');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════
// KONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // Termin-URL der Stadt Köln
  url: 'https://termine.stadt-koeln.de/m/kfz-zulassung/extern/calendar/?uid=67523a04-37af-4131-9495-0a3566e0eb8b&wsid=d2c525a6-8d28-46d4-97dc-3349c54459ce&lang=de&set_lang_ui=de&rev=n3bt3',

  // Suchbegriff im Service-Text (Tabellenzeile neben dem Mengen-Dropdown)
  dienstleistung: 'Gebrauchtfahrzeug',

  // Anzahl dieser Dienstleistung (1 = ein Fahrzeug anmelden)
  anzahl: '1',

  // Termine bis zu diesem Datum anzeigen (2 Wochen voraus)
  maxDate: getDateInDays(14),

  // Frühestes "Wunschziel": Termine bis Ende dieser Kalenderwoche (Fr.)
  // → Watch-Mode stoppt + Telegram-Alert nur bei Terminen in diesem Fenster
  priorityUntil: getEndOfCurrentWeek(),

  // Wiederholungsintervall in Minuten (nur bei --watch)
  intervalMinuten: 2,

  // ── Telegram-Benachrichtigung (optional) ──
  // 1. Schreibe @BotFather auf Telegram → /newbot → Token kopieren
  // 2. Schreibe @userinfobot → deine Chat-ID kopieren
  telegram: {
    enabled: true,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },

  // Browser sichtbar machen zum Debuggen (false = headless)
  headless: true,

  // Screenshot bei Fund speichern
  screenshotOnFind: true,
};

// ═══════════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════════

function getDateInDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59);
  return d;
}

function getEndOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay(); // 0=So, 1=Mo, ..., 5=Fr, 6=Sa
  // Freitag dieser Woche: wenn heute Sa/So, dann nächsten Fr
  const daysToFriday = day === 0 ? 5 : day === 6 ? 6 : (5 - day);
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysToFriday);
  friday.setHours(23, 59, 59);
  return friday;
}

function log(msg, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('de-DE');
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌', search: '🔍' };
  console.log(`[${timestamp}] ${icons[type] || ''} ${msg}`);
}

async function sendTelegram(message) {
  if (!CONFIG.telegram.enabled) return;
  try {
    const url = `https://api.telegram.org/bot${CONFIG.telegram.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.telegram.chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    if (!res.ok) log('Telegram-Nachricht konnte nicht gesendet werden', 'warn');
  } catch (e) {
    log(`Telegram-Fehler: ${e.message}`, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// HAUPTLOGIK
// ═══════════════════════════════════════════════════════════════

async function checkTermine() {
  log('Starte Termin-Check...', 'search');

  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext({
    locale: 'de-DE',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let foundTermine = [];

  try {
    // ── Schritt 1: Seite laden ──────────────────────────────────
    log('Lade Terminseite...');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const title = await page.title();
    log(`Seite geladen: "${title}"`);

    // ── Schritt 2: Richtige Service-Row finden und Menge setzen ─
    // Die Seite hat pro Dienstleistung eine <tr> mit einem <select> (Menge 0-3)
    // und dem Service-Namen daneben. Wir suchen die Row mit unserem Suchbegriff.

    log(`Suche Service-Row mit Text: "${CONFIG.dienstleistung}"...`);

    const serviceSelected = await page.evaluate(({ suchtext, anzahl }) => {
      const rows = document.querySelectorAll('tr');
      for (const row of rows) {
        const rowText = row.textContent || '';
        if (rowText.toLowerCase().includes(suchtext.toLowerCase())) {
          const sel = row.querySelector('select');
          if (sel) {
            sel.value = anzahl;
            // Change-Event auslösen damit die Seite reagiert
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return {
              found: true,
              selectId: sel.id,
              rowText: rowText.trim().substring(0, 120)
            };
          }
        }
      }
      return { found: false };
    }, { suchtext: CONFIG.dienstleistung, anzahl: CONFIG.anzahl });

    if (!serviceSelected.found) {
      log(`Service "${CONFIG.dienstleistung}" nicht gefunden! Prüfe Debug-Dateien.`, 'error');
      // Debug: Alle Rows ausgeben
      const allRows = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('tr'))
          .filter(r => r.querySelector('select'))
          .map(r => r.textContent.trim().substring(0, 120));
      });
      log(`Verfügbare Service-Rows:\n${allRows.join('\n')}`);
    } else {
      log(`Service gefunden und gewählt: "${serviceSelected.rowText}"`, 'success');
      log(`Select-ID: ${serviceSelected.selectId}, Menge: ${CONFIG.anzahl}`);
    }

    await page.waitForTimeout(1000);

    // ── Schritt 3: "Weiter" klicken ─────────────────────────────
    log('Klicke auf "Weiter"...');
    const weiterBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Weiter")');
    if (!weiterBtn) {
      // Fallback: Text-Suche
      await page.click('text=Weiter');
    } else {
      await weiterBtn.click();
    }

    await page.waitForTimeout(3000);

    const newTitle = await page.title();
    log(`Neue Seite: "${newTitle}"`);

    // ── Schritt 4: Verfügbare Termine lesen ─────────────────────
    // Die Terminseite zeigt Datum-Buttons: "Dienstag\n17.03.2026"
    const bodyText = await page.textContent('body');

    // Prüfe ob wir auf der richtigen Seite sind
    if (!bodyText.includes('Auswahl des Termins') && !bodyText.includes('verfügbaren Terminen') && !bodyText.includes('Termine ')) {
      log('Terminseite nicht erreicht - prüfe ob Fehler aufgetreten', 'warn');
      log(`Seiteninhalt (Anfang): ${bodyText.substring(0, 300)}`);
    } else {
      log('Terminseite erfolgreich geladen!', 'success');
    }

    // Datumsangaben im Format DD.MM.YYYY finden
    const dateMatches = bodyText.match(/\d{2}\.\d{2}\.\d{4}/g) || [];
    const uniqueDates = [...new Set(dateMatches)];
    log(`Gefundene Datumsangaben: ${uniqueDates.join(', ')}`);

    // Termine in zwei Gruppen aufteilen: diese Woche vs. später
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dieseWoche = [];
    const spaeter = [];

    for (const dateStr of uniqueDates) {
      const parts = dateStr.split('.');
      const terminDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));

      if (terminDate >= now && terminDate <= CONFIG.maxDate) {
        if (terminDate <= CONFIG.priorityUntil) {
          dieseWoche.push(dateStr);
        } else {
          spaeter.push(dateStr);
        }
      }
    }
    foundTermine = dieseWoche; // Rückgabewert = nur diese-Woche-Termine (relevant für Watch-Stop)

    // ── Schritt 5: Screenshot speichern ─────────────────────────
    const screenshotPath = `termin-check-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`Screenshot gespeichert: ${screenshotPath}`);

    // Debug-Dateien
    const fs = require('fs');
    fs.writeFileSync('page-debug.html', await page.content());
    fs.writeFileSync('page-debug.txt', bodyText);
    log('Debug-Dateien gespeichert (page-debug.html, page-debug.txt)');

    // ── Schritt 6: Ergebnis ausgeben ────────────────────────────
    const priorityDateStr = CONFIG.priorityUntil.toLocaleDateString('de-DE');

    if (dieseWoche.length > 0) {
      const msg = `🚗 TERMIN DIESE WOCHE!\n\nFreie Termine bis ${priorityDateStr}:\n${dieseWoche.join('\n')}\n\n👉 ${CONFIG.url}`;
      log(msg, 'success');
      await sendTelegram(msg);
    } else {
      log(`Keine Termine diese Woche (bis ${priorityDateStr})`, 'warn');
      if (spaeter.length > 0) {
        log(`Nächste verfügbare Termine: ${spaeter.join(', ')}`, 'info');
      } else {
        log('Auch keine Termine in den nächsten 2 Wochen gefunden.', 'warn');
        log('Tipp: Morgens zwischen 7-8 Uhr werden oft neue Termine freigeschaltet!');
      }
    }

  } catch (error) {
    log(`Fehler: ${error.message}`, 'error');

    try {
      await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
      log('Fehler-Screenshot gespeichert: error-screenshot.png');
    } catch {}

  } finally {
    await browser.close();
  }

  return foundTermine;
}

// ═══════════════════════════════════════════════════════════════
// WATCH-MODUS (wiederholte Prüfung)
// ═══════════════════════════════════════════════════════════════

async function watchMode(intervalMin) {
  log(`🔄 Watch-Modus gestartet (Intervall: ${intervalMin} Min)`);
  log(`Ziel: Termin diese Woche bis ${CONFIG.priorityUntil.toLocaleDateString('de-DE')}`);
  log(`Fallback-Anzeige bis: ${CONFIG.maxDate.toLocaleDateString('de-DE')}`);
  log('Watch-Mode stoppt nur bei Termin DIESER Woche. Drücke Ctrl+C zum Beenden\n');

  let checkCount = 0;

  while (true) {
    checkCount++;
    log(`\n══════ Check #${checkCount} ══════`);

    try {
      const termine = await checkTermine();
      if (termine.length > 0) {
        log('\n🎉🎉🎉 TERMINE GEFUNDEN! Öffne den Browser! 🎉🎉🎉', 'success');
        const { exec } = require('child_process');
        exec(`open "${CONFIG.url}"`); // macOS
        break;
      }
    } catch (e) {
      log(`Check fehlgeschlagen: ${e.message}`, 'error');
    }

    log(`Nächster Check in ${intervalMin} Minuten...`);
    await new Promise(resolve => setTimeout(resolve, intervalMin * 60 * 1000));
  }
}

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

(async () => {
  const args = process.argv.slice(2);
  const isWatch = args.includes('--watch');
  const customInterval = parseInt(args.find(a => !a.startsWith('-'))) || CONFIG.intervalMinuten;

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🚗 KFZ-Zulassung Köln - Termin-Checker     ║');
  console.log('║  Suche: Gebrauchtwagen-Zulassung            ║');
  console.log(`║  Zeitraum: bis ${CONFIG.maxDate.toLocaleDateString('de-DE')}                  ║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  if (isWatch) {
    await watchMode(customInterval);
  } else {
    await checkTermine();
  }
})();
