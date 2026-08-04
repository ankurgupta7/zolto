/**
 * French translation of the Launch Diary series + case study.
 *
 * STRUCTURAL PARITY CONTRACT with launchContent.ts (the English source of
 * truth): same slugs, same kinds, same dates, same image srcs and hrefs, and
 * a 1:1 block count / block-type sequence per article. Only prose is
 * localized. The reader is addressed with the formal "vous".
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
/** Gate-aware brand reference with a French-language anonymous fallback. */
const BRAND = maker.founder ? maker.brand : "notre atelier pilote";
const founderName = maker.founder ?? "la créatrice";

const diary1: Article = {
  slug: "launch-diary-1",
  kind: "diary",
  eyebrow: "Journal de lancement · Partie 1 sur 4",
  title: "Journal de lancement #1 : La mise en place",
  metaTitle: maker.founder
    ? `Comment ${maker.founder} a créé la première boutique en ligne de ${maker.brand} | Journal de lancement Zolto`
    : "Comment une créatrice zurichoise a créé sa première boutique en ligne | Journal de lancement Zolto",
  metaDescription: maker.founder
    ? `Suivez ${maker.founder}, fondatrice de ${maker.brand}, bijoux en perles à Zurich, pendant qu'elle crée sa première boutique en ligne sur Zolto. Vrai processus, vrai calendrier, zéro growth hack.`
    : "Suivez une créatrice de bijoux en perles à Zurich pendant qu'elle crée sa première boutique en ligne sur Zolto. Vrai processus, vrai calendrier, zéro growth hack.",
  dek: "Des marchés de Noël à une première boutique en ligne — Partie 1 : le démarrage.",
  datePublished: BLOG_POSTS[0].lastmod,
  dateModified: BLOG_POSTS[0].lastmod,
  readingTime: "4 min de lecture",
  keywords: [
    "lancer une boutique de bijoux en ligne",
    "bijoux en perles Zurich",
    "caisse pour artisans",
    "boutique en ligne artisanat",
  ],
  blocks: [
    {
      type: "p",
      text: `${BRAND} fait des bijoux. Pas de production de masse, pas de dropshipping — des pièces faites main en perles et pierres semi-précieuses, vendues sur les marchés de Noël et les Chilbis de la Gold Coast zurichoise. Environ 60 ventes par mois, toutes en personne. Pas de boutique en ligne. Juste une créatrice et son artisanat.`,
    },
    {
      type: "p",
      text: "Voici l'histoire de la création de cette première boutique en ligne. Pas une étude de cas growth hacking. Pas un récit « comment j'ai gagné six chiffres ». Juste une vraie créatrice qui cherche comment vendre en ligne sans devenir une pro de la tech.",
    },
    { type: "h2", text: "La créatrice" },
    {
      type: "p",
      text: "L'atelier vend des bijoux sur les marchés depuis environ un an. Colliers, boucles d'oreilles, bracelets — chaque pièce est unique, construite autour de perles et de pierres semi-précieuses. Le décor est familier : table pliante, présentoir en velours, terminal de carte. Environ 60 ventes par mois, surtout à des habitués qui reviennent aux mêmes foires au bord du lac de Zurich.",
    },
    {
      type: "p",
      text: `Le problème, ce ne sont pas les ventes. C'est la portée. Chaque marché est un nouveau public. Impossible pour quelqu'un qui a acheté un collier de perles à un marché de Noël à Seefeld de dire à une amie d'Enge où trouver ${BRAND} en ligne. Jusqu'ici, la réponse était : « Retrouvez-moi à la prochaine Chilbi. »`,
    },
    { type: "h2", text: "La décision" },
    {
      type: "p",
      text: "La décision de passer en ligne n'était pas une question de croissance, mais d'accessibilité. Les clients demandaient sans cesse : « Vous avez un site ? » La réponse était toujours non. Au bout de la troisième fois, cela devient gênant.",
    },
    { type: "p", text: "Les exigences étaient simples :" },
    {
      type: "ul",
      items: [
        "Montrer les bijoux en ligne",
        "Permettre d'acheter sans devoir envoyer un message WhatsApp",
        "Garder le même stock que la caisse (pas de double vente à une Chilbi)",
        "Ne pas devoir apprendre Shopify ni engager un développeur",
      ],
    },
    { type: "h2", text: "La mise en place" },
    {
      type: "p",
      text: "Jour 1 — Mise en ligne des produits. L'atelier a commencé avec 15 produits. Pas tout le catalogue — seulement les pièces qui se photographient bien et se vendent régulièrement. Une photo brute au téléphone par pièce, pas de studio ; l'IA de Zolto transforme ce seul cliché en image produit ou lifestyle, et les descriptions générées par l'IA font environ 80% du chemin avant une relecture humaine pour le ton.",
    },
    {
      type: "note",
      text: "Transparence : dans chaque image restylée par l'IA, le bijou est réel — tout ce qui l'entoure (fond, mise en scène, éventuel modèle) est généré par l'IA, et cela est indiqué sur chacune de ces images. Ce n'est pas de l'authenticité mise en scène ; c'est une petite créatrice qui dit franchement quel outil elle a utilisé.",
    },
    {
      type: "beforeAfter",
      before: {
        src: "/launch/pearl-halo-set-raw.jpg",
        alt: `Photo originale au téléphone d'un ensemble boucles d'oreilles et pendentif halo de perles de ${BRAND} sur un simple tissu`,
      },
      after: {
        src: "/launch/pearl-halo-set-styled.jpg",
        alt: "Le même ensemble halo de perles sur un fond marbre et roses généré par l'IA",
      },
      beforeLabel: "Photo au téléphone",
      afterLabel: "Stylisé par l'IA",
      caption:
        "Exactement le même ensemble halo de perles : la photo unique prise au téléphone par la créatrice (à gauche) et l'image produit stylisée par l'IA (à droite). Le bijou est la pièce réelle ; seul le fond est généré par l'IA.",
    },
    {
      type: "p",
      text: "Temps passé : moins d'une heure. L'ancien goulot d'étranglement — réserver un photographe ou un modèle, louer un studio pour quelques photos produit — a disparu.",
    },
    {
      type: "beforeAfter",
      before: {
        src: "/launch/baroque-fringe-earrings-raw.jpg",
        alt: `Photo originale au téléphone de boucles d'oreilles à franges en perles baroques de ${BRAND} posées sur de la roche volcanique`,
      },
      after: {
        src: "/launch/baroque-fringe-earrings-on-model.jpg",
        alt: "Les mêmes boucles d'oreilles à franges en perles baroques portées par un modèle généré par l'IA",
      },
      beforeLabel: "Photo au téléphone",
      afterLabel: "IA sur modèle",
      caption:
        "Les mêmes boucles d'oreilles, un cran plus loin : une photo au téléphone devient une prise de vue portée, sans modèle réservé ni studio loué. Les boucles d'oreilles sont la pièce réelle ; le modèle et la scène sont générés par l'IA.",
    },
    {
      type: "p",
      text: "Jour 2 — Configuration de la boutique. Livraison forfaitaire (CHF 8 Suisse, CHF 15 UE), Stripe connecté d'abord en mode test, couleurs de la boutique accordées à la marque, et une page À propos qui raconte l'histoire de la créatrice.",
    },
    {
      type: "p",
      text: "Jour 3 — Synchronisation de la caisse. La pièce maîtresse. Le stock de la caisse (ce qui est disponible sur les marchés) devait se synchroniser avec la boutique en ligne, pour qu'un bracelet vendu à une Chilbi ne s'affiche pas encore comme disponible en ligne dix minutes plus tard. Zolto gère cela automatiquement : une seule base de stock, deux canaux de vente. Temps passé : 30 minutes. Cela a simplement fonctionné.",
    },
    { type: "h2", text: "Ce que nous avons appris" },
    {
      type: "ol",
      items: [
        "Commencer petit. 15 produits, pas 150. Lancer avec tout crée la paralysie.",
        "Les descriptions IA font gagner du temps, mais il faut les relire. L'IA a saisi les matériaux et les dimensions ; le ton émotionnel manquait. Il a été rajouté à la main.",
        "La synchronisation de la caisse n'est pas négociable. Pour qui vend en ligne et en personne, c'est la fonction qui évite les catastrophes.",
        "La photo était le goulot d'étranglement. L'IA l'a supprimé — pour une fraction du coût d'un photographe, d'un modèle ou d'un studio qu'une créatrice de cette taille n'aurait de toute façon jamais engagés.",
      ],
    },
    { type: "h2", text: "La suite" },
    {
      type: "p",
      text: "La boutique est configurée. Les produits sont en ligne. Les paiements fonctionnent. Prochaine étape : le lancement en douceur — partager le lien avec les clients existants via Instagram et WhatsApp. Pas de pub. Pas de promotion. Juste : « Ça y est, nous sommes en ligne. »",
    },
  ],
  next: {
    label: "Journal de lancement #2 : La mise en ligne",
    href: `${BLOG_BASE}/launch-diary-2`,
  },
  schema: articleSchema({
    headline: "Journal de lancement #1 : La mise en place",
    description:
      "Comment une créatrice de bijoux en perles à Zurich a créé sa première boutique en ligne — vrai processus, vrai calendrier.",
    slug: "launch-diary-1",
    datePublished: BLOG_POSTS[0].lastmod,
    dateModified: BLOG_POSTS[0].lastmod,
    lang: "fr",
  }),
};

