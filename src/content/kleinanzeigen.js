// Content-Script für kleinanzeigen.de. Je nach Seite:
//   /s-anzeige/...              → Knopf "In Anzeigenkiste speichern"
//   /m-meine-anzeigen...        → Knopf "Alle Anzeigen sichern"
//   /p-anzeige-aufgeben...      → Panel zum Vorausfüllen aus der Kiste
//   /m-nachrichten...           → Textvorlagen-Leiste am Eingabefeld
(function () {
  const AK = globalThis.AK;
  const { h, toast, $, waitFor, sleep, setValue, injectFiles, formatPrice } = AK.dom;
  const S = AK.sel;
  const path = location.pathname;

  // ---------- Anzeige speichern ----------

  async function captureAd(doc, url) {
    const data = AK.parse.parseAdPage(doc, url);
    if (!data.title) throw new Error("Auf dieser Seite wurde keine Anzeige erkannt.");
    const images = await AK.api.runtime.sendMessage({ type: "fetchImages", urls: data.imageUrls });
    delete data.imageUrls;
    return AK.store.saveAd({ ...data, images: Array.isArray(images) ? images : [] });
  }

  function initAdPage() {
    const anchor = $(S.ad.actionBar);
    const btn = h("button", { class: "ak-btn ak-btn--primary ak-inline", type: "button" }, "▣ In Anzeigenkiste speichern");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Speichere …";
      try {
        const ad = await captureAd(document, location.href.split("?")[0]);
        btn.textContent = "✓ Gespeichert";
        toast(`„${ad.title}“ mit ${ad.images.length} Bild(ern) gespeichert.`);
      } catch (e) {
        btn.textContent = "▣ In Anzeigenkiste speichern";
        toast(e.message, "err");
      } finally {
        btn.disabled = false;
      }
    });
    if (anchor?.parentElement) anchor.parentElement.insertBefore(btn, anchor.nextSibling);
    else { btn.classList.add("ak-floating"); document.body.appendChild(btn); }

    // Aufrufe bereits gespeicherter Anzeigen still aktualisieren
    const data = AK.parse.parseAdPage(document, location.href.split("?")[0]);
    if (data.sourceId && data.stats) {
      AK.store.getAdList().then((list) => {
        const known = list.find((a) => a.sourceId === data.sourceId);
        if (known) AK.store.saveAd({ id: known.id, stats: data.stats });
      });
    }
  }

  // ---------- Meine Anzeigen: alle sichern ----------

  function collectMyAdLinks() {
    const urls = new Set();
    for (const a of document.querySelectorAll(S.myAds.links.join(","))) {
      const u = new URL(a.getAttribute("href"), location.origin);
      if (/\/s-anzeige\/[^/]+\/\d+/.test(u.pathname)) urls.add(u.origin + u.pathname);
    }
    return [...urls];
  }

  function initMyAds() {
    const { body } = AK.dom.panel("Anzeigenkiste");
    const info = h("p", { class: "ak-muted" }, "Sichert alle Anzeigen, die auf dieser Seite sichtbar sind, inklusive Bildern.");
    const bar = h("div", { class: "ak-progress", hidden: true }, h("div", { class: "ak-progress__fill" }));
    const btn = h("button", { class: "ak-btn ak-btn--primary", type: "button" }, "Alle Anzeigen sichern");
    const dash = h("button", { class: "ak-btn", type: "button", onclick: () => AK.api.runtime.sendMessage({ type: "openDashboard" }) }, "Kiste öffnen");
    body.append(info, bar, h("div", { class: "ak-row" }, btn, dash));

    btn.addEventListener("click", async () => {
      const links = collectMyAdLinks();
      if (!links.length) return toast("Keine Anzeigen gefunden. Liste ganz nach unten scrollen und erneut versuchen.", "err");
      btn.disabled = true;
      bar.hidden = false;
      let ok = 0;
      for (let i = 0; i < links.length; i++) {
        info.textContent = `Sichere ${i + 1} von ${links.length} …`;
        try {
          const res = await fetch(links[i], { credentials: "include" });
          const doc = new DOMParser().parseFromString(await res.text(), "text/html");
          await captureAd(doc, links[i]);
          ok++;
        } catch (e) { console.warn("[Anzeigenkiste]", links[i], e); }
        bar.firstChild.style.width = `${((i + 1) / links.length) * 100}%`;
        await sleep(1500 + Math.random() * 1000); // bewusst langsam, um Kleinanzeigen nicht zu belasten
      }
      info.textContent = `${ok} von ${links.length} Anzeigen gesichert.`;
      btn.disabled = false;
    });
  }

  // ---------- Anzeige aufgeben: vorausfüllen ----------

  // Präfix der Merkmale der gerade gewählten Kategorie, z. B. „kleidung_herren“
  function attributePrefix() {
    const counts = {};
    for (const i of document.querySelectorAll(S.post.attributeHidden)) {
      const m = i.name.match(/^attributeMap\[([^.\]]+)\./);
      if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }

  // Bedienelement eines Merkmals: Element mit id „präfix.name“, sonst Knopf neben dem versteckten Feld
  function attributeControl(name) {
    const prefix = attributePrefix();
    if (!prefix) return null;
    const key = `${prefix}.${name}`;
    const byId = document.getElementById(key);
    if (byId) return byId;
    const hidden = document.querySelector(`input[name='attributeMap[${CSS.escape(key)}]']`);
    if (!hidden) return null;
    if (hidden.type === "radio" || hidden.type === "checkbox") return hidden;
    return hidden.parentElement?.querySelector("button, [role='combobox'], select") || null;
  }

  let currentRun = null;

  async function fillPostForm(ad, statusEl) {
    currentRun?.stop();
    await waitFor(S.post.title, { timeout: 10000 });
    const map = AK.mapping.toKleinanzeigen(ad);
    const { choose } = AK.autofill;
    const priceText = { FIXED: "Festpreis", NEGOTIABLE: "VB", GIVE_AWAY: "Zu verschenken" }[ad.priceType];
    const { kaBuyNow: buyNow = "" } = await AK.api.storage.local.get("kaBuyNow");

    const steps = [
      { id: "title", label: "Titel", find: () => $(S.post.title), apply: (el) => setValue(el, ad.title) },
      map.categoryId && {
        id: "category", label: `Kategorie ${map.categoryLabel}`, refill: true,
        find: () => $(S.post.categoryPicker),
        apply: (fs) => {
          const radios = Array.from(fs.querySelectorAll("input[type='radio']"));
          // Vorschlag mit der passenden Kategorie-ID, sonst einer, dessen Text die Kategorie nennt
          const r = radios.find((x) => x.value === String(map.categoryId))
            || radios.find((x) => AK.mapping.has(AK.autofill.labelOf(x), map.categoryLabel));
          if (!r) return false;
          if (!r.checked) r.click();
          return true;
        }
      },
      { id: "description", label: "Beschreibung", refill: true, find: () => $(S.post.description),
        isFilled: (el) => el.value.trim() !== "", apply: (el) => setValue(el, ad.description) },
      ad.priceType !== "GIVE_AWAY" && ad.price && { id: "price", label: "Preis", refill: true, isFilled: (el) => el.value.trim() !== "",
        find: () => $(S.post.price), apply: (el) => setValue(el, ad.price) },
      priceText && { id: "priceType", label: "Preisart", find: () => $(S.post.priceType), apply: async (el) => !!(await choose(el, [ad.priceType, priceText])) },
      ad.images?.length && { id: "images", label: `${ad.images.length} Bilder`, hidden: true, find: () => $(S.post.images),
        apply: (el) => AK.dom.injectFilesOnce(ad.id, el, ad.images, "anzeige", document.querySelectorAll(S.post.uploadedPhotos).length) },
      // Einstellung „Direkt kaufen“: braucht „Versand möglich“
      buyNow === "true" && { id: "shipping", label: "Versand möglich", refill: true, hidden: true, isFilled: (el) => el.checked,
        find: () => $(S.post.shippingYes), apply: (el) => { if (!el.checked) el.click(); return true; } },
      (buyNow === "true" || buyNow === "false") && {
        id: "buyNow", label: `Direkt kaufen: ${buyNow === "true" ? "Ja" : "Nein"}`, refill: true, hidden: true, isFilled: (el) => el.checked,
        find: () => $(S.post.buyNow(buyNow)), apply: (el) => { if (!el.checked) el.click(); return el.checked; }
      },
      ...map.attrs.map((a) => ({
        id: `attr-${a.name}`, label: a.label, refill: true, optional: a.name === "material",
        find: () => attributeControl(a.name),
        apply: async (el) => !!(await choose(el, a.wanted, a.fallback))
      }))
    ].filter(Boolean);

    const render = (st) => {
      if (!statusEl) return;
      statusEl.replaceChildren(
        ...[
          st.done.length ? h("p", { class: "ak-small" }, `✓ ${st.done.join(", ")}`) : null,
          st.open.length ? h("p", { class: "ak-small ak-muted" }, `Wartet auf: ${st.open.join(", ")}`) : null
        ].filter(Boolean)
      );
    };
    currentRun = AK.autofill.run(steps, { onChange: render });
    render(currentRun.status());
    if (!map.categoryId) toast("Kategorie bitte selbst wählen. Die restlichen Felder fülle ich aus, sobald sie erscheinen.", "warn");
  }

  async function initPostPage() {
    const pending = await AK.store.takePending("kleinanzeigen");
    const ads = await AK.store.getAdList();
    if (!ads.length) return;

    const { body } = AK.dom.panel("Aus Anzeigenkiste einfügen", { onClose: () => currentRun?.stop() });
    const select = h("select", { class: "ak-input" },
      ads.map((a) => h("option", { value: a.id, selected: pending?.adId === a.id }, `${a.title} · ${formatPrice(a)}`)));
    const hint = h("div", { class: "ak-muted ak-small" });
    const status = h("div");
    const showHint = () => {
      const ad = ads.find((a) => a.id === select.value);
      if (!ad) return;
      const map = AK.mapping.toKleinanzeigen(ad);
      const d = ad.details || {};
      const facts = [d.brand, d.size && `Gr. ${d.size}`, d.condition, d.color].filter(Boolean).join(" · ");
      hint.replaceChildren(
        ad.category?.length ? h("p", { class: "ak-muted ak-small" }, `${ad.source === "vinted" ? "Vinted" : "Bisher"}: ${ad.category.join(" › ")}`) : null,
        map.categoryLabel ? h("p", { class: "ak-small" }, `→ Kleinanzeigen: ${map.categoryLabel}`) : null,
        facts ? h("p", { class: "ak-muted ak-small" }, facts)
          : h("p", { class: "ak-small ak-warn" }, "Keine Größe, Farbe oder Zustand gespeichert. Starte das Inserieren über das Dashboard, dann lädt die Kiste die Angaben von Vinted nach.")
      );
    };
    select.addEventListener("change", showHint);
    showHint();
    const btn = h("button", { class: "ak-btn ak-btn--primary", type: "button" }, "Formular ausfüllen");
    btn.addEventListener("click", () => fillPostForm(ads.find((a) => a.id === select.value), status));
    body.append(select, hint, btn, status,
      h("p", { class: "ak-muted ak-small" }, "Abschicken musst du selbst. Anzeigenkiste klickt nie für dich auf „Anzeige aufgeben“."));

    if (pending) {
      const ad = ads.find((a) => a.id === pending.adId);
      if (ad) fillPostForm(ad, status);
    }
  }

  // ---------- Postfach: Textvorlagen ----------

  function attachTemplates(input) {
    if (input.dataset.akTemplates) return;
    input.dataset.akTemplates = "1";
    const bar = h("div", { class: "ak-templates" });
    const render = async () => {
      bar.replaceChildren(h("span", { class: "ak-templates__label" }, "▣ Vorlagen:"));
      for (const t of await AK.store.getTemplates()) {
        bar.append(h("button", {
          class: "ak-chip", type: "button", title: t.text,
          onclick: () => AK.dom.insertText(input, t.text)
        }, t.name));
      }
    };
    render();
    AK.api.storage.onChanged.addListener((c) => { if (c.templates) render(); });
    input.parentElement?.insertBefore(bar, input);
  }

  function initMessages() {
    const scan = () => {
      for (const s of S.messages.input) document.querySelectorAll(s).forEach(attachTemplates);
    };
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }

  // ---------- Routing ----------

  if (path.startsWith("/s-anzeige/")) initAdPage();
  else if (path.startsWith("/m-meine-anzeigen")) initMyAds();
  else if (path.startsWith("/p-anzeige-aufgeben") || path.startsWith("/p-anzeige-bearbeiten")) initPostPage();
  else if (path.startsWith("/m-nachrichten")) initMessages();
})();
