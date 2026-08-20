/**
 * German (Swiss) translation of the Launch Diary series + case study.
 *
 * STRUCTURAL PARITY CONTRACT with launchContent.ts (the English source of
 * truth): same slugs, same kinds, same dates, same image srcs and hrefs, and
 * a 1:1 block count / block-type sequence per article. Only prose is
 * localized. Swiss orthography throughout ("ss", never "ß"); the reader is
 * addressed with the formal "Sie".
 *
 * The right-of-publicity gate from @shared/marketing applies here exactly as
 * in the English source: every maker reference flows through `maker`, so the
 * translations anonymize/reveal in lockstep with CONTENT_RELEASE_SIGNED.
 */
import {
  maker,
  STORY_SLUG,
  BLOG_POSTS,
  CONTENT_RELEASE_SIGNED,
} from "@shared/marketing";
import {
  articleSchema,
  storySchema,
  CASE_STUDY,
  type Article,
  type Block,
} from "./launchContent";

const BLOG_BASE = "/blog";
const STORY_PATH = `/stories/${STORY_SLUG}`;
/** Gate-aware brand reference with a German-language anonymous fallback. */
const BRAND = maker.founder ? maker.brand : "unser Pilotstudio";
const founderName = maker.founder ?? "die Macherin";

const diary1: Article = {
  slug: "launch-diary-1",
  kind: "diary",
  eyebrow: "Launch-Tagebuch · Teil 1 von 4",
  title: "Launch-Tagebuch #1: Die Einrichtung",
  metaTitle: maker.founder
    ? `Wie ${maker.founder} den ersten Onlineshop von ${maker.brand} aufbaute | Gwinn Launch-Tagebuch`
    : "Wie eine Zürcher Macherin ihren ersten Onlineshop aufbaute | Gwinn Launch-Tagebuch",
  metaDescription: maker.founder
    ? `Begleiten Sie ${maker.founder}, Gründerin von ${maker.brand} in Zürich, beim Aufbau ihres ersten Onlineshops auf Gwinn. Echter Prozess, echter Zeitplan, keine Growth-Hacks.`
    : "Begleiten Sie eine Zürcher Perlenschmuck-Macherin beim Aufbau ihres ersten Onlineshops auf Gwinn. Echter Prozess, echter Zeitplan, keine Growth-Hacks.",
  dek: "Von Weihnachtsmärkten zum ersten Onlineshop — Teil 1: der Anfang.",
  datePublished: BLOG_POSTS[0].lastmod,
  dateModified: BLOG_POSTS[0].lastmod,
  readingTime: "4 Min. Lesezeit",
  keywords: [
    "Schmuck online verkaufen",
    "Perlenschmuck Zürich",
    "Kassensystem für Kunsthandwerk",
    "Onlineshop für Kunsthandwerk",
  ],
  blocks: [
    {
      type: "p",
      text: `${BRAND} macht Schmuck. Keine Massenware, kein Dropshipping — handgefertigte Stücke aus Perlen und Halbedelsteinen, verkauft an Weihnachtsmärkten und Chilbis entlang der Zürcher Goldküste. Rund 60 Verkäufe im Monat, alle persönlich. Kein Onlineshop. Nur eine Macherin und ihr Handwerk.`,
    },
    {
      type: "p",
      text: 'Dies ist die Geschichte, wie dieser erste Onlineshop entstand. Keine Growth-Hacking-Fallstudie. Keine "So habe ich sechsstellig verdient"-Erzählung. Nur eine echte Macherin, die herausfindet, wie man online verkauft, ohne zum Tech-Profi zu werden.',
    },
    { type: "h2", text: "Die Macherin" },
    {
      type: "p",
      text: "Das Atelier verkauft seit rund einem Jahr Schmuck an Märkten. Halsketten, Ohrringe, Armbänder — jedes Stück ein Unikat, gebaut um Perlen und Halbedelsteine. Der Aufbau ist vertraut: Klapptisch, Samtauslage, Kartenlesegerät. Rund 60 Verkäufe pro Monat, meist an Stammkundschaft, die an denselben Märkten am Zürichsee auftaucht.",
    },
    {
      type: "p",
      text: `Das Problem sind nicht die Verkäufe. Es ist die Reichweite. Jeder Markt ist ein neues Publikum. Wer an einem Weihnachtsmarkt im Seefeld eine Perlenkette gekauft hat, kann einer Freundin in Enge nicht sagen, wo sie ${BRAND} online findet. Die Antwort lautete bisher: "Sie finden mich an der nächsten Chilbi."`,
    },
    { type: "h2", text: "Die Entscheidung" },
    {
      type: "p",
      text: 'Bei der Entscheidung, online zu gehen, ging es nicht um Skalierung. Es ging um Erreichbarkeit. Die Kundschaft fragte immer wieder: "Haben Sie eine Website?" Die Antwort war immer Nein. Das wird nach dem dritten Mal unangenehm.',
    },
    { type: "p", text: "Die Anforderungen waren einfach:" },
    {
      type: "ul",
      items: [
        "Den Schmuck online zeigen",
        "Kaufen ermöglichen, ohne dass jemand eine WhatsApp-Nachricht schreiben muss",
        "Denselben Lagerbestand wie an der Kasse führen (kein Doppelverkauf an der Chilbi)",
        "Weder Shopify lernen noch einen Entwickler engagieren müssen",
      ],
    },
    { type: "h2", text: "Der Einrichtungsprozess" },
    {
      type: "p",
      text: "Tag 1 — Produkte hochladen. Das Atelier startete mit 15 Produkten. Nicht das ganze Sortiment — nur die Stücke, die sich gut fotografieren lassen und verlässlich verkaufen. Ein grobes Handyfoto pro Stück, kein Studio; Gwinns KI verwandelt diese eine Aufnahme in ein Produkt- oder Lifestyle-Bild, und die KI-Beschreibungen schaffen etwa 80% des Wegs, bevor ein Mensch den Ton nachschärft.",
    },
    {
      type: "note",
      text: "Offenlegung: In jedem KI-gestylten Bild ist das Schmuckstück echt — alles darum herum (Hintergrund, Styling, allfällige Models oder Szenen) ist KI-generiert, und genau das steht bei jedem dieser Bilder dabei. Das ist keine inszenierte Authentizität; es ist eine kleine Macherin, die offen sagt, welches Werkzeug sie benutzt hat.",
    },
    {
      type: "beforeAfter",
      before: {
        src: "/launch/pearl-halo-set-raw.jpg",
        alt: `Originales Handyfoto eines Perlen-Halo-Sets aus Ohrringen und Anhänger von ${BRAND} auf schlichtem Stoff`,
      },
      after: {
        src: "/launch/pearl-halo-set-styled.jpg",
        alt: "Dasselbe Perlen-Halo-Set auf einem KI-generierten Hintergrund aus Marmor und Rosen",
      },
      beforeLabel: "Handyfoto der Macherin",
      afterLabel: "KI-gestylt",
      caption:
        "Exakt dasselbe Perlen-Halo-Set: das einzelne Handyfoto der Macherin (links) und das KI-gestylte Produktbild (rechts). Der Schmuck ist das echte Stück; nur der Hintergrund ist KI-generiert.",
    },
    {
      type: "p",
      text: "Zeitaufwand: unter einer Stunde. Der alte Engpass — einen Fotografen buchen, ein Model, ein Studio für ein paar Produktaufnahmen mieten — ist weg.",
    },
    {
      type: "beforeAfter",
      before: {
        src: "/launch/baroque-fringe-earrings-raw.jpg",
        alt: `Originales Handyfoto von Barockperlen-Fransenohrringen von ${BRAND} auf Vulkangestein`,
      },
      after: {
        src: "/launch/baroque-fringe-earrings-on-model.jpg",
        alt: "Dieselben Barockperlen-Fransenohrringe an einem KI-generierten Model",
      },
      beforeLabel: "Handyfoto der Macherin",
      afterLabel: "KI am Model",
      caption:
        "Dieselben Ohrringe, einen Schritt weiter: Aus einem Handyfoto wird eine Aufnahme am Model — ohne gebuchtes Model, ohne gemietetes Studio. Die Ohrringe sind das echte Stück; Model und Szene sind KI-generiert.",
    },
    {
      type: "p",
      text: "Tag 2 — Shop konfigurieren. Pauschalversand (CHF 8 Schweiz, CHF 15 EU), Stripe zuerst im Testmodus verbunden, Shopfarben an die Marke angepasst und eine Über-uns-Seite, die die Geschichte der Macherin erzählt.",
    },
    {
      type: "p",
      text: "Tag 3 — Kassensynchronisation. Das entscheidende Stück. Der Kassenbestand (was an Märkten verfügbar ist) musste sich mit dem Onlineshop synchronisieren, damit ein an der Chilbi verkauftes Armband zehn Minuten später online nicht mehr als verfügbar erscheint. Gwinn erledigt das automatisch: eine Bestandsdatenbank, zwei Verkaufskanäle. Zeitaufwand: 30 Minuten. Es funktionierte einfach.",
    },
    { type: "h2", text: "Was wir gelernt haben" },
    {
      type: "ol",
      items: [
        "Klein anfangen. 15 Produkte, nicht 150. Wer mit allem startet, lähmt sich selbst.",
        "KI-Beschreibungen sparen Zeit, brauchen aber Redigieren. Die KI erfasste Materialien und Masse; der emotionale Ton fehlte. Der kam von Hand zurück.",
        "Kassensynchronisation ist nicht verhandelbar. Wer online und persönlich verkauft, verhindert damit Desaster.",
        "Fotografie war früher der Engpass. Die KI hat ihn beseitigt — zu einem Bruchteil der Kosten für Fotograf, Model oder Studio, die eine Macherin dieser Grösse ohnehin nie engagiert hätte.",
      ],
    },
    { type: "h2", text: "Wie es weitergeht" },
    {
      type: "p",
      text: 'Der Shop ist konfiguriert. Die Produkte sind hochgeladen. Die Zahlungen funktionieren. Als Nächstes: der Soft Launch — der Link geht per Instagram und WhatsApp an die bestehende Kundschaft. Keine Werbung. Keine Promotion. Nur: "Hey, wir sind endlich online."',
    },
  ],
  next: {
    label: "Launch-Tagebuch #2: Der Livegang",
    href: `${BLOG_BASE}/launch-diary-2`,
  },
  schema: articleSchema({
    headline: "Launch-Tagebuch #1: Die Einrichtung",
    description:
      "Wie eine Zürcher Perlenschmuck-Macherin ihren ersten Onlineshop aufbaute — echter Prozess, echter Zeitplan.",
    slug: "launch-diary-1",
    datePublished: BLOG_POSTS[0].lastmod,
    dateModified: BLOG_POSTS[0].lastmod,
    lang: "de",
  }),
};

