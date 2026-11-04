// DOM-Helfer: Felder befüllen (auch in React/Vue-Formularen), Dateien in Upload-Felder legen,
// auf Elemente warten und das schwebende Anzeigenkiste-Panel bauen.
(function () {
  const AK = globalThis.AK;

  function $(sel, root = document) {
    for (const s of [].concat(sel)) {
      const el = root.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function $$(sel, root = document) {
    return [].concat(sel).flatMap((s) => Array.from(root.querySelectorAll(s)));
  }

  function waitFor(sel, { timeout = 10000, root = document } = {}) {
    return new Promise((resolve) => {
      const found = $(sel, root);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = $(sel, root);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(root.documentElement || root, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Setzt den Wert so, dass auch Frameworks (React, Vue) die Änderung mitbekommen.
  // Text-Editoren (Quill auf willhaben, Draft.js, ProseMirror) ignorieren direktes Setzen von
  // textContent. Sie verarbeiten aber ein Einfügen aus der Zwischenablage, also simulieren wir das.
  function setEditorText(el, value) {
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    const dt = new DataTransfer();
    dt.setData("text/plain", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    const text = () => el.innerText.replace(/\s+/g, " ").trim();
    const want = value.replace(/\s+/g, " ").trim();
    if (text() !== want) document.execCommand("insertText", false, value);
    if (text() !== want) {
      el.replaceChildren(...value.split("\n").map((line) => {
        const p = document.createElement("p");
        if (line) p.textContent = line; else p.append(document.createElement("br"));
        return p;
      }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return text() === want;
  }

  function setValue(el, value) {
    if (!el || value == null) return false;
    if (el.isContentEditable) return setEditorText(el, String(value));
    el.focus();
    {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter ? setter.call(el, value) : (el.value = value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
    return true;
  }

  // Text an der Cursorposition einfügen (für Nachrichten-Textvorlagen).
  function insertText(el, text) {
    if (!el) return false;
    if (el.isContentEditable) {
      el.focus();
      document.execCommand("insertText", false, text);
      return true;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setValue(el, next);
    el.focus();
    try { el.setSelectionRange(start + text.length, start + text.length); } catch {}
    return true;
  }

  function dataUrlToFile(dataUrl, name) {
    const [head, b64] = dataUrl.split(",");
    const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime === "image/png" ? "png" : "jpg";
    return new File([bytes], `${name}.${ext}`, { type: mime });
  }

  // Wandelt WebP, AVIF usw. in JPEG um. Ältere Anzeigen in der Kiste können noch WebP enthalten,
  // und Kleinanzeigen/willhaben lehnen das ab („ungültiges Format“).
  function ensureJpeg(dataUrl) {
    if (/^data:image\/(jpeg|png);/.test(dataUrl)) return Promise.resolve(dataUrl);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Legt Bilder in ein <input type="file">, als hätte der Nutzer sie ausgewählt.
  async function injectFiles(input, dataUrls, baseName = "bild") {
    if (!input || !dataUrls?.length) return false;
    const dt = new DataTransfer();
    const max = input.multiple ? dataUrls.length : 1;
    const ready = await Promise.all(dataUrls.slice(0, max).map(ensureJpeg));
    ready.forEach((u, i) => dt.items.add(dataUrlToFile(u, `${baseName}-${i + 1}`)));
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // Fotos höchstens einmal pro Anzeige und Seite einfügen. Kleinanzeigen ersetzt das Foto-Feld nach dem
  // Hochladen durch ein neues, leeres Feld; ohne diese Sperre würde jeder neue Durchlauf (erneutes Ausfüllen,
  // Abbrechen und Neustarten) die Fotos noch einmal hochladen.
  const photosInjected = new Set();
  async function injectFilesOnce(key, input, dataUrls, baseName, alreadyUploaded = 0) {
    if (photosInjected.has(key)) return true;
    if (alreadyUploaded > 0) { photosInjected.add(key); return true; }
    const ok = await injectFiles(input, dataUrls, baseName);
    if (ok) photosInjected.add(key);
    return ok;
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    }
  }

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function toast(msg, kind = "ok") {
    const t = h("div", { class: `ak-toast ak-toast--${kind}` }, msg);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("ak-toast--in"));
    setTimeout(() => { t.classList.remove("ak-toast--in"); setTimeout(() => t.remove(), 300); }, 3200);
  }

  // Schwebendes Panel unten rechts. Gibt { root, body, close } zurück.
  // onClose: wird beim Schließen über ✕ aufgerufen (z. B. um das Ausfüllen zu stoppen)
  function panel(title, { id = "ak-panel", onClose } = {}) {
    document.getElementById(id)?.remove();
    const body = h("div", { class: "ak-panel__body" });
    const close = () => { onClose?.(); root.remove(); };
    const root = h("aside", { id, class: "ak-panel", role: "dialog", "aria-label": title },
      h("header", { class: "ak-panel__head" },
        h("span", { class: "ak-logo", "aria-hidden": "true" }, "▣"),
        h("strong", {}, title),
        h("button", { class: "ak-icon-btn", title: "Schließen und Ausfüllen stoppen", onclick: close }, "✕")
      ),
      body
    );
    document.body.appendChild(root);
    return { root, body, close };
  }

  function formatPrice(ad) {
    if (ad.priceType === "GIVE_AWAY") return "Zu verschenken";
    if (!ad.price && ad.price !== 0) return "–";
    return `${ad.price} €${ad.priceType === "NEGOTIABLE" ? " VB" : ""}`;
  }

  AK.dom = { $, $$, waitFor, sleep, setValue, setEditorText, insertText, dataUrlToFile, ensureJpeg, injectFiles, injectFilesOnce, downloadDataUrl, copy, h, toast, panel, formatPrice };
})();
