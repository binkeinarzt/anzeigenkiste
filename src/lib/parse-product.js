// Liest eine Artikelseite von Vinted, eBay oder willhaben aus.
// Grundlage sind die strukturierten Daten (JSON-LD „Product“), die aber auf allen drei Plattformen
// nur einen Teil der Bilder enthalten. Deshalb hat jede Plattform zusätzlich einen eigenen Pfad:
//   Vinted:    eingebettete Seitendaten, Array "photos" (alle Fotos, auch die hinter „+3“)
//   willhaben: __NEXT_DATA__ → advertDetails (alle Bilder, echte Beschreibung, Ort)
//   eBay:      Bildergalerie (alle Fotos in groß); Beschreibung liegt in einem eigenen Frame
(function () {
  const AK = globalThis.AK;
  const clean = (s) => (s || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
  const uniq = (a) => [...new Set(a.filter(Boolean))];

  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
    const root = doc.body.firstElementChild || doc.body;
    root.querySelectorAll("script, style").forEach((e) => e.remove());
    root.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    root.querySelectorAll("p, div, li, tr, h1, h2, h3, h4").forEach((b) => b.append("\n"));
    return root.textContent.replace(/ /g, " ")
      .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  function findProduct(node) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const n of node) { const r = findProduct(n); if (r) return r; } return null; }
    const t = node["@type"];
    if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return node;
    return findProduct(node["@graph"]) || findProduct(node.mainEntity) || null;
  }

  function jsonLdProduct(doc) {
    for (const s of doc.querySelectorAll("script[type='application/ld+json']")) {
      try { const p = findProduct(JSON.parse(s.textContent)); if (p) return p; } catch {}
    }
    return null;
  }

  const meta = (doc, prop) =>
    doc.querySelector(`meta[property='${prop}'], meta[name='${prop}']`)?.getAttribute("content") || "";

  function toPrice(v) {
    if (v == null || v === "") return "";
    const n = parseFloat(String(v).replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    return Number.isFinite(n) ? String(n) : "";
  }

  // ---------- Vinted ----------

  // Sucht in Skript-Text alle JSON-Arrays nach `"<name>":[` – roh oder als JSON-String escaped (Next.js-Payload).
  function jsonArrays(text, name) {
    const out = [];
    for (const [key, escaped] of [[`"${name}":[`, false], [`\\"${name}\\":[`, true]]) {
      let i = 0;
      while ((i = text.indexOf(key, i)) >= 0) {
        const start = i + key.length - 1;
        let depth = 0, j = start;
        for (; j < text.length; j++) {
          const c = text[j];
          if (c === "[") depth++;
          else if (c === "]" && --depth === 0) break;
        }
        const raw = text.slice(start, j + 1);
        try { out.push(JSON.parse(escaped ? JSON.parse(`"${raw}"`) : raw)); } catch {}
        i = j;
      }
    }
    return out.filter((a) => Array.isArray(a) && a.length);
  }

  const photoArrays = (text) => jsonArrays(text, "photos").filter((a) => a[0] && (a[0].url || a[0].full_size_url));

  const vintedPhotoId = (u) => (u || "").match(/vinted\.net\/t\/([^/]+)\//)?.[1] || "";

  function vintedImages(doc) {
    const domImgs = Array.from(doc.querySelectorAll("[data-testid^='item-photo-'][data-testid$='--img']"))
      .map((i) => i.getAttribute("src") || i.currentSrc).filter(Boolean);
    const mainId = vintedPhotoId(domImgs[0]);
    const scripts = Array.from(doc.querySelectorAll("script")).map((s) => s.textContent).join("\n");
    const arrays = photoArrays(scripts);
    // Das Array des Artikels ist das, welches das Titelbild der Galerie enthält (nicht ähnliche Artikel)
    const own = (mainId && arrays.find((a) => a.some((p) => p.id === mainId || vintedPhotoId(p.url) === mainId))) || (!mainId && arrays[0]);
    if (own) return uniq(own.map((p) => p.full_size_url || p.url));
    // Rückfall: was die Galerie sichtbar zeigt
    const seen = new Set();
    return domImgs.filter((u) => { const id = vintedPhotoId(u); if (seen.has(id)) return false; seen.add(id); return true; });
  }

  // Marke, Größe, Zustand, Farbe, Material und Kategoriepfad.
  // Kategorie: Brotkrumen-Links (…?referrer=item-crumbs) mit Vinted-Katalog-IDs.
  // Merkmale: Array "attributes" im Payload ({code, data: {value}}), Rückfall auf die sichtbare Liste.
  function vintedDetails(doc, scripts) {
    const crumbs = Array.from(doc.querySelectorAll("a[href*='referrer=item-crumbs']"))
      .map((a) => ({ title: clean(a.textContent), href: a.getAttribute("href") || "" }))
      .filter((c) => c.title && !/\/brand\//.test(c.href))
      .map((c) => ({ title: c.title, id: Number(c.href.match(/\/catalog\/(\d+)/)?.[1]) || null }));

    const details = {};
    const attrs = jsonArrays(scripts, "attributes").find((a) => a.some((x) => x && x.code && x.data && "value" in x.data));
    for (const a of attrs || []) {
      if (["brand", "size", "status", "color", "material"].includes(a.code)) details[a.code] = clean(String(a.data.value));
    }
    for (const code of ["size", "status", "color", "material"]) {
      if (details[code]) continue;
      const el = doc.querySelector(`[data-testid='item-attributes-${code}']`);
      const label = el?.querySelector("[class*='title'], dt, span")?.textContent || "";
      const v = clean((el?.textContent || "").replace(label, ""));
      if (v) details[code] = v;
    }
    if (!details.brand) {
      const m = scripts.match(/brand_dto\\?"\s*:\s*\{[^}]*?\\?"title\\?"\s*:\s*\\?"([^"\\]+)/);
      if (m) details.brand = m[1];
    }
    return {
      category: crumbs.map((c) => c.title),
      catalogIds: crumbs.map((c) => c.id).filter(Boolean),
      details: {
        brand: details.brand || "",
        size: details.size || "",
        condition: details.status || "",
        color: details.color || "",
        material: details.material || ""
      }
    };
  }

  function vintedBasics(doc, scripts) {
    const title = clean(doc.querySelector("h1")?.textContent) || clean(meta(doc, "og:title").replace(/\s*\|\s*Vinted\s*$/, ""));
    const descEl = doc.querySelector("[itemprop='description'], [data-testid='item-description']");
    let description = descEl ? descEl.textContent.trim() : "";
    if (!description) {
      const og = meta(doc, "og:description");
      description = og.startsWith(title + " - ") ? og.slice(title.length + 3) : og;
    }
    // Preis des Artikels: das price-Objekt direkt vor seinem eigenen Titel
    let price = "";
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = scripts.match(new RegExp(`price\\\\?"\\s*:\\s*\\{\\\\?"amount\\\\?"\\s*:\\s*\\\\?"([\\d.]+)\\\\?"[^}]*\\}\\s*,\\s*\\\\?"title\\\\?"\\s*:\\s*\\\\?"${esc(JSON.stringify(title).slice(1, -1).replace(/"/g, '\\"'))}`));
    if (m) price = toPrice(m[1]);
    if (!price) price = toPrice(clean(doc.querySelector("[data-testid='item-price']")?.textContent));
    return { title, description, price };
  }

  // ---------- willhaben ----------

  function willhabenDetails(doc) {
    try {
      const j = JSON.parse(doc.getElementById("__NEXT_DATA__")?.textContent || "null");
      return j?.props?.pageProps?.advertDetails || null;
    } catch { return null; }
  }

  const whAttr = (ad, name) => ad?.attributes?.attribute?.find((a) => a.name === name)?.values?.[0] || "";

  // ---------- eBay ----------

  function ebayImages(doc) {
    const ids = [];
    for (const img of doc.querySelectorAll(".ux-image-carousel-item img, [data-testid='ux-image-carousel'] img")) {
      const u = img.getAttribute("data-zoom-src") || img.getAttribute("data-src") || img.getAttribute("src") || "";
      const id = u.match(/ebayimg\.com\/images\/g\/([^/]+)\//)?.[1];
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids.map((id) => `https://i.ebayimg.com/images/g/${id}/s-l1600.jpg`);
  }

  // ---------- Gesamt ----------

  function parseProductPage(doc, url, source) {
    const p = jsonLdProduct(doc) || {};
    const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers || {};
    const ldImgs = [].concat(p.image || []).map((i) => (typeof i === "string" ? i : i?.url || i?.contentUrl));
    const og = meta(doc, "og:image");
    const m = (url || "").match(/\/(?:items|itm)\/(?:[^/]*\/)?(\d{6,})|-(\d{6,})\/?$|\/(\d{6,})\/?$/);

    const data = {
      source,
      sourceId: `${source}:${p.sku || p.productID || (m && (m[1] || m[2] || m[3])) || url}`,
      url,
      title: clean(p.name) || clean(meta(doc, "og:title")) || clean(doc.querySelector("h1")?.textContent),
      description: (p.description || meta(doc, "og:description") || "").trim(),
      price: toPrice(offer.price ?? offer.lowPrice ?? (meta(doc, "product:price:amount") || meta(doc, "og:price:amount"))),
      category: typeof p.category === "string" ? p.category.split(/\s*[>›/]\s*/).filter(Boolean) : [],
      location: "",
      imageUrls: [],
      descriptionUrl: ""
    };

    let images = [];
    if (source === "vinted") {
      images = vintedImages(doc);
      const scripts = Array.from(doc.querySelectorAll("script")).map((s) => s.textContent).join("\n");
      const b = vintedBasics(doc, scripts);
      // Vinted ist die Quelle der Wahrheit: eigene Angaben haben Vorrang vor JSON-LD
      data.title = b.title || data.title;
      data.description = b.description || data.description;
      data.price = b.price || data.price;
      const d = vintedDetails(doc, scripts);
      if (d.category.length) data.category = d.category;
      data.catalogIds = d.catalogIds;
      data.details = d.details;
    } else if (source === "willhaben") {
      const ad = willhabenDetails(doc);
      if (ad) {
        images = (ad.advertImageList?.advertImage || []).map((i) => i.referenceImageUrl || i.mainImageUrl);
        // Bei willhaben ist "description" die Überschrift, der Text steckt im Attribut DESCRIPTION
        data.title = clean(ad.description) || data.title;
        data.description = htmlToText(whAttr(ad, "DESCRIPTION")) || data.description;
        data.price = toPrice(whAttr(ad, "PRICE")) || data.price;
        data.location = [whAttr(ad, "LOCATION/POSTCODE"), whAttr(ad, "LOCATION/ADDRESS_2")].filter(Boolean).join(" ");
        if (ad.id) data.sourceId = `willhaben:${ad.id}`;
      }
    } else if (source === "ebay") {
      images = ebayImages(doc);
      data.descriptionUrl = doc.querySelector("#desc_ifr")?.getAttribute("src") || "";
    }

    data.imageUrls = uniq([...images, ...(images.length ? [] : ldImgs), ...(images.length || ldImgs.length ? [] : [og])])
      .filter((u) => /^https?:/.test(u)).slice(0, 20);
    data.priceType = data.price === "0" ? "GIVE_AWAY" : data.price ? "FIXED" : "";
    return data;
  }

  AK.parseProduct = { parseProductPage, toPrice, htmlToText, photoArrays, jsonArrays };
})();