const diary2: Article = {
  slug: "launch-diary-2",
  kind: "diary",
  eyebrow: "Launch-Tagebuch · Teil 2 von 4",
  title: "Launch-Tagebuch #2: Der Livegang",
  metaTitle: `Livegang: Der erste Onlinetag ${maker.founder ? `von ${maker.brand}` : "eines Zürcher Schmuck-Shops"} | Gwinn Launch-Tagebuch`,
  metaDescription: `Tag 1 ${maker.founder ? `von ${maker.brand}` : "eines Perlenschmuck-Shops"} online in Zürich: 34 Besucher, 0 Bestellungen. Tag 2: der erste Verkauf. Die echte Geschichte eines Online-Launchs.`,
  dek: "Teil 2: der leise Wechsel von 'gibt es nicht' zu 'hier ist er' — und die erste Bestellung.",
  datePublished: BLOG_POSTS[1].lastmod,
  dateModified: BLOG_POSTS[1].lastmod,
  readingTime: "5 Min. Lesezeit",
  keywords: [
    "Schmuck-Shop Launch Zürich",
    "erste Online-Bestellung",
    "vom Weihnachtsmarkt ins Netz",
    "Perlenschmuck Schweiz",
  ],
  blocks: [
    {
      type: "p",
      text: 'Gestern wurde der Shop konfiguriert. Heute ging er live. Nicht mit einer Marketingkampagne. Nicht mit einer Launch-Party. Mit einer einzigen Instagram-Story: "Wir haben endlich eine Website. Link in der Bio."',
    },
    {
      type: "p",
      text: 'So sieht es wirklich aus, wenn eine Macherin online geht. Kein viraler Moment. Nur ein leiser Wechsel von "gibt es nicht" zu "hier ist er".',
    },
    { type: "h2", text: "Der Moment" },
    {
      type: "p",
      text: "Der Shop ging um 10:00 Uhr live. Innerhalb einer Stunde kam der erste Besucher — über die Instagram-Story, nicht über Werbung. Er schaute sich drei Perlenketten an, legte eine in den Warenkorb und schloss den Tab. Erste Lektion: Die meisten Besucher kaufen beim ersten Besuch nicht. Das ist normal. Dass der Shop live ist, ist Schritt eins; Vertrauen aufbauen ist Schritt zwei.",
    },
    { type: "h2", text: "Der Traffic (Tag 1)" },
    {
      type: "table",
      head: ["Quelle", "Besucher", "Bestellungen", "Anmerkungen"],
      rows: [
        [
          "Instagram (Story + Bio-Link)",
          "23",
          "0",
          "Neugierige Bestandskundschaft",
        ],
        ["WhatsApp (direkt geteilt)", "8", "0", "Freunde und Familie"],
        [
          "Direkt (URL eingetippt)",
          "3",
          "0",
          "Vermutlich die Macherin beim Testen",
        ],
        ["Total", "34", "0", "An Tag 1 zählt Präsenz, nicht Verkauf"],
      ],
    },
    {
      type: "p",
      text: "Null Bestellungen an Tag 1. Das ist kein Misserfolg. Ein neuer Shop ohne SEO-Historie, ohne Werbung und mit kleiner Instagram-Gefolgschaft bekommt Besucher, keine Conversions. Die Aufgabe von Tag 1 ist: existieren.",
    },
    { type: "h2", text: "Was funktioniert hat" },
    {
      type: "ol",
      items: [
        "Die Instagram-Story brachte den meisten Traffic. Das bestehende Publikum — aufgebaut an Märkten und Chilbis entlang der Goldküste — ist auf Instagram. Dort gehört die Ankündigung hin.",
        "Die Produktfotos zählten. Wer durchklickte, verbrachte im Schnitt 2 Minuten auf den Produktseiten.",
        "Die Über-uns-Seite bekam unerwartet viel Traffic. 40% der Besucher lasen sie, bevor sie Produkte anschauten. Die Leute wollen wissen, bei wem sie kaufen.",
      ],
    },
    { type: "h2", text: "Was nicht funktioniert hat" },
    {
      type: "ol",
      items: [
        "Niemand nutzte den KI-Chatbot an Tag 1. Er war sichtbar, aber ungebeten. Chatbots werden genutzt, wenn Leute Fragen haben — nicht, wenn sie nur schauen.",
        "Das mobile Raster war auf einigen Android-Handys leicht verschoben. Bis Tag 2 behoben.",
        "Der Versand war nicht klar genug. Zwei Besucher legten Produkte in den Warenkorb, schlossen den Kauf aber nicht ab.",
      ],
    },
    { type: "h2", text: "Der Korrekturzyklus" },
    {
      type: "p",
      text: 'Hier zeigt das KI-geführte Modell seinen Wert. Das Versandkosten-Problem ging an den KI-Chatbot: "Die Leute schliessen den Kauf nicht ab. Ich glaube, sie kennen die Versandkosten nicht." Der Chatbot schlug vor, die Versandkosten auf der Produktseite anzuzeigen. Genehmigt. In 10 Minuten im Shop. Kein Ticket. Keine E-Mail. Kein "Wir nehmen es in den Backlog auf."',
    },
    { type: "h2", text: "Tag 2: Die erste Bestellung" },
    {
      type: "p",
      text: "Um 9:47 Uhr an Tag 2 kam die erste Bestellung — eine Süsswasserperlenkette, CHF 65 + CHF 8 Versand. Die Kundin hatte die Macherin drei Wochen zuvor an einem Weihnachtsmarkt getroffen, die Visitenkarte verloren und sich an den Instagram-Namen erinnert. Genau dafür existiert der Shop: nicht für Impulskäufe von Fremden, sondern für die Person, die Sie einmal getroffen hat, später kaufen wollte und endlich einen Weg dazu hat.",
    },
    {
      type: "p",
      text: "Zeit vom Shop-Launch bis zur ersten Bestellung: 23 Stunden und 47 Minuten.",
    },
    { type: "h2", text: "Was wir gelernt haben" },
    {
      type: "ol",
      items: [
        "Ohne Erwartungen launchen. Der Traffic an Tag 1 ist Neugier, keine Conversion.",
        "Das bestehende Publikum konvertiert zuerst. Onlineverkäufe beginnen mit Menschen, die Sie offline getroffen haben.",
        "Kleine Korrekturen zählen. Die Versandkosten auf der Produktseite haben vermutlich 2–3 abgebrochene Warenkörbe verhindert.",
        "Der KI-Chatbot baut Features, er ist nicht nur Support. Die Versand-Korrektur kam aus einem Gespräch, nicht aus einem Bug-Report.",
      ],
    },
  ],
  next: {
    label: "Launch-Tagebuch #3: Der erste Monat online",
    href: `${BLOG_BASE}/launch-diary-3`,
  },
  schema: articleSchema({
    headline: "Launch-Tagebuch #2: Der Livegang",
    description:
      "Der erste Onlinetag eines Zürcher Perlenschmuck-Shops: 34 Besucher, 0 Bestellungen — dann der erste Verkauf an Tag 2.",
    slug: "launch-diary-2",
    datePublished: BLOG_POSTS[1].lastmod,
    dateModified: BLOG_POSTS[1].lastmod,
    lang: "de",
  }),
};

