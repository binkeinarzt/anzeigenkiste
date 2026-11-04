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
//   images: [dataURL], status ("active"|"saved"),
//   createdAt (auf Kleinanzeigen, Text), savedAt, updatedAt, tags: [string]
// }
(function () {
  const AK = globalThis.AK;
  const local = () => AK.api.storage.local;

  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ---------- Prüfung aller gespeicherten Werte ----------
  // Daten stammen von Webseiten oder aus Sicherungsdateien und gelten daher als nicht vertrauenswürdig.
  // Nur bekannte Felder mit erwarteten Typen und Längen werden übernommen.
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v).slice(0, max) : "");
  const strList = (v, n, max) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((x) => x.slice(0, max)) : []);
  const IMAGE_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const SOURCES = ["kleinanzeigen", "vinted", "ebay", "willhaben", "facebook", "marktde", "quoka"];

  function safeUrl(v) {
    try { const u = new URL(String(v)); return u.protocol === "https:" ? u.href.slice(0, 500) : ""; } catch { return ""; }
  }

  function sanitizeAd(data) {
    const out = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(data, k);
    if (has("id") && /^[a-z0-9]{1,40}$/i.test(String(data.id))) out.id = String(data.id);
    if (has("title")) out.title = str(data.title, 200);
    if (has("description")) out.description = str(data.description, 10000);
    if (has("price")) out.price = /^\d{1,9}(\.\d{1,2})?$/.test(str(data.price, 20)) ? str(data.price, 20) : "";
    if (has("priceType")) out.priceType = ["FIXED", "NEGOTIABLE", "GIVE_AWAY"].includes(data.priceType) ? data.priceType : "";
    if (has("url")) out.url = safeUrl(data.url);
    if (has("source")) out.source = SOURCES.includes(data.source) ? data.source : undefined;
    if (has("sourceId")) out.sourceId = str(data.sourceId, 200);
    if (has("location")) out.location = str(data.location, 200);
    if (has("shipping")) out.shipping = str(data.shipping, 500);
    if (has("createdAt")) out.createdAt = str(data.createdAt, 20);
    if (has("status")) out.status = ["active", "saved"].includes(data.status) ? data.status : "saved";
    if (has("category")) out.category = strList(data.category, 10, 100);
    if (has("tags")) out.tags = strList(data.tags, 20, 50);
    if (has("catalogIds")) out.catalogIds = Array.isArray(data.catalogIds) ? data.catalogIds.filter(Number.isInteger).slice(0, 10) : [];
    if (has("images")) out.images = Array.isArray(data.images) ? data.images.filter((i) => typeof i === "string" && IMAGE_RE.test(i)).slice(0, 25) : [];
    if (has("attributes")) {
      out.attributes = Array.isArray(data.attributes)
        ? data.attributes.slice(0, 30).map((a) => ({ label: str(a?.label, 100), value: str(a?.value, 200) })).filter((a) => a.label)
        : [];
    }
    if (has("details")) {
      const d = data.details && typeof data.details === "object" ? data.details : {};
      out.details = { brand: str(d.brand, 100), size: str(d.size, 50), condition: str(d.condition, 50), color: str(d.color, 100), material: str(d.material, 200) };
    }
    if (has("stats")) out.stats = undefined; // werden nicht mehr erfasst
    for (const k of ["savedAt", "updatedAt"]) if (has(k) && Number.isFinite(data[k])) out[k] = data[k];
    return out;
  }

  function sanitizeTemplates(list) {
    return (Array.isArray(list) ? list : []).slice(0, 100)
      .map((t) => ({ id: /^[a-z0-9]{1,40}$/i.test(String(t?.id)) ? String(t.id) : uid(), name: str(t?.name, 50), text: str(t?.text, 2000) }))
      .filter((t) => t.name || t.text);
  }

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
  async function saveAd(raw) {
    const data = sanitizeAd(raw || {});
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
    await local().set({ templates: sanitizeTemplates(templates) });
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
    if (!backup || typeof backup !== "object" || backup.app !== "anzeigenkiste") throw new Error("Keine gültige Anzeigenkiste-Sicherung.");
    const incoming = backup.ads && typeof backup.ads === "object" ? Object.values(backup.ads).slice(0, 5000) : [];
    const clean = {};
    for (const raw of incoming) {
      if (!raw || typeof raw !== "object") continue;
      const ad = { tags: [], attributes: [], images: [], category: [], status: "saved", ...sanitizeAd(raw) };
      if (!ad.title) continue;
      ad.id = ad.id || uid();
      clean[ad.id] = ad;
    }
    const ads = merge ? { ...(await getAds()), ...clean } : clean;
    await local().set({ ads, templates: backup.templates ? sanitizeTemplates(backup.templates) : DEFAULT_TEMPLATES });
    return Object.keys(clean).length;
  }

  AK.store = {
    uid, getAds, getAdList, getAd, saveAd, deleteAd,
    getTemplates, setTemplates, setPending, peekPending, takePending, setRefreshResult,
    exportBackup, importBackup, sanitizeAd, safeUrl, DEFAULT_TEMPLATES
  };
})();
