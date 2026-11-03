// Gegenrichtung: Artikel von Vinted, eBay oder willhaben in die Kiste holen,
// damit sie danach auf Kleinanzeigen (oder woanders) inseriert werden können.
(function () {
  const AK = globalThis.AK;
  const { h, toast } = AK.dom;
  const platform = AK.platformForHost(location.hostname);
  const P = AK.platforms[platform];
  if (!P?.item) return;

  let btn = null;

  function check() {
    const onItem = P.item.test(location.pathname);
    if (!onItem) { btn?.remove(); btn = null; return; }
    if (btn) return;
    btn = h("button", { class: "ak-btn ak-btn--primary ak-floating", type: "button" }, "▣ In Anzeigenkiste speichern");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Speichere …";
      try {
        const data = AK.parseProduct.parseProductPage(document, location.href.split("?")[0], platform);
        if (!data.title) throw new Error("Auf dieser Seite wurde kein Artikel erkannt.");
        const images = await AK.api.runtime.sendMessage({ type: "fetchImages", urls: data.imageUrls });
        delete data.imageUrls;
        const ad = await AK.store.saveAd({ ...data, images: Array.isArray(images) ? images : [] });
        btn.textContent = "✓ Gespeichert";
        toast(`„${ad.title}“ von ${P.label} gespeichert. Im Dashboard kannst du ihn jetzt inserieren.`);
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
  // Vinted und eBay wechseln Seiten ohne Neuladen
  let last = location.pathname;
  setInterval(() => { if (location.pathname !== last) { last = location.pathname; btn?.remove(); btn = null; check(); } }, 1000);
})();
