// Ausfüll-Motor für Formulare, die sich beim Ausfüllen verändern.
// Viele Verkaufsformulare zeigen Felder erst nach der Kategoriewahl (willhaben: Beschreibung,
// Farbe; Kleinanzeigen: Art, Größe, Marke, Zustand). Der Motor beobachtet die Seite und füllt
// jedes Feld, sobald es auftaucht, genau einmal. Was der Nutzer danach ändert, bleibt unangetastet.
//
// Unterstützte Bedienelemente:
//   - normale Text- und Auswahlfelder (<input>, <textarea>, <select>, Radio-Gruppen)
//   - Klapplisten mit role="combobox" + role="listbox"/"option" (Kleinanzeigen, viele React-Seiten)
//   - Suchfelder mit Vorschlagsliste (Marke auf Kleinanzeigen)
//   - Auswahl in einem Dialog mit Radio-Buttons und „Bestätigen“ (Zustand auf Kleinanzeigen)
(function () {
  const AK = globalThis.AK;
  const { setValue, sleep } = AK.dom;
  const norm = (s) => AK.mapping.norm(s);

  const visible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);

  function labelOf(el) {
    if (el.id) {
      const l = document.querySelector(`label[for='${CSS.escape(el.id)}']`);
      if (l) return l.textContent;
    }
    return el.closest("label")?.textContent || el.getAttribute("aria-label") || el.value || "";
  }

  const isPlaceholder = (t) => /^(bitte|w(ä|ae)hle|auswählen|--)/i.test((t || "").trim());

  /**
   * Wählt die beste Option.
   * options: [{ el, value, text }]; wanted: Werte oder Texte in Vorzugsreihenfolge;
   * fallback: Werte/Texte, falls nichts passt (z. B. „sonstige“).
   */
  function pick(options, wanted = [], fallback = []) {
    const real = options.filter((o) => (o.value !== "" || o.text.trim()) && !isPlaceholder(o.text));
    const eq = (o, w) => String(o.value).toLowerCase() === String(w).toLowerCase() || norm(o.text) === norm(w);
    for (const w of wanted) { const hit = real.find((o) => eq(o, w)); if (hit) return hit; }
    for (const w of wanted) {
      const n = norm(w);
      if (n.length < 1) continue;
      // „S (36)“ passt zu „S“, „42,5“ zu „42.5“
      const hit = real.find((o) => norm(o.text).startsWith(n + " ") || norm(o.text).replace(/ 5$/, ".5") === n)
        || (n.length >= 4 ? real.find((o) => norm(o.text).split(" ").includes(n)) : null);
      if (hit) return hit;
    }
    for (const f of fallback) { const hit = real.find((o) => eq(o, f)); if (hit) return hit; }
    if (fallback.length) return real.find((o) => /^(sonstig|andere|weitere)/i.test(o.text.trim())) || null;
    return null;
  }

  // ---------- Bedienelemente ----------

  function nativeOptions(el) {
    if (el instanceof HTMLSelectElement) return Array.from(el.options).map((o) => ({ el: o, value: o.value, text: o.textContent }));
    if (el instanceof HTMLInputElement && ["radio", "checkbox"].includes(el.type)) {
      const group = el.name ? Array.from(document.querySelectorAll(`input[name='${CSS.escape(el.name)}']`)) : [el];
      return group.map((r) => ({ el: r, value: r.value, text: labelOf(r) }));
    }
    return [];
  }

  function chooseNative(el, wanted, fallback) {
    const hit = pick(nativeOptions(el), wanted, fallback);
    if (!hit) return null;
    if (el instanceof HTMLSelectElement) setValue(el, hit.value);
    else { hit.el.click(); if (!hit.el.checked) { hit.el.checked = true; hit.el.dispatchEvent(new Event("change", { bubbles: true })); } }
    return hit.text.trim();
  }

  function listboxFor(el) {
    const id = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    return (id && document.getElementById(id)) || null;
  }

  async function waitOptions(el, ms = 1500) {
    for (let t = 0; t < ms; t += 100) {
      const lb = listboxFor(el) || document.querySelector("[role='listbox']:not([hidden])");
      const opts = lb ? Array.from(lb.querySelectorAll("[role='option']")) : [];
      if (opts.length) return opts.map((o) => ({ el: o, value: o.getAttribute("data-value") || "", text: o.textContent }));
      await sleep(100);
    }
    return [];
  }

  // Klappliste (Button oder Feld mit role=combobox)
  async function chooseCombobox(el, wanted, fallback) {
    if (el.getAttribute("aria-expanded") !== "true") el.click();
    const opts = await waitOptions(el);
    const hit = pick(opts, wanted, fallback);
    if (!hit) { if (el.getAttribute("aria-expanded") === "true") el.click(); return null; }
    hit.el.scrollIntoView?.({ block: "nearest" });
    hit.el.click();
    await sleep(150);
    return hit.text.trim();
  }

  // Suchfeld mit Vorschlägen: Text tippen, passenden Vorschlag anklicken
  async function chooseAutocomplete(el, wanted, fallback) {
    for (const query of [...wanted, ...fallback]) {
      if (!query) continue;
      el.focus();
      setValue(el, "");
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, String(query));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      const opts = await waitOptions(el, 2000);
      const hit = pick(opts, [query], []) || (fallback.includes(query) ? null : null);
      if (hit) { hit.el.click(); await sleep(150); return hit.text.trim(); }
    }
    // Nichts gefunden: „Sonstige“ aus der Liste wählen, falls angeboten
    setValue(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const opts = await waitOptions(el, 800);
    const other = pick(opts, [], fallback.length ? fallback : ["sonstige"]);
    if (other) { other.el.click(); return other.text.trim(); }
    return null;
  }

  // Button öffnet einen Dialog mit Radio-Buttons und einem Bestätigen-Knopf
  async function chooseInDialog(button, wanted, fallback) {
    button.click();
    let dlg = null;
    for (let t = 0; t < 1500 && !dlg; t += 100) {
      dlg = document.querySelector("dialog[open], [role='dialog'][aria-modal='true']");
      if (!dlg) await sleep(100);
    }
    if (!dlg) return null;
    const radios = Array.from(dlg.querySelectorAll("input[type='radio']"));
    const hit = pick(radios.map((r) => ({ el: r, value: r.value, text: labelOf(r) })), wanted, fallback);
    const buttons = Array.from(dlg.querySelectorAll("button"));
    if (!hit) { buttons.find((b) => /abbrechen|schließen/i.test(b.textContent))?.click(); return null; }
    hit.el.click();
    await sleep(150);
    buttons.find((b) => /bestätigen|übernehmen|fertig|^ok$/i.test(b.textContent.trim()))?.click();
    await sleep(200);
    return labelOf(hit.el).trim().split("\n")[0];
  }

  // Wählt das passende Verfahren für ein Bedienelement.
  async function choose(el, wanted, fallback = []) {
    if (!el) return null;
    if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && ["radio", "checkbox"].includes(el.type))) {
      return chooseNative(el, wanted, fallback);
    }
    if (el.getAttribute("role") === "combobox" && el instanceof HTMLInputElement) return chooseAutocomplete(el, wanted, fallback);
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-haspopup") === "listbox") return chooseCombobox(el, wanted, fallback);
    if (el.getAttribute("aria-haspopup") === "dialog") return chooseInDialog(el, wanted, fallback);
    return null;
  }

  /**
   * Startet das Ausfüllen.
   * steps: [{ id, label, find: () => Element|null, apply: async (el) => boolean, optional?, hidden?, refill?, isFilled? }]
 *   hidden: Feld darf unsichtbar sein (z. B. <input type="file">)
   * Rückgabe: { stop(), status(), tick() }
   */
  function run(steps, { durationMs = 15 * 60 * 1000, onChange } = {}) {
    const done = new Set();
    const touched = new WeakSet();
    const attempts = new WeakMap();
    const refills = new WeakMap();
    let timer = null;
    let busy = false;
    let again = false;
    let stopped = false;

    const status = () => ({
      done: steps.filter((s) => done.has(s.id)).map((s) => s.label),
      open: steps.filter((s) => !done.has(s.id) && !s.optional).map((s) => s.label)
    });

    async function tick() {
      if (stopped) return;
      if (busy) { again = true; return; }
      busy = true;
      let changed = false;
      let retry = false;
      for (const s of steps) {
        if (stopped) break;
        if (done.has(s.id) && !s.refill) continue;
        const el = s.find();
        // Foto-Felder sind fast immer versteckt (display: none) hinter einer Ablagefläche → nicht auf Sichtbarkeit prüfen
        if (!el || (!s.hidden && !visible(el))) continue;
        if (done.has(s.id) && s.isFilled) {
          // Erledigt, aber die Seite hat das Feld geleert (z. B. nach Kategoriewechsel): höchstens 3× nachfüllen
          if (s.isFilled(el)) continue;
          const r = refills.get(el) || 0;
          if (r >= 3) continue;
          refills.set(el, r + 1);
        } else if (touched.has(el)) {
          continue;
        }
        let ok = false;
        try { ok = await s.apply(el); } catch (e) { console.warn("[Anzeigenkiste]", s.id, e); }
        const n = (attempts.get(el) || 0) + 1;
        attempts.set(el, n);
        if (ok || n > 5) touched.add(el);
        if (ok) { done.add(s.id); changed = true; onChange?.(status()); } else if (n <= 5) retry = true;
      }
      busy = false;
      if (changed) onChange?.(status());
      if (again || retry) { again = false; schedule(retry ? 800 : 300); }
    }

    function schedule(ms = 350) { clearTimeout(timer); timer = setTimeout(tick, ms); }

    const obs = new MutationObserver(() => schedule());
    obs.observe(document.body, { childList: true, subtree: true });
    const end = setTimeout(stop, durationMs);
    function stop() { stopped = true; obs.disconnect(); clearTimeout(timer); clearTimeout(end); }

    tick();
    return { stop, status, tick };
  }

  AK.autofill = { run, choose, pick, chooseNative, chooseCombobox, chooseAutocomplete, chooseInDialog, visible, labelOf };
})();
