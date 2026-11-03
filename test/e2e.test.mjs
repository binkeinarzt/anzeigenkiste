// End-to-End-Test im echten Chrome mit der gebauten Erweiterung.
// Alle Plattform-Seiten werden abgefangen und durch nachgebaute Seiten ersetzt.
// Getestet: Speichern auf Kleinanzeigen → Dashboard → Bearbeiten → Inserieren-Dialog (mehrere Plattformen)
// → Formulare auf Kleinanzeigen, Vinted, Facebook, Quoka (mit Warten auf das Formular) → Textvorlagen
// → Gegenrichtung: Artikel von Vinted in die Kiste holen.
// Aufruf: npm run test:e2e   (braucht Chrome + puppeteer-core)
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ext = fileURLToPath(new URL("../dist/chrome", import.meta.url));
const html = (body) => `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;

const PAGES = {
  "www.kleinanzeigen.de/s-anzeige/ikea-sofa/2912345678-88-1234": readFileSync(new URL("./fixture-ad.html", import.meta.url), "utf8"),
  "www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html": html(`<form>
    <input id="postad-title"><textarea id="pstad-descrptn"></textarea>
    <input id="micro-frontend-price"><select id="priceType"><option value="FIXED">Fest</option><option value="NEGOTIABLE">VB</option></select>
    <input type="file" id="pictureupload-input" multiple accept="image/*"></form>`),
  "www.kleinanzeigen.de/m-nachrichten.html": html(`<div class="chat"><textarea name="message"></textarea></div>`),
  "www.vinted.de/items/new": html(`<input data-testid="title--input"><textarea data-testid="description--input"></textarea>
    <input data-testid="price-input--input"><input type="file" multiple accept="image/*">`),
  "www.facebook.com/marketplace/create/item": html(`
    <label aria-label="Titel"><span>Titel</span><input type="text"></label>
    <label aria-label="Preis"><span>Preis</span><input type="text"></label>
    <label aria-label="Beschreibung"><span>Beschreibung</span><textarea></textarea></label>
    <input type="file" multiple accept="image/*,image/heif">`),
  "www.quoka.de/": html(`<h1>Quoka Startseite</h1><a href="#">Kostenlos inserieren</a>`),
  "www.vinted.de/items/1234567890-lederjacke-vintage": html(`<h1>Lederjacke</h1>
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@type": "Product", name: "Lederjacke Vintage Gr. M",
      description: "Echtes Leder, kaum getragen.", category: "Herren > Jacken",
      image: ["https://images1.vinted.net/t/abc/f800/1.jpeg"],
      offers: { "@type": "Offer", price: "45.00", priceCurrency: "EUR" }
    })}</script>`)
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: true,
  protocolTimeout: 30000,
  enableExtensions: [ext], // Chrome ≥ 137 ignoriert --load-extension
  args: ["--no-sandbox"]
});

async function fakePage(url) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    const body = PAGES[u.hostname + u.pathname];
    if (body) r.respond({ status: 200, contentType: "text/html; charset=utf-8", body });
    else if (r.isNavigationRequest() || u.protocol === "https:") r.respond({ status: 404, body: "" });
    else r.continue();
  });
  console.log("→", url);
  await page.goto(url, { timeout: 15000 });
  return page;
}

const click = (page, sel) => page.$eval(sel, (b) => b.click());

try {
  const sw = await browser.waitForTarget((t) => t.type() === "service_worker", { timeout: 10000 });
  const extId = new URL(sw.url()).host;

  // 1) Anzeige auf Kleinanzeigen speichern
  const ad = await fakePage("https://www.kleinanzeigen.de/s-anzeige/ikea-sofa/2912345678-88-1234");
  await ad.waitForSelector(".ak-inline", { timeout: 8000 });
  await click(ad, ".ak-inline");
  await ad.waitForFunction(() => document.querySelector(".ak-inline")?.textContent.includes("Gespeichert"), { timeout: 15000 });
  console.log("✓ Anzeige gespeichert");

  // 2) Dashboard
  const dash = await browser.newPage();
  await dash.goto(`chrome-extension://${extId}/dashboard/dashboard.html`);
  await dash.waitForSelector(".item h3");
  assert.equal(await dash.$eval(".item h3", (e) => e.textContent), "IKEA Sofa Kivik grau");
  assert.match(await dash.$eval(".item .meta", (e) => e.textContent), /1250 € VB.*312 Aufrufe/);
  console.log("✓ Dashboard listet die Anzeige");

  await dash.bringToFront();
  await dash.evaluate(() => [...document.querySelectorAll(".item .actions button")].find((b) => b.textContent === "Bearbeiten").click());
  await dash.$eval("input[name=price]", (e) => (e.value = "999"));
  await (await dash.$("#editor-files")).uploadFile(fileURLToPath(new URL("../src/icons/icon128.png", import.meta.url)));
  await dash.waitForSelector("#editor-images img");
  await click(dash, "#editor button[value=save]");
  await dash.waitForFunction(() => document.querySelector(".item .meta")?.textContent.includes("999 € VB"));
  console.log("✓ Bearbeiten + Bild hinzufügen");

  // 3) Inserieren-Dialog: mehrere Plattformen wählen → je ein offener Auftrag
  await dash.evaluate(() => [...document.querySelectorAll(".item .actions button")].find((b) => b.textContent.startsWith("Inserieren")).click());
  await dash.waitForSelector("#publish[open] #pub-vinted");
  await dash.evaluate(() => {
    for (const k of ["kleinanzeigen", "vinted", "facebook", "quoka"]) document.getElementById(`pub-${k}`).checked = true;
  });
  await click(dash, "#publish button[value=go]");
  // Hintergrund-Tabs drosseln waitForFunction; deshalb von Node aus abfragen
  let keys = [];
  for (let i = 0; i < 20 && keys.length < 4; i++) {
    await new Promise((r) => setTimeout(r, 300));
    keys = await dash.evaluate(async () => Object.keys((await chrome.storage.local.get("pending")).pending || {}));
  }
  assert.deepEqual(keys.sort(), ["facebook", "kleinanzeigen", "quoka", "vinted"]);
  console.log("✓ Inserieren-Dialog legt Aufträge für 4 Plattformen an");
  // Die vom Dialog geöffneten echten Tabs schließen (im Test kein Netz); Aufträge bleiben bestehen
  for (const p of await browser.pages()) if (!/chrome-extension|about:blank|kleinanzeigen\.de\/s-anzeige/.test(p.url())) await p.close().catch(() => {});
  await dash.evaluate(async () => {
    const [a] = await AK.store.getAdList();
    for (const k of ["kleinanzeigen", "vinted", "facebook", "quoka"]) await AK.store.setPending(k, a.id);
  });

  // 4) Kleinanzeigen-Formular
  const post = await fakePage("https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html");
  await post.waitForFunction(() => document.querySelector("#postad-title").value === "IKEA Sofa Kivik grau", { timeout: 8000 });
  const ka = await post.evaluate(() => ({
    desc: document.querySelector("#pstad-descrptn").value,
    price: document.querySelector("#micro-frontend-price").value,
    type: document.querySelector("#priceType").value,
    files: document.querySelector("#pictureupload-input").files.length
  }));
  assert.ok(ka.desc.startsWith("Sehr guter Zustand."));
  assert.deepEqual([ka.price, ka.type, ka.files], ["999", "NEGOTIABLE", 1]);
  console.log("✓ Kleinanzeigen ausgefüllt (inkl. Bild)");

  // 5) Vinted
  const vin = await fakePage("https://www.vinted.de/items/new");
  await vin.waitForFunction(() => document.querySelector("[data-testid='title--input']").value === "IKEA Sofa Kivik grau", { timeout: 10000 });
  assert.equal(await vin.$eval("[data-testid='price-input--input']", (e) => e.value), "999");
  assert.equal(await vin.$eval("input[type=file]", (e) => e.files.length), 1);
  console.log("✓ Vinted ausgefüllt (inkl. Bild)");

  // 6) Facebook Marketplace (Felder über aria-label des Labels)
  const fb = await fakePage("https://www.facebook.com/marketplace/create/item");
  await fb.waitForFunction(() => document.querySelector("label[aria-label='Titel'] input").value === "IKEA Sofa Kivik grau", { timeout: 10000 });
  assert.equal(await fb.$eval("label[aria-label='Preis'] input", (e) => e.value), "999");
  assert.ok((await fb.$eval("label[aria-label='Beschreibung'] textarea", (e) => e.value)).startsWith("Sehr guter"));
  console.log("✓ Facebook Marketplace ausgefüllt");

  // 7) Quoka: Startseite ohne Formular → Warte-Panel; Formular erscheint später → wird ausgefüllt
  const qu = await fakePage("https://www.quoka.de/");
  await qu.waitForFunction(() => document.querySelector("#ak-panel")?.textContent.includes("öffne das Formular"), { timeout: 10000 });
  await qu.evaluate(() => document.body.insertAdjacentHTML("beforeend",
    `<form><label for="t">Titel der Anzeige</label><input id="t" name="headline"><textarea name="text"></textarea><input name="preis"></form>`));
  await qu.waitForFunction(() => document.querySelector("input[name=headline]").value === "IKEA Sofa Kivik grau", { timeout: 10000 });
  assert.equal(await qu.$eval("input[name=preis]", (e) => e.value), "999");
  console.log("✓ Quoka: wartet auf das Formular und füllt es dann aus");

  // 8) Textvorlagen im Postfach
  const msg = await fakePage("https://www.kleinanzeigen.de/m-nachrichten.html");
  await msg.waitForSelector(".ak-chip");
  await click(msg, ".ak-chip");
  assert.match(await msg.$eval("textarea", (e) => e.value), /noch verfügbar/);
  console.log("✓ Textvorlage eingefügt");

  // 9) Gegenrichtung: Artikel von Vinted speichern
  const item = await fakePage("https://www.vinted.de/items/1234567890-lederjacke-vintage");
  await item.waitForSelector(".ak-floating", { timeout: 8000 });
  await click(item, ".ak-floating");
  await item.waitForFunction(() => document.querySelector(".ak-floating")?.textContent.includes("Gespeichert"), { timeout: 15000 });
  const imported = await dash.evaluate(async () => (await AK.store.getAdList()).find((a) => a.source === "vinted"));
  assert.equal(imported.title, "Lederjacke Vintage Gr. M");
  assert.equal(imported.price, "45");
  assert.deepEqual(imported.category, ["Herren", "Jacken"]);
  assert.equal(imported.sourceId, "vinted:1234567890");
  console.log("✓ Artikel von Vinted in die Kiste geholt");

  console.log("\nAlle E2E-Tests bestanden.");
} finally {
  await browser.close();
}
