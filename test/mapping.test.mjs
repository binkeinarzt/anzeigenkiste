// Zuordnung Vinted → Kleinanzeigen mit echten Vinted-Kategoriepfaden (Stand November 2026).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

globalThis.AK = {};
new Function(readFileSync(new URL("../src/lib/mapping.js", import.meta.url), "utf8"))();
const { toKleinanzeigen, colors, size, condition } = globalThis.AK.mapping;
const attr = (m, name) => m.attrs.find((a) => a.name === name)?.wanted || null;

// Herren › Kleidung › Jacken & Mäntel › Jacken › Steppjacken (Wellensteyn, L, Gut, Marineblau)
let m = toKleinanzeigen({ category: ["Herren", "Kleidung", "Jacken & Mäntel", "Jacken", "Steppjacken"],
  details: { brand: "Wellensteyn", size: "L", condition: "Gut", color: "Marineblau", material: "Polyester, Daunen" } });
assert.equal(m.categoryId, 160);
assert.deepEqual(attr(m, "art"), ["jacken_maentel", "Jacken & Mäntel"]);
assert.deepEqual(attr(m, "groesse"), ["L"]);
assert.deepEqual(attr(m, "brand"), ["Wellensteyn"]);
assert.deepEqual(attr(m, "condition"), ["ok", "Gut"]);
assert.deepEqual(attr(m, "color"), ["Marineblau", "blau"]);

// Damen › Kleidung › Pullover & Strickpullover › Hoodies & Sweaters – „Kleidung“ darf nicht zu „Kleider“ führen
m = toKleinanzeigen({ category: ["Damen", "Kleidung", "Pullover & Strickpullover", "Hoodies & Sweaters"],
  details: { brand: "Nike", size: "M / 38 / 10", condition: "Neu, ohne Etikett", color: "Rosa" } });
assert.equal(m.categoryId, 154);
assert.deepEqual(attr(m, "art"), ["pullover", "Pullover"]);
assert.deepEqual(attr(m, "groesse"), ["M"]);
assert.deepEqual(attr(m, "condition"), ["new", "Neu"]);
assert.ok(attr(m, "color").includes("rosé"));

// Damen › Kleidung › Kleider › Midikleider
m = toKleinanzeigen({ category: ["Damen", "Kleidung", "Kleider", "Midikleider"], details: {} });
assert.deepEqual(attr(m, "art"), ["roecke_kleider", "Röcke & Kleider"]);

// Herren › Kleidung › Pullover & Sweater › Sweater
m = toKleinanzeigen({ category: ["Herren", "Kleidung", "Pullover & Sweater", "Sweater"], details: { size: "M" } });
assert.deepEqual(attr(m, "art"), ["pullover", "Pullover"]);

// Herren › Schuhe › Sneaker (42,5)
m = toKleinanzeigen({ category: ["Herren", "Schuhe", "Sneaker"], details: { size: "42,5", brand: "Nike" } });
assert.equal(m.categoryId, 158);
assert.deepEqual(attr(m, "art"), ["sneaker_sportschuhe", "Sneaker & Sportschuhe"]);
assert.deepEqual(attr(m, "groesse"), ["42.5", "42,5"]);

// Damen › Taschen › Rucksäcke
m = toKleinanzeigen({ category: ["Damen", "Taschen", "Rucksäcke"], details: {} });
assert.equal(m.categoryId, 156);

// Kinder › Jungs › Pullover & Jäckchen › Pullover (13 Jahre / 158)
m = toKleinanzeigen({ category: ["Kinder", "Jungs", "Pullover & Jäckchen", "Pullover"], details: { size: "13 Jahre / 158", condition: "Sehr gut" } });
assert.equal(m.categoryId, 22);
assert.deepEqual(attr(m, "art"), ["jungen", "Jungen"]);
assert.deepEqual(attr(m, "type"), ["pullover_strickjacken", "Pullover"]);
assert.deepEqual(attr(m, "groesse"), ["158"]);
assert.deepEqual(attr(m, "altersgruppe"), ["11_13_years", "11–13 Jahre"]);
assert.deepEqual(attr(m, "condition"), ["like_new", "Sehr Gut"]);

// Unbekannter Bereich → keine Kategorie, Nutzer wählt selbst
m = toKleinanzeigen({ category: ["Unterhaltung", "Bücher"], details: {} });
assert.equal(m.categoryId, null);

// Hilfsfunktionen
assert.equal(condition("Zufriedenstellend"), "alright");
assert.deepEqual(colors("Grau, Schwarz"), ["Grau", "grau"]);
assert.equal(size("XXL").letter, "XXL");
assert.equal(size("Einheitsgröße").oneSize, true);

console.log("✓ Zuordnungs-Tests bestanden (Vinted → Kleinanzeigen)");
