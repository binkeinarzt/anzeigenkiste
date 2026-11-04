// Gegenrichtung: Artikel von Vinted, eBay oder willhaben in die Kiste holen,
// damit sie danach auf Kleinanzeigen (oder woanders) inseriert werden können.
(function () {
  const AK = globalThis.AK;
  const { h, toast } = AK.dom;
  const platform = AK.platformForHost(location.hostname);
  const P = AK.platforms[platform];
  if (!P?.item) return;

  let btn = null;

  // Vinted und willhaben wechseln Artikel ohne Neuladen; die eingebetteten Daten im DOM gehören
  // dann noch zum ersten Artikel. Deshalb die Seite frisch laden und das HTML auswerten.
  async function currentDocument() {
    if (platform === "ebay") return document;
    try {
      const res = await fetch(location.href, { credentials: "include" });
      if (res.ok) return new DOMParser().parseFromString(await res.text(), "text/html");
    } catch {}
    return document;
  }

  async function capture(extra = {}) {
    const url = location.href.split("?")[0];
    let data = AK.parseProduct.parseProductPage(await currentDocument(), url, platform);
    // Liefert der Abruf eine Prüfseite statt des Artikels, die geladene Seite selbst auswerten
    if (!data.title || (platform === "vinted" && !data.details?.brand && !data.category?.length)) {
      const live = AK.parseProduct.parseProductPage(document, url, platform);
      if (live.title) data = live;
    }
    if (!data.title) throw new Error("Auf dieser Seite wurde kein Artikel erkannt.");

    // eBay lädt die Beschreibung in einem eigenen Frame von ebaydesc.com
    if (data.descriptionUrl && !data.description) {
      const html = await AK.api.runtime.sendMessage({ type: "fetchText", url: data.descriptionUrl });
      if (typeof html === "string") data.description = AK.parseProduct.htmlToText(html);
    }
    delete data.descriptionUrl;

    const images = await AK.api.runtime.sendMessage({ type: "fetchImages", urls: data.imageUrls });
    delete data.imageUrls;
    return AK.store.saveAd({ ...data, ...extra, images: Array.isArray(images) ? images : [] });
  }

  // Auftrag vom Dashboard: fehlende Angaben eines gespeicherten Vinted-Artikels nachladen.
  // Das Dashboard öffnet dafür diesen Artikel in einem Hintergrund-Tab; danach schließt er sich wieder.
  async function refreshIfRequested() {
    const p = await AK.store.peekPending(`refresh-${platform}`);
    if (!p || !P.item.test(location.pathname)) return;
    const target = await AK.store.getAd(p.adId);
    const id = (u) => (u || "").match(/\/items\/(\d+)/)?.[1];
    if (!target || id(target.url) !== id(location.href)) return;
    await AK.store.takePending(`refresh-${platform}`);
    try {
      // Galerie und eingebettete Daten kurz fertig laden lassen
      await AK.dom.waitFor("h1", { timeout: 8000 });
      await AK.dom.sleep(800);
      await capture({ id: target.id });
      await AK.store.setRefreshResult(target.id, "ok");
    } catch (e) {
      await AK.store.setRefreshResult(target.id, e.message);
    }
    AK.api.runtime.sendMessage({ type: "closeTab" });
  }

  function check() {
    if (!P.item.test(location.pathname)) { btn?.remove(); btn = null; return; }
    if (btn) return;
    btn = h("button", { class: "ak-btn ak-btn--primary ak-floating", type: "button" }, "▣ In Anzeigenkiste speichern");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Speichere …";
      try {
        const ad = await capture();
        btn.textContent = "✓ Gespeichert";
        toast(`„${ad.title}“ mit ${ad.images.length} Bild(ern) von ${P.label} gespeichert.`);
      } catch (e) {
        btn.textContent = "▣ In Anzeigenkiste speichern";
        toast(e.message, "err");
      } finally {
        btn.disabled = false;
      }
    });
    document.body.appendChild(btn);
  }

  refreshIfRequested();
  check();
  let last = location.pathname;
  setInterval(() => { if (location.pathname !== last) { last = location.pathname; btn?.remove(); btn = null; check(); } }, 1000);
})();