const diary2: Article = {
  slug: "launch-diary-2",
  kind: "diary",
  eyebrow: "Journal de lancement · Partie 2 sur 4",
  title: "Journal de lancement #2 : La mise en ligne",
  metaTitle: `Mise en ligne : le premier jour ${maker.founder ? `de ${maker.brand}` : "d'une boutique de bijoux zurichoise"} | Journal de lancement Zolto`,
  metaDescription: `Jour 1 ${maker.founder ? `de ${maker.brand}` : "d'une boutique de bijoux en perles"} en ligne à Zurich : 34 visiteurs, 0 commande. Jour 2 : la première vente. La vraie histoire d'un lancement en ligne.`,
  dek: "Partie 2 : le passage discret de « pas disponible » à « c'est ici » — et la première commande.",
  datePublished: BLOG_POSTS[1].lastmod,
  dateModified: BLOG_POSTS[1].lastmod,
  readingTime: "5 min de lecture",
  keywords: [
    "lancement boutique bijoux Zurich",
    "première commande en ligne",
    "du marché de Noël au web",
    "bijoux en perles Suisse",
  ],
  blocks: [
    {
      type: "p",
      text: "Hier, la boutique était configurée. Aujourd'hui, elle est en ligne. Pas avec une campagne marketing. Pas avec une soirée de lancement. Avec une seule story Instagram : « Nous avons enfin un site. Lien dans la bio. »",
    },
    {
      type: "p",
      text: "Voilà ce qui se passe vraiment quand une créatrice se lance en ligne. Pas de moment viral. Juste un passage discret de « pas disponible » à « c'est ici ».",
    },
    { type: "h2", text: "Le moment" },
    {
      type: "p",
      text: "La boutique est passée en ligne à 10h00. En moins d'une heure, le premier visiteur est arrivé — via la story Instagram, pas une pub. Il a regardé trois colliers de perles, en a ajouté un au panier, puis a fermé l'onglet. Première leçon : la plupart des visiteurs n'achètent pas à la première visite. C'est normal. Que la boutique soit en ligne, c'est l'étape un ; construire la confiance, c'est l'étape deux.",
    },
    { type: "h2", text: "Le trafic (jour 1)" },
    {
      type: "table",
      head: ["Source", "Visiteurs", "Commandes", "Remarques"],
      rows: [
        [
          "Instagram (story + lien bio)",
          "23",
          "0",
          "Des clients existants curieux",
        ],
        ["WhatsApp (partages directs)", "8", "0", "Amis et famille"],
        [
          "Direct (URL saisie)",
          "3",
          "0",
          "Probablement la créatrice en train de tester",
        ],
        ["Total", "34", "0", "Le jour 1, c'est la présence, pas les ventes"],
      ],
    },
    {
      type: "p",
      text: "Zéro commande le jour 1. Ce n'est pas un échec. Une nouvelle boutique sans historique SEO, sans pubs et avec une petite audience Instagram reçoit des visiteurs, pas des conversions. Le travail du jour 1, c'est d'exister.",
    },
    { type: "h2", text: "Ce qui a fonctionné" },
    {
      type: "ol",
      items: [
        "La story Instagram a apporté le plus de trafic. L'audience existante — construite sur les marchés et les Chilbis de la Gold Coast — est sur Instagram. C'est là que l'annonce a sa place.",
        "Les photos produit ont compté. Les visiteurs qui ont cliqué ont passé en moyenne 2 minutes sur les pages produit.",
        "La page À propos a reçu un trafic inattendu. 40% des visiteurs l'ont lue avant de regarder les produits. Les gens veulent savoir à qui ils achètent.",
      ],
    },
    { type: "h2", text: "Ce qui n'a pas fonctionné" },
    {
      type: "ol",
      items: [
        "Personne n'a utilisé le chatbot IA le jour 1. Il était visible mais pas sollicité. On utilise un chatbot quand on a des questions, pas quand on ne fait que regarder.",
        "La grille mobile était légèrement décalée sur certains téléphones Android. Corrigé dès le jour 2.",
        "Les frais de livraison n'étaient pas assez clairs. Deux visiteurs ont rempli leur panier sans passer commande.",
      ],
    },
    { type: "h2", text: "Le cycle de correction" },
    {
      type: "p",
      text: "C'est là que le modèle piloté par l'IA montre sa valeur. Le problème de clarté des frais de livraison est allé au chatbot IA : « Les gens ne finalisent pas. Je pense qu'ils ne connaissent pas les frais de livraison. » Le chatbot a proposé d'afficher les frais sur la page produit. Approuvé. Déployé en 10 minutes. Pas de ticket. Pas d'e-mail. Pas de « on l'ajoute au backlog ».",
    },
    { type: "h2", text: "Jour 2 : la première commande" },
    {
      type: "p",
      text: "À 9h47 le jour 2, la première commande est arrivée — un collier de perles d'eau douce, CHF 65 + CHF 8 de livraison. La cliente avait rencontré la créatrice à un marché de Noël trois semaines plus tôt, perdu la carte de visite et retenu le compte Instagram. C'est exactement pour cela que la boutique existe : pas pour les achats impulsifs d'inconnus, mais pour la personne qui vous a rencontré une fois, voulait acheter plus tard et a enfin un moyen de le faire.",
    },
    {
      type: "p",
      text: "Temps entre le lancement de la boutique et la première commande : 23 heures et 47 minutes.",
    },
    { type: "h2", text: "Ce que nous avons appris" },
    {
      type: "ol",
      items: [
        "Lancer sans attentes. Le trafic du jour 1, c'est de la curiosité, pas de la conversion.",
        "L'audience existante convertit en premier. Les ventes en ligne commencent avec les gens qui vous ont rencontré hors ligne.",
        "Les petites corrections comptent. Afficher les frais de livraison sur la page produit a sans doute sauvé 2–3 paniers abandonnés.",
        "Le chatbot IA construit des fonctionnalités, il ne fait pas que du support. La correction de la livraison est née d'une conversation, pas d'un rapport de bug.",
      ],
    },
  ],
  next: {
    label: "Journal de lancement #3 : Le premier mois en ligne",
    href: `${BLOG_BASE}/launch-diary-3`,
  },
  schema: articleSchema({
    headline: "Journal de lancement #2 : La mise en ligne",
    description:
      "Le premier jour en ligne d'une boutique de bijoux en perles à Zurich : 34 visiteurs, 0 commande — puis la première vente le jour 2.",
    slug: "launch-diary-2",
    datePublished: BLOG_POSTS[1].lastmod,
    dateModified: BLOG_POSTS[1].lastmod,
    lang: "fr",
  }),
};

