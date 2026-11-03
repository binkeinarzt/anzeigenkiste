// End-to-End-Test im echten Chrome: lädt die gebaute Erweiterung, öffnet eine
// (abgefangene) Kleinanzeigen-Seite mit der Test-Fixture, speichert die Anzeige
// und prüft, ob sie im Dashboard erscheint. Danach Formular-Vorausfüllen und Textvorlagen.
// Aufruf: npm run build && node test/e2e.test.mjs   (braucht Chrome + puppeteer-core)
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ext = fileURLToPath(new URL("../dist/chrome", import.meta.url));
const fixture = readFileSync(new URL("./fixture-ad.html", import.meta.url), "utf8");
const postForm = `<!doctype html><html><body><form>
  <input id="postad-title"><textarea id="pstad-descrptn"></textarea>
  <input id="micro-frontend-price"><select id="priceType"><option value="FIXED">Fest</option><option value="NEGOTIABLE">VB</option></select>
  <input type="file" id="pictureupload-input" multiple accept="image/*"></form></body></html>`;
const messages = `<!doctype html><html><body><div class="chat"><textarea name="message"></textarea></div></body></html>`;
const pages = {
  "/s-anzeige/ikea-sofa/2912345678-88-1234": fixture,
  "/p-anzeige-aufgeben-schritt2.html": postForm,
  "/m-nachrichten.html": messages
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: true,
  protocolTimeout: 20000,
  enableExtensions: [ext], // Chrome ≥ 137 ignoriert --load-extension
  args: ["--no-sandbox"]
});

async function fakePage(path) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname === "www.kleinanzeigen.de" && pages[u.pathname]) r.respond({ status: 200, contentType: "text/html", body: pages[u.pathname] });
    else if (u.hostname.endsWith("kleinanzeigen.de")) r.respond({ status: 404, body: "" });
    else r.continue();
  });
  console.log("→", path);
  await page.goto(`https://www.kleinanzeigen.de${path}`, { timeout: 15000 });
  return page;
}

try {
  // Extension-ID über den Service Worker finden
  const sw = await browser.waitForTarget((t) => t.type() === "service_worker", { timeout: 10000 });
  const extId = new URL(sw.url()).host;

  // 1) Anzeige speichern
  const ad = await fakePage("/s-anzeige/ikea-sofa/2912345678-88-1234");
  const btn = await ad.waitForSelector(".ak-inline", { timeout: 8000 });
  await btn.evaluate((b) => b.click());
  await ad.waitForFunction(() => document.querySelector(".ak-inline")?.textContent.includes("Gespeichert"), { timeout: 15000 });
  console.log("✓ Anzeige gespeichert");

  // 2) Dashboard zeigt sie
  const dash = await browser.newPage();
  await dash.goto(`chrome-extension://${extId}/dashboard/dashboard.html`);
  await dash.waitForSelector(".item h3");
  assert.equal(await dash.$eval(".item h3", (e) => e.textContent), "IKEA Sofa Kivik grau");
  assert.match(await dash.$eval(".item .meta", (e) => e.textContent), /1250 € VB.*312 Aufrufe/);
  console.log("✓ Dashboard listet die Anzeige");

  // Editor: Preis ändern und ein Bild ergänzen, damit der Upload getestet wird
  await dash.bringToFront();
  await dash.evaluate(() => [...document.querySelectorAll(".item .actions button")].find((b) => b.textContent === "Bearbeiten").click());
  await dash.$eval("input[name=price]", (e) => (e.value = "999"));
  const png = fileURLToPath(new URL("../src/icons/icon128.png", import.meta.url));
  await (await dash.$("#editor-files")).uploadFile(png);
  await dash.waitForSelector("#editor-images img");
  await dash.$eval("button[value=save]", (b) => b.click());
  await dash.waitForFunction(() => document.querySelector(".item .meta")?.textContent.includes("999 € VB"));
  console.log("✓ Bearbeiten + Bild hinzufügen");

  // 3) Neu inserieren: Pending setzen, Formular wird befüllt
  await dash.evaluate(async () => {
    const [a] = await AK.store.getAdList();
    await AK.store.setPending({ action: "reinsert", adId: a.id });
  });
  const post = await fakePage("/p-anzeige-aufgeben-schritt2.html");
  await post.waitForFunction(() => document.querySelector("#postad-title").value === "IKEA Sofa Kivik grau", { timeout: 8000 });
  const filled = await post.evaluate(() => ({
    desc: document.querySelector("#pstad-descrptn").value,
    price: document.querySelector("#micro-frontend-price").value,
    type: document.querySelector("#priceType").value,
    files: document.querySelector("#pictureupload-input").files.length
  }));
  assert.ok(filled.desc.startsWith("Sehr guter Zustand."));
  assert.equal(filled.price, "999");
  assert.equal(filled.type, "NEGOTIABLE");
  assert.equal(filled.files, 1);
  console.log("✓ Formular vorausgefüllt (inkl. Bild)");

  // 4) Textvorlagen im Postfach
  const msg = await fakePage("/m-nachrichten.html");
  await msg.waitForSelector(".ak-chip");
  await msg.$eval(".ak-chip", (b) => b.click());
  assert.match(await msg.$eval("textarea", (e) => e.value), /noch verfügbar/);
  console.log("✓ Textvorlage eingefügt");

  // 5) Export zu Vinted: Panel erscheint und füllt per data-testid
  await dash.evaluate(async () => {
    const [a] = await AK.store.getAdList();
    await AK.store.setPending({ action: "export", adId: a.id, platform: "vinted" });
  });
  const vin = await browser.newPage();
  await vin.setRequestInterception(true);
  vin.on("request", (r) => r.url().startsWith("https://www.vinted.de/items/new")
    ? r.respond({ status: 200, contentType: "text/html", body: `<!doctype html><input data-testid="title--input"><textarea data-testid="description--input"></textarea><input data-testid="price-input--input"><input type="file" multiple accept="image/*">` })
    : r.respond({ status: 404, body: "" }));
  await vin.goto("https://www.vinted.de/items/new", { timeout: 15000 });
  await vin.waitForSelector("#ak-panel .ak-btn--primary", { timeout: 10000 });
  await vin.$eval("#ak-panel .ak-btn--primary", (b) => b.click());
  assert.equal(await vin.$eval("[data-testid='title--input']", (e) => e.value), "IKEA Sofa Kivik grau");
  assert.equal(await vin.$eval("[data-testid='price-input--input']", (e) => e.value), "999");
  console.log("✓ Export zu Vinted");

  console.log("\nAlle E2E-Tests bestanden.");
} finally {
  await browser.close();
}
