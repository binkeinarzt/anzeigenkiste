// Testet den Anzeigen-Parser gegen eine nachgebaute Kleinanzeigen-Detailseite.
// Aufruf: npm test
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync(new URL("./fixture-ad.html", import.meta.url), "utf8");
const dom = new JSDOM(html, { url: "https://www.kleinanzeigen.de/s-anzeige/ikea-sofa/2912345678-88-1234" });
globalThis.AK = {};
for (const f of ["selectors.js", "parse.js"]) {
  new Function(readFileSync(new URL(`../src/lib/${f}`, import.meta.url), "utf8"))();
}

const ad = globalThis.AK.parse.parseAdPage(dom.window.document, dom.window.location.href);

assert.equal(ad.title, "IKEA Sofa Kivik grau");
assert.equal(ad.price, "1250");
assert.equal(ad.priceType, "NEGOTIABLE");
assert.equal(ad.sourceId, "2912345678");
assert.equal(ad.location, "10115 Berlin - Mitte");
assert.equal(ad.description, "Sehr guter Zustand.\nNichtraucher, keine Tiere.\n\nAbholung in Berlin.");
assert.deepEqual(ad.category, ["Möbel & Wohnen", "Wohnzimmer"]);
assert.deepEqual(ad.attributes, [{ label: "Art", value: "Sofas & Sitzgarnituren" }, { label: "Farbe", value: "Grau" }]);
assert.equal(ad.stats, undefined);
assert.equal(ad.createdAt, "21.10.2026");
assert.equal(ad.imageUrls.length, 2);
assert.ok(ad.imageUrls[0].includes("rule=$_59.JPG"));

const { parsePrice } = globalThis.AK.parse;
assert.deepEqual(parsePrice("Zu verschenken"), { price: "", priceType: "GIVE_AWAY" });
assert.deepEqual(parsePrice("49,90 €"), { price: "49.90", priceType: "FIXED" });
assert.deepEqual(parsePrice("VB"), { price: "", priceType: "NEGOTIABLE" });

console.log("✓ Parser-Tests bestanden");
