// Alle Zielplattformen an einer Stelle: Name, Startseite zum Inserieren, Erkennung und Formularfelder.
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
    ebay: {
      label: "eBay",
      hosts: /(^|\.)ebay\.(de|at)$/,
      start: { de: "https://www.ebay.de/sl/prelist/suggest", at: "https://www.ebay.at/sl/prelist/suggest" },
      fields: {
        title: ["input[name='title']", "textarea[name='title']", "input[aria-label*='Titel' i]"],
        description: ["textarea[name='description']", "[contenteditable='true'][aria-label*='Beschreibung' i]"],
        price: ["input[name='price']", "input[aria-label*='Preis' i]"]
      },
      item: /^\/itm\//
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
    },
    facebook: {
      label: "Facebook Marketplace",
      hosts: /(^|\.)facebook\.com$/,
      start: { de: "https://www.facebook.com/marketplace/create/item", at: "https://www.facebook.com/marketplace/create/item" },
      fields: {
        title: ["label[aria-label='Titel'] input", "input[aria-label='Titel']"],
        description: ["label[aria-label='Beschreibung'] textarea", "textarea[aria-label='Beschreibung']"],
        price: ["label[aria-label='Preis'] input", "input[aria-label='Preis']"]
      }
    },
    marktde: {
      label: "markt.de",
      hosts: /(^|\.)markt\.de$/,
      // Kein fester Formular-Link bekannt: Startseite öffnen, „Anzeige aufgeben“ klicken, dann füllt die Kiste aus
      start: { de: "https://www.markt.de/", at: "https://www.markt.de/" },
      fields: {
        title: ["input[name='title']", "input[name*='titel' i]", "input[id*='title' i]"],
        description: ["textarea[name='description']", "textarea[name*='beschreibung' i]", "textarea"],
        price: ["input[name='price']", "input[name*='preis' i]"]
      }
    },
    quoka: {
      label: "Quoka",
      hosts: /(^|\.)quoka\.de$/,
      // Formular über „Kostenlos inserieren“ auf der Startseite
      start: { de: "https://www.quoka.de/", at: "https://www.quoka.de/" },
      fields: {
        title: ["input[name='title']", "input[name*='headline' i]", "input[name*='titel' i]"],
        description: ["textarea[name='description']", "textarea[name*='text' i]", "textarea"],
        price: ["input[name='price']", "input[name*='preis' i]"]
      }
    }
  };

  AK.platformForHost = (host) =>
    Object.entries(AK.platforms).find(([, p]) => p.hosts.test(host))?.[0] || null;
})();
