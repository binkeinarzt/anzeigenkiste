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

    // Anzeige aufgeben (/p-anzeige-aufgeben-schritt2.html), Formular-Stand November 2026
    post: {
      title: ["#ad-title", "input[name='title']", "#postad-title"],
      description: ["#ad-description", "textarea[name='description']", "#pstad-descrptn"],
      price: ["#ad-price-amount", "input[name='priceAmount']", "#pstad-price"],
      priceType: ["#ad-price-type", "select[name='priceType']", "#priceType"],
      images: ["input[type='file'][accept*='image']", "input[type='file']"],
      uploadedPhotos: "img[alt='Bild zur Anzeige']",
      // „Direkt kaufen“ (erscheint nur bei „Versand möglich“) und Versand
      buyNow: (v) => `input[name='buyNow'][value='${v}']`,
      shippingYes: "input[name^='attributeMap['][name$='.versand]'][value='ja']",
      // Kategorievorschläge erscheinen nach Eingabe des Titels als Radio-Buttons (value = Kategorie-ID)
      categoryPicker: ["#ad-category-picker", "fieldset[aria-label*='Kategorie']"],
      categoryInput: ["input[name='categoryId']"],
      // Merkmale: verstecktes Feld attributeMap[<präfix>.<name>], Bedienelement mit id <präfix>.<name>
      attributeHidden: "input[name^='attributeMap[']"
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
