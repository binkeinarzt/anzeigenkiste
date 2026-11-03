// Export-Panel für Vinted, eBay und willhaben.
// Erscheint auf den Verkaufsseiten, wenn im Dashboard „Übertragen“ gewählt wurde.
// Versucht Felder automatisch zu befüllen und bietet für alles Kopier-Knöpfe als Rückfallebene.
(function () {
  const AK = globalThis.AK;
  const { h, toast, setValue, injectFiles, copy, downloadDataUrl, formatPrice, waitFor } = AK.dom;

  const host = location.hostname;
  const platform = /vinted\./.test(host) ? "vinted" : /ebay\./.test(host) ? "ebay" : /willhaben\./.test(host) ? "willhaben" : null;
  if (!platform) return;

  // Plattform-spezifische Selektoren zuerst, danach generische Heuristik.
  const FIELDS = {
    vinted: {
      title: ["input[data-testid='title--input']", "input#title", "input[name='title']"],
      description: ["textarea[data-testid='description--input']", "textarea#description", "textarea[name='description']"],
      price: ["input[data-testid='price-input--input']", "input#price", "input[name='price']"]
    },
    ebay: {
      title: ["input[name='title']", "textarea[name='title']", "input[aria-label*='Titel' i]"],
      description: ["textarea[name='description']", "[contenteditable='true'][aria-label*='Beschreibung' i]"],
      price: ["input[name='price']", "input[aria-label*='Preis' i]"]
    },
    willhaben: {
      title: ["input[name='heading']", "input[data-testid*='heading']", "input[name='title']"],
      description: ["textarea[name='description']", "[contenteditable='true']"],
      price: ["input[name='price']", "input[data-testid*='price']"]
    }
  }[platform];

  const LABELS = { vinted: "Vinted", ebay: "eBay", willhaben: "willhaben" };

  function guess(kind) {
    const words = { title: /titel|title|heading|überschrift/i, description: /beschreibung|description/i, price: /preis|price/i }[kind];
    const candidates = Array.from(document.querySelectorAll(kind === "description" ? "textarea, [contenteditable='true']" : "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio])"));
    return candidates.find((el) => {
      const label = el.id ? document.querySelector(`label[for='${CSS.escape(el.id)}']`)?.textContent : "";
      return words.test([el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.dataset?.testid, label].join(" "));
    }) || null;
  }

  function field(kind) {
    for (const s of FIELDS[kind]) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return guess(kind);
  }

  function fill(ad) {
    const done = [];
    if (setValue(field("title"), ad.title)) done.push("Titel");
    if (setValue(field("description"), ad.description)) done.push("Beschreibung");
    if (ad.price && setValue(field("price"), ad.price)) done.push("Preis");
    const file = document.querySelector("input[type='file'][accept*='image'], input[type='file']");
    if (file && ad.images?.length && injectFiles(file, ad.images, "artikel")) done.push("Bilder");
    toast(done.length ? `Eingefügt: ${done.join(", ")}. Bitte alles prüfen.` : "Keine Felder gefunden. Nutze die Kopier-Knöpfe.", done.length ? "ok" : "warn");
  }

  function copyRow(label, value) {
    return h("div", { class: "ak-copyrow" },
      h("div", { class: "ak-copyrow__text" }, h("span", { class: "ak-muted ak-small" }, label), h("span", {}, value || "–")),
      h("button", { class: "ak-btn ak-btn--sm", type: "button", onclick: async () => { await copy(value || ""); toast(`${label} kopiert.`); } }, "Kopieren"));
  }

  function render(ad) {
    const { body } = AK.dom.panel(`Nach ${LABELS[platform]} übertragen`);
    const thumbs = h("div", { class: "ak-thumbs" }, (ad.images || []).slice(0, 8).map((src) => h("img", { src, alt: "" })));
    body.append(
      h("p", { class: "ak-strong" }, ad.title),
      thumbs,
      h("div", { class: "ak-row" },
        h("button", { class: "ak-btn ak-btn--primary", type: "button", onclick: () => fill(ad) }, "Automatisch ausfüllen"),
        h("button", {
          class: "ak-btn", type: "button",
          onclick: () => (ad.images || []).forEach((src, i) => downloadDataUrl(src, `${ad.title.slice(0, 40)}-${i + 1}.jpg`))
        }, "Bilder laden")),
      copyRow("Titel", ad.title),
      copyRow("Beschreibung", ad.description),
      copyRow("Preis", ad.priceType === "GIVE_AWAY" ? "0" : ad.price),
      ad.category?.length ? h("p", { class: "ak-muted ak-small" }, `Kategorie auf Kleinanzeigen: ${ad.category.join(" › ")}`) : null,
      h("p", { class: "ak-muted ak-small" }, "Kategorie, Zustand und Versand wählst du selbst. Veröffentlichen ebenfalls.")
    );
  }

  // Nur auf Verkaufsseiten aktiv werden, damit z. B. eine Login-Weiterleitung den Auftrag nicht verbraucht.
  const SELL_PATHS = { vinted: /^\/items\/new/, ebay: /^\/(sl|lstng)\b/, willhaben: /anzeigenaufgabe|\/iad\/.*(aufgeben|create)/ };

  (async () => {
    if (!SELL_PATHS[platform].test(location.pathname)) return;
    const pending = await AK.store.takePending((p) => p.action === "export" && p.platform === platform);
    if (!pending) return;
    const ad = await AK.store.getAd(pending.adId);
    if (!ad) return;
    // Verkaufsformulare sind oft Single-Page-Apps; kurz auf ein Eingabefeld warten
    await waitFor("input, textarea", { timeout: 8000 });
    render(ad);
  })();
})();
