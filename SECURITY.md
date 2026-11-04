# Sicherheit

## Grundsätze

- **Alles bleibt lokal.** Anzeigen, Bilder und Vorlagen liegen nur im Speicher deines Browsers. Die Erweiterung hat keinen Server, sammelt keine Statistiken und sendet nichts an Dritte.
- **Nichts wird automatisch veröffentlicht.** Die Erweiterung füllt Formulare nur aus. Abschicken, Veröffentlichen und Entwürfe speichern bleibt immer bei dir.
- **Minimale Berechtigungen.** Nur `storage` und `unlimitedStorage` (für Bilder) sowie Zugriff auf die unterstützten Plattformen. Kein Zugriff auf Verlauf, Tabs anderer Seiten, Downloads oder Cookies.
- **Kein fremder Code.** Keine nachgeladenen Skripte, kein `eval`, keine Bibliotheken zur Laufzeit. Erweiterungsseiten laufen mit strenger Content Security Policy (`script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`).

## Schutzmaßnahmen im Detail

| Bedrohung | Maßnahme |
|---|---|
| Webseiten oder Tracking-Skripte lesen deine Anzeigenliste, Vorlagen oder klicken Knöpfe der Erweiterung | Panel, Hinweise und Vorlagen liegen in einem **geschlossenen Shadow DOM**. Seiten-Skripte erhalten keinen Zugriff darauf. |
| Schadhafte Inhalte (z. B. HTML in Anzeigentiteln) führen Code aus | Alle Inhalte werden nur als Text (`textContent`) eingefügt. Kein `innerHTML`; ein Test verhindert, dass es später hinzukommt. |
| Webseite bringt die Erweiterung dazu, beliebige Adressen abzurufen | Der Hintergrunddienst lädt Bilder nur per https von den Bildservern der Plattformen (max. 25 Bilder, 15 MB je Bild, nur `image/*`, Weiterleitungen nur innerhalb dieser Server). |
| Abrufe mit deiner Anmeldung an fremde Server | „Alle Anzeigen sichern“ ruft nur Seiten auf kleinanzeigen.de selbst ab. |
| Manipulierte Sicherungsdatei | Beim Einspielen werden nur bekannte Felder mit erwarteten Typen und Längen übernommen; Links nur `https:`, Bilder nur als JPEG/PNG/WebP/GIF (kein SVG). |
| Nachrichten von fremden Erweiterungen oder Seiten-Skripten | Der Hintergrunddienst nimmt nur Nachrichten dieser Erweiterung an; Tabs schließen darf nur, was das Dashboard selbst geöffnet hat. Es gibt keine `externally_connectable`- und keine `web_accessible_resources`-Einträge. |

`npm test` enthält dafür eigene Sicherheitstests (`test/security.test.mjs`), der Browser-Test prüft zusätzlich, dass Webseiten das Panel nicht sehen.

## Bekannte Grenzen

- Daten im Browser-Speicher sind nicht verschlüsselt. Wer Zugriff auf dein Benutzerkonto am Computer hat, kann sie lesen – wie bei allen Browserdaten.
- Die Erweiterung füllt Formulare auf Kleinanzeigen, Vinted, willhaben & Co. aus. Diese Seiten sehen die eingefügten Werte, sobald sie im Formular stehen – das ist der Zweck.
- Die Plattformen untersagen automatisierte Zugriffe in ihren Nutzungsbedingungen. Die Erweiterung handelt deshalb nur auf deinen Klick und veröffentlicht nichts selbst.

## Sicherheitslücke melden

Bitte **nicht** als öffentliches Issue, sondern über „Report a vulnerability“ im Reiter *Security* des GitHub-Repositorys (privat). Ich melde mich so schnell wie möglich.
