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

  async function capture() {
    const url = location.href.split("?")[0];
    const doc = await currentDocument();
    const data = AK.parseProduct.parseProductPage(doc, url, platform);
    if (!data.title) throw new Error("Auf dieser Seite wurde kein Artikel erkannt.");

    // eBay lädt die Beschreibung in einem eigenen Frame von ebaydesc.com
    if (data.descriptionUrl && !data.description) {
      const html = await AK.api.runtime.sendMessage({ type: "fetchText", url: data.descriptionUrl });
      if (typeof html === "string") data.description = AK.parseProduct.htmlToText(html);
    }
    delete data.descriptionUrl;

    const images = await AK.api.runtime.sendMessage({ type: "fetchImages", urls: data.imageUrls });
    delete data.imageUrls;
    return AK.store.saveAd({ ...data, images: Array.isArray(images) ? images : [] });
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

  check();
  let last = location.pathname;
  setInterval(() => { if (location.pathname !== last) { last = location.pathname; btn?.remove(); btn = null; check(); } }, 1000);
})();
