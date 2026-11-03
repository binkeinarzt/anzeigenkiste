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

  async function fillPostForm(ad) {
    const results = [];
    const title = await waitFor(S.post.title, { timeout: 8000 });
    results.push(["Titel", setValue(title, ad.title)]);
    results.push(["Beschreibung", setValue($(S.post.description), ad.description)]);

    if (ad.priceType !== "GIVE_AWAY") results.push(["Preis", setValue($(S.post.price), ad.price)]);
    const pt = $(S.post.priceType);
    if (pt && ad.priceType) {
      const opt = Array.from(pt.options || []).find((o) => o.value === ad.priceType);
      results.push(["Preisart", opt ? setValue(pt, opt.value) : false]);
    }

    const file = $(S.post.images);
    if (file && ad.images?.length) results.push([`${ad.images.length} Bilder`, injectFiles(file, ad.images, "anzeige")]);

    const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
    toast(failed.length ? `Ausgefüllt. Bitte prüfen: ${failed.join(", ")}` : "Formular ausgefüllt. Kategorie prüfen und absenden.", failed.length ? "warn" : "ok");
  }

  async function initPostPage() {
    const pending = await AK.store.takePending("kleinanzeigen");
    const ads = await AK.store.getAdList();
    if (!ads.length) return;

    const { body } = AK.dom.panel("Aus Anzeigenkiste einfügen");
    const select = h("select", { class: "ak-input" },
      ads.map((a) => h("option", { value: a.id, selected: pending?.adId === a.id }, `${a.title} · ${formatPrice(a)}`)));
    const hint = h("p", { class: "ak-muted" });
    const showHint = () => {
      const ad = ads.find((a) => a.id === select.value);
      hint.textContent = ad?.category?.length ? `Kategorie: ${ad.category.join(" › ")}` : "";
    };
    select.addEventListener("change", showHint);
    showHint();
    const btn = h("button", { class: "ak-btn ak-btn--primary", type: "button" }, "Formular ausfüllen");
    btn.addEventListener("click", () => fillPostForm(ads.find((a) => a.id === select.value)));
    body.append(select, hint, btn,
      h("p", { class: "ak-muted ak-small" }, "Abschicken musst du selbst. Anzeigenkiste klickt nie für dich auf „Anzeige aufgeben“."));

    if (pending) {
      const ad = ads.find((a) => a.id === pending.adId);
      if (ad) fillPostForm(ad);
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