const diary3: Article = {
  slug: "launch-diary-3",
  kind: "diary",
  eyebrow: "Launch-Tagebuch · Teil 3 von 4",
  title: "Launch-Tagebuch #3: Der erste Monat online",
  metaTitle:
    "Der erste Monat online: 12 Bestellungen, ehrliche Zahlen | Gwinn Launch-Tagebuch",
  metaDescription: `Einen Monat nach dem Online-Launch teilt ${maker.founder ? maker.brand : "eine Zürcher Perlenschmuck-Macherin"} echte Zahlen: 12 Bestellungen, CHF 61 im Schnitt, 81% KI-Chatbot-Lösungsquote. Keine Growth-Hacks.`,
  dek: "Teil 3: ehrliche Zahlen aus Monat eins — 12 Online-Bestellungen, CHF 61 im Schnitt, und was sie ausgelöst hat.",
  datePublished: BLOG_POSTS[2].lastmod,
  dateModified: BLOG_POSTS[2].lastmod,
  readingTime: "6 Min. Lesezeit",
  keywords: [
    "erster Monat Onlineshop",
    "Kennzahlen Schmuckgeschäft",
    "Verkauf von handgemachtem Schmuck",
    "Zürcher Maker-Business",
  ],
  blocks: [
    {
      type: "p",
      text: "Der Shop ist seit einem Monat live. Zeit für ehrliche Zahlen — keine Rosinenpickerei, das ganze Bild.",
    },
    { type: "h2", text: "Die Ausgangslage" },
    {
      type: "p",
      text: "Vor dem Shop: ~60 Offline-Verkäufe pro Monat, 0 online, Reichweite begrenzt auf alle, die am Tisch vorbeiliefen. Nach einem Monat: ~55 offline (ein leichter Rückgang, weil einige Stammkunden online wechselten), 12 Online-Bestellungen und eine Reichweite, die jetzt die ganze Schweiz plus 2 EU-Bestellungen aus Deutschland abdeckt.",
    },
    {
      type: "p",
      text: "Verkäufe total: 67 statt 60. Nicht dramatisch. Aber der Mix hat sich verändert: 82% offline, 18% online. Das ist ein Anfang.",
    },
    { type: "h2", text: "Monat 1 im Detail" },
    {
      type: "table",
      head: [
        "Woche",
        "Online-Bestellungen",
        "Ø Bestellwert",
        "Traffic",
        "Anmerkungen",
      ],
      rows: [
        ["Woche 1 (Launch)", "3", "CHF 58", "156 Besucher", "Instagram-Effekt"],
        ["Woche 2", "2", "CHF 52", "89 Besucher", "Ruhe nach dem Launch"],
        [
          "Woche 3",
          "4",
          "CHF 71",
          "134 Besucher",
          "Post zur neuen Perlenkollektion",
        ],
        ["Woche 4", "3", "CHF 62", "102 Besucher", "Konstant"],
        ["Monat total", "12", "CHF 61", "481 Besucher", "2,5% Conversion"],
      ],
    },
    { type: "h2", text: "Was die Verkäufe auslöste" },
    {
      type: "table",
      head: ["Quelle", "Bestellungen", "% der Online-Verkäufe"],
      rows: [
        ["Instagram (organisch)", "7", "58%"],
        ["Direkt / wiederkehrend", "3", "25%"],
        ["Mundpropaganda (geteilte Links)", "2", "17%"],
        ["Suche / Google", "0", "0%"],
      ],
    },
    {
      type: "p",
      text: "Suche liegt bei 0%, weil der Shop noch keine SEO-Historie hat. Das ist zu erwarten. In Monat 1 geht es darum zu belegen, dass der Shop funktioniert. In den Monaten 2–3 geht es um SEO und Inhalte — genau dafür ist diese Serie da.",
    },
    { type: "h2", text: "Der KI-Chatbot: Zahlen aus Monat 1" },
    {
      type: "table",
      head: ["Kennzahl", "Wert"],
      rows: [
        ["Gespräche total", "47"],
        ["Ohne menschliche Hilfe gelöst", "38 (81%)"],
        ["An die Macherin eskaliert", "9 (19%)"],
        ["Feature-Wünsche", "4"],
        ["Ø Antwortzeit", "3,2 Sekunden"],
      ],
    },
    { type: "h2", text: "Was sich am Produkt verändert hat" },
    {
      type: "p",
      text: "In Monat 1 wurden vier Features gebaut, alle aus Chatbot-Gesprächen — die Kundschaft fragt, die KI baut, live in Stunden statt in Sprints.",
    },
    {
      type: "table",
      head: ["Tag", "Wunsch", "Was gebaut wurde", "Wirkung"],
      rows: [
        [
          "3",
          "Versandkosten sind unklar",
          "Versandpreis auf der Produktseite",
          "Weniger abgebrochene Warenkörbe",
        ],
        [
          "8",
          "Mehr Ansichten der Perlen",
          "Zoom auf Produktbildern",
          "+15% Verweildauer auf Produktseiten",
        ],
        [
          "15",
          "Gibt es Geschenkverpackung?",
          "Geschenkverpackung als Option (CHF 3)",
          "3 Bestellungen nutzten sie",
        ],
        [
          "22",
          "Das mobile Menü ist schwer zu treffen",
          "Grössere Tippflächen",
          "Mobile Conversion leicht gestiegen",
        ],
      ],
    },
    { type: "h2", text: "Das ehrliche Fazit" },
    {
      type: "p",
      text: "Monat 1 hat das Geschäft nicht umgekrempelt — 12 Online-Bestellungen zusätzlich zu 55 offline sind ein Zuwachs, kein Sprung. Aber die Reichweite ging von null-ausserhalb-Zürichs auf 12 Bestellungen inklusive 2 aus Deutschland; Zahlungen, Versand und Bestandssynchronisation haben sich bewährt; und es gibt jetzt echte Daten: 2,5% Conversion, CHF 61 durchschnittlicher Bestellwert, Instagram als stärkste Quelle.",
    },
    {
      type: "p",
      text: "In Monat 1 ging es darum zu beweisen, dass der Shop funktioniert. In Monat 2 geht es darum zu beweisen, dass er wachsen kann.",
    },
  ],
  next: {
    label: "Die Fallstudie: In 30 Tagen vom Marktstand ins Netz",
    href: STORY_PATH,
  },
  schema: articleSchema({
    headline: "Launch-Tagebuch #3: Der erste Monat online",
    description:
      "Ehrliche Zahlen aus Monat eins eines Zürcher Perlenschmuck-Shops: 12 Bestellungen, CHF 61 im Schnitt, 81% KI-Chatbot-Lösungsquote.",
    slug: "launch-diary-3",
    datePublished: BLOG_POSTS[2].lastmod,
    dateModified: BLOG_POSTS[2].lastmod,
    lang: "de",
  }),
};

