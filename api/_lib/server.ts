import type { VercelRequest } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';

/**
 * Helpers serveur partagés par les fonctions /api.
 * Le dossier `_lib` n'est pas exposé comme route par Vercel.
 *
 * Principe : toute règle financière (montant, commission, statut payé) est
 * calculée et écrite ICI, côté serveur, avec la clé API Appwrite. Le navigateur
 * ne fournit jamais un montant.
 */

export const MISSION_STATUS = {
  PENDING: 'pending', // en attente de modération
  OPEN: 'approved', // publiée, reçoit des offres
  ASSIGNED: 'assigned', // une offre a été acceptée
  COMPLETED: 'completed', // terminée par l'artisan, en attente de validation + paiement client
  PAID: 'paid', // payée par le client (fin de mission)
  REJECTED: 'rejected',
  CLOSED: 'closed',
} as const;

export class HttpError extends Error {
  constructor(public status: number, message: string, public headers: Record<string, string> = {}) {
    super(message);
  }
}

function config() {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const project = process.env.APPWRITE_PROJECT_ID;
  const database = process.env.APPWRITE_DATABASE_ID;
  const key = process.env.APPWRITE_API_KEY;
  if (!endpoint || !project || !database || !key) {
    throw new HttpError(500, 'Configuration Appwrite serveur incomplète.');
  }
  return { endpoint, project, database, key };
}

async function appwrite(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const { endpoint, project, key } = config();
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': project,
      'X-Appwrite-Key': key,
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404) throw new HttpError(404, 'Document introuvable.');
    throw new HttpError(502, `Appwrite ${method} ${path} -> ${response.status}: ${text}`);
  }
  return response.json();
}

// API « Tables » d'Appwrite (collection = table, document = ligne).
export const db = {
  async get(collection: string, id: string) {
    const { database } = config();
    return appwrite('GET', `/tablesdb/${database}/tables/${collection}/rows/${encodeURIComponent(id)}`);
  },
  async update(collection: string, id: string, data: Record<string, unknown>, permissions?: string[]) {
    const { database } = config();
    return appwrite('PATCH', `/tablesdb/${database}/tables/${collection}/rows/${encodeURIComponent(id)}`, permissions ? { data, permissions } : { data });
  },
  async remove(collection: string, id: string) {
    const { database } = config();
    const { endpoint, project, key } = config();
    const response = await fetch(`${endpoint}/tablesdb/${database}/tables/${collection}/rows/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Appwrite-Project': project, 'X-Appwrite-Key': key },
    });
    if (!response.ok && response.status !== 404) throw new HttpError(502, `Appwrite DELETE ${collection}/${id} -> ${response.status}`);
  },
  /** `id` peut valoir 'unique()' pour laisser Appwrite générer l'identifiant. `permissions` : ex. ['read("user:abc")']. */
  async create(collection: string, id: string, data: Record<string, unknown>, permissions: string[] = []) {
    const { database } = config();
    return appwrite('POST', `/tablesdb/${database}/tables/${collection}/rows`, { rowId: id, data, permissions });
  },
  /** Les plus récents d'abord. `offset` permet la pagination. */
  async listRecent(collection: string, limit = 100, offset = 0) {
    const { database } = config();
    const order = encodeURIComponent(JSON.stringify({ method: 'orderDesc', attribute: '$createdAt' }));
    const lim = encodeURIComponent(JSON.stringify({ method: 'limit', values: [limit] }));
    const off = encodeURIComponent(JSON.stringify({ method: 'offset', values: [offset] }));
    const result = await appwrite('GET', `/tablesdb/${database}/tables/${collection}/rows?queries[]=${order}&queries[]=${lim}&queries[]=${off}`);
    return { rows: result.rows as any[], total: result.total as number };
  },
  async listEqual(collection: string, attribute: string, value: string, offset = 0) {
    const { database } = config();
    const q = encodeURIComponent(JSON.stringify({ method: 'equal', attribute, values: [value] }));
    const limit = encodeURIComponent(JSON.stringify({ method: 'limit', values: [100] }));
    const off = encodeURIComponent(JSON.stringify({ method: 'offset', values: [offset] }));
    const result = await appwrite('GET', `/tablesdb/${database}/tables/${collection}/rows?queries[]=${q}&queries[]=${limit}&queries[]=${off}`);
    return result.rows as any[];
  },
  /** Parcourt les pages de 100 (jusqu'à `maxPages`) : pour les listes qui peuvent dépasser 100 lignes. */
  async listAllEqual(collection: string, attribute: string, value: string, maxPages = 10) {
    const all: any[] = [];
    for (let page = 0; page < maxPages; page++) {
      const rows = await this.listEqual(collection, attribute, value, page * 100);
      all.push(...rows);
      if (rows.length < 100) break;
    }
    return all;
  },
};

/** Bucket des pièces justificatives (isolé : aucune permission côté navigateur, fichiers lisibles par leur propriétaire et les admins). */
export const bucketId = () => process.env.APPWRITE_BUCKET_ID || 'cv';

export const storage = {
  /** Envoie un fichier. `permissions` : ex. ['read("user:abc")', 'read("label:admin")']. */
  async upload(name: string, bytes: Uint8Array, mime: string, permissions: string[]) {
    const { endpoint, project, key } = config();
    const form = new FormData();
    form.append('fileId', 'unique()');
    form.append('file', new Blob([bytes], { type: mime }), name);
    permissions.forEach((p) => form.append('permissions[]', p));
    const response = await fetch(`${endpoint}/storage/buckets/${bucketId()}/files`, {
      method: 'POST',
      headers: { 'X-Appwrite-Project': project, 'X-Appwrite-Key': key },
      body: form,
    });
    if (!response.ok) throw new HttpError(502, `Appwrite Storage upload -> ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.json();
  },
  async meta(fileId: string) {
    return appwrite('GET', `/storage/buckets/${bucketId()}/files/${encodeURIComponent(fileId)}`);
  },
  async download(fileId: string): Promise<Uint8Array> {
    const { endpoint, project, key } = config();
    const response = await fetch(`${endpoint}/storage/buckets/${bucketId()}/files/${encodeURIComponent(fileId)}/download`, {
      headers: { 'X-Appwrite-Project': project, 'X-Appwrite-Key': key },
    });
    if (response.status === 404) throw new HttpError(404, 'Fichier introuvable.');
    if (!response.ok) throw new HttpError(502, `Appwrite Storage download -> ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  },
  async remove(fileId: string) {
    const { endpoint, project, key } = config();
    const response = await fetch(`${endpoint}/storage/buckets/${bucketId()}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { 'X-Appwrite-Project': project, 'X-Appwrite-Key': key },
    });
    if (!response.ok && response.status !== 404) throw new HttpError(502, `Appwrite Storage delete -> ${response.status}`);
  },
};

