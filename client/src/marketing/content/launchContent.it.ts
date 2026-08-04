/**
 * Italian translation of the Launch Diary series + case study.
 *
 * STRUCTURAL PARITY CONTRACT with launchContent.ts (the English source of
 * truth): same slugs, same kinds, same dates, same image srcs and hrefs, and
 * a 1:1 block count / block-type sequence per article. Only prose is
 * localized. The reader is addressed with the formal "Lei".
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
/** Gate-aware brand reference with an Italian-language anonymous fallback. */
const BRAND = maker.founder ? maker.brand : "il nostro studio pilota";
const founderName = maker.founder ?? "l'artigiana";

const diary1: Article = {
  slug: "launch-diary-1",
  kind: "diary",
  eyebrow: "Diario di lancio · Parte 1 di 4",
  title: "Diario di lancio #1: La preparazione",
  metaTitle: maker.founder
    ? `Come ${maker.founder} ha creato il primo negozio online di ${maker.brand} | Diario di lancio Zolto`
    : "Come un'artigiana di Zurigo ha creato il suo primo negozio online | Diario di lancio Zolto",
  metaDescription: maker.founder
    ? `Segua ${maker.founder}, fondatrice di ${maker.brand}, gioielli di perle a Zurigo, mentre apre il suo primo negozio online su Zolto. Processo reale, tempi reali, niente growth hack.`
    : "Segua un'artigiana di gioielli di perle a Zurigo mentre apre il suo primo negozio online su Zolto. Processo reale, tempi reali, niente growth hack.",
  dek: "Dai mercatini di Natale a un primo negozio online — Parte 1: come si comincia.",
  datePublished: BLOG_POSTS[0].lastmod,
  dateModified: BLOG_POSTS[0].lastmod,
  readingTime: "4 min di lettura",
  keywords: [
    "aprire un negozio di gioielli online",
    "gioielli di perle Zurigo",
    "cassa per artigiani",
    "negozio online per l'artigianato",
  ],
  blocks: [
    {
      type: "p",
      text: `${BRAND} crea gioielli. Niente produzione di massa, niente dropshipping — pezzi fatti a mano con perle e pietre semipreziose, venduti ai mercatini di Natale e alle Chilbi lungo la Gold Coast di Zurigo. Circa 60 vendite al mese, tutte di persona. Nessun negozio online. Solo un'artigiana e il suo mestiere.`,
    },
    {
      type: "p",
      text: 'Questa è la storia di come è nato quel primo negozio online. Non un caso di growth hacking. Non un racconto "come ho guadagnato sei cifre". Solo un\'artigiana vera che capisce come vendere online senza diventare un\'esperta di tecnologia.',
    },
    { type: "h2", text: "L'artigiana" },
    {
      type: "p",
      text: "Il laboratorio vende gioielli ai mercati da circa un anno. Collane, orecchini, bracciali — ogni pezzo è unico, costruito attorno a perle e pietre semipreziose. La scena è familiare: tavolo pieghevole, espositore in velluto, lettore di carte. Circa 60 vendite al mese, per lo più a clienti affezionati che tornano alle stesse fiere sul lago di Zurigo.",
    },
    {
      type: "p",
      text: `Il problema non sono le vendite. È la portata. Ogni mercato è un pubblico nuovo. Chi ha comprato una collana di perle a un mercatino di Natale a Seefeld non ha modo di dire a un'amica di Enge dove trovare ${BRAND} online. Finora la risposta era: "Mi trova alla prossima Chilbi."`,
    },
    { type: "h2", text: "La decisione" },
    {
      type: "p",
      text: 'La decisione di andare online non riguardava la crescita. Riguardava l\'accessibilità. I clienti continuavano a chiedere: "Avete un sito?" La risposta era sempre no. Alla terza volta diventa imbarazzante.',
    },
    { type: "p", text: "I requisiti erano semplici:" },
    {
      type: "ul",
      items: [
        "Mostrare i gioielli online",
        "Permettere di comprare senza dover mandare un messaggio WhatsApp",
        "Tenere lo stesso inventario della cassa (niente doppie vendite alla Chilbi)",
        "Non dover imparare Shopify né assumere uno sviluppatore",
      ],
    },
    { type: "h2", text: "La configurazione" },
    {
      type: "p",
      text: "Giorno 1 — Caricamento dei prodotti. Il laboratorio è partito con 15 prodotti. Non l'intero catalogo — solo i pezzi che vengono bene in foto e si vendono con costanza. Una foto grezza da telefono per pezzo, niente studio; l'IA di Zolto trasforma quello scatto unico in un'immagine prodotto o lifestyle, e le descrizioni IA arrivano all'80% del risultato prima di una revisione umana per il tono.",
    },
    {
      type: "note",
      text: "Trasparenza: in ogni immagine rielaborata dall'IA il gioiello è reale — tutto ciò che lo circonda (sfondo, styling, eventuali modelle o scene) è generato dall'IA, e questo è dichiarato su ogni immagine. Non è autenticità costruita; è una piccola artigiana che dice apertamente quale strumento ha usato.",
    },
    {
      type: "beforeAfter",
      before: {
        src: "/launch/pearl-halo-set-raw.jpg",
        alt: `Foto originale da telefono di un set orecchini e ciondolo halo di perle di ${BRAND} su un semplice panno`,
      },
      after: {
        src: "/launch/pearl-halo-set-styled.jpg",
        alt: "Lo stesso set halo di perle su uno sfondo di marmo e rose generato dall'IA",
      },
      beforeLabel: "Foto da telefono",
      afterLabel: "Stile IA",
      caption:
        "Esattamente lo stesso set halo di perle: l'unica foto da telefono dell'artigiana (a sinistra) e l'immagine prodotto rielaborata dall'IA (a destra). Il gioiello è il pezzo reale; solo lo sfondo è generato dall'IA.",
    },
    {
      type: "p",
      text: "Tempo impiegato: meno di un'ora. Il vecchio collo di bottiglia — prenotare un fotografo, una modella o affittare uno studio per qualche scatto — non esiste più.",
    },
    {
      type: "beforeAfter",
      before: {
        src: "/launch/baroque-fringe-earrings-raw.jpg",
        alt: `Foto originale da telefono di orecchini a frangia con perle barocche di ${BRAND} appoggiati su roccia vulcanica`,
      },
      after: {
        src: "/launch/baroque-fringe-earrings-on-model.jpg",
        alt: "Gli stessi orecchini a frangia con perle barocche indossati da una modella generata dall'IA",
      },
      beforeLabel: "Foto da telefono",
      afterLabel: "IA su modella",
      caption:
        "Gli stessi orecchini, un passo oltre: una foto da telefono diventa uno scatto indossato, senza modella prenotata né studio affittato. Gli orecchini sono il pezzo reale; la modella e la scena sono generate dall'IA.",
    },
    {
      type: "p",
      text: "Giorno 2 — Configurazione del negozio. Spedizione a tariffa fissa (CHF 8 Svizzera, CHF 15 UE), Stripe collegato prima in modalità test, colori del negozio abbinati al marchio e una pagina Chi siamo che racconta la storia dell'artigiana.",
    },
    {
      type: "p",
      text: "Giorno 3 — Sincronizzazione della cassa. Il pezzo decisivo. L'inventario della cassa (ciò che è disponibile ai mercati) doveva sincronizzarsi con il negozio online, così un bracciale venduto a una Chilbi non risulta ancora disponibile online dieci minuti dopo. Zolto lo gestisce in automatico: un solo database di inventario, due canali di vendita. Tempo impiegato: 30 minuti. Ha semplicemente funzionato.",
    },
    { type: "h2", text: "Che cosa abbiamo imparato" },
    {
      type: "ol",
      items: [
        "Partire in piccolo. 15 prodotti, non 150. Lanciare con tutto paralizza.",
        "Le descrizioni IA fanno risparmiare tempo, ma vanno riviste. L'IA ha colto materiali e dimensioni; le mancava il tono emotivo. È stato aggiunto a mano.",
        "La sincronizzazione della cassa non è negoziabile. Per chi vende online e di persona è la funzione che evita i disastri.",
        "La fotografia era il collo di bottiglia. L'IA lo ha eliminato — a una frazione del costo di fotografo, modella o studio che un'artigiana di queste dimensioni non avrebbe comunque mai ingaggiato.",
      ],
    },
    { type: "h2", text: "I prossimi passi" },
    {
      type: "p",
      text: 'Il negozio è configurato. I prodotti sono caricati. I pagamenti funzionano. Prossimo passo: il soft launch — condividere il link con i clienti esistenti via Instagram e WhatsApp. Niente pubblicità. Niente promozioni. Solo: "Ehi, finalmente siamo online."',
    },
  ],
  next: {
    label: "Diario di lancio #2: Si va online",
    href: `${BLOG_BASE}/launch-diary-2`,
  },
  schema: articleSchema({
    headline: "Diario di lancio #1: La preparazione",
    description:
      "Come un'artigiana di gioielli di perle a Zurigo ha creato il suo primo negozio online — processo reale, tempi reali.",
    slug: "launch-diary-1",
    datePublished: BLOG_POSTS[0].lastmod,
    dateModified: BLOG_POSTS[0].lastmod,
    lang: "it",
  }),
};

