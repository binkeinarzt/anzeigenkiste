// Hintergrund: lädt Bilder (CORS-frei dank host_permissions) und öffnet Tabs.
const api = globalThis.browser ?? globalThis.chrome;

async function toDataUrl(url) {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`Bild ${res.status}`);
  const blob = await res.blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
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
