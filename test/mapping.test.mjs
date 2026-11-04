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

// Jede Kategorie aus der Auswahl im Dashboard muss eindeutig abgebildet werden
new Function(readFileSync(new URL("../src/lib/categories.js", import.meta.url), "utf8"))();
const TREE = globalThis.AK.CATEGORY_TREE;
const expected = {
  "Damen›Kleidung": 154, "Herren›Kleidung": 160, "Damen›Schuhe": 159, "Herren›Schuhe": 158,
  "Damen›Taschen": 156, "Herren›Taschen": 156, "Damen›Beauty": 224, "Herren›Pflege": 224,
  "Kinder›Mädchen": 22, "Kinder›Jungs": 22, "Kinder›Spielzeug": 23, "Home›Dekoration": 246, "Sport›Sport & Camping": 230
};
let checked = 0;
for (const [root, groups] of Object.entries(TREE)) {
  for (const [group, leaves] of Object.entries(groups)) {
    for (const leaf of leaves) {
      const m = toKleinanzeigen({ category: [root, group, leaf], details: {} });
      const key = `${root}›${group}`;
      let want = expected[key];
      if (group === "Accessoires") want = /schmuck|uhren/i.test(leaf) ? 157 : 156;
      if (/^(Mädchen|Jungs)$/.test(group) && leaf === "Schuhe") want = 19;
      assert.equal(m.categoryId, want, `${root} › ${group} › ${leaf}`);
      checked++;
    }
  }
}
// Stichproben für die Art innerhalb der Kategorie
const art = (path) => { const at = toKleinanzeigen({ category: path, details: {} }).attrs; return (at.find((a) => a.name === "type") || at.find((a) => a.name === "art"))?.wanted[0]; };
assert.equal(art(["Herren", "Accessoires", "Mützen & Hüte"]), "muetzen_schals_handschuhe");
assert.equal(art(["Damen", "Kleidung", "Kleider"]), "roecke_kleider");
assert.equal(art(["Damen", "Kleidung", "Blusen & Hemden"]), "hemden_blusen");
assert.equal(art(["Herren", "Kleidung", "T-Shirts & Tops"]), "shirts");
assert.equal(art(["Herren", "Schuhe", "Halbschuhe & Schnürschuhe"]), "halb_schnuerschuhe");
assert.equal(art(["Damen", "Schuhe", "Pumps & High Heels"]), "pumps");
assert.equal(art(["Kinder", "Mädchen", "Bodys & Strampler"]), "bodys_strampler");
// Vinted: Handschuhe sind keine Schuhe
assert.equal(toKleinanzeigen({ category: ["Damen", "Accessoires", "Handschuhe"], details: {} }).categoryId, 156);

// Hilfsfunktionen
assert.equal(condition("Zufriedenstellend"), "alright");
assert.deepEqual(colors("Grau, Schwarz"), ["Grau", "grau"]);
assert.equal(size("XXL").letter, "XXL");
assert.equal(size("Einheitsgröße").oneSize, true);

console.log(`✓ Zuordnungs-Tests bestanden (Vinted → Kleinanzeigen, ${checked} Kategorien der Auswahl geprüft)`);
