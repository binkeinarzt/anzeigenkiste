// Alle Plattformen (Kleinanzeigen, Vinted, willhaben) an einer Stelle: Name, Startseite zum Inserieren, Erkennung und Formularfelder.
// Felder: Liste von Selektoren, erster Treffer gewinnt. Greift keiner, sucht export.js per Heuristik
// nach Feldern mit „Titel“, „Beschreibung“ und „Preis“ in name, id, placeholder, aria-label oder Label.
(function () {
  const AK = globalThis.AK;

  AK.platforms = {
    kleinanzeigen: {
      label: "Kleinanzeigen",
      hosts: /(^|\.)kleinanzeigen\.de$/,
      start: { de: "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html", at: "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html" }
      // Formular wird in content/kleinanzeigen.js mit AK.sel.post befüllt
    },
    vinted: {
      label: "Vinted",
      hosts: /(^|\.)vinted\.(de|at)$/,
      start: { de: "https://www.vinted.de/items/new", at: "https://www.vinted.at/items/new" },
      fields: {
        title: ["input[data-testid='title--input']", "input#title", "input[name='title']"],
        description: ["textarea[data-testid='description--input']", "textarea#description", "textarea[name='description']"],
        price: ["input[data-testid='price-input--input']", "input#price", "input[name='price']"]
      },
      item: /^\/items\/\d+/
    },
    willhaben: {
      label: "willhaben",
      hosts: /(^|\.)willhaben\.at$/,
      start: { de: "https://www.willhaben.at/iad/anzeigenaufgabe/marktplatz?adTypeId=67&productId=67", at: "https://www.willhaben.at/iad/anzeigenaufgabe/marktplatz?adTypeId=67&productId=67" },
      fields: {
        title: ["#heading", "input[name='heading']"],
        description: [".ql-editor", "[contenteditable='true']"],
        price: ["#price", "input[name='price']"]
      },
      item: /^\/iad\/kaufen-und-verkaufen\/d\//
    }
  };

  AK.platformForHost = (host) =>
    Object.entries(AK.platforms).find(([, p]) => p.hosts.test(host))?.[0] || null;
})();
