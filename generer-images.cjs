
const fs = require("node:fs/promises");
const path = require("node:path");

const FICHIER = "evenements-a-venir.json";
const DOSSIER = "images-evenements";

// Sécurité : au maximum 2 nouvelles images par exécution.
const MAX_IMAGES=1;
const MAX_IMAGES_MOIS=10;
const FICHIER_COMPTEUR="compteur-images.json";
async function genererImage(evenement, fichier) {
  const cle = process.env.OPENAI_API_KEY;

  if (!cle) {
    throw new Error("Clé OPENAI_API_KEY absente.");
  }

  const titre = evenement.titre || evenement.title || "Événement local";

  const reponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cle}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-image-1-mini",
      prompt: `Illustration photoréaliste pour un site d'événements.
Sujet : ${titre}.
Belle composition, lumière naturelle, photographie professionnelle.
Aucun texte, aucun logo. Ne pas représenter de personnes réelles identifiables.`,
      size: "1536x1024",
      quality: "low",
      n: 1
    })
  });

  const resultat = await reponse.json();

  if (!reponse.ok) {
    throw new Error(JSON.stringify(resultat.error || resultat));
  }

  const image = resultat.data?.[0]?.b64_json;

  if (!image) {
    throw new Error("Aucune image reçue.");
  }

  await fs.writeFile(
    path.join(DOSSIER, fichier),
    Buffer.from(image, "base64")
  );
}
async function lireCompteur() {
  const mois = new Date().toISOString().slice(0, 7);

  try {
    const donnees = JSON.parse(
      await fs.readFile(FICHIER_COMPTEUR, "utf8")
    );

    if (donnees.mois === mois) {
      return donnees;
    }
  } catch (erreur) {
    if (erreur.code !== "ENOENT") {
      throw erreur;
    }
  }

  return { mois, nombre: 0 };
}
async function main() {
      const compteurMensuel = await lireCompteur();
  console.log(`Images générées ce mois : ${compteurMensuel.nombre}/${MAX_IMAGES_MOIS}`);
  await fs.mkdir(DOSSIER, { recursive: true });

  const evenements = JSON.parse(
    await fs.readFile(FICHIER, "utf8")
  );

  if (!Array.isArray(evenements)) {
    throw new Error("Format JSON inattendu : liste attendue.");
  }

  let compteur = 0;
if (compteurMensuel.nombre >= MAX_IMAGES_MOIS) {
  console.log("Limite mensuelle de 10 images atteinte.");
  return;
}
  for (const evenement of evenements) {
    if (compteur >= MAX_IMAGES || compteurMensuel.nombre >= MAX_IMAGES_MOIS) {
  break;
}

    const titre = evenement.titre || evenement.title || "";
    const identifiant = titre
  .replace(/^Spectacle\s*:\s*/i, "")
  .replace(/^Vivre au rythme des saisons$/i, "vivre-au-rythme-des-saisons")
  .replace(/^Ça grouille dans le marais du sorcier$/i, "marais-du-sorcier");

    const nom = String(identifiant)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    if (!nom) continue;

    const fichier = `${nom}.png`;
    const destination = path.join(DOSSIER, fichier);

    try {
      await fs.access(destination);
      console.log(`Image existante : ${fichier}`);
      continue;
    } catch {
      // Image absente : génération nécessaire.
    }

    console.log(`Génération : ${titre}`);
    await genererImage(evenement, fichier);
    compteur++;
    compteurMensuel.nombre++;

await fs.writeFile(
  FICHIER_COMPTEUR,
  JSON.stringify(compteurMensuel, null, 2),
  "utf8"
);
    console.log(`Image enregistrée : ${fichier}`);
  }

  console.log(`Terminé : ${compteur} image(s) créée(s).`);
}

main().catch(erreur => {
  console.error(erreur.message);
  process.exitCode = 1;
});
