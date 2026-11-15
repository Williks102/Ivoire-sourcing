/**
 * Crée (ou met à jour) la base Appwrite d'IvoireSource : base, collections, attributs, index, permissions, bucket.
 * Idempotent : peut être relancé sans danger ; les permissions sont réappliquées à chaque exécution.
 *
 * Prérequis (à faire une fois dans la console Appwrite) :
 *   1. Créer le projet.
 *   2. Créer une clé API avec les catégories « Databases » (tables, columns, indexes, rows) et « Storage » cochées.
 *   3. Ajouter une plateforme Web (le nom de domaine de votre site) pour autoriser la connexion.
 *
 * Usage :
 *   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1 APPWRITE_PROJECT_ID=xxx APPWRITE_API_KEY=xxx \
 *   npm run setup:appwrite
 *
 * Variables facultatives : APPWRITE_DATABASE_ID (défaut « ivoire-sourcing »), APPWRITE_BUCKET_ID (défaut « cv »).
 */

export {};

const endpoint = (process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1').replace(/\/$/, '');
const project = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'ivoire-sourcing';
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID || 'cv';

if (!project || !apiKey) {
  console.error('APPWRITE_PROJECT_ID et APPWRITE_API_KEY sont obligatoires.');
  process.exit(1);
}

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': project!, 'X-Appwrite-Key': apiKey! },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  return { status: response.status, data };
}

/** Appelle l'API et tolère « existe déjà » (409). Toute autre erreur est fatale. */
async function ensure(label: string, method: string, path: string, body: unknown) {
  const { status, data } = await call(method, path, body);
  if (status === 409) { console.log(`  = ${label} (déjà présent)`); return data; }
  if (status >= 400) throw new Error(`${label} : ${status} ${data.message || JSON.stringify(data)}`);
  console.log(`  + ${label}`);
  return data;
}

type Attr =
  | { type: 'string'; key: string; size: number; array?: boolean }
  | { type: 'integer'; key: string }
  | { type: 'float'; key: string }
  | { type: 'boolean'; key: string };

const s = (key: string, size = 255, array = false): Attr => ({ type: 'string', key, size, array });
const i = (key: string): Attr => ({ type: 'integer', key });
const f = (key: string): Attr => ({ type: 'float', key });
const b = (key: string): Attr => ({ type: 'boolean', key });

interface CollectionDef {
  id: string;
  name: string;
  /** Permissions de collection (qui peut agir sur TOUS les documents). */
  permissions: string[];
  /** Si vrai, les permissions posées sur chaque document s'ajoutent à celles de la collection. */
  documentSecurity: boolean;
  attributes: Attr[];
  indexes: { key: string; attributes: string[] }[];
}

// Les écritures sensibles (missions, offres, paiements) passent par le serveur avec la clé API :
// les clients n'ont donc AUCUNE permission d'écriture sur ces collections.
const ADMIN = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")'];

const COLLECTIONS: CollectionDef[] = [
  {
    id: 'users',
    name: 'Profils',
    // Chaque utilisateur crée son profil ; lecture/modification réservées à lui (permission de document) et aux admins.
    permissions: ['create("users")', ...ADMIN],
    documentSecurity: true,
    attributes: [
      s('uid', 64), s('role', 20), s('displayName', 120), s('email', 255), s('photoURL', 1000), s('location', 120),
      s('bio', 2000), s('skills', 100, true), b('isVerified'), b('isPremium'), f('averageRating'), i('reviewCount'),
      s('phone', 30), s('cvName', 255), s('cvUrl', 500000), s('createdAt', 40),
      // Profil artisan :
      s('trades', 40, true), s('serviceCities', 60, true), i('experienceYears'),
      // Liste de pièces au format JSON. À terme : stocker les fichiers dans Storage plutôt qu'en base64.
      s('verificationDocs', 2000000),
    ],
    indexes: [{ key: 'idx_role', attributes: ['role'] }],
  },
  {
    id: 'jobs',
    name: 'Missions',
    // Lecture publique (liste des missions ouvertes sur l'accueil). Écriture : serveur et admins uniquement.
    permissions: ['read("any")', 'create("label:admin")', 'update("label:admin")', 'delete("label:admin")'],
    documentSecurity: false,
    attributes: [
      s('employerId', 64), s('title', 150), s('description', 5000), s('category', 40), s('location', 60), s('address', 200),
      s('scheduledDate', 40), i('budget'), s('status', 20), s('createdAt', 40),
      // Renseignés par le serveur :
      s('assignedArtisanId', 64), s('assignedApplicationId', 64), i('agreedPrice'), s('assignedAt', 40), s('completedAt', 40),
      s('paidAt', 40), s('paymentReference', 64), i('commissionAmount'), i('artisanPayout'), s('payoutStatus', 20),
      s('payoutSentAt', 40), s('payoutReference', 64),
      // Anciennes annonces de recrutement / création admin :
      s('salaryRange', 60), b('isPremium'),
    ],
    indexes: [
      { key: 'idx_employer', attributes: ['employerId'] },
      { key: 'idx_artisan', attributes: ['assignedArtisanId'] },
      { key: 'idx_status', attributes: ['status'] },
      { key: 'idx_category', attributes: ['category'] },
    ],
  },
  {
    id: 'applications',
    name: 'Offres',
    // Chaque offre est lisible par le client de la mission et par l'artisan (permissions de document posées par le serveur).
    permissions: [...ADMIN],
    documentSecurity: true,
    attributes: [
      s('jobId', 64), s('employerId', 64), s('candidateId', 64), s('candidateName', 120), s('photoURL', 1000),
      i('experienceYears'), i('proposedPrice'), s('delay', 120), s('message', 1000), s('status', 20), s('createdAt', 40),
      s('trades', 40, true),
    ],
    indexes: [
      { key: 'idx_job', attributes: ['jobId'] },
      { key: 'idx_candidate', attributes: ['candidateId'] },
      { key: 'idx_employer', attributes: ['employerId'] },
    ],
  },
  {
    id: 'payments',
    name: 'Paiements',
    permissions: [], // serveur uniquement
    documentSecurity: false,
    attributes: [
      s('reference', 64), s('jobId', 64), s('employerId', 64), s('artisanId', 64), i('amount'), i('commission'), i('payout'),
      s('channel', 20), s('status', 20), s('createdAt', 40), s('paidAt', 40), s('gatewayStatus', 40),
    ],
    indexes: [{ key: 'idx_job', attributes: ['jobId'] }],
  },
];

