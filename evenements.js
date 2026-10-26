
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const fs = require("node:fs/promises");

async function chercherEvenements() {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  });

  const aujourdHui = new Date().toISOString().slice(0, 10);

  const reponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Recherche jusqu'à 6 événements réels à venir
      uniquement à Repentigny, Québec, à partir du ${aujourdHui}.
      Utilise des sources officielles. N'invente rien.
      Retourne uniquement un tableau JSON avec :
      titre, date, lieu, ville, description, url_source.
      Si tu trouves moins de 6 événements confirmés,
      retourne seulement ceux que tu trouves.`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const texte = reponse.text
    .replace(/```json|```/g, "")
    .trim();

  const evenements = JSON.parse(texte);

  await fs.writeFile(
    "evenements-a-verifier.json",
    JSON.stringify(evenements, null, 2),
    "utf8"
  );

  console.log(evenements);
}

chercherEvenements().catch(console.error);