const diary3: Article = {
  slug: "launch-diary-3",
  kind: "diary",
  eyebrow: "Journal de lancement · Partie 3 sur 4",
  title: "Journal de lancement #3 : Le premier mois en ligne",
  metaTitle:
    "Premier mois en ligne : 12 commandes, des chiffres honnêtes | Journal de lancement Zolto",
  metaDescription: `Un mois après le lancement, ${maker.founder ? maker.brand : "une créatrice de bijoux en perles à Zurich"} partage de vrais chiffres : 12 commandes, CHF 61 de panier moyen, 81% de résolution par le chatbot IA.`,
  dek: "Partie 3 : les chiffres honnêtes du premier mois — 12 commandes en ligne, CHF 61 de panier moyen, et ce qui les a générées.",
  datePublished: BLOG_POSTS[2].lastmod,
  dateModified: BLOG_POSTS[2].lastmod,
  readingTime: "6 min de lecture",
  keywords: [
    "premier mois boutique en ligne",
    "chiffres bijouterie artisanale",
    "ventes de bijoux faits main",
    "artisanat Zurich",
  ],
  blocks: [
    {
      type: "p",
      text: "Cela fait un mois que la boutique est en ligne. L'heure des chiffres honnêtes — pas de moments choisis, le tableau complet.",
    },
    { type: "h2", text: "Le point de départ" },
    {
      type: "p",
      text: "Avant la boutique : ~60 ventes hors ligne par mois, 0 en ligne, une portée limitée à qui passait devant la table. Après un mois : ~55 hors ligne (une légère baisse, certains habitués étant passés en ligne), 12 commandes en ligne, et une portée qui couvre désormais la Suisse plus 2 commandes UE venues d'Allemagne.",
    },
    {
      type: "p",
      text: "Ventes totales : 67, contre 60. Rien de spectaculaire. Mais la répartition a changé : 82% hors ligne, 18% en ligne. C'est un début.",
    },
    { type: "h2", text: "Le mois 1 en détail" },
    {
      type: "table",
      head: [
        "Semaine",
        "Commandes en ligne",
        "Panier moyen",
        "Trafic",
        "Remarques",
      ],
      rows: [
        [
          "Semaine 1 (lancement)",
          "3",
          "CHF 58",
          "156 visiteurs",
          "Effet Instagram",
        ],
        [
          "Semaine 2",
          "2",
          "CHF 52",
          "89 visiteurs",
          "Calme après le lancement",
        ],
        [
          "Semaine 3",
          "4",
          "CHF 71",
          "134 visiteurs",
          "Post sur la nouvelle collection de perles",
        ],
        ["Semaine 4", "3", "CHF 62", "102 visiteurs", "Stable"],
        [
          "Total du mois",
          "12",
          "CHF 61",
          "481 visiteurs",
          "2,5% de conversion",
        ],
      ],
    },
    { type: "h2", text: "Ce qui a généré les ventes" },
    {
      type: "table",
      head: ["Source", "Commandes", "% des ventes en ligne"],
      rows: [
        ["Instagram (organique)", "7", "58%"],
        ["Direct / clients qui reviennent", "3", "25%"],
        ["Bouche-à-oreille (liens partagés)", "2", "17%"],
        ["Recherche / Google", "0", "0%"],
      ],
    },
    {
      type: "p",
      text: "La recherche est à 0% parce que la boutique n'a pas encore d'historique SEO. C'est attendu. Le mois 1 sert à valider que la boutique fonctionne. Les mois 2–3 seront consacrés au SEO et au contenu — c'est précisément le rôle de cette série.",
    },
    { type: "h2", text: "Le chatbot IA : les chiffres du mois 1" },
    {
      type: "table",
      head: ["Indicateur", "Valeur"],
      rows: [
        ["Conversations au total", "47"],
        ["Résolues sans aide humaine", "38 (81%)"],
        ["Transmises à la créatrice", "9 (19%)"],
        ["Demandes de fonctionnalités", "4"],
        ["Temps de réponse moyen", "3,2 secondes"],
      ],
    },
    { type: "h2", text: "Ce qui a changé dans le produit" },
    {
      type: "p",
      text: "Quatre fonctionnalités ont été construites au mois 1, toutes issues de conversations avec le chatbot — le client demande, l'IA construit, déployé en quelques heures, pas en sprints.",
    },
    {
      type: "table",
      head: ["Jour", "Demande", "Ce qui a été construit", "Impact"],
      rows: [
        [
          "3",
          "Les frais de livraison ne sont pas clairs",
          "Frais de livraison sur la page produit",
          "Moins de paniers abandonnés",
        ],
        [
          "8",
          "Voir les perles sous plus d'angles",
          "Zoom sur les images produit",
          "+15% de temps sur les pages produit",
        ],
        [
          "15",
          "Proposez-vous un emballage cadeau ?",
          "Option emballage cadeau (CHF 3)",
          "3 commandes l'ont utilisée",
        ],
        [
          "22",
          "Le menu mobile est difficile à toucher",
          "Zones tactiles plus grandes",
          "Conversion mobile en légère hausse",
        ],
      ],
    },
    { type: "h2", text: "Le verdict honnête" },
    {
      type: "p",
      text: "Le mois 1 n'a pas transformé l'entreprise — 12 commandes en ligne en plus de 55 hors ligne, c'est incrémental. Mais la portée est passée de zéro-hors-de-Zurich à 12 commandes dont 2 d'Allemagne ; paiements, livraison et synchronisation du stock ont fait leurs preuves ; et il y a désormais de vraies données : 2,5% de conversion, CHF 61 de panier moyen, Instagram comme première source.",
    },
    {
      type: "p",
      text: "Le mois 1 devait prouver que la boutique fonctionne. Le mois 2 devra prouver qu'elle peut grandir.",
    },
  ],
  next: {
    label: "L'étude de cas : en 30 jours du stand de marché au web",
    href: STORY_PATH,
  },
  schema: articleSchema({
    headline: "Journal de lancement #3 : Le premier mois en ligne",
    description:
      "Les chiffres honnêtes du premier mois d'une boutique de bijoux en perles à Zurich : 12 commandes, CHF 61 de panier moyen, 81% de résolution par le chatbot IA.",
    slug: "launch-diary-3",
    datePublished: BLOG_POSTS[2].lastmod,
    dateModified: BLOG_POSTS[2].lastmod,
    lang: "fr",
  }),
};