async function createAttribute(collectionId: string, attr: Attr) {
  const base = `/tablesdb/${DATABASE_ID}/tables/${collectionId}/columns`;
  const label = `${collectionId}.${attr.key}`;
  if (attr.type === 'string') return ensure(label, 'POST', `${base}/string`, { key: attr.key, size: attr.size, required: false, array: !!attr.array });
  if (attr.type === 'integer') return ensure(label, 'POST', `${base}/integer`, { key: attr.key, required: false, min: 0, max: 2_000_000_000 });
  if (attr.type === 'float') return ensure(label, 'POST', `${base}/float`, { key: attr.key, required: false });
  return ensure(label, 'POST', `${base}/boolean`, { key: attr.key, required: false });
}

/** Les attributs sont créés en asynchrone : on attend qu'ils soient « available » avant de créer les index. */
async function waitForAttributes(collectionId: string, keys: string[]) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const { data } = await call('GET', `/tablesdb/${DATABASE_ID}/tables/${collectionId}/columns?queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [100] }))}`);
    const byKey = new Map<string, string>((data.columns || []).map((a: any) => [a.key, a.status]));
    const pending = keys.filter((k) => byKey.get(k) !== 'available');
    const failed = keys.filter((k) => byKey.get(k) === 'failed');
    if (failed.length) throw new Error(`Attributs en échec sur ${collectionId} : ${failed.join(', ')}`);
    if (pending.length === 0) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Délai dépassé en attendant les attributs de ${collectionId}`);
}

async function main() {
  console.log(`Projet ${project} sur ${endpoint}`);

  console.log('\nBase de données');
  // On teste l'existence avant de créer : certains plans limitent le nombre de bases et répondent 403 même pour un id existant.
  const existing = await call('GET', `/tablesdb/${DATABASE_ID}`);
  if (existing.status === 200) console.log(`  = base ${DATABASE_ID} (déjà présente)`);
  else await ensure(`base ${DATABASE_ID}`, 'POST', '/tablesdb', { databaseId: DATABASE_ID, name: 'IvoireSource' });

  for (const col of COLLECTIONS) {
    console.log(`\nCollection ${col.id}`);
    await ensure(`collection ${col.id}`, 'POST', `/tablesdb/${DATABASE_ID}/tables`, {
      tableId: col.id, name: col.name, permissions: col.permissions, rowSecurity: col.documentSecurity,
    });
    // Réapplique toujours les permissions (si la collection existait déjà avec d'autres droits).
    await ensure(`permissions ${col.id}`, 'PUT', `/tablesdb/${DATABASE_ID}/tables/${col.id}`, {
      name: col.name, permissions: col.permissions, rowSecurity: col.documentSecurity, enabled: true,
    });

    for (const attr of col.attributes) await createAttribute(col.id, attr);
    await waitForAttributes(col.id, col.attributes.map((a) => a.key));

    for (const idx of col.indexes) {
      await ensure(`index ${col.id}.${idx.key}`, 'POST', `/tablesdb/${DATABASE_ID}/tables/${col.id}/indexes`, {
        key: idx.key, type: 'key', columns: idx.attributes,
      });
    }
  }

  console.log('\nStockage');
  const bucket = await call('GET', `/storage/buckets/${BUCKET_ID}`);
  if (bucket.status === 200) console.log(`  = bucket ${BUCKET_ID} (déjà présent)`);
  else await ensure(`bucket ${BUCKET_ID}`, 'POST', '/storage/buckets', {
    bucketId: BUCKET_ID, name: 'Documents', permissions: ['create("users")'], fileSecurity: true,
    maximumFileSize: 10_000_000, allowedFileExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
  });

  console.log(`
Terminé. À renseigner dans Vercel (Settings → Environment Variables) :

  VITE_APPWRITE_ENDPOINT=${endpoint}
  VITE_APPWRITE_PROJECT_ID=${project}
  VITE_APPWRITE_DATABASE_ID=${DATABASE_ID}
  VITE_APPWRITE_BUCKET_CV_ID=${BUCKET_ID}
  APPWRITE_ENDPOINT=${endpoint}
  APPWRITE_PROJECT_ID=${project}
  APPWRITE_DATABASE_ID=${DATABASE_ID}
  APPWRITE_API_KEY=<votre clé API serveur, ne jamais la préfixer par VITE_>

Reste à faire dans la console : poser le label « admin » sur votre compte (Auth → utilisateur → Labels).
`);
}

main().catch((error) => {
  console.error('\nÉchec :', error.message);
  process.exit(1);
});
