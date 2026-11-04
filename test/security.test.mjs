// Sicherheitstests ohne Browser: Prüfung gespeicherter Daten, Sicherungsimport, Hintergrund-Nachrichten.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const load = (f) => new Function(readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8"))();

// ---------- Speicher mit nachgebautem chrome.storage.local ----------
const mem = {};
globalThis.AK = { api: { storage: { local: {
  get: async (k) => (typeof k === "string" ? { [k]: mem[k] } : Object.fromEntries((k || Object.keys(mem)).map((x) => [x, mem[x]]))),
  set: async (o) => Object.assign(mem, o)
} } } };
load("lib/storage.js");
const store = globalThis.AK.store;

const evil = {
  app: "anzeigenkiste",
  ads: {
    a1: {
      id: "a1", title: "<img src=x onerror=alert(1)>Sofa", url: "javascript:alert(document.cookie)",
      price: "1e9; DROP", priceType: "WHATEVER", source: "evil.com",
      images: ["data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==", "https://evil.example/x.png", "data:image/png;base64,iVBORw0KGgo="],
      details: { brand: { toString: "x" }, size: "L", injected: "nope" },
      category: ["Herren", 42, { a: 1 }], tags: "kein-array", __proto__: { polluted: true },
      catalogIds: [5, "6", 7.5]
    },
    "../../etc": { id: "../../etc", title: "Pfad im Schlüssel" },
    leer: { id: "leer", title: "" }
  },
  templates: [{ id: "<x>", name: "Hallo", text: "Text".repeat(1000) }, { name: 5 }, "kaputt"]
};

const n = await store.importBackup(evil, { merge: false });
assert.equal(n, 2, "Anzeige ohne Titel wird verworfen");
const list = await store.getAdList();
const a1 = list.find((a) => a.id === "a1");
assert.equal(a1.url, "", "javascript:-Link wird verworfen");
assert.deepEqual(a1.images, ["data:image/png;base64,iVBORw0KGgo="], "nur echte Bild-data:-URLs");
assert.equal(a1.price, "");
assert.equal(a1.priceType, "");
assert.equal(a1.source, undefined);
assert.deepEqual(a1.category, ["Herren"]);
assert.deepEqual(a1.tags, []);
assert.deepEqual(a1.catalogIds, [5]);
assert.deepEqual(Object.keys(a1.details).sort(), ["brand", "color", "condition", "material", "size"]);
assert.equal(a1.details.brand, "");
assert.equal({}.polluted, undefined, "kein Prototype Pollution");
assert.ok(list.every((a) => /^[a-z0-9]+$/i.test(a.id)), "IDs ohne Sonderzeichen");
assert.equal(a1.title, "<img src=x onerror=alert(1)>Sofa", "Text bleibt Text (wird nur per textContent angezeigt)");

const t = await store.getTemplates();
assert.equal(t.length, 2, "kaputte Einträge verworfen, Zahlen als Text übernommen");
assert.equal(t[0].text.length, 2000, "Vorlagentext begrenzt");
assert.match(t[0].id, /^[a-z0-9]+$/i);

await assert.rejects(store.importBackup({ app: "andere", ads: {} }), /Keine gültige/);
await assert.rejects(store.importBackup(null), /Keine gültige/);

// saveAd prüft ebenfalls (Daten aus Webseiten)
const saved = await store.saveAd({ title: "X", url: "http://unsicher.example/a", images: ["data:image/svg+xml;base64,PHN2Zz4="] });
assert.equal(saved.url, "", "nur https");
assert.deepEqual(saved.images, [], "SVG (kann Skripte enthalten) wird verworfen");

// ---------- Hintergrund: Nachrichten nur aus der Erweiterung, Bilder nur von erlaubten Servern ----------
let listener = null;
const fetched = [];
const removed = [];
globalThis.chrome = {
  runtime: {
    id: "ext-id",
    getURL: (p) => `chrome-extension://ext-id/${p}`,
    onMessage: { addListener: (fn) => (listener = fn) }
  },
  tabs: { remove: async (id) => removed.push(id), create: async () => {} }
};
globalThis.fetch = async (u) => { fetched.push(String(u)); throw new Error("offline"); };
const warn = console.warn; console.warn = () => {};
load("background.js");
const send = (msg, sender) => new Promise((resolve) => {
  const r = listener(msg, sender, resolve);
  if (r === false) resolve("abgelehnt");
});

