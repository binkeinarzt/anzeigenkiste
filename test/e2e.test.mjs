// End-to-End-Test im echten Chrome mit der gebauten Erweiterung.
// Alle Plattform-Seiten werden abgefangen und durch nachgebaute Seiten ersetzt.
// Getestet: Speichern auf Kleinanzeigen → Dashboard → Bearbeiten → Inserieren-Dialog (mehrere Plattformen)
// → Formulare auf Kleinanzeigen und Vinted (mit Warten auf das Formular, z. B. nach dem Login) → Textvorlagen
// → WebP-Bilder werden zu JPEG → Artikel von Vinted holen (Kategorie, Marke, Größe, Zustand, Farbe)
// → damit Kleinanzeigen und willhaben ausfüllen, inkl. Feldern, die erst nach der Kategoriewahl erscheinen.
// Aufruf: npm run test:e2e   (braucht Chrome + puppeteer-core)
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ext = fileURLToPath(new URL("../dist/chrome", import.meta.url));
const html = (body) => `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;

const PAGES = {
  "www.kleinanzeigen.de/s-anzeige/ikea-sofa/2912345678-88-1234": readFileSync(new URL("./fixture-ad.html", import.meta.url), "utf8"),
  "www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html": readFileSync(new URL("./mock-kleinanzeigen-post.html", import.meta.url), "utf8"),
  "www.willhaben.at/iad/anzeigenaufgabe/marktplatz": readFileSync(new URL("./mock-willhaben-post.html", import.meta.url), "utf8"),
  "www.kleinanzeigen.de/m-nachrichten.html": html(`<div class="chat"><textarea name="message"></textarea></div>`),
  // Vinted-Verkaufsseite, die das Formular erst nach dem Laden einblendet (wie nach einem Login)
  "www.vinted.de/items/new": html(`<h1>Artikel verkaufen</h1>`),
  "www.vinted.de/items/10652437387-nike-pullover": vintedItem()
};

// Vinted-Artikel wie im Original: Daten als escapter JSON-String im Next.js-Payload
function vintedItem() {
  const data = {
    item: {
      price: { amount: "20.0", currency_code: "EUR" }, title: "Nike Pullover",
      photos: ["01_AAA", "02_BBB", "03_CCC", "04_DDD"].map((id, i) => ({ id, url: `https://images1.vinted.net/t/${id}/f800/${"abcd"[i]}.webp?s=${i + 1}` })),
      attributes: [
        { code: "brand", data: { title: "Marke", value: "Nike" } },
        { code: "size", data: { title: "Größe", value: "M / 38 / 10" } },
        { code: "status", data: { title: "Zustand", value: "Neu, ohne Etikett" } },
        { code: "color", data: { title: "Farbe", value: "Rosa" } }
      ]
    },
    similar: { photos: [{ id: "09_OTHER", url: "https://images1.vinted.net/t/09_OTHER/f800/o.webp" }] }
  };
  return readFileSync(new URL("./mock-vinted-item.html", import.meta.url), "utf8")
    .replace(/<!--PAYLOAD[^>]*-->/, `<script>self.__next_f.push([1, ${JSON.stringify(JSON.stringify(data))}])</script>`);
}

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