const caseStudyDeTitle = maker.founder
  ? `Die Launch-Fallstudie von ${maker.brand}`
  : "Die Launch-Fallstudie unseres Pilotstudios";

const caseStudy: Article = {
  slug: STORY_SLUG,
  kind: "story",
  title: caseStudyDeTitle,
  metaTitle: `${maker.founder ? `Fallstudie ${maker.brand}` : "Fallstudie"}: Von Weihnachtsmärkten zu Onlineverkäufen in 30 Tagen | Gwinn`,
  metaDescription: `Wie ${maker.founder ? `${maker.founder}, Gründerin von ${maker.brand},` : "eine Perlenschmuck-Macherin in Zürich"} in 3 Tagen einen ersten Onlineshop auf Gwinn aufbaute und im ersten Monat 12 Onlineverkäufe erzielte.`,
  dek: "Von ~60 Offline-Verkäufen pro Monat an Weihnachtsmärkten zu einem hybriden Online-Offline-Schmuckgeschäft in 30 Tagen.",
  datePublished: CASE_STUDY.datePublished,
  dateModified: CASE_STUDY.dateModified,
  readingTime: "5 Min. Lesezeit",
  keywords: [
    "handgemachter Schmuck Schweiz",
    "Kassensystem für Makers",
    "Perlenschmuck Zürich",
    "Onlineshop für Kunsthandwerk",
  ],
  blocks: [
    { type: "h2", text: "Die Macherin" },
    {
      type: "p",
      text: `${BRAND} ist eine Schmuckmarke in Zürich: handgefertigte Stücke aus Perlen und Halbedelsteinen — Halsketten, Ohrringe, Armbänder —, verkauft an Weihnachtsmärkten und Chilbis entlang der Zürcher Goldküste. Vor Gwinn lief das ganze Geschäft offline: rund 60 Verkäufe im Monat, alle persönlich, kein Onlineshop.`,
    },
    { type: "h2", text: "Die Herausforderung" },
    {
      type: "p",
      text: "Das Problem war nicht das Verkaufsvolumen — es waren Reichweite und Erreichbarkeit. Die Kundschaft fragte immer wieder nach einer Website. Jeder Markt war ein neues Publikum ohne Möglichkeit, eine dauerhafte Beziehung aufzubauen; Bestandskundschaft konnte online niemanden weiterempfehlen, und der Lagerbestand wurde weitgehend im Kopf geführt.",
    },
    {
      type: "p",
      text: "Die Macherin ist kein Tech-Mensch und wollte weder Shopify lernen noch einen Entwickler bezahlen noch Stunden in Software stecken. Das Ziel war, Schmuck zu machen — nicht Werkzeuge zu verwalten.",
    },
    { type: "h2", text: "Die Lösung — eingerichtet in 3 Tagen" },
    {
      type: "table",
      head: ["Tag", "Aufgabe", "Zeitaufwand"],
      rows: [
        ["1", "15 Produkte hochladen + KI-Beschreibungen", "3 Stunden"],
        ["2", "Shop, Versand und Zahlungen konfigurieren", "1 Stunde"],
        ["3", "Kassenbestand mit dem Onlineshop synchronisieren", "30 Minuten"],
      ],
      caption:
        "Gesamte Einrichtungszeit: ~5 Stunden — das meiste davon Fotografie, nicht Software.",
    },
    {
      type: "p",
      text: "Genutzte Schlüsselfunktionen: KI-Produktbeschreibungen (aus Fotos generiert, in ~5 Minuten pro Stück im Ton nachbearbeitet); Kassen- und Online-Synchronisation (ein Bestand für beide Kanäle — ein Verkauf an der Chilbi aktualisiert den Online-Bestand und umgekehrt); und der KI-Chatbot (beantwortet Fragen zu Perlenarten, Versand und Grössen — und macht aus Wünschen ausgelieferte Features).",
    },
    {
      type: "figure",
      image: {
        src: "/launch/gold-fringe-earrings-styled.jpg",
        alt: `Goldgefasste Barockperlen-Fransenohrringe von ${BRAND} auf einem KI-generierten Marmorhintergrund`,
      },
      caption:
        "Ein shopfertiges Produktbild aus einem einzigen Foto der Macherin — die Ohrringe sind das echte Stück; der Hintergrund ist KI-generiert und als solcher ausgewiesen.",
    },
    { type: "h2", text: "Die Ergebnisse (erster Monat)" },
    {
      type: "table",
      head: ["Kennzahl", "Vorher", "Nach 30 Tagen"],
      rows: [
        ["Offline-Verkäufe", "~60/Monat", "~55/Monat"],
        ["Online-Verkäufe", "0", "12 Bestellungen"],
        ["Verkäufe total", "~60/Monat", "~67/Monat"],
        ["Kundenreichweite", "Zürcher Märkte", "Schweiz + Deutschland"],
        ["Bestandsführung", "Im Kopf", "Echtzeit-Synchronisation"],
        [
          "Support-Aufwand",
          "Alles bei der Macherin",
          "81% von der KI erledigt",
        ],
      ],
    },
    {
      type: "p",
      text: "Die erste Online-Kundin hatte die Macherin drei Wochen zuvor an einem Weihnachtsmarkt getroffen, die Visitenkarte verloren und sich an den Instagram-Namen erinnert. Der Shop existiert für Menschen, die Sie bereits kennen — er gibt ihnen nur einen Weg zu kaufen, wenn Sie gerade an keinem Markt stehen.",
    },
    { type: "h2", text: "Was aus Feedback gebaut wurde" },
    {
      type: "table",
      head: ["Tag", "Kundenwunsch", "Was gebaut wurde", "Zeit bis live"],
      rows: [
        [
          "3",
          "Versandkosten sind unklar",
          "Versandpreis auf der Produktseite",
          "10 Minuten",
        ],
        [
          "8",
          "Mehr Ansichten der Perlen",
          "Zoom auf Produktbildern",
          "2 Stunden",
        ],
        [
          "15",
          "Ich möchte Geschenkverpackung",
          "Geschenkverpackung als Option (CHF 3)",
          "1 Stunde",
        ],
        [
          "22",
          "Das mobile Menü ist schwer zu treffen",
          "Grössere Tippflächen",
          "30 Minuten",
        ],
      ],
      caption: "4 Features in ~4 Stunden gebaut, nicht in 4 Sprints.",
    },
    ...(CONTENT_RELEASE_SIGNED
      ? [
          { type: "h2", text: "Die Perspektive der Macherin" } as Block,
          {
            type: "quote",
            text: "Ich wollte kein Tech-Mensch werden. Ich wollte Schmuck machen. Mit Gwinn stand mein Shop in 3 Tagen, ohne dass ich etwas Neues lernen musste. Die KI beantwortet die Fragen, die ich früher in Instagram-DMs beantwortet habe — etwa ob meine Perlen Süsswasserperlen sind oder was der Versand nach Deutschland kostet.",
            cite: `${founderName}, Gründerin von ${maker.brand}, Zürich`,
          } as Block,
        ]
      : [
          {
            type: "quote",
            text: "Ich habe nur an Märkten verkauft — und hatte innert weniger Tage meine erste Online-Bestellung, ohne eine neue Plattform zu lernen oder jemanden einzustellen.",
            cite: "Pilot-Macherin, Zürich (Testimonial bis zur Freigabe zurückgehalten)",
          } as Block,
        ]),
    { type: "h2", text: "Die wichtigsten Erkenntnisse" },
    {
      type: "ol",
      items: [
        "Klein anfangen. 15 Produkte, nicht 150. Launchen, dann iterieren.",
        "Ihr bestehendes Publikum konvertiert zuerst. Onlineverkäufe beginnen mit Menschen, die Sie an Märkten getroffen haben.",
        "Der KI-Chatbot baut Features, er ist nicht nur Support. Aus Gesprächen werden Produktverbesserungen.",
        "5 Stunden Einrichtung, nicht 5 Wochen. Dauert es länger, ist das Werkzeug das falsche.",
      ],
    },
  ],
  schema: storySchema({
    headline: caseStudyDeTitle,
    description: "Von Weihnachtsmärkten zu Onlineverkäufen in 30 Tagen.",
    lang: "de",
  }),
};

/** All Launch Diary posts in German, series order (parity with DIARY_POSTS). */
export const DIARY_POSTS_DE: Article[] = [diary1, diary2, diary3];

/** The case study in German (parity with CASE_STUDY). */
export const CASE_STUDY_DE: Article = caseStudy;