const diary2: Article = {
  slug: "launch-diary-2",
  kind: "diary",
  eyebrow: "Diario di lancio · Parte 2 di 4",
  title: "Diario di lancio #2: Si va online",
  metaTitle: `Si va online: il primo giorno ${maker.founder ? `di ${maker.brand}` : "di un negozio di gioielli di Zurigo"} | Diario di lancio Zolto`,
  metaDescription: `Giorno 1 ${maker.founder ? `di ${maker.brand}` : "di un negozio di gioielli di perle"} online a Zurigo: 34 visitatori, 0 ordini. Giorno 2: la prima vendita. La vera storia di un lancio online.`,
  dek: 'Parte 2: il passaggio silenzioso da "non disponibile" a "eccolo" — e il primo ordine.',
  datePublished: BLOG_POSTS[1].lastmod,
  dateModified: BLOG_POSTS[1].lastmod,
  readingTime: "5 min di lettura",
  keywords: [
    "lancio negozio di gioielli Zurigo",
    "primo ordine online",
    "dal mercatino di Natale all'online",
    "gioielli di perle Svizzera",
  ],
  blocks: [
    {
      type: "p",
      text: 'Ieri il negozio è stato configurato. Oggi è andato online. Non con una campagna di marketing. Non con una festa di lancio. Con una sola storia Instagram: "Finalmente abbiamo un sito. Link in bio."',
    },
    {
      type: "p",
      text: 'Ecco che cosa succede davvero quando un\'artigiana va online. Nessun momento virale. Solo un passaggio silenzioso da "non disponibile" a "eccolo".',
    },
    { type: "h2", text: "Il momento" },
    {
      type: "p",
      text: "Il negozio è andato online alle 10:00. Nel giro di un'ora è arrivato il primo visitatore — dalla storia Instagram, non da una pubblicità. Ha guardato tre collane di perle, ne ha aggiunta una al carrello e ha chiuso la scheda. Prima lezione: la maggior parte dei visitatori non compra alla prima visita. È normale. Il negozio online è il passo uno; costruire fiducia è il passo due.",
    },
    { type: "h2", text: "Il traffico (giorno 1)" },
    {
      type: "table",
      head: ["Fonte", "Visitatori", "Ordini", "Note"],
      rows: [
        [
          "Instagram (storia + link in bio)",
          "23",
          "0",
          "Clienti esistenti incuriositi",
        ],
        ["WhatsApp (condivisioni dirette)", "8", "0", "Amici e famiglia"],
        [
          "Diretto (URL digitato)",
          "3",
          "0",
          "Probabilmente l'artigiana che testava",
        ],
        ["Totale", "34", "0", "Il giorno 1 conta la presenza, non le vendite"],
      ],
    },
    {
      type: "p",
      text: "Zero ordini il giorno 1. Non è un fallimento. Un negozio nuovo senza storia SEO, senza pubblicità e con un piccolo seguito su Instagram riceve visitatori, non conversioni. Il compito del giorno 1 è esistere.",
    },
    { type: "h2", text: "Che cosa ha funzionato" },
    {
      type: "ol",
      items: [
        "La storia Instagram ha portato la maggior parte del traffico. Il pubblico esistente — costruito ai mercati e alle Chilbi lungo la Gold Coast — è su Instagram. È lì che l'annuncio deve stare.",
        "Le foto dei prodotti hanno contato. Chi ha cliccato ha passato in media 2 minuti sulle pagine prodotto.",
        "La pagina Chi siamo ha ricevuto un traffico inatteso. Il 40% dei visitatori l'ha letta prima di guardare i prodotti. Le persone vogliono sapere da chi comprano.",
      ],
    },
    { type: "h2", text: "Che cosa non ha funzionato" },
    {
      type: "ol",
      items: [
        "Nessuno ha usato il chatbot IA il giorno 1. Era visibile ma non richiesto. I chatbot si usano quando si hanno domande, non quando si sta solo guardando.",
        "La griglia mobile era leggermente disallineata su alcuni telefoni Android. Sistemata entro il giorno 2.",
        "Le spese di spedizione non erano abbastanza chiare. Due visitatori hanno riempito il carrello senza completare l'acquisto.",
      ],
    },
    { type: "h2", text: "Il ciclo delle correzioni" },
    {
      type: "p",
      text: 'È qui che il modello guidato dall\'IA mostra il suo valore. Il problema della chiarezza sulla spedizione è andato al chatbot IA: "Le persone non completano l\'acquisto. Credo non conoscano le spese di spedizione." Il chatbot ha proposto di mostrare le spese di spedizione sulla pagina prodotto. Approvato. In negozio in 10 minuti. Nessun ticket. Nessuna e-mail. Nessun "lo mettiamo in backlog".',
    },
    { type: "h2", text: "Giorno 2: il primo ordine" },
    {
      type: "p",
      text: "Alle 9:47 del giorno 2 è arrivato il primo ordine — una collana di perle d'acqua dolce, CHF 65 + CHF 8 di spedizione. La cliente aveva incontrato l'artigiana a un mercatino di Natale tre settimane prima, aveva perso il biglietto da visita e si era ricordata il nome Instagram. Il negozio esiste esattamente per questo: non per gli acquisti d'impulso degli sconosciuti, ma per la persona che L'ha incontrata una volta, voleva comprare più tardi e finalmente ha un modo per farlo.",
    },
    {
      type: "p",
      text: "Tempo dal lancio del negozio al primo ordine: 23 ore e 47 minuti.",
    },
    { type: "h2", text: "Che cosa abbiamo imparato" },
    {
      type: "ol",
      items: [
        "Lanciare senza aspettative. Il traffico del giorno 1 è curiosità, non conversione.",
        "Il pubblico esistente converte per primo. Le vendite online cominciano dalle persone che L'hanno conosciuta di persona.",
        "Le piccole correzioni contano. Le spese di spedizione sulla pagina prodotto hanno probabilmente salvato 2–3 carrelli abbandonati.",
        "Il chatbot IA costruisce funzionalità, non fa solo assistenza. La correzione sulla spedizione è nata da una conversazione, non da una segnalazione di bug.",
      ],
    },
  ],
  next: {
    label: "Diario di lancio #3: Il primo mese online",
    href: `${BLOG_BASE}/launch-diary-3`,
  },
  schema: articleSchema({
    headline: "Diario di lancio #2: Si va online",
    description:
      "Il primo giorno online di un negozio di gioielli di perle di Zurigo: 34 visitatori, 0 ordini — poi la prima vendita il giorno 2.",
    slug: "launch-diary-2",
    datePublished: BLOG_POSTS[1].lastmod,
    dateModified: BLOG_POSTS[1].lastmod,
    lang: "it",
  }),
};

