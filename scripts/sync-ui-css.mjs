// Erzeugt src/lib/ui-css.js aus src/content/panel.css.
// Panel und Hinweise werden in einem geschlossenen Shadow DOM angezeigt (Webseiten können sie nicht
// auslesen); dort greifen normale Content-Script-Stylesheets nicht, deshalb liegt das CSS auch als String vor.
// Aufruf: node scripts/sync-ui-css.mjs   (npm test prüft, dass beide Dateien übereinstimmen)
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const css = readFileSync(new URL("src/content/panel.css", root), "utf8");
const out = `// AUTOMATISCH ERZEUGT aus src/content/panel.css – nicht von Hand ändern (node scripts/sync-ui-css.mjs).
(function () {
  globalThis.AK = globalThis.AK || {};
  globalThis.AK.UI_CSS = ${JSON.stringify(":host { all: initial; }\n" + css)};
})();
`;
writeFileSync(new URL("src/lib/ui-css.js", root), out);
console.log("✓ src/lib/ui-css.js aktualisiert");
