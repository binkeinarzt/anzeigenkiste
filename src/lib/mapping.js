// Übersetzt Vinted-Angaben (Kategoriepfad, Marke, Größe, Zustand, Farbe, Material)
// in die Kategorien und Merkmale anderer Plattformen.
//
// Kleinanzeigen: Kategorie-IDs und Merkmalsschlüssel stammen aus den Suchfiltern
// (z. B. /s-herrenbekleidung/c160+kleidung_herren.art_s:jacken_maentel), Stand November 2026.
// Die Merkmale heißen im Formular gleich (attributeMap[kleidung_herren.art_s]).
(function () {
  const AK = globalThis.AK;

  const norm = (s) => (s || "").toLowerCase()
    .replace(/[éèê]/g, "e").replace(/[áàâ]/g, "a")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/&/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const has = (text, ...words) => words.some((w) => norm(text).includes(norm(w)));

  // ---------- gemeinsame Werte ----------

  // Vinted-Zustand → neutraler Wert
  function condition(v) {
    const t = norm(v);
    if (!t) return "";
    if (t.includes("mit etikett")) return "new_with_tag";
    if (t.startsWith("neu")) return "new";
    if (t.includes("sehr gut")) return "like_new";
    if (t === "gut") return "ok";
    if (t.includes("zufriedenstellend") || t.includes("akzeptabel")) return "alright";
    return "";
  }

  // Vinted-Farben → Grundfarbe (für Plattformen mit kleinerer Farbliste)
  const COLOR_BASE = {
    schwarz: "schwarz", weiss: "weiß", grau: "grau", silber: "silber", gold: "gold",
    braun: "braun", beige: "beige", creme: "beige", khaki: "grün", camel: "braun",
    blau: "blau", marineblau: "blau", hellblau: "blau", tuerkis: "türkis", petrol: "türkis",
    gruen: "grün", dunkelgruen: "grün", minzgruen: "grün", oliv: "grün",
    rot: "rot", burgunderrot: "rot", bordeaux: "rot", koralle: "orange",
    rosa: "rosa", pink: "pink", lila: "lila", flieder: "lila",
    gelb: "gelb", senfgelb: "gelb", orange: "orange", aprikose: "orange",
    bunt: "bunt", mehrfarbig: "bunt", transparent: "sonstige"
  };
  function colors(v) {
    const first = (v || "").split(/,|\//)[0].trim();
    if (!first) return [];
    const base = COLOR_BASE[norm(first).replace(/ /g, "")] || "";
    // Reihenfolge = Suchreihenfolge im Formular: genaue Farbe, Grundfarbe, verwandte, „Andere“
    const alt = { bunt: ["mehrfarbig"], rosa: ["rosé", "pink"], pink: ["rosa"], "türkis": ["blau"], silber: ["grau"], gold: ["gelb"], lila: ["violett"] }[base] || [];
    return [...new Set([first, base, ...alt].filter(Boolean))];
  }

  // Größe: „L“, „M / 38 / 10“, „42,5“, „13 Jahre / 158“
  function size(v) {
    const s = (v || "").trim();
    const letter = s.match(/\b(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[4-9]XL)\b/i)?.[1];
    const numbers = (s.match(/\d+(?:[.,]5)?/g) || []).map((n) => n.replace(",", "."));
    const cm = numbers.find((n) => Number(n) >= 44 && Number(n) <= 188 && /jahr|monat|cm|\//i.test(s));
    const years = s.match(/(\d+)\s*Jahre?/i)?.[1];
    const months = s.match(/(\d+)\s*Monate?/i)?.[1];
    return {
      raw: s,
      letter: letter ? letter.toUpperCase() : "",
      number: numbers[0] || "",
      cm: cm || "",
      years: years ? Number(years) : null,
      months: months ? Number(months) : null,
      oneSize: /einheits|one size|onesize/i.test(s)
    };
  }

  // ---------- Kleinanzeigen ----------

  const KA = {
    damenKleidung: { id: 154, key: "kleidung_damen", label: "Damenbekleidung" },
    herrenKleidung: { id: 160, key: "kleidung_herren", label: "Herrenbekleidung" },
    damenSchuhe: { id: 159, key: "schuhe_damen", label: "Damenschuhe" },
    herrenSchuhe: { id: 158, key: "schuhe_herren", label: "Herrenschuhe" },
    taschen: { id: 156, key: "accessoires_schmuck", label: "Taschen & Accessoires" },
    schmuck: { id: 157, key: "uhren_schmuck", label: "Uhren & Schmuck" },
    kinderKleidung: { id: 22, key: "baby_kinderkleidung", label: "Baby- & Kinderkleidung" },
    kinderSchuhe: { id: 19, key: "baby_kinderschuhe", label: "Baby- & Kinderschuhe" },
    spielzeug: { id: 23, key: "spielzeug", label: "Spielzeug" },
    beauty: { id: 224, key: "beauty_gesundheit", label: "Beauty & Gesundheit" },
    sport: { id: 230, key: "sport_camping", label: "Sport & Camping" },
    deko: { id: 246, key: "dekoration", label: "Dekoration" }
  };

  // Oberbegriffe wie „Kleidung“ oder „Schuhe“ aus dem Pfad entfernen, sonst passt „Kleid“ auf alles
  const specific = (path) => path.filter((seg) => !/^(kleidung|schuhe|accessoires|taschen)$/.test(norm(seg)));

  function clothingArt(path, female) {
    const p = specific(path).join(" ");
    if (has(p, "jacke", "mantel", "weste", "parka")) return "jacken_maentel";
    if (has(p, "jeans")) return "jeans";
    if (has(p, "short")) return "shorts";
    if (has(p, "anzug", "anzuege", "blazer", "sakko")) return "anzuege";
    if (has(p, "bademode", "badeanzug", "bikini", "badehose")) return "bademode";
    if (has(p, "kostuem", "verkleidung")) return "kostueme_verkleidungen";
    if (has(p, "hochzeit", "brautkleid")) return "hochzeitsmode";
    if (has(p, "sport", "aktiv")) return "sportbekleidung";
    if (female && has(p, "umstand")) return "umstandsmode";
    if (female && has(p, "kleid", "rock", "roecke")) return "roecke_kleider";
    if (has(p, "pullover", "sweat", "hoodie", "strick", "cardigan")) return "pullover";
    if (female && has(p, "bluse", "hemd")) return "hemden_blusen";
    if (!female && has(p, "hemd")) return "hemden";
    if (has(p, "t shirt", "shirt", "top", "polo")) return female ? "shirts_tops" : "shirts";
    if (has(p, "hose", "leggings", "jogger", "chino")) return "hosen";
    return "sonstige";
  }

  function shoeArt(path, female) {
    const p = specific(path).join(" ");
    if (has(p, "sneaker", "sportschuh", "turnschuh", "laufschuh")) return "sneaker_sportschuhe";
    if (has(p, "stiefel", "boots")) return "stiefel";
    if (has(p, "sandale", "flip flop", "pantolette", "clog")) return "sandalen";
    if (has(p, "hausschuh")) return "hausschuhe";
    if (has(p, "wander", "outdoor", "trekking")) return "outdoor_wanderschuhe";
    if (female && has(p, "ballerina")) return "ballerinas";
    if (female && has(p, "pumps", "high heel", "absatz")) return "pumps";
    if (has(p, "schnuer", "halbschuh", "loafer", "mokassin", "business", "slipper", "oxford", "derby")) return "halb_schnuerschuhe";
    return "sonstiges";
  }

  function kidsType(p) {
    if (has(p, "jacke", "mantel", "weste")) return "jacken_mantel";
    if (has(p, "schnee", "ski")) return "schnee_skibekleidung";
    if (has(p, "body", "strampler")) return "bodys_strampler";
    if (has(p, "schlafanzug", "pyjama")) return "schlafanzuege";
    if (has(p, "strumpfhose")) return "strumpfhosen";
    if (has(p, "socke")) return "socken";
    if (has(p, "legging")) return "leggings";
    if (has(p, "rock", "roecke")) return "roecke";
    if (has(p, "kleid")) return "kleider_roecke";
    if (has(p, "hose", "jeans", "short")) return "hosen_jeans";
    if (has(p, "strickjacke", "cardigan")) return "strickjacken";
    if (has(p, "pullover", "sweat", "hoodie")) return "pullover_strickjacken";
    if (has(p, "hemd")) return "hemden";
    if (has(p, "shirt", "top")) return "shirts_tops";
    if (has(p, "bademode", "badeanzug", "badehose")) return "bademode";
    if (has(p, "sport")) return "sportbekleidung";
    if (has(p, "kostuem", "verkleidung")) return "kostueme_verkleidung";
    if (has(p, "set", "paket", "bundle")) return "kleidungspakete_sets";
    if (has(p, "unterwaesche", "waesche")) return "wasche";
    if (has(p, "accessoire", "muetze", "schal", "handschuh")) return "accessoires";
    return "sonstiges";
  }

  function kidsAge(sz) {
    const y = sz.years, m = sz.months;
    if (m != null && y == null) return m <= 1 ? "newborn" : m <= 3 ? "1_3_months" : m <= 6 ? "3_6_months" : m <= 12 ? "6_12_months" : m <= 18 ? "12_18_months" : "18_24_months";
    if (y == null) return "";
    if (y <= 3) return "2_3_years";
    if (y <= 5) return "3_5_years";
    if (y <= 7) return "5_7_years";
    if (y <= 9) return "7_9_years";
    if (y <= 11) return "9_11_years";
    if (y <= 13) return "11_13_years";
    return "13_16_years";
  }

  // Sichtbare Texte der Klapplisten im Kleinanzeigen-Formular (Werte → Text), aus den Suchfiltern
  const KA_TEXT = {
    jacken_maentel: "Jacken & Mäntel", roecke_kleider: "Röcke & Kleider", shirts_tops: "Shirts & Tops",
    hosen: "Hosen", pullover: "Pullover", hemden_blusen: "Hemden & Blusen", jeans: "Jeans",
    sportbekleidung: "Sportbekleidung", umstandsmode: "Umstandsmode", bademode: "Bademode", shorts: "Shorts",
    kostueme_verkleidungen: "Kostüme & Verkleidungen", hochzeitsmode: "Hochzeitsmode", anzuege: "Anzüge",
    shirts: "Shirts", hemden: "Hemden",
    ballerinas: "Ballerinas", halb_schnuerschuhe: "Halb- & Schnürschuhe", hausschuhe: "Hausschuhe",
    outdoor_wanderschuhe: "Outdoor & Wanderschuhe", pumps: "Pumps & High Heels", sandalen: "Sandalen",
    sneaker_sportschuhe: "Sneaker & Sportschuhe", stiefel: "Stiefel & Stiefeletten",
    taschen_rucksaecke: "Taschen & Rucksäcke", sonnenbrillen: "Sonnenbrillen",
    muetzen_schals_handschuhe: "Mützen, Schals & Handschuhe", schmuck: "Schmuck", uhren: "Uhren",
    maedchen: "Mädchen", jungen: "Jungen", unisex: "Unisex",
    jacken_mantel: "Jacken & Mäntel", hosen_jeans: "Hosen, Jeans & Shorts", pullover_strickjacken: "Pullover",
    kleider_roecke: "Kleider", accessoires: "Accessoires", wasche: "Unterwäsche", bodys_strampler: "Bodys & Strampler",
    kleidungspakete_sets: "Kleidungspakete & Sets", kostueme_verkleidung: "Kostüme & Verkleidung", leggings: "Leggings",
    roecke: "Röcke", schlafanzuege: "Schlafanzüge", schnee_skibekleidung: "Schnee- & Skibekleidung", socken: "Socken",
    strickjacken: "Strickjacken", strumpfhosen: "Strumpfhosen",
    new_with_tag: "Neu mit Etikett", new: "Neu", like_new: "Sehr Gut", ok: "Gut", alright: "In Ordnung",
    "5_7_years": "5–7 Jahre", "3_5_years": "3–5 Jahre", "9_11_years": "9–11 Jahre", "7_9_years": "7–9 Jahre",
    "11_13_years": "11–13 Jahre", "2_3_years": "2–3 Jahre", "6_12_months": "6–12 Monate", "13_16_years": "13–16 Jahre",
    "3_6_months": "3–6 Monate", "18_24_months": "18–24 Monate", "12_18_months": "12–18 Monate", "1_3_months": "1–3 Monate",
    newborn: "Neugeborenes"
  };
  const kaWanted = (v) => [v, KA_TEXT[v]].filter(Boolean);

  /**
   * Liefert {
   *   categoryId, categoryLabel,
   *   attrs: [{ name, label, wanted: [Werte/Texte], fallback: [...] }]
   * }
   * name ist der Merkmalsname ohne Kategorie-Präfix (art, brand, groesse, color, condition, …).
   * Das Präfix (z. B. kleidung_herren) liest content/kleinanzeigen.js zur Laufzeit aus dem Formular,
   * weil es von der gewählten Kategorie abhängt.
   */
  function toKleinanzeigen(ad) {
    const path = ad.category || [];
    const d = ad.details || {};
    const root = norm(path[0]);
    const rest = path.slice(1);
    const p = rest.join(" ");
    const female = root.startsWith("damen");
    const male = root.startsWith("herren");
    const kids = root.startsWith("kinder") || root.startsWith("baby");
    const sz = size(d.size);
    const attrs = [];
    const add = (name, label, wanted, fallback = []) => { if (wanted.filter(Boolean).length || fallback.length) attrs.push({ name, label, wanted: wanted.filter(Boolean), fallback }); };
    let cat = null;

    if ((female || male) && has(p, "schuh") && !has(p, "schuhpflege", "handschuh")) {
      cat = female ? KA.damenSchuhe : KA.herrenSchuhe;
      add("art", "Art", kaWanted(shoeArt(rest, female)));
      if (sz.number) add("groesse", "Größe", [sz.number, sz.number.replace(".", ",")]);
    } else if ((female || male) && has(p, "tasche", "rucksack", "koffer")) {
      cat = KA.taschen;
      add("art", "Art", kaWanted("taschen_rucksaecke"));
    } else if ((female || male) && has(p, "schmuck", "uhr", "kette", "ring", "armband", "ohrring")) {
      cat = KA.schmuck;
      add("art", "Art", kaWanted(has(p, "uhr") && !has(p, "ohrring") ? "uhren" : "schmuck"));
    } else if ((female || male) && has(p, "accessoire", "sonnenbrille", "muetze", "schal", "handschuh", "guertel", "hut", "kappe", "cap")) {
      cat = KA.taschen;
      const art = has(p, "sonnenbrille") ? "sonnenbrillen" : has(p, "muetze", "schal", "handschuh", "hut", "kappe", "cap") ? "muetzen_schals_handschuhe" : "sonstiges";
      add("art", "Art", kaWanted(art), ["sonstiges"]);
    } else if ((female || male) && has(p, "beauty", "pflege", "parfum", "make up", "kosmetik")) {
      cat = KA.beauty;
    } else if (female || male) {
      cat = female ? KA.damenKleidung : KA.herrenKleidung;
      add("art", "Art", kaWanted(clothingArt(rest, female)), ["sonstige"]);
      if (sz.oneSize) add("groesse", "Größe", ["unisize", "Einheitsgröße"]);
      else if (sz.letter) add("groesse", "Größe", [sz.letter]);
    } else if (kids && has(p, "spielzeug", "spiel")) {
      cat = KA.spielzeug;
    } else if (kids && has(p, "schuh") && !has(p, "handschuh")) {
      cat = KA.kinderSchuhe;
      const g = has(p, "maedchen") ? "maedchen" : has(p, "jung") ? "jungen" : "unisex";
      add("geschlecht", "Geschlecht", kaWanted(g));
      add("art", "Art", kaWanted(shoeArt(rest, g === "maedchen")), ["sonstiges"]);
      if (sz.number) add("groesse", "Größe", [sz.number]);
    } else if (kids) {
      cat = KA.kinderKleidung;
      const g = has(p, "maedchen") ? "maedchen" : has(p, "jung") ? "jungen" : "unisex";
      add("art", "Für", kaWanted(g));
      add("type", "Art", kaWanted(kidsType(p)), ["sonstiges"]);
      if (sz.cm) add("groesse", "Größe", [sz.cm]);
      const age = kidsAge(sz);
      if (age) add("altersgruppe", "Alter", kaWanted(age));
    } else if (has(root, "home", "haus", "wohnen") && has(p, "deko")) {
      cat = KA.deko;
    } else if (has(root, "sport")) {
      cat = KA.sport;
    }

    if (d.brand && cat && /kleidung|schuhe/.test(cat.key)) add("brand", "Marke", [d.brand], ["sonstige", "Sonstige", "Andere Marke", "Sonstige Marke"]);
    const zustand = condition(d.condition);
    if (zustand) add("condition", "Zustand", kaWanted(zustand));
    if (d.color) add("color", "Farbe", colors(d.color), ["sonstige", "Andere Farben", "Andere Farbe"]);
    if (d.material) add("material", "Material", d.material.split(",").map((m) => m.trim()), ["Sonstige", "Anderes Material"]);

    return { categoryId: cat?.id || null, categoryLabel: cat?.label || "", attrs };
  }

  AK.mapping = { norm, has, condition, colors, size, toKleinanzeigen, KA, KA_TEXT };
})();