// Führt Code im abgeschotteten Bereich der Erweiterung (Content-Script-Welt) einer Seite aus.
// Panel, Hinweise und Vorlagen liegen in einem geschlossenen Shadow DOM, an das die Webseite –
// und damit auch page.evaluate – absichtlich nicht herankommt.
async function inExt(page, expression) {
  const cdp = await page.createCDPSession();
  const contexts = [];
  cdp.on("Runtime.executionContextCreated", (e) => contexts.push(e.context));
  await cdp.send("Runtime.enable");
  const { frameTree } = await cdp.send("Page.getFrameTree");
  const ctx = contexts.find((c) => c.auxData?.type === "isolated" && c.auxData?.frameId === frameTree.frame.id && c.name === "Anzeigenkiste");
  if (!ctx) { await cdp.detach(); throw new Error("Content-Script-Welt nicht gefunden"); }
  const r = await cdp.send("Runtime.evaluate", { expression, contextId: ctx.id, awaitPromise: true, returnByValue: true });
  await cdp.detach();
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function waitExt(page, expression, ms = 10000) {
  for (let t = 0; t < ms; t += 250) {
    if (await inExt(page, expression).catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Zeitüberschreitung: ${expression}`);
}
const panelText = "AK.dom.uiRoot().getElementById('ak-panel')?.innerText || ''";

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
  assert.match(await dash.$eval(".item .meta", (e) => e.textContent), /1250 € VB/);
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
    for (const k of ["kleinanzeigen", "vinted", "willhaben"]) document.getElementById(`pub-${k}`).checked = true;
  });
  await click(dash, "#publish button[value=go]");
  // Hintergrund-Tabs drosseln waitForFunction; deshalb von Node aus abfragen
  let keys = [];
  for (let i = 0; i < 20 && keys.length < 3; i++) {
    await new Promise((r) => setTimeout(r, 300));
    keys = await dash.evaluate(async () => Object.keys((await chrome.storage.local.get("pending")).pending || {}));
  }
  assert.deepEqual(keys.sort(), ["kleinanzeigen", "vinted", "willhaben"]);
  assert.deepEqual(await dash.$$eval("#publish-list input", (l) => l.map((i) => i.value)), ["kleinanzeigen", "vinted", "willhaben"], "nur noch drei Plattformen");
  console.log("✓ Inserieren-Dialog legt Aufträge für Kleinanzeigen, Vinted und willhaben an");
  // Die vom Dialog geöffneten echten Tabs schließen (im Test kein Netz); Aufträge bleiben bestehen
  for (const p of await browser.pages()) if (!/chrome-extension|about:blank|kleinanzeigen\.de\/s-anzeige/.test(p.url())) await p.close().catch(() => {});
  await dash.evaluate(async () => {
    const [a] = await AK.store.getAdList();
    for (const k of ["kleinanzeigen", "vinted"]) await AK.store.setPending(k, a.id);
  });

  // 4) Kleinanzeigen-Formular (Nachbau des echten Formulars)
  const post = await fakePage("https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html");
  await post.waitForFunction(() => document.querySelector("#ad-title").value === "IKEA Sofa Kivik grau", { timeout: 8000 });
  await post.waitForFunction(() => document.querySelector("input[name=priceType]").value === "NEGOTIABLE", { timeout: 8000 });
  for (let i = 0; i < 30 && !(await post.$$eval("img[alt='Bild zur Anzeige']", (e) => e.length)); i++) await new Promise((r) => setTimeout(r, 200));
  const ka = await post.evaluate(() => ({
    desc: document.querySelector("#ad-description").value,
    price: document.querySelector("#ad-price-amount").value,
    files: document.querySelectorAll("img[alt='Bild zur Anzeige']").length
  }));
  assert.ok(ka.desc.startsWith("Sehr guter Zustand."));
  assert.deepEqual([ka.price, ka.files], ["999", 1]);
  console.log("✓ Kleinanzeigen ausgefüllt (inkl. Bild und Preisart VB)");

  // 5) Vinted: Seite ohne Formular → Warte-Panel; Formular erscheint später → wird ausgefüllt
  const vin = await fakePage("https://www.vinted.de/items/new");
  await waitExt(vin, `(${panelText}).includes("öffne das Formular")`);
  // Die Webseite selbst sieht vom Panel nichts (geschlossenes Shadow DOM)
  assert.equal(await vin.evaluate(() => document.body.innerText.includes("öffne das Formular") || !!document.querySelector("ak-ui")?.shadowRoot), false, "Panel für die Webseite unsichtbar");
  await vin.evaluate(() => document.body.insertAdjacentHTML("beforeend",
    `<input data-testid="title--input"><textarea data-testid="description--input"></textarea><input data-testid="price-input--input"><input type="file" multiple accept="image/*" style="display:none">`));
  await vin.waitForFunction(() => document.querySelector("[data-testid='title--input']").value === "IKEA Sofa Kivik grau", { timeout: 10000 });
  assert.equal(await vin.$eval("[data-testid='price-input--input']", (e) => e.value), "999");
  for (let i = 0; i < 20 && !(await vin.$eval("input[type=file]", (e) => e.files.length)); i++) await new Promise((r) => setTimeout(r, 200));
  assert.equal(await vin.$eval("input[type=file]", (e) => e.files.length), 1);
  console.log("✓ Vinted: wartet auf das Formular und füllt es dann aus (inkl. Bild)");

  // 8) Textvorlagen im Postfach
  const msg = await fakePage("https://www.kleinanzeigen.de/m-nachrichten.html");
  await waitExt(msg, "!!AK.dom.inlineRoots[0]?.querySelector('.ak-chip')");
  assert.equal(await msg.evaluate(() => document.body.innerText.includes("Vorlagen")), false, "Vorlagen für die Webseite unsichtbar");
  await inExt(msg, "AK.dom.inlineRoots[0].querySelector('.ak-chip').click()");
  assert.match(await msg.$eval("textarea", (e) => e.value), /noch verfügbar/);
  console.log("✓ Textvorlage eingefügt");

  // 9) WebP → JPEG: Kleinanzeigen lehnt WebP ab („ungültiges Format“)
  const conv = await dash.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 40; c.height = 30;
    c.getContext("2d").fillRect(0, 0, 40, 30);
    const webp = c.toDataURL("image/webp");
    const [bg] = await chrome.runtime.sendMessage({ type: "fetchImages", urls: [webp] });
    const page = await AK.dom.ensureJpeg(webp);
    return { input: webp.slice(0, 15), bg: bg.slice(0, 15), page: page.slice(0, 15) };
  });
  assert.equal(conv.input, "data:image/webp");
  assert.equal(conv.bg, "data:image/jpeg");
  assert.equal(conv.page, "data:image/jpeg");
  console.log("✓ WebP-Bilder werden als JPEG gespeichert und eingefügt");

  // 10) Gegenrichtung: Artikel von Vinted speichern (mit allen Details)
  const item = await fakePage("https://www.vinted.de/items/10652437387-nike-pullover");
  await item.waitForSelector(".ak-floating", { timeout: 8000 });
  await click(item, ".ak-floating");
  await item.waitForFunction(() => document.querySelector(".ak-floating")?.textContent.includes("Gespeichert"), { timeout: 15000 });
  const vad = await dash.evaluate(async () => (await AK.store.getAdList()).find((a) => a.source === "vinted"));
  assert.equal(vad.title, "Nike Pullover");
  assert.equal(vad.price, "20");
  assert.equal(vad.description, "Kaum getragen, wie neu.\nNichtraucherhaushalt.");
  assert.deepEqual(vad.category, ["Damen", "Kleidung", "Pullover & Strickpullover", "Hoodies & Sweaters"]);
  assert.deepEqual(vad.details, { brand: "Nike", size: "M / 38 / 10", condition: "Neu, ohne Etikett", color: "Rosa", material: "" });
  assert.equal(vad.sourceId, "vinted:10652437387");
  console.log("✓ Artikel von Vinted mit Kategorie, Marke, Größe, Zustand und Farbe geholt");

  // 10b) Mit alter Version gespeicherter Vinted-Artikel (ohne Details): Dashboard lädt sie beim Inserieren nach
  await dash.evaluate(async (id) => {
    const ads = await AK.store.getAds();
    delete ads[id].details; delete ads[id].catalogIds; ads[id].category = ["Damen Hoodies"];
    await chrome.storage.local.set({ ads });
  }, vad.id);
  await dash.reload();
  await dash.bringToFront(); // Chrome schickt das close-Ereignis des Dialogs nur in sichtbaren Tabs
  await dash.waitForSelector(".item h3");
  dash.on("dialog", (d) => d.dismiss());
  // Wie bei Vinted beobachtet: direkte Abrufe (fetch) bekommen eine Prüfseite, nur das Öffnen
  // der Seite im Tab liefert den Artikel. Browserweit abfangen, damit auch neu geöffnete Tabs erfasst werden.
  const bs = await browser.target().createCDPSession();
  await bs.send("Fetch.enable", { patterns: [{ urlPattern: "*://www.vinted.de/items/*" }] });
  let vintedTabOpened = false;
  bs.on("Fetch.requestPaused", (e) => {
    const isPage = e.resourceType === "Document";
    if (isPage) vintedTabOpened = true;
    const body = isPage ? PAGES["www.vinted.de/items/10652437387-nike-pullover"] : "<!doctype html><html><body><p>Bitte warten, wir prüfen deinen Browser …</p></body></html>";
    bs.send("Fetch.fulfillRequest", {
      requestId: e.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
      body: Buffer.from(body).toString("base64")
    }).catch(() => {});
  });
  await dash.evaluate(() => [...document.querySelectorAll(".item")].find((i) => i.textContent.includes("Nike Pullover"))
    .querySelector(".actions button").click());
  await dash.waitForSelector("#publish[open]");
  await dash.evaluate(() => { document.querySelectorAll("#publish-list input").forEach((c) => (c.checked = c.value === "kleinanzeigen")); });
  await click(dash, "#publish button[value=go]");
  let refreshed = null;
  for (let i = 0; i < 120 && !refreshed?.details; i++) {
    await new Promise((r) => setTimeout(r, 500));
    refreshed = await dash.evaluate(async (id) => AK.store.getAd(id), vad.id);
  }
  assert.deepEqual(refreshed.details, vad.details);
  assert.deepEqual(refreshed.category, vad.category);
  assert.ok(vintedTabOpened, "Rückfall über den Hintergrund-Tab wurde genutzt");
  const vintedTabs = async () => (await browser.pages()).filter((p) => /vinted\.de\/items\/\d/.test(p.url())).length;
  for (let i = 0; i < 20 && (await vintedTabs()) > 1; i++) await new Promise((r) => setTimeout(r, 300));
  assert.equal(await vintedTabs(), 1, "Hintergrund-Tab wieder geschlossen (offen bleibt nur der Tab aus Schritt 10)");
  await bs.send("Fetch.disable");
  for (const p of await browser.pages()) if (/kleinanzeigen\.de\/p-anzeige/.test(p.url())) await p.close().catch(() => {});
  console.log("✓ Alte Vinted-Einträge ohne Details werden über einen Hintergrund-Tab nachgeladen, Tab schließt sich wieder");

  // 11) Vinted-Artikel auf Kleinanzeigen: Kategorie und alle Merkmale nach Vinted
  // Einstellung „Direkt kaufen: Ja“ im Dashboard setzen
  await dash.bringToFront();
  await dash.evaluate(() => [...document.querySelectorAll(".tab")].find((t) => t.dataset.tab === "settings").click());
  await dash.select("#buy-now", "true");
  assert.equal(await dash.evaluate(async () => (await chrome.storage.local.get("kaBuyNow")).kaBuyNow), "true");
  // Zwei WebP-Bilder hinterlegen, wie sie ältere Versionen von Vinted gespeichert haben
  await dash.evaluate(async (id) => {
    const webp = (color) => { const c = document.createElement("canvas"); c.width = 60; c.height = 40; const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, 60, 40); return c.toDataURL("image/webp"); };
    const ads = await AK.store.getAds();
    ads[id].images = [webp("#c33"), webp("#36c")];
    await chrome.storage.local.set({ ads });
    await AK.store.setPending("kleinanzeigen", id); await AK.store.setPending("willhaben", id);
  }, vad.id);
  const post2 = await fakePage("https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html");
  const v = (n) => post2.$eval(`input[name='${n}']`, (e) => e.value).catch(() => null);
  for (let i = 0; i < 60 && !(await v("attributeMap[kleidung_damen.color]")); i++) await new Promise((r) => setTimeout(r, 300));
  const ka2 = {
    cat: await v("categoryId"), art: await v("attributeMap[kleidung_damen.art]"), size: await v("attributeMap[kleidung_damen.groesse]"),
    color: await v("attributeMap[kleidung_damen.color]"), brand: await v("attributeMap[kleidung_damen.brand]"),
    cond: await v("attributeMap[kleidung_damen.condition]"), submitted: await post2.evaluate(() => !!window.__submitted)
  };
  assert.deepEqual(ka2, { cat: "154", art: "pullover", size: "m_38", color: "rose", brand: "nike", cond: "new", submitted: false });
  const photos = () => post2.$$eval("img[alt='Bild zur Anzeige']", (e) => e.map((i) => `${i.dataset.name}:${i.dataset.type}`));
  for (let i = 0; i < 20 && (await photos()).length < 2; i++) await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(await photos(), ["anzeige-1.jpg:image/jpeg", "anzeige-2.jpg:image/jpeg"], "Kleinanzeigen: Fotos als JPEG im versteckten Foto-Feld");
  for (let i = 0; i < 20 && !(await post2.$eval("#ad-buy-now-true", (e) => e.checked).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 200));
  assert.equal(await post2.$eval("#ad-shipping-enabled-yes", (e) => e.checked), true, "Versand möglich gewählt");
  assert.equal(await post2.$eval("#ad-buy-now-true", (e) => e.checked), true, "Direkt kaufen: Ja gewählt");

  // Erneut ausfüllen (z. B. nach Unterbrechen) darf die Fotos nicht doppelt hochladen
  await post2.bringToFront();
  // Die Kleinanzeigen-Seite kann die Liste deiner Anzeigen im Panel nicht auslesen
  assert.equal(await post2.evaluate(() => document.body.innerText.includes("IKEA Sofa")), false, "Anzeigenliste für die Webseite unsichtbar");
  await inExt(post2, "[...AK.dom.uiRoot().querySelectorAll('#ak-panel button')].find((b) => b.textContent === 'Formular ausfüllen').click()");
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal((await photos()).length, 2, "Fotos nach erneutem Ausfüllen nicht doppelt");

  // ✕ am Panel stoppt das Ausfüllen: geleerte Beschreibung bleibt leer
  await inExt(post2, "AK.dom.uiRoot().querySelector('#ak-panel .ak-icon-btn').click()");
  await post2.evaluate(() => { const t = document.querySelector("#ad-description"); t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true })); document.body.append(document.createElement("div")); });
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(await post2.$eval("#ad-description", (e) => e.value), "", "nach ✕ wird nichts mehr ausgefüllt");
  console.log("✓ Kleinanzeigen: Damenbekleidung › Pullover, M, Nike, Rosé, Neu, 2 Fotos (WebP → JPEG), Direkt kaufen – nichts abgeschickt");
  console.log("✓ Erneutes Ausfüllen lädt Fotos nicht doppelt hoch, ✕ stoppt das Ausfüllen");

  // 12) willhaben: Beschreibung im Editor, Felder nach Kategoriewahl, Preis nachgefüllt, Fenster richtig gespeichert
  const wh = await fakePage("https://www.willhaben.at/iad/anzeigenaufgabe/marktplatz?adTypeId=67&productId=67");
  let whs = null;
  for (let i = 0; i < 60; i++) {
    whs = await wh.evaluate(() => ({
      cat: [...document.querySelectorAll("input[name='category-suggestion']")].findIndex((r) => r.checked),
      model: window.__editorModel(),
      price: document.querySelector("#price").value,
      brand: window.__modal.BRAND_CLOTHING || null,
      size: document.querySelector("input[name='CLOTHING_SIZE_FEMALE-radio-group']:checked")?.value || null,
      cond: document.querySelector("input[name='Zustand-radio-group']:checked")?.value || null,
      color: document.querySelector("[data-testid='COLOR-button']")?.textContent || null,
      draftSaved: !!window.__draftSaved, submitted: !!window.__submitted
    }));
    if (whs.color === "Rosa" && whs.price && whs.brand && whs.size && whs.cond) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(whs.cat >= 1, "willhaben: Damen-Kategorie gewählt");
  assert.equal(whs.model, "Kaum getragen, wie neu.\nNichtraucherhaushalt.");
  assert.equal(whs.price, "20", "willhaben: Preis nach Kategoriewechsel nachgefüllt");
  assert.equal(whs.brand, "Nike");
  assert.equal(whs.size, "38");
  assert.equal(whs.cond, "neu");
  assert.equal(whs.color, "Rosa");
  assert.equal(whs.draftSaved, false, "willhaben: Entwurf darf nicht gespeichert werden");
  assert.deepEqual(await wh.$eval("#imagePicker", (e) => [...e.files].map((f) => f.type)), ["image/jpeg", "image/jpeg"], "willhaben: Fotos als JPEG");
  assert.equal(whs.submitted, false);
  console.log("✓ willhaben: Text im Editor, Damen-Kategorie, Nike, 38, Neu, Rosa, Preis – kein Entwurf, nichts abgeschickt");

  console.log("\nAlle E2E-Tests bestanden.");
} finally {
  await browser.close();
}
