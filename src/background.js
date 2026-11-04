// Hintergrund: lädt Bilder (CORS-frei dank host_permissions) und öffnet Tabs.
const api = globalThis.browser ?? globalThis.chrome;

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
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`Bild ${res.status}`);
  let blob = await res.blob();
  try { blob = await toJpeg(blob); } catch (e) { console.warn("[Anzeigenkiste] Umwandlung fehlgeschlagen", url, e); }
  return blobToDataUrl(blob);
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "fetchImages": {
        const out = [];
        for (const u of msg.urls || []) {
          try { out.push(await toDataUrl(u)); } catch (e) { console.warn("[Anzeigenkiste]", u, e); }
        }
        return out;
      }
      case "fetchText": {
        // Nur für eBay-Beschreibungen (eigener Frame auf ebaydesc.com)
        const u = new URL(msg.url);
        if (!/(^|\.)ebaydesc\.com$/.test(u.hostname)) return null;
        const res = await fetch(u, { credentials: "omit" });
        return res.ok ? await res.text() : null;
      }
      case "openTab":
        await api.tabs.create({ url: msg.url });
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
