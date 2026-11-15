/**
 * Sauvegarde (JSON) des tables Appwrite : à lancer en local ou en tâche planifiée.
 *   APPWRITE_ENDPOINT=… APPWRITE_PROJECT_ID=… APPWRITE_DATABASE_ID=… APPWRITE_API_KEY=… npm run backup:appwrite
 * Écrit backups/AAAA-MM-JJ/<table>.json. Le dossier est ignoré par git : stockez-le hors du dépôt, chiffré.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const { APPWRITE_ENDPOINT: endpoint, APPWRITE_PROJECT_ID: project, APPWRITE_DATABASE_ID: database, APPWRITE_API_KEY: key } = process.env;
if (!endpoint || !project || !database || !key) { console.error('Variables APPWRITE_* manquantes.'); process.exit(1); }
const headers = { 'X-Appwrite-Project': project, 'X-Appwrite-Key': key };
const TABLES = ['users', 'jobs', 'applications', 'payments', 'quote_templates', 'audit_logs', 'outreach'];
const dir = `backups/${new Date().toISOString().slice(0, 10)}`;
mkdirSync(dir, { recursive: true });

for (const table of TABLES) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 100) {
    const q = [JSON.stringify({ method: 'limit', values: [100] }), JSON.stringify({ method: 'offset', values: [offset] })].map((x) => `queries[]=${encodeURIComponent(x)}`).join('&');
    const r = await fetch(`${endpoint}/tablesdb/${database}/tables/${table}/rows?${q}`, { headers });
    if (r.status === 404) { console.log(`- ${table} : absente, ignorée`); break; }
    if (!r.ok) throw new Error(`${table}: ${r.status}`);
    const page = (await r.json()).rows as unknown[];
    rows.push(...page);
    if (page.length < 100) { writeFileSync(`${dir}/${table}.json`, JSON.stringify(rows, null, 2)); console.log(`✓ ${table} : ${rows.length} lignes`); break; }
  }
}
