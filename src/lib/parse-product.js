// Liest eine Artikelseite von Vinted, eBay oder willhaben aus.
// Erst strukturierte Daten (JSON-LD „Product“), dann Open-Graph-Metadaten als Rückfall.
(function () {
  const AK = globalThis.AK;
  const clean = (s) => (s || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();

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

  function parseProductPage(doc, url, source) {
    const p = jsonLdProduct(doc) || {};
    const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers || {};
    const imgs = [].concat(p.image || []).map((i) => (typeof i === "string" ? i : i?.url || i?.contentUrl)).filter(Boolean);
    const og = meta(doc, "og:image");
    const images = [...new Set(imgs.length ? imgs : og ? [og] : [])].filter((u) => /^https?:/.test(u)).slice(0, 20);
    const price = toPrice(offer.price ?? offer.lowPrice ?? meta(doc, "product:price:amount") ?? meta(doc, "og:price:amount"));
    const category = typeof p.category === "string" ? p.category.split(/\s*[>›/]\s*/).filter(Boolean) : [];
    const m = (url || "").match(/\/(?:items|itm)\/(?:[^/]*\/)?(\d{6,})|-(\d{6,})\/?$|\/(\d{6,})\/?$/);
    return {
      source,
      sourceId: `${source}:${p.sku || p.productID || (m && (m[1] || m[2] || m[3])) || url}`,
      url,
      title: clean(p.name) || clean(meta(doc, "og:title")) || clean(doc.querySelector("h1")?.textContent),
      description: (p.description || meta(doc, "og:description") || "").trim(),
      price,
      priceType: price === "0" ? "GIVE_AWAY" : price ? "FIXED" : "",
      category,
      imageUrls: images
    };
  }

  AK.parseProduct = { parseProductPage, toPrice };
})();