const diary3: Article = {
  slug: "launch-diary-3",
  kind: "diary",
  eyebrow: "Diario di lancio · Parte 3 di 4",
  title: "Diario di lancio #3: Il primo mese online",
  metaTitle:
    "Il primo mese online: 12 ordini, numeri onesti | Diario di lancio Zolto",
  metaDescription: `A un mese dal lancio online, ${maker.founder ? maker.brand : "un'artigiana di gioielli di perle a Zurigo"} condivide numeri veri: 12 ordini, CHF 61 di media, 81% di richieste risolte dal chatbot IA. Niente growth hack.`,
  dek: "Parte 3: i numeri onesti del primo mese — 12 ordini online, CHF 61 di media, e che cosa li ha generati.",
  datePublished: BLOG_POSTS[2].lastmod,
  dateModified: BLOG_POSTS[2].lastmod,
  readingTime: "6 min di lettura",
  keywords: [
    "primo mese negozio online",
    "numeri di una gioielleria artigianale",
    "vendita di gioielli fatti a mano",
    "attività artigiana Zurigo",
  ],
  blocks: [
    {
      type: "p",
      text: "È passato un mese dal lancio del negozio. È ora di numeri onesti — niente highlights selezionati, il quadro completo.",
    },
    { type: "h2", text: "Il punto di partenza" },
    {
      type: "p",
      text: "Prima del negozio: ~60 vendite offline al mese, 0 online, una portata limitata a chi passava davanti al tavolo. Dopo un mese: ~55 offline (un lieve calo, alcuni affezionati sono passati all'online), 12 ordini online e una portata che ora copre la Svizzera più 2 ordini UE dalla Germania.",
    },
    {
      type: "p",
      text: "Vendite totali: 67, da 60. Niente di clamoroso. Ma il mix è cambiato: 82% offline, 18% online. È un inizio.",
    },
    { type: "h2", text: "Il mese 1 nel dettaglio" },
    {
      type: "table",
      head: ["Settimana", "Ordini online", "Valore medio ordine", "Traffico", "Note"],
      rows: [
        [
          "Settimana 1 (lancio)",
          "3",
          "CHF 58",
          "156 visitatori",
          "Effetto Instagram",
        ],
        ["Settimana 2", "2", "CHF 52", "89 visitatori", "Quiete dopo il lancio"],
        [
          "Settimana 3",
          "4",
          "CHF 71",
          "134 visitatori",
          "Post sulla nuova collezione di perle",
        ],
        ["Settimana 4", "3", "CHF 62", "102 visitatori", "Stabile"],
        [
          "Totale mese",
          "12",
          "CHF 61",
          "481 visitatori",
          "2,5% di conversione",
        ],
      ],
    },
    { type: "h2", text: "Che cosa ha generato le vendite" },
    {
      type: "table",
      head: ["Fonte", "Ordini", "% delle vendite online"],
      rows: [
        ["Instagram (organico)", "7", "58%"],
        ["Diretto / di ritorno", "3", "25%"],
        ["Passaparola (link condivisi)", "2", "17%"],
        ["Ricerca / Google", "0", "0%"],
      ],
    },
    {
      type: "p",
      text: "La ricerca è allo 0% perché il negozio non ha ancora una storia SEO. È previsto. Il mese 1 serve a dimostrare che il negozio funziona. I mesi 2–3 riguarderanno SEO e contenuti — è esattamente lo scopo di questa serie.",
    },
    { type: "h2", text: "Il chatbot IA: i numeri del mese 1" },
    {
      type: "table",
      head: ["Indicatore", "Valore"],
      rows: [
        ["Conversazioni totali", "47"],
        ["Risolte senza aiuto umano", "38 (81%)"],
        ["Passate all'artigiana", "9 (19%)"],
        ["Richieste di funzionalità", "4"],
        ["Tempo medio di risposta", "3,2 secondi"],
      ],
    },
    { type: "h2", text: "Che cosa è cambiato nel prodotto" },
    {
      type: "p",
      text: "Nel mese 1 sono state costruite quattro funzionalità, tutte nate da conversazioni con il chatbot — il cliente chiede, l'IA costruisce, online in ore, non in sprint.",
    },
    {
      type: "table",
      head: ["Giorno", "Richiesta", "Che cosa è stato costruito", "Impatto"],
      rows: [
        [
          "3",
          "Le spese di spedizione non sono chiare",
          "Spese di spedizione sulla pagina prodotto",
          "Meno carrelli abbandonati",
        ],
        [
          "8",
          "Vedere le perle da più angolazioni",
          "Zoom sulle immagini prodotto",
          "+15% di tempo sulle pagine prodotto",
        ],
        [
          "15",
          "Fate confezioni regalo?",
          "Opzione confezione regalo (CHF 3)",
          "3 ordini l'hanno usata",
        ],
        [
          "22",
          "Il menu mobile è difficile da toccare",
          "Aree di tocco più grandi",
          "Conversione mobile in lieve crescita",
        ],
      ],
    },
    { type: "h2", text: "Il verdetto onesto" },
    {
      type: "p",
      text: "Il mese 1 non ha trasformato l'attività — 12 ordini online in aggiunta ai 55 offline sono un incremento, non un salto. Ma la portata è passata da zero-fuori-Zurigo a 12 ordini di cui 2 dalla Germania; pagamenti, spedizioni e sincronizzazione dell'inventario hanno retto; e ora ci sono dati veri: 2,5% di conversione, CHF 61 di valore medio, Instagram come prima fonte.",
    },
    {
      type: "p",
      text: "Il mese 1 doveva dimostrare che il negozio funziona. Il mese 2 dovrà dimostrare che può crescere.",
    },
  ],
  next: {
    label: "Il caso studio: in 30 giorni dal banco del mercato all'online",
    href: STORY_PATH,
  },
  schema: articleSchema({
    headline: "Diario di lancio #3: Il primo mese online",
    description:
      "I numeri onesti del primo mese di un negozio di gioielli di perle di Zurigo: 12 ordini, CHF 61 di media, 81% di richieste risolte dal chatbot IA.",
    slug: "launch-diary-3",
    datePublished: BLOG_POSTS[2].lastmod,
    dateModified: BLOG_POSTS[2].lastmod,
    lang: "it",
  }),
};

