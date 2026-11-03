// Liest eine Kleinanzeigen-Detailseite aus (aktuelles Dokument oder per fetch geladenes HTML).
// Rein lesend, kein Netzwerkzugriff → testbar mit jsdom (siehe test/).
(function () {
  const AK = globalThis.AK;

  const clean = (s) => (s || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();

  function first(doc, list) {
    for (const s of list) {
      const el = doc.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function meta(doc, prop) {
    return doc.querySelector(`meta[property='${prop}'], meta[name='${prop}']`)?.getAttribute("content") || "";
  }

  // "1.250 € VB" → { price: "1250", priceType: "NEGOTIABLE" }
  function parsePrice(text) {
    const t = clean(text);
    if (!t) return { price: "", priceType: "" };
    if (/verschenken/i.test(t)) return { price: "", priceType: "GIVE_AWAY" };
    const m = t.match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/);
    const price = m ? m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : "") : "";
    return { price, priceType: /VB/.test(t) ? "NEGOTIABLE" : price ? "FIXED" : "" };
  }

  // Beschreibung mit Zeilenumbrüchen (<br>) erhalten
  function textWithBreaks(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    clone.querySelectorAll("p, div, li").forEach((b) => b.append("\n"));
    return clone.textContent
      .replace(/ /g, " ")
      .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function adIdFromUrl(url) {
    // /s-anzeige/titel/2912345678-123-4567 → 2912345678
    const m = (url || "").match(/\/s-anzeige\/[^/]+\/(\d+)/);
    return m ? m[1] : "";
  }

  function imageUrls(doc, S) {
    const urls = new Set();
    for (const s of S.ad.images) {
      doc.querySelectorAll(s).forEach((img) => {
        const u = img.getAttribute("data-imgsrc") || img.getAttribute("data-src") || img.getAttribute("src");
        if (u && /^https?:/.test(u)) urls.add(u);
      });
      if (urls.size) break;
    }
    if (!urls.size) {
      const og = meta(doc, "og:image");
      if (og) urls.add(og);
    }
    // Kleinanzeigen liefert Bildgrößen per Rule-Parameter; die große Variante anfordern
    return [...urls].map((u) => u.replace(/\?rule=\$_\d+\.(JPG|jpg|webp|WEBP)/, "?rule=$_59.$1")).slice(0, 20);
  }

  function parseAdPage(doc, url) {
    const S = AK.sel;
    const title = clean(first(doc, S.ad.title)?.textContent) || clean(meta(doc, "og:title"));
    const { price, priceType } = parsePrice(first(doc, S.ad.price)?.textContent);
    const description = textWithBreaks(first(doc, S.ad.description)) || clean(meta(doc, "og:description"));
    const location = clean(first(doc, S.ad.locality)?.textContent);
    const viewsText = clean(first(doc, S.ad.views)?.textContent);
    const views = viewsText ? parseInt(viewsText.replace(/\D/g, ""), 10) : null;

    let category = [];
    for (const s of S.ad.breadcrumbs) {
      const parts = Array.from(doc.querySelectorAll(s)).map((a) => clean(a.textContent)).filter(Boolean);
      if (parts.length) { category = parts.filter((p) => !/^kleinanzeigen$/i.test(p)); break; }
    }

    const attributes = [];
    for (const s of S.ad.detailRows) {
      doc.querySelectorAll(s).forEach((row) => {
        const valEl = first(row, S.ad.detailValue);
        const value = clean(valEl?.textContent);
        const label = clean((valEl ? row.textContent.replace(valEl.textContent, "") : row.textContent));
        if (label) attributes.push({ label, value });
      });
    }

    const extra = clean(first(doc, S.ad.extraInfo)?.textContent);
    const idMatch = extra.match(/Anzeigen-?ID:?\s*(\d+)/i);
    const dateMatch = extra.match(/(\d{2}\.\d{2}\.\d{4})/);
    const sourceId = idMatch?.[1] || adIdFromUrl(url);

    return {
      sourceId,
      url,
      title,
      description,
      price,
      priceType,
      category,
      location,
      shipping: clean(first(doc, S.ad.shipping)?.textContent),
      attributes,
      imageUrls: imageUrls(doc, S),
      createdAt: dateMatch?.[1] || "",
      stats: views != null && !Number.isNaN(views) ? { views, updatedAt: Date.now() } : undefined
    };
  }

  AK.parse = { parseAdPage, parsePrice, adIdFromUrl, textWithBreaks };
})();
