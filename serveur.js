import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dossier = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.join(dossier, '.env')
});

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL manque dans .env');
  process.exit(1);
}

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 15000,
  query_timeout: 20000
});

pool.on('error', () => {
  console.error('❌ Une connexion Neon a été interrompue.');
});

const app = express();
app.use(express.json({ limit: '20kb' }));
app.disable('x-powered-by');
app.use('/images-evenements', express.static(
  path.join(dossier, 'images-evenements')
));

app.get('/evenements-a-venir.json', (req, res) => {
  res.sendFile(path.join(dossier, 'evenements-a-venir.json'));
});

// Page d’accueil.
app.get('/', (req, res) => {
  res.sendFile(path.join(dossier, 'index.html'));
});
// Page pour ajouter un commerce.
app.get('/ajouter-commerce.html', (req, res) => {
  res.sendFile(path.join(dossier, 'ajouter-commerce.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(dossier, 'index.html'));
});

// Images uniquement : aucun accès au fichier .env.
app.use(
  '/images',
  express.static(path.join(dossier, 'images'), {
    dotfiles: 'deny',
    index: false
  })
);

// Recherche des commerces approuvés.
app.post('/api/demandes-commerce', async (req, res) => {
  try {
    const {
      nom, categorie, ville, adresse,
      telephone, courriel, site, description
    } = req.body || {};

    if (
      !nom?.trim() || !categorie?.trim() ||
      !ville?.trim() || !telephone?.trim() ||
      !courriel?.trim() || !description?.trim()
    ) {
      return res.status(400).json({
        erreur: 'Veuillez remplir tous les champs obligatoires.'
      });
    }

    await pool.query(
      `INSERT INTO public."DemandeCommerce"
       ("id", "nom", "categorie", "ville", "adresse",
        "telephone", "courriel", "siteWeb", "description",
        "statut", "createdAt")
       VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, $8, 'en_attente', NOW()
       )`,
      [
        nom.trim(),
        categorie.trim(),
        ville.trim(),
        adresse?.trim() || null,
        telephone.trim(),
        courriel.trim(),
        site?.trim() || null,
        description.trim()
      ]
    );

    res.status(201).json({
      message: 'Votre demande a été enregistrée et attend une approbation.'
    });

  } catch (erreur) {
    console.error('Erreur inscription :', erreur);
    res.status(500).json({
      erreur: 'Impossible d’enregistrer la demande.'
    });
  }
});
app.get('/api/commerces', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const mot = typeof req.query.mot === 'string'
    ? req.query.mot.trim()
    : '';

  const ville = typeof req.query.ville === 'string'
    ? req.query.ville.trim()
    : 'Repentigny';

  if (mot.length > 150 || ville.length > 100) {
    return res.status(400).json({
      erreur: 'La recherche est trop longue.'
    });
  }

  try {
    const resultat = await pool.query(
      `
        SELECT
          nom, slug, categorie, adresse, telephone,
          description, ville, "codePostal",
          "siteWeb", source, attribution, licence
        FROM public."Commerce"
        WHERE "aVerifier" = false
          AND (
            $1 = ''
            OR nom ILIKE $2
            OR categorie ILIKE $2
          )
          AND (
            $3 = ''
            OR ville ILIKE $4
          )
        ORDER BY nom, adresse
        LIMIT 50
      `,
      [mot, `%${mot}%`, ville, `%${ville}%`]
    );

    res.json({
      commerces: resultat.rows
    });
  } catch {
    console.error('❌ La recherche dans Neon a échoué.');

    res.status(500).json({
      erreur: 'Recherche indisponible. Réessayez plus tard.'
    });
  }
});

// Événements approuvés et pas encore terminés.
app.get('/api/evenements', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const ville = typeof req.query.ville === 'string'
    ? req.query.ville.trim()
    : 'Repentigny';

  if (!ville || ville.length > 100) {
    return res.status(400).json({
      erreur: 'Indiquez une ville valide.'
    });
  }

  try {
    const resultat = await pool.query(
      `
        SELECT
          titre, slug, lieu, adresse, ville,
          "dateDebut", "dateFin", prix, source
        FROM public."Evenement"
        WHERE "aVerifier" = false
          AND LOWER(ville) = LOWER($1)
          AND "dateFin" > NOW()
          AND "dateFin" >= "dateDebut"
        ORDER BY "dateDebut", titre
        LIMIT 30
      `,
      [ville]
    );

    res.json({
      evenements: resultat.rows
    });
  } catch {
    console.error('❌ Chargement des événements impossible.');

    res.status(500).json({
      erreur: 'Les événements sont momentanément indisponibles.'
    });
  }
});

// Démarrage du serveur local.
async function demarrer() {
  try {
    await pool.query('SELECT 1');

    const serveur = app.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => {
      console.log('✅ Connexion à Neon réussie.');
      console.log('🌐 Site : http://127.0.0.1:3000');
    });

    serveur.on('error', async error => {
      console.error(
        error.code === 'EADDRINUSE'
          ? '❌ Le port 3000 est déjà utilisé.'
          : '❌ Impossible de démarrer le serveur.'
      );

      await pool.end();
      process.exitCode = 1;
    });
  } catch {
    console.error(
      '❌ Connexion à Neon impossible. Vérifie ton fichier .env.'
    );

    await pool.end();
    process.exitCode = 1;
  }
}

demarrer();