const page = { id: "ext-id", tab: { id: 7 }, url: "https://www.kleinanzeigen.de/s-anzeige/x/1" };
const dashboard = { id: "ext-id", tab: { id: 3 }, url: "chrome-extension://ext-id/dashboard/dashboard.html" };

assert.equal(await send({ type: "fetchImages", urls: ["https://x"] }, { id: "fremde-erweiterung" }), "abgelehnt", "fremde Absender abgelehnt");

await send({ type: "fetchImages", urls: [
  "https://evil.example/a.png", "http://images1.vinted.net/t/a.webp", "file:///etc/passwd",
  "https://images1.vinted.net.evil.example/a.webp", "https://images1.vinted.net/t/ok.webp",
  "https://i.ebayimg.com/images/g/x/s-l1600.jpg", "https://img.kleinanzeigen.de/api/v1/prod-ads/images/a"
] }, page);
assert.deepEqual(fetched, [
  "https://images1.vinted.net/t/ok.webp",
  "https://i.ebayimg.com/images/g/x/s-l1600.jpg",
  "https://img.kleinanzeigen.de/api/v1/prod-ads/images/a"
], "nur https-Bildserver der Plattformen");

fetched.length = 0;
await send({ type: "fetchImages", urls: Array.from({ length: 100 }, (_, i) => `https://images1.vinted.net/t/${i}.webp`) }, page);
assert.equal(fetched.length, 25, "höchstens 25 Bilder pro Anfrage");

fetched.length = 0;
assert.equal(await send({ type: "fetchText", url: "https://evil.example/" }, page), null);
assert.equal(await send({ type: "fetchText", url: "http://itm.ebaydesc.com/x" }, page), null);
assert.deepEqual(fetched, [], "fetchText nur für https ebaydesc.com");

assert.equal(await send({ type: "registerRefreshTab", tabId: 7 }, page), false, "Webseiten-Skripte dürfen keine Tabs zum Schließen anmelden");
await send({ type: "closeTab" }, page);
assert.deepEqual(removed, [], "nicht angemeldeter Tab bleibt offen");
assert.equal(await send({ type: "registerRefreshTab", tabId: 7 }, dashboard), true);
await send({ type: "closeTab" }, page);
assert.deepEqual(removed, [7], "vom Dashboard angemeldeter Tab wird geschlossen");

assert.equal(await send({ type: "openTab", url: "javascript:alert(1)" }, page), null, "kein allgemeiner Tab-Öffner");

// ---------- Kein riskanter Code im Quelltext ----------
import { readdirSync, statSync } from "node:fs";
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = `${d}/${f}`; statSync(p).isDirectory() ? walk(p) : /\.(js|html)$/.test(f) && files.push(p); });
walk(new URL("../src", import.meta.url).pathname);
for (const f of files) {
  const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
  for (const [re, what] of [[/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=|document\.write/, "HTML-Einfügen"], [/\beval\(|new Function\(/, "eval"], [/<script>[^<]/, "Inline-Skript"]]) {
    assert.ok(!re.test(src), `${what} in ${f.split("/src/")[1]}`);
  }
}

// ---------- Manifest ----------
const m = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));
assert.ok(!m.web_accessible_resources, "keine für Webseiten abrufbaren Dateien (verhindert Erkennung der Erweiterung)");
assert.ok(!m.externally_connectable, "keine Nachrichten von Webseiten");
assert.deepEqual(m.permissions.sort(), ["storage", "unlimitedStorage"], "nur Speicher-Berechtigungen");
assert.match(m.content_security_policy.extension_pages, /script-src 'self'/);
assert.match(m.content_security_policy.extension_pages, /object-src 'none'/);

// ui-css.js muss zu panel.css passen
const css = readFileSync(new URL("../src/content/panel.css", import.meta.url), "utf8");
globalThis.AK = {};
load("lib/ui-css.js");
assert.ok(globalThis.AK.UI_CSS.endsWith(css), "src/lib/ui-css.js veraltet → node scripts/sync-ui-css.mjs");

console.warn = warn;
console.log(`✓ Sicherheitstests bestanden (${files.length} Dateien geprüft)`);
