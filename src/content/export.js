// Übertragen auf andere Plattformen (Vinted, eBay, willhaben, Facebook, markt.de, Quoka).
// Läuft auf jeder Seite der Plattform, wird aber nur aktiv, wenn im Dashboard ein Auftrag
// für diese Plattform offen ist. Sobald ein Verkaufsformular erkannt wird, füllt es Titel,
// Beschreibung, Preis und Bilder aus. Kopier-Knöpfe bleiben als Rückfallebene im Panel.
(function () {
  const AK = globalThis.AK;
  const { h, toast, setValue, injectFiles, copy, downloadDataUrl, sleep } = AK.dom;

  const platform = AK.platformForHost(location.hostname);
  if (!platform || platform === "kleinanzeigen") return;
  const P = AK.platforms[platform];

  const WORDS = {
    title: /titel|title|heading|überschrift|headline/i,
    description: /beschreibung|description/i,
    price: /preis|price/i
  };

  function describe(el) {
    const byId = el.id ? document.querySelector(`label[for='${CSS.escape(el.id)}']`)?.textContent : "";
    const labelledBy = (el.getAttribute("aria-labelledby") || "").split(/\s+/)
      .map((id) => id && document.getElementById(id)?.textContent).join(" ");
    const wrapping = el.closest("label");
    return [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.dataset?.testid,
      byId, labelledBy, wrapping?.getAttribute("aria-label"), wrapping?.textContent?.slice(0, 60)].join(" ");
  }

  const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;

  function guess(kind) {
    const sel = kind === "description"
      ? "textarea, [contenteditable='true']"
      : "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=search])";
    return Array.from(document.querySelectorAll(sel)).find((el) => visible(el) && WORDS[kind].test(describe(el))) || null;
  }

  function field(kind) {
    for (const s of P.fields[kind] || []) {
      const el = document.querySelector(s);
      if (el && visible(el)) return el;
    }
    return guess(kind);
  }

  const formReady = () => !!(field("title") && (field("description") || field("price")));

  function fill(ad, { quiet = false } = {}) {
    const done = [];
    const missing = [];
    const put = (name, ok) => (ok ? done : missing).push(name);
    put("Titel", setValue(field("title"), ad.title));
    put("Beschreibung", setValue(field("description"), ad.description));
    if (ad.priceType !== "GIVE_AWAY" && ad.price) put("Preis", setValue(field("price"), ad.price));
    const file = Array.from(document.querySelectorAll("input[type='file']"))
      .find((i) => /image/.test(i.accept || "image")) || null;
    if (ad.images?.length) put(`${ad.images.length} Bilder`, file ? injectFiles(file, ad.images, "artikel") : false);
    if (!quiet || missing.length) {
      toast(missing.length
        ? `Ausgefüllt: ${done.join(", ") || "nichts"}. Bitte von Hand: ${missing.join(", ")}.`
        : `Ausgefüllt: ${done.join(", ")}. Kategorie wählen, prüfen, veröffentlichen.`, missing.length ? "warn" : "ok");
    }
    return missing;
  }

  function copyRow(label, value) {
    return h("div", { class: "ak-copyrow" },
      h("div", { class: "ak-copyrow__text" }, h("span", { class: "ak-muted ak-small" }, label), h("span", {}, value || "–")),
      h("button", { class: "ak-btn ak-btn--sm", type: "button", onclick: async () => { await copy(value || ""); toast(`${label} kopiert.`); } }, "Kopieren"));
  }

  function renderPanel(ad) {
    const { body } = AK.dom.panel(`Nach ${P.label} übertragen`);
    body.append(
      h("p", { class: "ak-strong" }, ad.title),
      h("div", { class: "ak-thumbs" }, (ad.images || []).slice(0, 8).map((src) => h("img", { src, alt: "" }))),
      h("div", { class: "ak-row" },
        h("button", { class: "ak-btn ak-btn--primary", type: "button", onclick: () => fill(ad) }, "Erneut ausfüllen"),
        h("button", {
          class: "ak-btn", type: "button",
          onclick: () => (ad.images || []).forEach((src, i) => downloadDataUrl(src, `${ad.title.slice(0, 40)}-${i + 1}.jpg`))
        }, "Bilder laden")),
      copyRow("Titel", ad.title),
      copyRow("Beschreibung", ad.description),
      copyRow("Preis", ad.priceType === "GIVE_AWAY" ? "0" : ad.price),
      ad.category?.length ? h("p", { class: "ak-muted ak-small" }, `Kategorie bisher: ${ad.category.join(" › ")}`) : null,
      h("p", { class: "ak-muted ak-small" }, "Kategorie, Zustand und Versand wählst du selbst. Veröffentlichen ebenfalls.")
    );
  }

  function renderWaiting(ad) {
    const { body } = AK.dom.panel(`Nach ${P.label} übertragen`);
    body.append(
      h("p", { class: "ak-strong" }, ad.title),
      h("p", { class: "ak-muted" }, `Melde dich bei Bedarf an und öffne das Formular zum Inserieren. Sobald es da ist, fülle ich es aus.`),
      h("button", { class: "ak-btn", type: "button", onclick: async () => { await AK.store.takePending(platform); AK.dom.$("#ak-panel")?.remove(); } }, "Abbrechen")
    );
  }

  (async () => {
    const pending = await AK.store.peekPending(platform);
    if (!pending) return;
    const ad = await AK.store.getAd(pending.adId);
    if (!ad) return;

    // Auf das Formular warten (auch über Login und Seitenwechsel in Single-Page-Apps hinweg)
    let waitingShown = false;
    for (let i = 0; i < 900; i++) { // max. 15 Minuten
      if (formReady()) break;
      if (i === 4 && !waitingShown) { renderWaiting(ad); waitingShown = true; }
      if (!(await AK.store.peekPending(platform))) return; // abgebrochen
      await sleep(1000);
    }
    if (!formReady()) return;
    await sleep(1200); // Formular kurz rendern lassen
    await AK.store.takePending(platform);
    renderPanel(ad);
    fill(ad);
  })();
})();
