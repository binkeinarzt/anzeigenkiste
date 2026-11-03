// Baut zwei Varianten aus src/:
//   dist/chrome   – Chrome, Edge, Brave (service_worker)
//   dist/firefox  – Firefox ≥ 121 (background.scripts + gecko-ID)
// und packt jeweils ein .zip für die Stores (falls `zip` installiert ist).
// Aufruf: node scripts/build.mjs
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const dist = join(root, "dist");
const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

const targets = {
  chrome: manifest,
  firefox: {
    ...manifest,
    background: { scripts: ["background.js"] },
    browser_specific_settings: {
      gecko: {
        id: "anzeigenkiste@example.org", // vor dem Upload zu addons.mozilla.org durch eigene ID ersetzen
        strict_min_version: "121.0",
        data_collection_permissions: { required: ["none"] } // es werden keine Daten gesammelt
      }
    }
  }
};

for (const [name, m] of Object.entries(targets)) {
  const out = join(dist, name);
  cpSync(src, out, { recursive: true });
  writeFileSync(join(out, "manifest.json"), JSON.stringify(m, null, 2));
  try {
    execSync(`cd "${out}" && zip -qr "../anzeigenkiste-${name}-${m.version}.zip" .`);
  } catch {
    console.warn(`zip nicht verfügbar – ${name} nur als Ordner gebaut`);
  }
  console.log(`✓ ${name} → dist/${name}`);
}

// Landingpage für GitHub Pages: site/page.html in ein vollständiges Dokument packen
const page = readFileSync(join(root, "site", "page.html"), "utf8");
writeFileSync(join(root, "site", "index.html"),
  `<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="icon" href="icon.png">\n</head>\n<body>\n${page}\n</body>\n</html>\n`);
console.log("✓ Landingpage → site/index.html");
