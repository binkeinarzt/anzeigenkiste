// Testet das Auslesen von Artikelseiten auf Vinted und willhaben.
// Die Fixtures bilden den echten Aufbau nach (Stand November 2026):
//   Vinted:    JSON-LD mit nur 1 Bild, Galerie zeigt 5, alle 8 stecken escaped im Next.js-Payload
//   willhaben: JSON-LD mit nur 1 Bild, alle Bilder und der Text in __NEXT_DATA__
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const dom = new JSDOM("");
globalThis.DOMParser = dom.window.DOMParser;
globalThis.AK = {};
new Function(readFileSync(new URL("../src/lib/parse-product.js", import.meta.url), "utf8"))();
const { parseProductPage } = globalThis.AK.parseProduct;
const page = (html) => new dom.window.DOMParser().parseFromString(html, "text/html");

// ---------- Vinted ----------
const vImg = (i, size = "f800") => `https://images1.vinted.net/t/0${i}_ID${i}/${size}/p${i}.webp?s=x${i}`;
const ownPhotos = Array.from({ length: 8 }, (_, i) => ({ id: `0${i + 1}_ID${i + 1}`, url: vImg(i + 1), thumbnails: [] }));
const otherPhotos = [{ id: "09_OTHER", url: "https://images1.vinted.net/t/09_OTHER/f800/o.webp" }];
// Next.js streamt die Daten als JSON-String im Skript → Anführungszeichen sind escaped
const payload = JSON.stringify(JSON.stringify({ similar: { photos: otherPhotos }, item: { photos: ownPhotos } }));
const vinted = page(`<html><head>
  <script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Wellensteyn Jacke", description: "Größe L", category: "Herren Steppjacken", image: vImg(1), offers: { price: "35.00" } })}</script>
  </head><body>
  ${[1, 2, 3, 4, 5].map((i) => `<div data-testid="item-photo-${i}"><img data-testid="item-photo-${i}--img" src="${vImg(i)}"></div>`).join("")}
  <span data-testid="item-photo-5--label">+ 3</span>
  <script>self.__next_f.push([1, ${payload}])</script>
  </body></html>`);
const v = parseProductPage(vinted, "https://www.vinted.at/items/10654170690-wellensteyn-jacke", "vinted");
assert.equal(v.imageUrls.length, 8, "Vinted: alle 8 Fotos, nicht nur die 5 sichtbaren");
assert.equal(v.imageUrls[0], vImg(1));
assert.ok(!v.imageUrls.some((u) => u.includes("OTHER")), "Vinted: keine Fotos ähnlicher Artikel");
assert.equal(v.title, "Wellensteyn Jacke");
assert.equal(v.price, "35");
assert.equal(v.sourceId, "vinted:10654170690");

// Ohne Payload: Rückfall auf die sichtbare Galerie
const vintedNoData = page(`<body>${[1, 2, 3].map((i) => `<img data-testid="item-photo-${i}--img" src="${vImg(i)}"><img data-testid="item-photo-${i}--img" src="${vImg(i)}">`).join("")}</body>`);
assert.equal(parseProductPage(vintedNoData, "https://www.vinted.at/items/1-x", "vinted").imageUrls.length, 3, "Vinted: Galerie ohne Duplikate");

// ---------- willhaben ----------
const whNext = {
  props: { pageProps: { advertDetails: {
    id: 2105215990,
    description: "Jacke von Only",
    attributes: { attribute: [
      { name: "DESCRIPTION", values: ["Schicke Jacke!<br>Kaum getragen.<br><br>Nur Abholung."] },
      { name: "PRICE", values: ["10"] },
      { name: "LOCATION/POSTCODE", values: ["4061"] },
      { name: "LOCATION/ADDRESS_2", values: ["Pasching"] }
    ] },
    advertImageList: { advertImage: [1, 2, 3].map((i) => ({ referenceImageUrl: `https://cache.willhaben.at/mmo/0/210/521/5990_${i}.jpg` })) }
  } } }
};
const wh = page(`<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Jacke", image: "https://cache.willhaben.at/mmo/0/210/521/5990_1_hoved.jpg", offers: { price: "10" } })}</script></head>
  <body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(whNext)}</script></body></html>`);
const w = parseProductPage(wh, "https://www.willhaben.at/iad/kaufen-und-verkaufen/d/jacke-2105215990/", "willhaben");
assert.equal(w.imageUrls.length, 3, "willhaben: alle Bilder aus __NEXT_DATA__");
assert.equal(w.title, "Jacke von Only");
assert.equal(w.description, "Schicke Jacke!\nKaum getragen.\n\nNur Abholung.");
assert.equal(w.price, "10");
assert.equal(w.location, "4061 Pasching");
assert.equal(w.sourceId, "willhaben:2105215990");

assert.equal(globalThis.AK.parseProduct.htmlToText("<div><p>Zeile 1</p><p>Zeile 2</p><script>x()</script></div>"), "Zeile 1\nZeile 2");

console.log("✓ Artikelseiten-Tests bestanden (Vinted 8/8, willhaben 3/3)");
