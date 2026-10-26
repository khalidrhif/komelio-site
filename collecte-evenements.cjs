
const fs = require("node:fs/promises");

const BASE = "https://repentigny.ca";

const MOIS = {
  janvier: 1, février: 2, mars: 3,
  avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, septembre: 9,
  octobre: 10, novembre: 11, décembre: 12
};

function nettoyer(texte = "") {
  return texte
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/&rsquo;/gi, "’")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function texteVisible(html) {
  return nettoyer(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function extraireDate(html) {
  const jour = html.match(/class="day">(\d+)/);
  const mois = html.match(/class="month">([^<]+)/);
  const annee = html.match(/class="year">(\d{4})/);

  if (!jour || !mois || !annee) {
    return "Date à vérifier";
  }

  return `${jour[1]} ${mois[1]} ${annee[1]}`;
}

function extraireHoraires(texte) {
  const section = texte.match(
    /Horaire détaillé\s+(.{0,350})/i
  );

  if (!section) {
    return {
      horaire: "Horaire à vérifier",
      seances: []
    };
  }

  const extrait = section[1].split(
    /Sur la carte|Accueil|Facebook|Twitter/i
  )[0];

  const heures = [
    ...extrait.matchAll(
      /\b(?:[01]?\d|2[0-3])\s*h(?:\s*[0-5]\d)?\b/gi
    )
  ].map(x => x[0].replace(/\s+/g, " ").trim());

  const heuresUniques = [...new Set(heures)];

  if (heuresUniques.length === 2 &&
      /\bà\b/.test(extrait)) {
    return {
      horaire: heuresUniques.join(" à "),
      seances: []
    };
  }

  if (heuresUniques.length === 1) {
    return {
      horaire: heuresUniques[0],
      seances: []
    };
  }

  return {
    horaire: "Horaire à vérifier",
    seances: []
  };
}

function extraireSeancesDescription(texte, date) {
  // Reconnaît les formulations du type :
  // "28, 29 et 30 octobre, 18 h, 19 h et 20 h"
  const modele =
    /(\d{1,2}(?:\s*,\s*\d{1,2})*\s*et\s*\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s*,?\s*((?:(?:[01]?\d|2[0-3])\s*h(?:\s*[0-5]\d)?(?:\s*,\s*|\s+et\s+|$)){2,})/i;

  const texteNormalise = texte.replace(/&nbsp;|&#160;/gi, " ");
   const match = texteNormalise.match(modele);

if (match) {
  const suite = texteNormalise.slice(match.index, match.index + match[0].length + 15);
  const heuresTrouvees = [...suite.matchAll(/\b(?:[01]?\d|2[0-3])\s*h(?:\s*[0-5]\d)?\b/gi)];
  match[3] = heuresTrouvees.map(x => x[0]).join(", ");
}

  if (!match) return null;

  const annee = date.match(/\b20\d{2}\b/)?.[0];

  if (!annee) return null;

  const jours = [...match[1].matchAll(/\d{1,2}/g)]
    .map(x => Number(x[0]));

  const heures = [...match[3].matchAll(
    /\b(?:[01]?\d|2[0-3])\s*h(?:\s*[0-5]\d)?\b/gi
  )].map(x => x[0].replace(/\s+/g, " ").trim());

  const mois = match[2].toLowerCase();

  if (!MOIS[mois] || !jours.length || !heures.length) {
    return null;
  }

  const seances = [];

  for (const jour of jours) {
    const dateSeance = `${jour} ${mois} ${annee}`;

    for (const heure of heures) {
      seances.push({
        date: dateSeance,
        heure: heure
      });
    }
  }

  return seances;
}

async function collecter() {
  console.log("Collecte des événements de Repentigny...");

  const reponse = await fetch(BASE + "/calendrier");

  if (!reponse.ok) {
    throw new Error("Calendrier inaccessible");
  }

  const html = await reponse.text();

  const liens = [
    ...new Set(
      [...html.matchAll(/href="(\/evenement\/[^"#?]+)"/g)]
        .map(x => x[1])
    )
  ];

  console.log("Liens trouvés :", liens.length);

  const evenements = [];

  for (const lien of liens) {
    try {
      const page = await fetch(BASE + lien);

      if (!page.ok) {
        throw new Error("HTTP " + page.status);
      }

      const contenu = await page.text();
      const texte = texteVisible(contenu);

      const titreMatch = contenu.match(
        /property="og:title"\s+content="([^"]+)"/
      );

      const lieuMatch = contenu.match(
        /class="locations-list event-venue"[\s\S]*?class="location-view[^"]*"[^>]*>([^<]+)/
      );

      const prixMatch = contenu.match(
        /class="event-price-number"[^>]*>([\s\S]*?)<\/p>/
      );

      const date = extraireDate(contenu);
      const horaires = extraireHoraires(texte);

const heureHtml = contenu.match(
  /<span class="time">\s*([^<]+)\s*<\/span>/
);

if (heureHtml) {
  horaires.horaire = nettoyer(heureHtml[1]);
}

      const seancesDescription =
        extraireSeancesDescription(texte, date);

      let horaire = horaires.horaire;
      let seances = horaires.seances;

      if (seancesDescription) {
        seances = seancesDescription;
        horaire = "Plusieurs séances";
      }

      let inscription = "À vérifier";

      if (/Inscription requise/i.test(texte) && !/Aucune inscription requise/i.test(texte)) {
        inscription = "Requise";
      } else if (/Aucune inscription requise/i.test(texte)) {
        inscription = "Non requise";
      }

      const evenement = {
        titre: titreMatch
          ? nettoyer(titreMatch[1])
          : "Titre inconnu",

        date: date,
        horaire: horaire,
        seances: seances,

        lieu: lieuMatch
          ? nettoyer(lieuMatch[1])
          : "Lieu à vérifier",

        prix: prixMatch
          ? nettoyer(prixMatch[1])
          : "Prix à vérifier",

        inscription: inscription,
        url_source: BASE + lien
      };

      evenements.push(evenement);

      console.log("");
      console.log("Événement :", evenement.titre);
      console.log("Date      :", evenement.date);
      console.log("Horaire   :", evenement.horaire);
      console.log("Séances   :", evenement.seances.length);
      console.log("Lieu      :", evenement.lieu);
      console.log("Prix      :", evenement.prix);
      console.log("Inscription :", evenement.inscription);

    } catch (erreur) {
      console.log("Erreur :", lien, erreur.message);
    }
  }

  await fs.writeFile(
    "evenements-officiels.json",
    JSON.stringify(evenements, null, 2),
    "utf8"
  );
// Garder uniquement les événements à venir
const maintenant = new Date();
maintenant.setHours(0, 0, 0, 0);

const evenementsAVenir = evenements.filter(evenement => {
  const correspondance = evenement.date.match(
    /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i
  );

  if (!correspondance) return false;

  const jour = Number(correspondance[1]);
  const mois = MOIS[correspondance[2].toLowerCase()];
  const annee = Number(correspondance[3]);

  const dateEvenement = new Date(annee, mois - 1, jour);

  return dateEvenement >= maintenant;
});

await fs.writeFile(
  "evenements-a-venir.json",
  JSON.stringify(evenementsAVenir, null, 2),
  "utf8"
);

console.log("Événements à venir :", evenementsAVenir.length);
console.log("Fichier : evenements-a-venir.json");
  console.log("");
  console.log("================================");
  console.log("Collecte terminée !");
  console.log("Événements :", evenements.length);
  console.log("Fichier : evenements-officiels.json");
  console.log("================================");
}

collecter().catch(console.error);
