// Dashboard: Übersicht, Bearbeiten, Neu inserieren, Übertragen, Vorlagen, Sicherung.
(function () {
  const AK = globalThis.AK;
  const { h, formatPrice } = AK.dom;
  const api = AK.api;

  const $ = (s) => document.querySelector(s);
  let ads = [];
  let country = "de";

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("is-active", x === t));
      document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== `tab-${t.dataset.tab}`));
    }));

  // ---------- Anzeigen ----------
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–");
  const num = (n) => (n ?? 0).toLocaleString("de-AT");

  function renderStats() {
    const value = ads.reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
    const images = ads.reduce((s, a) => s + (a.images?.length || 0), 0);
    $("#stats").replaceChildren(
      h("div", { class: "stat" }, h("b", {}, num(ads.length)), h("span", {}, "Anzeigen in der Kiste")),
      h("div", { class: "stat" }, h("b", {}, `${num(Math.round(value))} €`), h("span", {}, "Warenwert")),
      h("div", { class: "stat" }, h("b", {}, num(images)), h("span", {}, "Bilder gesichert"))
    );
  }

  // Inserieren: öffnet je gewählter Plattform einen Tab mit dem Formular, das die Erweiterung dort ausfüllt.
  async function go(platform, ad, active = true) {
    await AK.store.setPending(platform, ad.id);
    await api.tabs.create({ url: AK.platforms[platform].start[country], active });
  }

  const pubDialog = $("#publish");
  let pubAd = null;

  async function openPublish(ad) {
    pubAd = ad;
    const { lastTargets } = await api.storage.local.get("lastTargets");
    const chosen = new Set(lastTargets || ["kleinanzeigen"]);
    $("#publish-ad").textContent = ad.title;
    $("#publish-list").replaceChildren(...Object.entries(AK.platforms).map(([key, p]) =>
      h("label", { class: "check" },
        h("input", { type: "checkbox", id: `pub-${key}`, value: key, checked: chosen.has(key) }),
        h("span", {}, p.label),
        ad.source === key ? h("span", { class: "tag" }, "Herkunft") : null)));
    pubDialog.returnValue = "";
    pubDialog.showModal();
  }

  // Vinted-Artikel, die mit einer älteren Version gespeichert wurden, haben keine Marke, Größe,
  // Zustand, Farbe und keinen vollständigen Kategoriepfad. Diese Angaben vor dem Inserieren nachladen.
  const needsRefresh = (ad) => ad.source === "vinted" && ad.url &&
    (!ad.details || !ad.catalogIds?.length || (ad.images || []).some((i) => /^data:image\/webp/.test(i)));

  // Weg 2: Artikel in einem Hintergrund-Tab öffnen; das Content-Script liest ihn dort aus.
  // Nötig, weil Vinted direkte Abrufe aus der Erweiterung teils mit einer Prüfseite beantwortet.
  async function refreshViaTab(ad) {
    await api.storage.local.set({ refreshResult: null });
    await AK.store.setPending("refresh-vinted", ad.id);
    const tab = await api.tabs.create({ url: ad.url, active: false });
    await api.runtime.sendMessage({ type: "registerRefreshTab", tabId: tab.id });
    try {
      for (let i = 0; i < 60; i++) { // max. 30 Sekunden
        await new Promise((r) => setTimeout(r, 500));
        const { refreshResult } = await api.storage.local.get("refreshResult");
        if (refreshResult?.adId === ad.id) {
          if (refreshResult.result !== "ok") throw new Error(refreshResult.result);
          return AK.store.getAd(ad.id);
        }
      }
      throw new Error("Vinted hat nicht rechtzeitig geantwortet");
    } finally {
      await AK.store.takePending("refresh-vinted");
      api.tabs.remove(tab.id).catch(() => {});
    }
  }

  async function refreshFromVinted(ad) {
    // Weg 1: Seite direkt abrufen (schnell, ohne sichtbaren Tab)
    let d = null;
    try {
      const res = await fetch(ad.url, { credentials: "include" });
      if (res.ok) d = AK.parseProduct.parseProductPage(new DOMParser().parseFromString(await res.text(), "text/html"), ad.url, "vinted");
    } catch {}
    if (!d?.title || !d.category?.length) return refreshViaTab(ad);
    const update = { id: ad.id, details: d.details, catalogIds: d.catalogIds };
    if (d.category?.length) update.category = d.category;
    const webp = (ad.images || []).some((i) => /^data:image\/webp/.test(i));
    if (webp || d.imageUrls.length > (ad.images?.length || 0)) {
      const imgs = await api.runtime.sendMessage({ type: "fetchImages", urls: d.imageUrls });
      if (Array.isArray(imgs) && imgs.length) update.images = imgs;
    }
    return AK.store.saveAd(update);
  }

  pubDialog.addEventListener("close", async () => {
    if (pubDialog.returnValue !== "go" || !pubAd) return;
    const targets = [...pubDialog.querySelectorAll("#publish-list input:checked")].map((i) => i.value);
    if (!targets.length) return;
    await api.storage.local.set({ lastTargets: targets });
    let ad = pubAd;
    if (needsRefresh(ad)) {
      AK.dom.toast("Lade Größe, Farbe und Zustand von Vinted nach …");
      try { ad = await refreshFromVinted(ad); }
      catch (e) { alert(`Vinted-Angaben konnten nicht nachgeladen werden (${e.message}). Größe, Farbe und Zustand bitte selbst wählen.`); }
    }
    for (const [i, t] of targets.entries()) await go(t, ad, i === 0);
  });

  function renderList() {
    const q = $("#search").value.trim().toLowerCase();
    const sort = $("#sort").value;
    let list = ads.filter((a) =>
      !q || [a.title, a.description, a.location, ...(a.category || []), ...(a.tags || [])].join(" ").toLowerCase().includes(q));
    const sorters = {
      updated: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
      price: (a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0),
      title: (a, b) => a.title.localeCompare(b.title, "de")
    };
    list = list.sort(sorters[sort]);

    $("#empty").hidden = ads.length > 0;
    $("#list").replaceChildren(...list.map((ad) =>
      h("article", { class: "item" },
        /^data:image\//.test(ad.images?.[0] || "") ? h("img", { src: ad.images[0], alt: "" }) : h("div", { class: "noimg" }, "▣"),
        h("div", {},
          h("h3", {}, ad.title),
          h("div", { class: "meta" },
            h("span", { class: "price" }, formatPrice(ad)),
            ad.category?.length ? h("span", {}, ad.category[ad.category.length - 1]) : null,
            ad.details?.brand ? h("span", {}, ad.details.brand) : null,
            ad.details?.size ? h("span", {}, `Gr. ${ad.details.size}`) : null,
            ad.location ? h("span", {}, ad.location) : null,
            ad.source && AK.platforms[ad.source] ? h("span", {}, `von ${AK.platforms[ad.source].label}`) : null,
            h("span", {}, `${ad.images?.length || 0} Bilder`),
            h("span", {}, `gesichert ${fmtDate(ad.savedAt)}`),
            ...(ad.tags || []).map((t) => h("span", { class: "tag" }, t))
          )
        ),
        h("div", { class: "actions" },
          h("button", { class: "btn btn--sm btn--primary", type: "button", onclick: () => openPublish(ad) }, "Inserieren …"),
          h("button", { class: "btn btn--sm", type: "button", onclick: () => openEditor(ad) }, "Bearbeiten"),
          AK.store.safeUrl(ad.url) ? h("a", { class: "btn btn--sm", href: AK.store.safeUrl(ad.url), target: "_blank", rel: "noopener noreferrer" }, "Original") : null,
          h("button", {
            class: "btn btn--sm btn--danger", type: "button",
            onclick: async () => { if (confirm(`„${ad.title}“ aus der Kiste löschen?`)) { await AK.store.deleteAd(ad.id); load(); } }
          }, "Löschen")
        )
      )));
  }

  async function load() {
    ads = await AK.store.getAdList();
    renderStats();
    renderList();
    renderUsage();
  }

  $("#search").addEventListener("input", renderList);
  $("#sort").addEventListener("change", renderList);

  // ---------- Editor ----------
  const dialog = $("#editor");
  const form = $("#editor-form");
  const F = form.elements; // nicht form.title: das wäre das title-Attribut des Formulars
  let editing = null;
  let editImages = [];

  function renderEditorImages() {
    $("#editor-images").replaceChildren(...editImages.map((src, i) =>
      h("div", { class: "thumb" },
        h("img", { src, alt: `Bild ${i + 1}` }),
        h("button", { type: "button", title: "Entfernen", onclick: () => { editImages.splice(i, 1); renderEditorImages(); } }, "✕"))));
  }

  // ---------- Kategorie-Auswahl (Bereich › Art › Unterkategorie) ----------
  const TREE = AK.CATEGORY_TREE;
  const catSel = [$("#cat-1"), $("#cat-2"), $("#cat-3")];
  let catTail = [];        // tiefere Ebenen eines Vinted-Pfads (z. B. „Jacken › Steppjacken“), bleiben erhalten
  let catTouched = false;  // erst wenn der Nutzer etwas ändert, wird der Pfad neu gebildet

  function fillSelect(sel, values, current, placeholder) {
    const opts = [h("option", { value: "" }, placeholder)];
    for (const v of values) opts.push(h("option", { value: v }, v));
    // Werte aus Vinted, die es im Baum nicht gibt, trotzdem anzeigen
    if (current && !values.includes(current)) opts.push(h("option", { value: current }, `${current} (übernommen)`));
    sel.replaceChildren(...opts);
    sel.value = current || "";
    sel.disabled = values.length === 0 && !current;
  }

  function renderCategory(path) {
    const [a = "", b = "", c = ""] = path;
    fillSelect(catSel[0], Object.keys(TREE), a, "Bitte wählen");
    fillSelect(catSel[1], a && TREE[a] ? Object.keys(TREE[a]) : [], b, a ? "Bitte wählen" : "–");
    fillSelect(catSel[2], a && b && TREE[a]?.[b] ? TREE[a][b] : [], c, b ? "Bitte wählen" : "–");
    renderPreview();
  }

  function currentCategory() {
    const path = catSel.map((s) => s.value).filter(Boolean);
    return catTouched ? path : [...path, ...catTail];
  }

  // Zeigt direkt, was daraus auf Kleinanzeigen wird
  function renderPreview() {
    const category = currentCategory();
    const p = $("#cat-preview");
    if (!category.length) { p.textContent = "Ohne Kategorie schlägt Kleinanzeigen anhand des Titels eine vor."; return; }
    const m = AK.mapping.toKleinanzeigen({ category, details: {} });
    const art = (m.attrs.find((x) => x.name === "type") || m.attrs.find((x) => x.name === "art"))?.wanted?.[1];
    p.replaceChildren(
      category.join(" › "),
      h("br"),
      m.categoryId
        ? h("span", {}, "→ Kleinanzeigen: ", h("b", {}, [m.categoryLabel, art].filter(Boolean).join(" › ")))
        : "→ Kleinanzeigen: Kategorie wählst du dort selbst (Vorschlag anhand des Titels)."
    );
  }

  catSel.forEach((sel, i) => sel.addEventListener("change", () => {
    catTouched = true;
    catTail = [];
    const path = catSel.map((s) => s.value);
    for (let j = i + 1; j < 3; j++) path[j] = ""; // untere Ebenen zurücksetzen
    renderCategory(path);
  }));

  function openEditor(ad) {
    editing = ad;
    editImages = [...(ad?.images || [])];
    $("#editor-title").textContent = ad ? "Anzeige bearbeiten" : "Neue Anzeige";
    F.title.value = ad?.title || "";
    F.description.value = ad?.description || "";
    F.price.value = ad?.price || "";
    F.priceType.value = ad?.priceType || "NEGOTIABLE";
    const cat = ad?.category || [];
    catTouched = false;
    catTail = cat.slice(3);
    renderCategory(cat.slice(0, 3));
    const d = ad?.details || {};
    F.brand.value = d.brand || "";
    F.size.value = d.size || "";
    for (const [name, value] of [["condition", d.condition], ["color", d.color]]) {
      const sel = F[name];
      sel.querySelector("option[data-extra]")?.remove();
      if (value && ![...sel.options].some((o) => o.value === value)) sel.append(h("option", { "data-extra": "1" }, value));
      sel.value = value || "";
    }
    $("#brand-list").replaceChildren(...[...new Set(ads.map((a) => a.details?.brand).filter(Boolean))].sort().map((b) => h("option", { value: b })));
    F.tags.value = (ad?.tags || []).join(", ");
    renderEditorImages();
    dialog.returnValue = ""; // sonst speichert Escape mit dem Wert vom letzten Mal
    dialog.showModal();
  }

  // Bilder verkleinern, damit der Speicher nicht explodiert (max. 1600 px, JPEG 85 %)
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  $("#editor-files").addEventListener("change", async (e) => {
    for (const f of e.target.files) editImages.push(await shrink(f));
    e.target.value = "";
    renderEditorImages();
  });

  $("#new-ad").addEventListener("click", () => openEditor(null));

  dialog.addEventListener("close", async () => {
    if (dialog.returnValue !== "save") return;
    const split = (s, sep) => s.split(sep).map((x) => x.trim()).filter(Boolean);
    await AK.store.saveAd({
      ...(editing ? { id: editing.id } : {}),
      title: F.title.value.trim(),
      description: F.description.value.trim(),
      price: F.price.value.trim().replace(",", "."),
      priceType: F.priceType.value,
      category: currentCategory(),
      details: {
        ...(editing?.details || {}),
        brand: F.brand.value.trim(), size: F.size.value.trim(), condition: F.condition.value, color: F.color.value
      },
      tags: split(F.tags.value, ","),
      images: editImages
    });
    // saveAd behält alte Bilder, wenn eine leere Liste kommt; beim bewussten Entfernen aller Bilder nachziehen
    if (editing && editImages.length === 0) {
      const all = await AK.store.getAds();
      all[editing.id].images = [];
      await api.storage.local.set({ ads: all });
    }
    load();
  });

  // ---------- Vorlagen ----------
  let templates = [];

  async function saveTemplates() { await AK.store.setTemplates(templates); }

  function renderTemplates() {
    $("#templates").replaceChildren(...templates.map((t, i) => {
      const name = h("input", { class: "input", value: t.name, "aria-label": "Name" });
      const text = h("textarea", { class: "input", rows: 3, "aria-label": "Text" });
      text.value = t.text;
      name.addEventListener("change", () => { templates[i].name = name.value; saveTemplates(); });
      text.addEventListener("change", () => { templates[i].text = text.value; saveTemplates(); });
      return h("div", { class: "tpl" }, name, text,
        h("button", { class: "btn btn--sm btn--danger", type: "button", onclick: () => { templates.splice(i, 1); saveTemplates(); renderTemplates(); } }, "Löschen"));
    }));
  }

  $("#add-template").addEventListener("click", () => {
    templates.push({ id: AK.store.uid(), name: "Neue Vorlage", text: "" });
    saveTemplates();
    renderTemplates();
  });

  // ---------- Einstellungen ----------
  $("#country").addEventListener("change", (e) => { country = e.target.value; api.storage.local.set({ country }); });
  $("#buy-now").addEventListener("change", (e) => api.storage.local.set({ kaBuyNow: e.target.value }));

  $("#backup").addEventListener("click", async () => {
    const data = await AK.store.exportBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    const a = h("a", { href: url, download: `anzeigenkiste-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $("#restore").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const n = await AK.store.importBackup(JSON.parse(await file.text()));
      alert(`${n} Anzeigen eingespielt.`);
      templates = await AK.store.getTemplates();
      renderTemplates();
      load();
    } catch (err) { alert(err.message); }
    e.target.value = "";
  });

  async function renderUsage() {
    if (!api.storage.local.getBytesInUse) return; // Firefox kennt das nicht überall
    const bytes = await api.storage.local.getBytesInUse(null);
    $("#usage").textContent = `Belegter Speicher: ${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  // ---------- Start ----------
  api.storage.onChanged.addListener((c) => { if (c.ads) load(); });
  (async () => {
    country = (await api.storage.local.get("country")).country || "de";
    $("#country").value = country;
    $("#buy-now").value = (await api.storage.local.get("kaBuyNow")).kaBuyNow || "";
    templates = await AK.store.getTemplates();
    renderTemplates();
    load();
  })();
})();
