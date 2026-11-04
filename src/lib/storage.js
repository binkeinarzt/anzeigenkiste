// Speicher-Layer: alles liegt lokal in storage.local, nichts verlässt den Browser.
//
// Schema:
//   ads:        { [id]: Ad }
//   templates:  [{ id, name, text }]
//   pending:    { action: "reinsert" | "export", adId, platform?, at }
//
// Ad = {
//   id, sourceId, url, title, description, price, priceType ("FIXED"|"NEGOTIABLE"|"GIVE_AWAY"|""),
//   category: [string], location, shipping, attributes: [{label, value}],
//   images: [dataURL], stats: { views, updatedAt }, status ("active"|"saved"),
//   createdAt (auf Kleinanzeigen, Text), savedAt, updatedAt, tags: [string]
// }
(function () {
  const AK = globalThis.AK;
  const local = () => AK.api.storage.local;

  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const DEFAULT_TEMPLATES = [
    { id: "t1", name: "Noch da", text: "Hallo, ja, der Artikel ist noch verfügbar. Viele Grüße" },
    { id: "t2", name: "Preis fest", text: "Hallo, danke für dein Interesse. Der Preis ist leider fest. Viele Grüße" },
    { id: "t3", name: "Versand", text: "Hallo, Versand ist möglich. Die Kosten trägt der Käufer. Viele Grüße" },
    { id: "t4", name: "Schon weg", text: "Hallo, der Artikel ist leider schon verkauft. Viele Grüße" }
  ];

  async function getAds() {
    const { ads } = await local().get("ads");
    return ads || {};
  }

  async function getAdList() {
    const ads = await getAds();
    return Object.values(ads).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async function getAd(id) {
    return (await getAds())[id] || null;
  }

  // Speichert oder aktualisiert eine Anzeige. Gleiche Kleinanzeigen-ID → Update statt Duplikat.
  async function saveAd(data) {
    const ads = await getAds();
    let existing = data.id ? ads[data.id] : null;
    if (!existing && data.sourceId) {
      existing = Object.values(ads).find((a) => a.sourceId && a.sourceId === data.sourceId) || null;
    }
    const now = Date.now();
    const ad = {
      tags: [],
      attributes: [],
      images: [],
      category: [],
      status: "saved",
      ...(existing || {}),
      ...data,
      id: existing?.id || data.id || uid(),
      savedAt: existing?.savedAt || now,
      updatedAt: now
    };
    // Bilder nicht mit leerer Liste überschreiben (z. B. bei reinem Statistik-Update)
    if (existing && (!data.images || data.images.length === 0)) ad.images = existing.images;
    if (existing?.stats && data.stats) ad.stats = { ...existing.stats, ...data.stats };
    ads[ad.id] = ad;
    await local().set({ ads });
    return ad;
  }

  async function deleteAd(id) {
    const ads = await getAds();
    delete ads[id];
    await local().set({ ads });
  }

  async function getTemplates() {
    const { templates } = await local().get("templates");
    return templates || DEFAULT_TEMPLATES;
  }

  async function setTemplates(templates) {
    await local().set({ templates });
  }

  // Offene Aufträge je Plattform, damit mehrere Tabs gleichzeitig ausgefüllt werden können.
  // pending = { [platform]: { adId, at } }, platform z. B. "kleinanzeigen", "vinted", "facebook"
  const PENDING_TTL = 15 * 60 * 1000;

  async function setPending(platform, adId) {
    const { pending } = await local().get("pending");
    const next = pending && typeof pending === "object" && !pending.action ? pending : {};
    next[platform] = { adId, at: Date.now() };
    await local().set({ pending: next });
  }

  // Liest einen offenen Auftrag, ohne ihn zu verbrauchen.
  async function peekPending(platform) {
    const { pending } = await local().get("pending");
    const p = pending?.[platform];
    return p && Date.now() - p.at < PENDING_TTL ? p : null;
  }

  // Liefert den offenen Auftrag und löscht ihn.
  async function takePending(platform) {
    const p = await peekPending(platform);
    if (!p) return null;
    const { pending } = await local().get("pending");
    delete pending[platform];
    await local().set({ pending });
    return p;
  }

  // Ergebnis eines Nachlade-Auftrags (für das Dashboard, das darauf wartet)
  async function setRefreshResult(adId, result) {
    await local().set({ refreshResult: { adId, result, at: Date.now() } });
  }

  async function exportBackup() {
    const all = await local().get(["ads", "templates"]);
    return {
      app: "anzeigenkiste",
      version: 1,
      exportedAt: new Date().toISOString(),
      ads: all.ads || {},
      templates: all.templates || DEFAULT_TEMPLATES
    };
  }

  async function importBackup(backup, { merge = true } = {}) {
    if (!backup || backup.app !== "anzeigenkiste") throw new Error("Keine gültige Anzeigenkiste-Sicherung.");
    const ads = merge ? { ...(await getAds()), ...backup.ads } : backup.ads;
    await local().set({ ads, templates: backup.templates || DEFAULT_TEMPLATES });
    return Object.keys(backup.ads || {}).length;
  }

  AK.store = {
    uid, getAds, getAdList, getAd, saveAd, deleteAd,
    getTemplates, setTemplates, setPending, peekPending, takePending, setRefreshResult,
    exportBackup, importBackup, DEFAULT_TEMPLATES
  };
})();