const caseStudyItTitle = maker.founder
  ? `Il caso studio del lancio di ${maker.brand}`
  : "Il caso studio del lancio del nostro studio pilota";

const caseStudy: Article = {
  slug: STORY_SLUG,
  kind: "story",
  title: caseStudyItTitle,
  metaTitle: `${maker.founder ? `Caso studio ${maker.brand}` : "Caso studio"}: dai mercatini di Natale alle vendite online in 30 giorni | Zolto`,
  metaDescription: `Come ${maker.founder ? `${maker.founder}, fondatrice di ${maker.brand},` : "un'artigiana di gioielli di perle a Zurigo"} ha aperto il suo primo negozio online in 3 giorni e realizzato 12 vendite online nel primo mese, su Zolto.`,
  dek: "Da ~60 vendite offline al mese ai mercatini di Natale a una gioielleria ibrida online-offline in 30 giorni.",
  datePublished: CASE_STUDY.datePublished,
  dateModified: CASE_STUDY.dateModified,
  readingTime: "5 min di lettura",
  keywords: [
    "gioielli fatti a mano Svizzera",
    "sistema di cassa per artigiani",
    "gioielli di perle Zurigo",
    "negozio online per artigiani",
  ],
  blocks: [
    { type: "h2", text: "L'artigiana" },
    {
      type: "p",
      text: `${BRAND} è un marchio di gioielli di Zurigo: pezzi fatti a mano con perle e pietre semipreziose — collane, orecchini, bracciali — venduti ai mercatini di Natale e alle Chilbi lungo la Gold Coast di Zurigo. Prima di Zolto tutta l'attività era offline: circa 60 vendite al mese, tutte di persona, nessun negozio online.`,
    },
    { type: "h2", text: "La sfida" },
    {
      type: "p",
      text: "Il problema non era il volume di vendite — erano la portata e l'accessibilità. I clienti continuavano a chiedere un sito. Ogni mercato era un pubblico nuovo, senza modo di costruire una relazione duratura, senza modo per i clienti esistenti di consigliare il negozio online, e con un inventario tenuto per lo più a memoria.",
    },
    {
      type: "p",
      text: "L'artigiana non è un'esperta di tecnologia e non voleva imparare Shopify, pagare uno sviluppatore o passare ore sul software. L'obiettivo era fare gioielli, non gestire strumenti.",
    },
    { type: "h2", text: "La soluzione — pronta in 3 giorni" },
    {
      type: "table",
      head: ["Giorno", "Attività", "Tempo impiegato"],
      rows: [
        ["1", "Caricare 15 prodotti + descrizioni IA", "3 ore"],
        ["2", "Configurare negozio, spedizioni, pagamenti", "1 ora"],
        [
          "3",
          "Sincronizzare l'inventario della cassa con il negozio online",
          "30 minuti",
        ],
      ],
      caption:
        "Tempo totale di configurazione: ~5 ore — per lo più fotografia, non software.",
    },
    {
      type: "p",
      text: "Funzioni chiave usate: descrizioni prodotto IA (generate dalle foto, tono rivisto in ~5 minuti ciascuna); sincronizzazione cassa + online (un solo inventario per entrambi i canali: una vendita alla Chilbi aggiorna lo stock online e viceversa); e il chatbot IA (risponde a domande su tipi di perle, spedizioni e misure — e trasforma le richieste in funzionalità consegnate).",
    },
    {
      type: "figure",
      image: {
        src: "/launch/gold-fringe-earrings-styled.jpg",
        alt: `Orecchini a frangia con perle barocche montate in oro di ${BRAND} su uno sfondo di marmo generato dall'IA`,
      },
      caption:
        "Un'immagine prodotto pronta per il negozio da un'unica foto dell'artigiana — gli orecchini sono il pezzo reale; lo sfondo è generato dall'IA e dichiarato come tale.",
    },
    { type: "h2", text: "I risultati (primo mese)" },
    {
      type: "table",
      head: ["Indicatore", "Prima", "Dopo 30 giorni"],
      rows: [
        ["Vendite offline", "~60/mese", "~55/mese"],
        ["Vendite online", "0", "12 ordini"],
        ["Vendite totali", "~60/mese", "~67/mese"],
        ["Portata clienti", "Mercati di Zurigo", "Svizzera + Germania"],
        ["Gestione inventario", "A memoria", "Sincronizzazione in tempo reale"],
        ["Carico di assistenza", "Tutto sull'artigiana", "81% gestito dall'IA"],
      ],
    },
    {
      type: "p",
      text: "La prima cliente online aveva incontrato l'artigiana a un mercatino di Natale tre settimane prima, aveva perso il biglietto da visita e si era ricordata il nome Instagram. Il negozio esiste per le persone che La conoscono già — dà loro solo un modo per comprare quando Lei non è a un mercato.",
    },
    { type: "h2", text: "Che cosa è stato costruito dai feedback" },
    {
      type: "table",
      head: ["Giorno", "Il cliente ha detto", "Che cosa è stato costruito", "Tempo di rilascio"],
      rows: [
        [
          "3",
          "Le spese di spedizione non sono chiare",
          "Spese di spedizione sulla pagina prodotto",
          "10 minuti",
        ],
        [
          "8",
          "Vedere le perle da più angolazioni",
          "Zoom sulle immagini prodotto",
          "2 ore",
        ],
        [
          "15",
          "Vorrei la confezione regalo",
          "Opzione confezione regalo (CHF 3)",
          "1 ora",
        ],
        [
          "22",
          "Il menu mobile è difficile da toccare",
          "Aree di tocco più grandi",
          "30 minuti",
        ],
      ],
      caption: "4 funzionalità costruite in ~4 ore, non in 4 sprint.",
    },
    ...(CONTENT_RELEASE_SIGNED
      ? [
          { type: "h2", text: "La prospettiva dell'artigiana" } as Block,
          {
            type: "quote",
            text: "Non volevo diventare un'esperta di tecnologia. Volevo fare gioielli. Con Zolto ho aperto il negozio in 3 giorni senza imparare nulla di nuovo. L'IA gestisce le domande a cui rispondevo nei DM di Instagram — per esempio se le mie perle sono d'acqua dolce o quanto costa la spedizione in Germania.",
            cite: `${founderName}, fondatrice di ${maker.brand}, Zurigo`,
          } as Block,
        ]
      : [
          {
            type: "quote",
            text: "Sono passata dal vendere solo ai mercati al mio primo ordine online in pochi giorni — senza imparare una nuova piattaforma né assumere nessuno.",
            cite: "Artigiana pilota, Zurigo (testimonianza in attesa di autorizzazione)",
          } as Block,
        ]),
    { type: "h2", text: "Punti chiave" },
    {
      type: "ol",
      items: [
        "Partire in piccolo. 15 prodotti, non 150. Lanciare, poi iterare.",
        "Il Suo pubblico esistente converte per primo. Le vendite online cominciano dalle persone incontrate ai mercati.",
        "Il chatbot IA costruisce funzionalità, non fa solo assistenza. Le conversazioni diventano miglioramenti del prodotto.",
        "5 ore di configurazione, non 5 settimane. Se serve di più, lo strumento è sbagliato.",
      ],
    },
  ],
  schema: storySchema({
    headline: caseStudyItTitle,
    description: "Dai mercatini di Natale alle vendite online in 30 giorni.",
    lang: "it",
  }),
};

/** All Launch Diary posts in Italian, series order (parity with DIARY_POSTS). */
export const DIARY_POSTS_IT: Article[] = [diary1, diary2, diary3];

/** The case study in Italian (parity with CASE_STUDY). */
export const CASE_STUDY_IT: Article = caseStudy;
