// Alle Kleinanzeigen-Selektoren an einer Stelle.
// Wenn Kleinanzeigen das Layout ändert, muss meist nur diese Datei angepasst werden.
// Jeder Eintrag ist eine Liste: der erste Treffer gewinnt.
(function () {
  globalThis.AK.sel = {
    // Anzeigen-Detailseite (/s-anzeige/...)
    ad: {
      title: ["#viewad-title", "h1[itemprop='name']", "h1"],
      price: ["#viewad-price", "[itemprop='price']", ".boxedarticle--price"],
      description: ["#viewad-description-text", "[itemprop='description']"],
      locality: ["#viewad-locality", "[itemprop='addressLocality']"],
      views: ["#viewad-cntr-num", ".viewad-cntr-num"],
      extraInfo: ["#viewad-extra-info", "#viewad-ad-id-box"],
      breadcrumbs: [".breadcrump-link", ".breadcrumb-link", "nav[aria-label*='Breadcrumb'] a"],
      detailRows: [".addetailslist--detail"],
      detailValue: [".addetailslist--detail--value"],
      shipping: [".boxedarticle--details--shipping", "#viewad-shipping"],
      images: [
        "#viewad-image",
        ".galleryimage-element img",
        "#viewad-product .galleryimage--element img",
        ".galleryimage-large img"
      ],
      actionBar: ["#viewad-action-watchlist", "#viewad-contact", ".viewad-actions", "#viewad-price"]
    },

    // Anzeige aufgeben (/p-anzeige-aufgeben*.html)
    post: {
      title: ["#postad-title", "input[name='title']", "input[id*='title' i]"],
      description: ["#pstad-descrptn", "textarea[name='description']", "textarea"],
      price: ["#micro-frontend-price", "#pstad-price", "input[name='priceAmount']", "input[id*='price' i]"],
      priceType: ["#micro-frontend-price-type", "#priceType", "select[name='priceType']"],
      zip: ["#pstad-zip", "input[name='zipCode']"],
      images: ["#pictureupload-input", "input[type='file'][accept*='image']", "input[type='file']"]
    },

    // Meine Anzeigen (/m-meine-anzeigen.html)
    myAds: {
      links: ["a[href*='/s-anzeige/']"]
    },

    // Postfach (/m-nachrichten.html)
    messages: {
      input: [
        "textarea[name='message']",
        "textarea[placeholder*='Nachricht' i]",
        "[contenteditable='true'][role='textbox']",
        "textarea"
      ]
    }
  };
})();
