// Hintergrund: lädt Bilder (CORS-frei dank host_permissions) und öffnet/schließt Tabs. Alle Eingaben kommen letztlich von Webseiten und werden geprüft.
const api = globalThis.browser ?? globalThis.chrome;

// Bilder nur von den Bildservern der unterstützten Plattformen (oder bereits eingebettete data:-Bilder)
const IMAGE_HOSTS = [/(^|\.)kleinanzeigen\.de$/, /(^|\.)vinted\.net$/, /(^|\.)vinted\.(de|at)$/, /(^|\.)willhaben\.at$/];
const MAX_IMAGES = 25;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function allowedImageUrl(raw) {
  if (typeof raw !== "string") return false;
  if (/^data:image\/(jpeg|png|webp|gif|avif);base64,/i.test(raw)) return raw.length < MAX_IMAGE_BYTES * 1.4;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && IMAGE_HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

const fromExtensionPage = (sender) => sender.id === api.runtime.id && typeof sender.url === "string" && sender.url.startsWith(api.runtime.getURL(""));

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}

// Alle Bilder als JPEG speichern: Kleinanzeigen und willhaben nehmen nur jpg, png und gif,
// Vinted liefert aber WebP. Gleichzeitig auf max. 1600 px verkleinern.
async function toJpeg(blob) {
  if (blob.type === "image/jpeg" && blob.size < 1_500_000) return blob;
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparente PNGs/WebPs bekommen weißen statt schwarzen Hintergrund
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

async function toDataUrl(url) {
  // Zeitlimit: ein hängender Bildserver darf die Kiste nicht blockieren
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  const res = await fetch(url, { credentials: "omit", signal: ctrl.signal }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`Bild ${res.status}`);
  // Weiterleitungen nur innerhalb der erlaubten Bildserver
  if (res.redirected && !allowedImageUrl(res.url)) throw new Error("Weiterleitung zu fremdem Server");
  if (Number(res.headers.get("content-length") || 0) > MAX_IMAGE_BYTES) throw new Error("Bild zu groß");
  let blob = await res.blob();
  if (!/^image\//.test(blob.type)) throw new Error(`Kein Bild (${blob.type || "unbekannt"})`);
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("Bild zu groß");
  try { blob = await toJpeg(blob); } catch (e) { console.warn("[Anzeigenkiste] Umwandlung fehlgeschlagen", url, e); }
  return blobToDataUrl(blob);
}

const refreshTabs = new Set();

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Nur Nachrichten aus dieser Erweiterung (Content-Scripts, Dashboard, Popup)
  if (sender.id !== api.runtime.id) return false;
  (async () => {
    switch (msg?.type) {
      case "fetchImages": {
        // parallel laden, Reihenfolge beibehalten, fehlgeschlagene Bilder auslassen
        const urls = (Array.isArray(msg.urls) ? msg.urls : []).filter(allowedImageUrl).slice(0, MAX_IMAGES);
        const results = await Promise.allSettled(urls.map(toDataUrl));
        results.filter((r) => r.status === "rejected").forEach((r) => console.warn("[Anzeigenkiste]", r.reason));
        return results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      }
      case "closeTab":
        // Nur Tabs, die das Dashboard zum Nachladen geöffnet hat (siehe dashboard.js)
        if (sender.tab?.id != null && refreshTabs.has(sender.tab.id)) { refreshTabs.delete(sender.tab.id); await api.tabs.remove(sender.tab.id); }
        return true;
      case "registerRefreshTab":
        // Nur das Dashboard darf Tabs zum Nachladen anmelden, nicht Content-Scripts auf Webseiten
        if (!fromExtensionPage(sender) || !Number.isInteger(msg.tabId)) return false;
        refreshTabs.add(msg.tabId);
        return true;
      case "openDashboard":
        await api.tabs.create({ url: api.runtime.getURL("dashboard/dashboard.html") });
        return true;
      default:
        return null;
    }
  })().then(sendResponse, (e) => sendResponse({ error: String(e) }));
  return true; // asynchrone Antwort
});