const caseStudyFrTitle = maker.founder
  ? `L'étude de cas du lancement de ${maker.brand}`
  : "L'étude de cas du lancement de notre atelier pilote";

const caseStudy: Article = {
  slug: STORY_SLUG,
  kind: "story",
  title: caseStudyFrTitle,
  metaTitle: `${maker.founder ? `Étude de cas ${maker.brand}` : "Étude de cas"} : des marchés de Noël aux ventes en ligne en 30 jours | Zolto`,
  metaDescription: `Comment ${maker.founder ? `${maker.founder}, fondatrice de ${maker.brand},` : "une créatrice de bijoux en perles à Zurich"} a lancé sa première boutique en ligne en 3 jours et réalisé 12 ventes en ligne le premier mois, sur Zolto.`,
  dek: "De ~60 ventes hors ligne par mois sur les marchés de Noël à une bijouterie hybride en ligne/hors ligne en 30 jours.",
  datePublished: CASE_STUDY.datePublished,
  dateModified: CASE_STUDY.dateModified,
  readingTime: "5 min de lecture",
  keywords: [
    "bijoux faits main Suisse",
    "système de caisse pour artisans",
    "bijoux en perles Zurich",
    "boutique en ligne pour artisans",
  ],
  blocks: [
    { type: "h2", text: "La créatrice" },
    {
      type: "p",
      text: `${BRAND} est une marque de bijoux à Zurich : des pièces faites main en perles et pierres semi-précieuses — colliers, boucles d'oreilles, bracelets — vendues sur les marchés de Noël et les Chilbis de la Gold Coast zurichoise. Avant Zolto, toute l'activité était hors ligne : environ 60 ventes par mois, toutes en personne, pas de boutique en ligne.`,
    },
    { type: "h2", text: "Le défi" },
    {
      type: "p",
      text: "Le problème n'était pas le volume de ventes — c'étaient la portée et l'accessibilité. Les clients réclamaient un site. Chaque marché était un public neuf, sans moyen de construire une relation durable, sans moyen pour les clients existants de recommander la boutique en ligne, et avec un stock suivi essentiellement de tête.",
    },
    {
      type: "p",
      text: "La créatrice n'est pas une pro de la tech et ne voulait ni apprendre Shopify, ni payer un développeur, ni passer des heures dans un logiciel. L'objectif : faire des bijoux, pas gérer des outils.",
    },
    { type: "h2", text: "La solution — en place en 3 jours" },
    {
      type: "table",
      head: ["Jour", "Tâche", "Temps passé"],
      rows: [
        ["1", "Mise en ligne de 15 produits + descriptions IA", "3 heures"],
        ["2", "Configuration boutique, livraison, paiements", "1 heure"],
        ["3", "Synchronisation du stock caisse avec la boutique", "30 minutes"],
      ],
      caption:
        "Temps total de mise en place : ~5 heures — surtout de la photo, pas du logiciel.",
    },
    {
      type: "p",
      text: "Fonctions clés utilisées : descriptions produit par IA (générées à partir des photos, ton retouché en ~5 minutes chacune) ; synchronisation caisse + en ligne (un seul stock pour les deux canaux : une vente à une Chilbi met à jour le stock en ligne, et inversement) ; et le chatbot IA (qui répond aux questions sur les types de perles, la livraison et les tailles — et transforme les demandes en fonctionnalités livrées).",
    },
    {
      type: "figure",
      image: {
        src: "/launch/gold-fringe-earrings-styled.jpg",
        alt: `Boucles d'oreilles à franges en perles baroques serties d'or de ${BRAND} sur un fond marbre généré par l'IA`,
      },
      caption:
        "Une image produit prête pour la boutique à partir d'une seule photo de la créatrice — les boucles d'oreilles sont la pièce réelle ; le fond est généré par l'IA et signalé comme tel.",
    },
    { type: "h2", text: "Les résultats (premier mois)" },
    {
      type: "table",
      head: ["Indicateur", "Avant", "Après 30 jours"],
      rows: [
        ["Ventes hors ligne", "~60/mois", "~55/mois"],
        ["Ventes en ligne", "0", "12 commandes"],
        ["Ventes totales", "~60/mois", "~67/mois"],
        ["Portée client", "Marchés zurichois", "Suisse + Allemagne"],
        ["Suivi du stock", "De tête", "Synchro en temps réel"],
        ["Charge de support", "Tout sur la créatrice", "81% gérés par l'IA"],
      ],
    },
    {
      type: "p",
      text: "La première cliente en ligne avait rencontré la créatrice à un marché de Noël trois semaines plus tôt, perdu la carte de visite et retenu le compte Instagram. La boutique existe pour les gens qui vous connaissent déjà — elle leur donne simplement un moyen d'acheter quand vous n'êtes pas sur un marché.",
    },
    { type: "h2", text: "Ce qui a été construit à partir des retours" },
    {
      type: "table",
      head: [
        "Jour",
        "Le client a dit",
        "Ce qui a été construit",
        "Délai de mise en ligne",
      ],
      rows: [
        [
          "3",
          "Les frais de livraison ne sont pas clairs",
          "Frais de livraison sur la page produit",
          "10 minutes",
        ],
        [
          "8",
          "Voir les perles sous plus d'angles",
          "Zoom sur les images produit",
          "2 heures",
        ],
        [
          "15",
          "Je veux un emballage cadeau",
          "Option emballage cadeau (CHF 3)",
          "1 heure",
        ],
        [
          "22",
          "Le menu mobile est difficile à toucher",
          "Zones tactiles plus grandes",
          "30 minutes",
        ],
      ],
      caption: "4 fonctionnalités construites en ~4 heures, pas en 4 sprints.",
    },
    ...(CONTENT_RELEASE_SIGNED
      ? [
          { type: "h2", text: "Le point de vue de la créatrice" } as Block,
          {
            type: "quote",
            text: "Je ne voulais pas devenir une pro de la tech. Je voulais faire des bijoux. Zolto m'a permis de monter une boutique en 3 jours sans rien apprendre de nouveau. L'IA gère les questions auxquelles je répondais en DM Instagram — par exemple si mes perles sont d'eau douce, ou combien coûte la livraison vers l'Allemagne.",
            cite: `${founderName}, fondatrice de ${maker.brand}, Zurich`,
          } as Block,
        ]
      : [
          {
            type: "quote",
            text: "Je suis passée de la vente uniquement sur les marchés à ma première commande en ligne en quelques jours — sans apprendre une nouvelle plateforme ni embaucher qui que ce soit.",
            cite: "Créatrice pilote, Zurich (témoignage en attente d'autorisation)",
          } as Block,
        ]),
    { type: "h2", text: "À retenir" },
    {
      type: "ol",
      items: [
        "Commencez petit. 15 produits, pas 150. Lancez, puis itérez.",
        "Votre audience existante convertit en premier. Les ventes en ligne commencent avec les gens qui vous ont rencontré sur les marchés.",
        "Le chatbot IA construit des fonctionnalités, il ne fait pas que du support. Les conversations deviennent des améliorations produit.",
        "5 heures de mise en place, pas 5 semaines. Si c'est plus long, c'est que l'outil n'est pas le bon.",
      ],
    },
  ],
  schema: storySchema({
    headline: caseStudyFrTitle,
    description: "Des marchés de Noël aux ventes en ligne en 30 jours.",
    lang: "fr",
  }),
};

/** All Launch Diary posts in French, series order (parity with DIARY_POSTS). */
export const DIARY_POSTS_FR: Article[] = [diary1, diary2, diary3];

/** The case study in French (parity with CASE_STUDY). */
export const CASE_STUDY_FR: Article = caseStudy;
