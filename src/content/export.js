// Übertragen auf andere Plattformen (Vinted, eBay, willhaben, Facebook, markt.de, Quoka).
// Läuft auf jeder Seite der Plattform, wird aber nur aktiv, wenn im Dashboard ein Auftrag
// für diese Plattform offen ist. Der Ausfüll-Motor (lib/autofill.js) füllt jedes Feld, sobald es
// erscheint – auch Felder, die erst nach der Kategoriewahl auftauchen. Kopier-Knöpfe bleiben
// als Rückfallebene im Panel.
(function () {
  const AK = globalThis.AK;
  const { h, toast, copy, downloadDataUrl, sleep } = AK.dom;

  const platform = AK.platformForHost(location.hostname);
  if (!platform || platform === "kleinanzeigen") return;
  const P = AK.platforms[platform];

  const stepsFor = (ad) => (AK.targets[platform] ? AK.targets[platform](ad) : AK.targets.generic(ad, P));

  // Formular erkannt, wenn der Titel-Schritt sein Feld findet
  const formReady = (ad) => !!stepsFor(ad).find((s) => s.id === "title")?.find();

  function copyRow(label, value) {
    return h("div", { class: "ak-copyrow" },
      h("div", { class: "ak-copyrow__text" }, h("span", { class: "ak-muted ak-small" }, label), h("span", {}, value || "–")),
      h("button", { class: "ak-btn ak-btn--sm", type: "button", onclick: async () => { await copy(value || ""); toast(`${label} kopiert.`); } }, "Kopieren"));
  }

  let run = null;

  function start(ad, statusEl) {
    run?.stop();
    const render = (st) => statusEl.replaceChildren(
      ...[
        st.done.length ? h("p", { class: "ak-small" }, `✓ ${st.done.join(", ")}`) : null,
        st.open.length ? h("p", { class: "ak-small ak-muted" }, `Wartet auf: ${st.open.join(", ")}`) : null
      ].filter(Boolean)
    );
    run = AK.autofill.run(stepsFor(ad), { onChange: render });
    render(run.status());
  }

  function renderPanel(ad) {
    const { body } = AK.dom.panel(`Nach ${P.label} übertragen`, { onClose: () => run?.stop() });
    const status = h("div");
    const d = ad.details || {};
    const facts = [d.brand, d.size && `Gr. ${d.size}`, d.condition, d.color].filter(Boolean).join(" · ");
    body.append(
      h("p", { class: "ak-strong" }, ad.title),
      ad.category?.length ? h("p", { class: "ak-muted ak-small" }, ad.category.join(" › ")) : null,
      facts ? h("p", { class: "ak-muted ak-small" }, facts) : null,
      h("div", { class: "ak-thumbs" }, (ad.images || []).slice(0, 8).map((src) => h("img", { src, alt: "" }))),
      status,
      h("div", { class: "ak-row" },
        h("button", { class: "ak-btn ak-btn--primary", type: "button", onclick: () => start(ad, status) }, "Erneut ausfüllen"),
        h("button", {
          class: "ak-btn", type: "button",
          onclick: () => (ad.images || []).forEach((src, i) => downloadDataUrl(src, `${ad.title.slice(0, 40)}-${i + 1}.jpg`))
        }, "Bilder laden")),
      copyRow("Titel", ad.title),
      copyRow("Beschreibung", ad.description),
      copyRow("Preis", ad.priceType === "GIVE_AWAY" ? "0" : ad.price),
      h("p", { class: "ak-muted ak-small" }, "Felder, die erst nach der Kategoriewahl erscheinen, fülle ich nach. Veröffentlichen musst du selbst.")
    );
    start(ad, status);
  }

  function renderWaiting(ad) {
    const { body, close } = AK.dom.panel(`Nach ${P.label} übertragen`);
    body.append(
      h("p", { class: "ak-strong" }, ad.title),
      h("p", { class: "ak-muted" }, "Melde dich bei Bedarf an und öffne das Formular zum Inserieren. Sobald es da ist, fülle ich es aus."),
      h("button", { class: "ak-btn", type: "button", onclick: async () => { await AK.store.takePending(platform); close(); } }, "Abbrechen")
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
      if (formReady(ad)) break;
      if (i === 4 && !waitingShown) { renderWaiting(ad); waitingShown = true; }
      if (!(await AK.store.peekPending(platform))) return; // abgebrochen
      await sleep(1000);
    }
    if (!formReady(ad)) return;
    await sleep(1000); // Formular kurz rendern lassen
    await AK.store.takePending(platform);
    renderPanel(ad);
  })();
})();
