// Dashboard: Übersicht, Bearbeiten, Neu inserieren, Übertragen, Vorlagen, Sicherung.
(function () {
  const AK = globalThis.AK;
  const { h, formatPrice } = AK.dom;
  const api = AK.api;

  const REINSERT_URL = "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html";
  const EXPORT_URLS = {
    de: { vinted: "https://www.vinted.de/items/new", ebay: "https://www.ebay.de/sl/prelist/suggest", willhaben: "https://www.willhaben.at/iad/anzeigenaufgabe" },
    at: { vinted: "https://www.vinted.at/items/new", ebay: "https://www.ebay.at/sl/prelist/suggest", willhaben: "https://www.willhaben.at/iad/anzeigenaufgabe" }
  };
  const PLATFORMS = [["vinted", "Vinted"], ["ebay", "eBay"], ["willhaben", "willhaben"]];

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
    const views = ads.reduce((s, a) => s + (a.stats?.views || 0), 0);
    const value = ads.reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
    const images = ads.reduce((s, a) => s + (a.images?.length || 0), 0);
    $("#stats").replaceChildren(
      h("div", { class: "stat" }, h("b", {}, num(ads.length)), h("span", {}, "Anzeigen in der Kiste")),
      h("div", { class: "stat" }, h("b", {}, num(views)), h("span", {}, "Aufrufe gesamt")),
      h("div", { class: "stat" }, h("b", {}, `${num(Math.round(value))} €`), h("span", {}, "Warenwert")),
      h("div", { class: "stat" }, h("b", {}, num(images)), h("span", {}, "Bilder gesichert"))
    );
  }

  function closeMenus() { document.querySelectorAll(".menu__list").forEach((m) => m.remove()); }
  document.addEventListener("click", (e) => { if (!e.target.closest(".menu")) closeMenus(); });

  async function go(action, ad, platform) {
    await AK.store.setPending({ action, adId: ad.id, platform });
    const url = action === "reinsert" ? REINSERT_URL : EXPORT_URLS[country][platform];
    await api.tabs.create({ url });
  }

  function exportMenu(ad) {
    const wrap = h("div", { class: "menu" });
    const btn = h("button", { class: "btn btn--sm", type: "button" }, "Übertragen ▾");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = wrap.querySelector(".menu__list");
      closeMenus();
      if (open) return;
      wrap.append(h("div", { class: "menu__list" },
        PLATFORMS.map(([key, label]) => h("button", { type: "button", onclick: () => go("export", ad, key) }, `Zu ${label}`))));
    });
    wrap.append(btn);
    return wrap;
  }

  function renderList() {
    const q = $("#search").value.trim().toLowerCase();
    const sort = $("#sort").value;
    let list = ads.filter((a) =>
      !q || [a.title, a.description, a.location, ...(a.category || []), ...(a.tags || [])].join(" ").toLowerCase().includes(q));
    const sorters = {
      updated: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
      views: (a, b) => (b.stats?.views || 0) - (a.stats?.views || 0),
      price: (a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0),
      title: (a, b) => a.title.localeCompare(b.title, "de")
    };
    list = list.sort(sorters[sort]);

    $("#empty").hidden = ads.length > 0;
    $("#list").replaceChildren(...list.map((ad) =>
      h("article", { class: "item" },
        ad.images?.[0] ? h("img", { src: ad.images[0], alt: "" }) : h("div", { class: "noimg" }, "▣"),
        h("div", {},
          h("h3", {}, ad.title),
          h("div", { class: "meta" },
            h("span", { class: "price" }, formatPrice(ad)),
            ad.category?.length ? h("span", {}, ad.category[ad.category.length - 1]) : null,
            ad.location ? h("span", {}, ad.location) : null,
            ad.stats?.views != null ? h("span", { title: `Stand ${fmtDate(ad.stats.updatedAt)}` }, `${num(ad.stats.views)} Aufrufe`) : null,
            h("span", {}, `${ad.images?.length || 0} Bilder`),
            h("span", {}, `gesichert ${fmtDate(ad.savedAt)}`),
            ...(ad.tags || []).map((t) => h("span", { class: "tag" }, t))
          )
        ),
        h("div", { class: "actions" },
          h("button", { class: "btn btn--sm btn--primary", type: "button", onclick: () => go("reinsert", ad) }, "Neu inserieren"),
          exportMenu(ad),
          h("button", { class: "btn btn--sm", type: "button", onclick: () => openEditor(ad) }, "Bearbeiten"),
          ad.url ? h("a", { class: "btn btn--sm", href: ad.url, target: "_blank", rel: "noopener" }, "Original") : null,
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

  function openEditor(ad) {
    editing = ad;
    editImages = [...(ad?.images || [])];
    $("#editor-title").textContent = ad ? "Anzeige bearbeiten" : "Neue Anzeige";
    F.title.value = ad?.title || "";
    F.description.value = ad?.description || "";
    F.price.value = ad?.price || "";
    F.priceType.value = ad?.priceType || "NEGOTIABLE";
    F.category.value = (ad?.category || []).join(" › ");
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
      category: split(F.category.value, /›|>/),
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
    templates = await AK.store.getTemplates();
    renderTemplates();
    load();
  })();
})();
