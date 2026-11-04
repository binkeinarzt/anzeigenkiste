// Kategoriebaum für die Auswahl im Dashboard (Bereich › Art › Unterkategorie).
// Die Bezeichnungen folgen Vinted, damit selbst angelegte und von Vinted geholte Anzeigen gleich
// behandelt werden: lib/mapping.js leitet daraus die Kategorie und Merkmale für Kleinanzeigen ab,
// lib/targets.js wählt damit den passenden Kategorievorschlag auf willhaben.
(function () {
  const AK = globalThis.AK;

  const kleidung = (female) => [
    "Jacken & Mäntel", "Pullover & Sweatshirts", "Strickjacken & Cardigans", "T-Shirts & Tops",
    female ? "Blusen & Hemden" : "Hemden", "Hosen", "Jeans", "Shorts",
    ...(female ? ["Kleider", "Röcke", "Umstandsmode"] : []),
    "Anzüge & Blazer", "Sportbekleidung", "Bademode", "Kostüme & Verkleidungen", "Sonstige Kleidung"
  ];
  const schuhe = (female) => [
    "Sneaker", "Sportschuhe", "Stiefel & Stiefeletten", "Halbschuhe & Schnürschuhe", "Sandalen & Flip-Flops",
    "Wanderschuhe & Outdoor", "Hausschuhe", ...(female ? ["Ballerinas", "Pumps & High Heels"] : []), "Sonstige Schuhe"
  ];
  const taschen = ["Handtaschen", "Rucksäcke", "Umhängetaschen", "Geldbörsen", "Koffer & Reisetaschen", "Sonstige Taschen"];
  const accessoires = ["Schmuck", "Uhren", "Sonnenbrillen", "Mützen & Hüte", "Schals & Tücher", "Gürtel", "Sonstige Accessoires"];
  const kinder = (girl) => [
    "Jacken & Mäntel", "Pullover & Sweatshirts", "Shirts & Tops", "Hosen & Jeans", ...(girl ? ["Kleider", "Röcke"] : []),
    "Bodys & Strampler", "Schlafanzüge", "Schnee- & Skibekleidung", "Bademode", "Kostüme & Verkleidungen",
    "Kleidungspakete", "Schuhe", "Sonstige Kinderkleidung"
  ];

  AK.CATEGORY_TREE = {
    Damen: {
      Kleidung: kleidung(true),
      Schuhe: schuhe(true),
      Taschen: taschen,
      Accessoires: accessoires,
      Beauty: ["Make-up", "Pflege", "Parfum", "Sonstige Beauty"]
    },
    Herren: {
      Kleidung: kleidung(false),
      Schuhe: schuhe(false),
      Taschen: taschen,
      Accessoires: accessoires,
      Pflege: ["Rasur & Bart", "Parfum", "Sonstige Pflege"]
    },
    Kinder: {
      "Mädchen": kinder(true),
      Jungs: kinder(false),
      Spielzeug: ["LEGO & Bausteine", "Puppen", "Spielfiguren", "Gesellschaftsspiele", "Lernspielzeug", "Sonstiges Spielzeug"]
    },
    Home: {
      Dekoration: ["Kerzen & Kerzenhalter", "Bilder & Rahmen", "Vasen", "Sonstige Deko"]
    },
    Sport: {
      "Sport & Camping": ["Fitness", "Radsport", "Wintersport", "Camping & Outdoor", "Ballsport", "Sonstiger Sport"]
    }
  };
})();