/**
 * Identifie l'appelant. Le navigateur envoie un JWT Appwrite
 * (Authorization: Bearer <jwt>) ; on le vérifie auprès d'Appwrite.
 */
export async function authenticate(req: VercelRequest): Promise<{ $id: string; name: string; email: string; phone?: string; labels: string[] }> {
  const header = req.headers.authorization || '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!jwt) throw new HttpError(401, 'Authentification requise.');

  const { endpoint, project } = config();
  const response = await fetch(`${endpoint}/account`, {
    headers: { 'X-Appwrite-Project': project, 'X-Appwrite-JWT': jwt },
  });
  if (!response.ok) throw new HttpError(401, 'Session invalide ou expirée.');
  const user = await response.json();
  return { $id: user.$id, name: user.name || '', email: user.email || '', phone: user.phone || undefined, labels: user.labels || [] };
}

/** Comparaison à temps constant pour les secrets. */
export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Taux de commission de la plateforme (0.12 = 12 %), borné à [0 ; 0.5]. */
export function commissionRate(): number {
  const raw = Number(process.env.COMMISSION_RATE ?? '0.12');
  if (!Number.isFinite(raw)) return 0.12;
  return Math.min(Math.max(raw, 0), 0.5);
}

/** Répartition d'un prix convenu : la commission est prélevée sur le total payé par le client. */
export function splitPrice(total: number) {
  const amount = Math.round(total);
  const commission = Math.round(amount * commissionRate());
  return { amount, commission, payout: amount - commission };
}

/** Réservé aux comptes portant le label Appwrite `admin`. */
export function requireAdmin(user: { labels: string[] }) {
  if (!user.labels.includes('admin')) throw new HttpError(403, 'Réservé aux administrateurs.');
}

export function readBody(req: VercelRequest): Record<string, any> {
  const body = req.body;
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body && typeof body === 'object' ? body : {};
}

/** Retire le HTML et les caractères de gabarit, puis borne la longueur. */
export function sanitizeText(input: unknown, maxLength = 5000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<\/?[^>]+(>|$)/g, '')
    .substring(0, maxLength)
    .replace(/[`${}]/g, '')
    .trim();
}
