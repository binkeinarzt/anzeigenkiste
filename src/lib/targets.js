// Ausfüll-Schritte je Zielplattform (für content/export.js).
// Jede Funktion liefert eine Liste von Schritten für AK.autofill.run().
//
// willhaben (Formular-Stand November 2026, /iad/anzeigenaufgabe/marktplatz):
//   Titel #heading, Preis #price, Bilder #imagePicker, Beschreibung im Quill-Editor (.ql-editor)
//   Kategorie: Vorschläge nach dem Titel als Radios name="category-suggestion"
//   Merkmale erscheinen erst nach der Kategorie:
//     Radio-Gruppen  name="<SCHLÜSSEL>-radio-group"  (BRAND_CLOTHING, CLOTHING_SIZE_MALE, Zustand …)
//     Fenster-Knöpfe data-testid="<SCHLÜSSEL>-button" → Fenster data-testid="attribute-modal-<SCHLÜSSEL>"
//       mit Knöpfen data-testid="attribute-value-<WERT>" (Farbe: Mehrfachauswahl + „Speichern“)
(function () {
  const AK = globalThis.AK;
  const { setValue, injectFiles, sleep } = AK.dom;
  const { norm, has, condition, colors, size } = AK.mapping;
  const { pick, labelOf, chooseNative } = AK.autofill;

  const q = (sel) => document.querySelector(sel);

  // Schlüssel der Merkmale auf der Seite (Radio-Gruppen und Fenster-Knöpfe)
  function whKeys() {
    const keys = new Set();
    document.querySelectorAll("input[type='radio'][name$='-radio-group']").forEach((r) => keys.add(r.name.replace(/-radio-group$/, "")));
    document.querySelectorAll("[data-testid$='-button']").forEach((b) => {
      const k = b.getAttribute("data-testid").replace(/-button$/, "");
      if (/^[A-Z][A-Za-z_]+$/.test(k)) keys.add(k);
    });
    return [...keys];
  }
  const whKey = (re) => whKeys().find((k) => re.test(k)) || null;

  // Text eines Kategorievorschlags mit Trennern: „Mode / Accessoires › Herrenmode › Jacken / Mäntel › Winterjacken“
  function segments(label) {
    const out = [];
    const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const t = walker.currentNode.textContent.trim(); if (t) out.push(t); }
    return out;
  }

  // Bewertet einen Kategorievorschlag gegen den Vinted-Pfad
  function scoreCategory(segs, path) {
    const text = norm(segs.join(" "));
    const root = norm(path[0]);
    let score = 0;
    const gender = root.startsWith("damen") ? "damen" : root.startsWith("herren") ? "herren" : root.startsWith("kinder") ? "kinder" : "";
    if (gender) {
      const other = ["damen", "herren", "kinder"].filter((g) => g !== gender);
      if (text.includes(gender) || (gender === "kinder" && /baby|kinder|maedchen|bub/.test(text))) score += 5;
      if (other.some((g) => text.includes(g))) score -= 5;
    }
    const syn = { stepp: "winter", daunen: "winter", puffer: "winter", hoodie: "pullover", sweater: "pullover", sweat: "pullover", sneaker: "sportschuhe", tshirt: "shirt" };
    for (const word of norm(path.slice(1).join(" ")).split(" ")) {
      if (word.length < 4) continue;
      const stem = word.replace(/(en|n|s|e)$/, "");
      if (text.includes(stem)) score += 1;
      for (const [k, v] of Object.entries(syn)) if (word.includes(k) && text.includes(v)) score += 1;
    }
    return score;
  }

  // willhaben-Zustand
  function whCondition(v) {
    const c = condition(v);
    return { new_with_tag: ["neu", "Neu"], new: ["neu", "Neu"], like_new: ["MintCondition", "Neuwertig"], ok: ["gebraucht", "Gebraucht"], alright: ["gebraucht", "Gebraucht"] }[c] || [];
  }

  // Größe in Radio-Gruppe: Beschriftungen wie „50 / L“, „38“, „bis 34“, „ab 58“
  function chooseSize(radio, rawSize) {
    const sz = size(rawSize);
    const group = Array.from(document.querySelectorAll(`input[name='${CSS.escape(radio.name)}']`));
    const parts = (r) => labelOf(r).split("/").map((p) => p.trim().toUpperCase());
    const tries = [sz.number, sz.cm, sz.letter].filter(Boolean).map((s) => String(s).toUpperCase().replace(".", ","));
    for (const t of tries) {
      const hit = group.find((r) => parts(r).includes(t) || parts(r).includes(t.replace(",", ".")));
      if (hit) { hit.click(); return true; }
    }
    return false;
  }

  // Wählt in einem Merkmal-Fenster einen Wert (Einfach- oder Mehrfachauswahl)
  async function chooseInModal(key, wanted, fallback) {
    const btn = q(`[data-testid='${key}-button']`);
    if (!btn) return false;
    btn.click();
    let modal = null;
    for (let t = 0; t < 1500 && !modal; t += 100) { modal = q(`[data-testid='attribute-modal-${key}']`); if (!modal) await sleep(100); }
    if (!modal) return false;
    const filter = modal.querySelector("[data-testid='attributeValueFilterInput']");
    if (filter && wanted[0]) { setValue(filter, wanted[0]); await sleep(300); }
    const options = Array.from(modal.querySelectorAll("[data-testid^='attribute-value-']"))
      .map((el) => ({ el, value: el.getAttribute("data-testid").replace("attribute-value-", ""), text: el.textContent }));
    let hit = pick(options, wanted, []);
    if (!hit && filter) { setValue(filter, ""); await sleep(300); }
    if (!hit) {
      const all = Array.from(modal.querySelectorAll("[data-testid^='attribute-value-']"))
        .map((el) => ({ el, value: el.getAttribute("data-testid").replace("attribute-value-", ""), text: el.textContent }));
      hit = pick(all, [], fallback);
    }
    if (!hit) { modal.querySelector(`[data-testid='attribute-modal-${key}-close-button'], [data-testid='abort-button']`)?.click(); return false; }
    hit.el.click();
    await sleep(300);
    // Mehrfachauswahl: Fenster bleibt offen → im Fenster speichern (nicht den Entwurf-Knopf der Seite!)
    const still = q(`[data-testid='attribute-modal-${key}']`);
    if (still) still.querySelector("[data-testid='save-button']")?.click();
    await sleep(200);
    return true;
  }

  function willhaben(ad) {
    const d = ad.details || {};
    const path = ad.category || [];
    const steps = [
      { id: "title", label: "Titel", refill: true, isFilled: (el) => el.value.trim() !== "",
        find: () => q("#heading, input[name='heading']"), apply: (el) => setValue(el, ad.title) },
      path.length && {
        id: "category", label: "Kategorie", refill: true,
        find: () => q("input[name='category-suggestion']"),
        apply: (first) => {
          const radios = Array.from(document.querySelectorAll("input[name='category-suggestion']"));
          const scored = radios.map((r) => {
            const label = (r.id && q(`label[for='${CSS.escape(r.id)}']`)) || r.closest("label");
            return { r, s: label ? scoreCategory(segments(label), path) : 0 };
          }).sort((a, b) => b.s - a.s);
          const best = scored[0];
          if (!best || best.s <= 0) return false;
          if (!best.r.checked) best.r.click();
          return true;
        }
      },
      { id: "description", label: "Beschreibung", refill: true, find: () => q(".ql-editor, [contenteditable='true']"),
        isFilled: (el) => el.innerText.trim() !== "", apply: (el) => setValue(el, ad.description) },
      // willhaben leert den Preis, wenn sich die Kategorie ändert → nachfüllen, solange leer
      ad.price && ad.priceType !== "GIVE_AWAY" && { id: "price", label: "Preis", refill: true, isFilled: (el) => el.value.trim() !== "",
        find: () => q("#price, input[name='price']"), apply: (el) => setValue(el, ad.price) },
      ad.images?.length && { id: "images", label: `${ad.images.length} Bilder`, hidden: true, find: () => q("#imagePicker, input[type='file']"), apply: (el) => injectFiles(el, ad.images, "artikel") },
      d.brand && {
        id: "brand", label: "Marke", refill: true,
        find: () => { const k = whKey(/^BRAND/); return k ? (q(`input[name='${k}-radio-group']`) || q(`[data-testid='${k}-button']`)) : null; },
        apply: async (el) => {
          const key = whKey(/^BRAND/);
          const radio = q(`input[name='${key}-radio-group']`);
          if (radio && chooseNative(radio, [d.brand], [])) return true;
          return chooseInModal(key, [d.brand], ["Sonstige", "Andere", "Andere Marke", "SONSTIGE"]);
        }
      },
      d.size && {
        id: "size", label: "Größe", refill: true,
        find: () => { const k = whKey(/SIZE/); return k ? q(`input[name='${k}-radio-group']`) || q(`[data-testid='${k}-button']`) : null; },
        apply: async (el) => {
          if (el instanceof HTMLInputElement) return chooseSize(el, d.size);
          const sz = size(d.size);
          return chooseInModal(whKey(/SIZE/), [sz.number, sz.letter, sz.cm, d.size].filter(Boolean), []);
        }
      },
      d.condition && whCondition(d.condition).length && {
        id: "condition", label: "Zustand", refill: true,
        find: () => { const k = whKey(/^(Zustand|CONDITION)/i); return k ? q(`input[name='${k}-radio-group']`) : null; },
        apply: (el) => !!chooseNative(el, whCondition(d.condition), [])
      },
      d.color && {
        id: "color", label: "Farbe", refill: true,
        find: () => { const k = whKey(/^COLOU?R/); return k ? q(`[data-testid='${k}-button']`) || q(`input[name='${k}-radio-group']`) : null; },
        isFilled: (el) => el instanceof HTMLButtonElement && !/bitte|auswählen/i.test(el.textContent),
        apply: async (el) => {
          const wanted = [...colors(d.color), ...(has(d.color, "bunt", "mehrfarbig") ? ["Mehrfarbig"] : [])];
          if (el instanceof HTMLInputElement) return !!chooseNative(el, wanted, []);
          return chooseInModal(whKey(/^COLOU?R/), wanted, []);
        }
      }
    ];
    return steps.filter(Boolean);
  }

  // Allgemein (Vinted, eBay, Facebook, markt.de, Quoka): Titel, Text, Preis, Bilder
  // plus Merkmale, die über ihre Beschriftung gefunden werden.
  function generic(ad, P) {
    const WORDS = {
      title: /titel|title|heading|überschrift|headline/i,
      description: /beschreibung|description/i,
      price: /preis|price/i
    };
    const describe = (el) => {
      const byId = el.id ? q(`label[for='${CSS.escape(el.id)}']`)?.textContent : "";
      const by = (el.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => id && document.getElementById(id)?.textContent).join(" ");
      const wrap = el.closest("label");
      return [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.dataset?.testid, byId, by, wrap?.getAttribute("aria-label"), wrap?.textContent?.slice(0, 60)].join(" ");
    };
    const field = (kind) => {
      for (const s of P.fields?.[kind] || []) { const el = q(s); if (el && AK.autofill.visible(el)) return el; }
      const sel = kind === "description" ? "textarea, [contenteditable='true']" : "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=search])";
      return Array.from(document.querySelectorAll(sel)).find((el) => AK.autofill.visible(el) && WORDS[kind].test(describe(el))) || null;
    };
    const d = ad.details || {};
    // Merkmal per Beschriftung finden: <select>, Klappliste oder Radio-Gruppe in der Nähe des Labels
    const byLabel = (re) => () => {
      for (const l of document.querySelectorAll("label, legend, [id$='-label'], span, p")) {
        if (l.children.length > 2 || !re.test(l.textContent.trim()) || l.textContent.trim().length > 30) continue;
        const target = (l.htmlFor && document.getElementById(l.htmlFor)) || l.parentElement?.querySelector("select, [role='combobox'], input[type='radio']");
        if (target && AK.autofill.visible(target)) return target;
      }
      return null;
    };
    const attr = (id, label, re, wanted, fallback = []) => wanted.filter(Boolean).length && {
      id, label, optional: true, refill: true, find: byLabel(re),
      apply: async (el) => !!(await AK.autofill.choose(el, wanted.filter(Boolean), fallback))
    };
    const sz = size(d.size);
    return [
      { id: "title", label: "Titel", find: () => field("title"), apply: (el) => setValue(el, ad.title) },
      { id: "description", label: "Beschreibung", refill: true, find: () => field("description"),
        isFilled: (el) => (el.value ?? el.innerText).trim() !== "", apply: (el) => setValue(el, ad.description) },
      ad.price && ad.priceType !== "GIVE_AWAY" && { id: "price", label: "Preis", refill: true, isFilled: (el) => el.value.trim() !== "",
        find: () => field("price"), apply: (el) => setValue(el, ad.price) },
      ad.images?.length && {
        id: "images", label: `${ad.images.length} Bilder`, hidden: true,
        find: () => Array.from(document.querySelectorAll("input[type='file']")).find((i) => /image/.test(i.accept || "image")) || null,
        apply: (el) => injectFiles(el, ad.images, "artikel")
      },
      attr("brand", "Marke", /^marke|^brand/i, [d.brand], ["Sonstige", "Andere Marke"]),
      attr("size", "Größe", /^größe|^groesse|^size/i, [sz.number, sz.letter, d.size]),
      attr("condition", "Zustand", /^zustand|^condition/i, [{ new_with_tag: "Neu mit Etikett", new: "Neu", like_new: "Sehr gut", ok: "Gut", alright: "Zufriedenstellend" }[condition(d.condition)], d.condition]),
      attr("color", "Farbe", /^farbe|^colou?r/i, colors(d.color), ["Andere", "Sonstige", "Mehrfarbig"])
    ].filter(Boolean);
  }

  AK.targets = { willhaben, generic, scoreCategory, whCondition, segments };
})();
