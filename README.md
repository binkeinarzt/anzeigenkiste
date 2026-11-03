# Anzeigenkiste

Freie Browsererweiterung für alle, die auf Kleinanzeigen verkaufen. Anzeigen sichern, neu inserieren, Textvorlagen im Postfach nutzen und Anzeigen zu Vinted, eBay oder willhaben übertragen.

**Open Source (MIT) · ohne Konto · ohne Abo · alle Daten bleiben lokal im Browser**

![Dashboard](site/dashboard.png)

## Funktionen

| Funktion | Wo | Was passiert |
|---|---|---|
| Anzeige sichern | jede Anzeige (`/s-anzeige/…`) | Knopf „In Anzeigenkiste speichern“ sichert Titel, Text, Preis, Kategorie, Merkmale und Bilder |
| Alle sichern | „Meine Anzeigen“ | Panel sichert alle sichtbaren Anzeigen nacheinander (bewusst gedrosselt) |
| Neu inserieren | Dashboard → „Neu inserieren“ | öffnet „Anzeige aufgeben“ und füllt Titel, Beschreibung, Preis, Preisart und Bilder aus |
| Übertragen | Dashboard → „Übertragen“ | öffnet das Verkaufsformular von Vinted, eBay oder willhaben, füllt aus, Kopier-Knöpfe als Rückfall |
| Textvorlagen | Postfach (`/m-nachrichten…`) | Vorlagen-Chips über dem Nachrichtenfeld, Klick fügt Text ein |
| Übersicht | Dashboard | Liste mit Aufrufen, Preis, Ort, Schlagwörtern; Suche, Sortierung, Bearbeiten, eigene Anzeigen anlegen |
| Sicherung | Dashboard → Einstellungen | Export/Import der ganzen Kiste als JSON |

**Bewusst nicht enthalten:** automatisches Verlängern, automatisches Veröffentlichen, Autoresponder. Kleinanzeigen untersagt automatisierte Zugriffe in seinen Nutzungsbedingungen. Anzeigenkiste füllt nur aus, abschicken tut immer der Mensch.

## Installieren (Entwicklerversion)

```bash
npm install
npm run build        # erzeugt dist/chrome, dist/firefox und je ein .zip
```

- **Chrome / Edge / Brave:** `chrome://extensions` → Entwicklermodus → „Entpackte Erweiterung laden“ → `dist/chrome`
- **Firefox (≥ 121):** `about:debugging#/runtime/this-firefox` → „Temporäres Add-on laden“ → `dist/firefox/manifest.json`

## Projektstruktur

```
src/
  manifest.json          Manifest V3 (Chrome); build.mjs erzeugt die Firefox-Variante
  background.js          lädt Bilder, öffnet Tabs
  lib/
    api.js               chrome/browser-Shim
    storage.js           Anzeigen, Vorlagen, offene Aktionen (storage.local)
    dom.js               Felder befüllen (React-sicher), Dateien einfügen, Panel, Toasts
    selectors.js         ALLE Kleinanzeigen-Selektoren an einer Stelle
    parse.js             liest eine Anzeigen-Detailseite aus
  content/
    kleinanzeigen.js     Speichern, Meine Anzeigen, Formular ausfüllen, Textvorlagen
    export.js            Panel für Vinted, eBay, willhaben
    panel.css
  dashboard/             Übersicht, Editor, Vorlagen, Einstellungen
  popup/
site/                    Landingpage (page.html → index.html für GitHub Pages)
test/                    Parser-Test (jsdom) und E2E-Test (echtes Chrome)
```

## Tests

```bash
npm test             # Parser gegen test/fixture-ad.html
npm run test:e2e     # baut, startet Chrome mit der Erweiterung, testet Speichern → Dashboard →
                     # Bearbeiten → Neu inserieren → Textvorlage → Export zu Vinted
```

Der E2E-Test fängt die Kleinanzeigen- und Vinted-Seiten ab und liefert nachgebaute Formulare. Ob die Selektoren auf den echten Seiten passen, muss man live prüfen.

## Wenn eine Plattform ihr Layout ändert

- Kleinanzeigen: nur `src/lib/selectors.js` anpassen. Jeder Eintrag ist eine Liste, der erste Treffer gewinnt.
- Vinted, eBay, willhaben: `FIELDS` oben in `src/content/export.js`. Greift nichts, sucht eine Heuristik nach Feldern mit „Titel“, „Beschreibung“, „Preis“.

## Veröffentlichen

1. Projektnamen und `DEIN-NAME` in `site/page.html` ersetzen, Firefox-ID in `scripts/build.mjs` setzen.
2. `npm run build`
3. Chrome Web Store: `dist/anzeigenkiste-chrome-*.zip` hochladen (einmalig 5 USD Entwicklergebühr).
4. addons.mozilla.org: `dist/anzeigenkiste-firefox-*.zip` hochladen (kostenlos).
5. Landingpage: GitHub Pages auf den Ordner `site/` zeigen lassen.

## Rechtliches

Anzeigenkiste ist ein unabhängiges Projekt und steht in keiner Verbindung zu Kleinanzeigen, Vinted, eBay oder willhaben. Alle Marken gehören ihren Inhabern. Nutzung auf eigenes Risiko, siehe [LICENSE](LICENSE).
