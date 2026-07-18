# Runbook : Migration Ivoire-Sourcing → Vercel + Appwrite

**Cible d'exécution :** Claude Code (CLI agentique)
**Type :** Migration one-shot, exécutée par phases
**Dépôt :** `Williks102/Ivoire-sourcing` (branche `main`)
**Dernière mise à jour :** 30 juin 2026

---

## Décision d'architecture (à lire avant de commencer)

**Voie retenue : héberger sur Vercel, garder Appwrite comme back-as-a-service.** On évite la dépendance unique à Appwrite pour l'hébergement et la logique métier, tout en gardant ses services prêts (auth/DB/storage/realtime).

| Composant | État actuel | Cible |
|-----------|-------------|-------|
| Hébergement frontend | Express `server.ts` (dev) / flou en prod | **Vercel** (build Vite statique) |
| Modération Gemini | route `server.ts` **+** `api/moderation/check-job.ts` (déjà OK) | **Vercel serverless** `api/` |
| Paiement Pro checkout | route `server.ts` `/api/pay` uniquement | **Vercel serverless** `api/pay.ts` (à porter) |
| Webhook paiement | route `server.ts` `/api/webhook` uniquement | **Vercel serverless** `api/webhook.ts` (à porter) |
| Temps réel | WebSocket Express + `onSnapshot` Firebase (mock vide) | **Appwrite Realtime** (client) |
| Auth / DB / Storage | ✅ déjà Appwrite | inchangé |
| Email employeur | ✅ Appwrite Function `notify-employer` (event-trigger) | inchangé (voir note) |

**Le point clé qui débloque tout :** Appwrite Realtime est une connexion **navigateur ↔ Appwrite**, indépendante de Vercel. Donc on supprime le WebSocket maison (impossible en serverless) sans perdre le live. Le pattern de remplacement : une route `api/` écrit un statut dans la DB Appwrite → l'abonnement Realtime du client se déclenche → toast.

**Ce qui disparaît :** `server.ts` (Express + WebSocket) et `lib/backend.ts` (mock Firebase). On ne garde qu'**une seule** source de vérité backend : le dossier `api/`.

> **Note sur `notify-employer`** : il reste une Appwrite Function car il est *event-triggered* (sur création de document `applications`) — Vercel n'a pas d'équivalent natif pour réagir à un event DB Appwrite. Ce n'est pas du lock-in d'hébergement, juste le bon outil. **Alternative full-portable** : créer une route `api/apply.ts` qui crée la candidature (via `node-appwrite`) *et* envoie l'email (Resend), et faire passer le client par cette route au lieu d'écrire en direct. Plus de travail ; à ne faire que si tu veux zéro Function Appwrite.

---

### Purpose

Finaliser la migration : héberger sur Vercel, compléter les routes serverless `api/`, brancher le flux de candidature mort, remplacer le temps réel Firebase/WebSocket par Appwrite Realtime, puis supprimer Express. À la fin : frontend statique Vercel + `api/` serverless + Appwrite (auth/DB/storage/realtime).

### Prerequisites

- [ ] Claude Code lancé à la racine du projet, accès en écriture au dépôt
- [ ] Compte Vercel + CLI : `npm i -g vercel` puis `vercel login`
- [ ] Projet Appwrite avec `PROJECT_ID`, `DATABASE_ID`, bucket CV
- [ ] **API Key serveur Appwrite** (scopes `documents.write`) — pour que `api/webhook.ts` écrive dans la DB
- [ ] Clés : `GEMINI_API_KEY`, `PAIEMENTPRO_MERCHANT_ID`, `PAYMENT_WEBHOOK_SECRET`, `RESEND_API_KEY`
- [ ] Variables déclarées dans **Vercel → Settings → Environment Variables** (pas seulement en local)

---

## Procedure

> **Sécurité** : une branche + un commit par phase. Ne supprimer `server.ts` / `backend.ts` qu'en Phase 6, après validation des phases précédentes.

### Phase 0 — Filet de sécurité

```bash
git checkout -b migration/vercel-appwrite
npm install
npm run lint   # baseline tsc --noEmit
```

**Expected result :** branche prête, baseline TypeScript connue.
**If it fails :** noter les erreurs `tsc` pré-existantes pour ne pas les confondre plus tard.

---

### Phase 1 — Variables d'environnement (local + Vercel)

Remplir `.env.local` (et mettre à jour `.env.example` sans valeurs). **Deux familles** :

```
# --- Frontend (préfixe VITE_, exposé au navigateur) ---
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=<...>
VITE_APPWRITE_DATABASE_ID=<...>
VITE_APPWRITE_BUCKET_CV_ID=<...>
VITE_PAIEMENTPRO_MERCHANT_ID=<...>

# --- Serverless api/ (JAMAIS de préfixe VITE_, reste côté serveur) ---
GEMINI_API_KEY=<...>
PAIEMENTPRO_MERCHANT_ID=<...>
PAYMENT_WEBHOOK_SECRET=<...>
APP_URL=https://<ton-domaine-vercel>
# Appwrite côté serveur (pour api/webhook.ts qui écrit dans la DB)
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=<...>
APPWRITE_DATABASE_ID=<...>
APPWRITE_API_KEY=<server_key_secrète>
```

⚠️ **Règle de sécurité Vite** : tout ce qui est préfixé `VITE_` est **embarqué dans le bundle navigateur**. Ne JAMAIS y mettre `APPWRITE_API_KEY`, `GEMINI_API_KEY` ni `PAYMENT_WEBHOOK_SECRET`.

Déclarer les mêmes variables dans la console Vercel (Production + Preview).

Corriger les placeholders en dur : dans `sourcingService.ts`, remplacer `const BUCKET_CV_ID = 'cv_bucket_id'` par `import.meta.env.VITE_APPWRITE_BUCKET_CV_ID` ; dans `appwrite.ts`, retirer les fallbacks `'ton_project_id_ici'`.

**Expected result :** `databases.listDocuments(DATABASE_ID, 'jobs', [])` répond sans 401/404.
**If it fails :** 401 = permissions de collection ; 404 = mauvais ID. Vérifier que collections `jobs`/`applications`/`users` existent avec attributs + permissions (lecture `any` sur jobs approuvés, écriture `users`).

---

### Phase 2 — Réparer le flux de candidature mort

Dans `App.tsx`, `submitApplication` (~ligne 842) ne fait que du `setState` local (`// add application`) et n'appelle jamais `sourcingService.submitApplication`. Conséquence : aucune candidature en DB, et `notify-employer` ne se déclenche jamais.

```ts
// App.tsx, à l'emplacement de "// add application"
if (!user || !applyingJob) return;
await sourcingService.submitApplication(applyingJob.id, user.$id, cvFile);
// puis maj profil + écrans de succès existants
```

Vérifier que `ApplicationFormModal.tsx` remonte bien un objet `File` (input `type="file"`) jusqu'à `submitApplication`, pas seulement `cvUrl`/`cvName`. Adapter la signature si nécessaire.

**Expected result :** postuler crée un doc `applications` + un fichier CV ; l'email employeur part.
**If it fails :** vérifier le trigger de `notify-employer` : `databases.*.collections.<applications_id>.documents.*.create`.

---

### Phase 3 — Remplacer `onSnapshot` par Appwrite Realtime

`SourcingHub.tsx` utilise `onSnapshot` (mock vide) sur `users`/`jobs`/`applications` ; `DashboardView.tsx` et `LandingView.tsx` importent aussi `lib/backend`.

Pattern de remplacement (web SDK déjà installé) :

```ts
import client, { databases, APPWRITE_CONFIG } from '../lib/appwrite';

useEffect(() => {
  let mounted = true;

  databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, 'jobs')   // remplace getDocs
    .then(r => { if (mounted) setJobs(r.documents); });

  const unsubscribe = client.subscribe(                          // remplace onSnapshot
    `databases.${APPWRITE_CONFIG.DATABASE_ID}.collections.jobs.documents`,
    (res) => {
      const evt = res.events;
      if (evt.some(e => e.endsWith('.create'))) setJobs(p => [res.payload, ...p]);
      if (evt.some(e => e.endsWith('.update'))) setJobs(p => p.map(j => j.$id === res.payload.$id ? res.payload : j));
      if (evt.some(e => e.endsWith('.delete'))) setJobs(p => p.filter(j => j.$id !== res.payload.$id));
    }
  );

  return () => { mounted = false; unsubscribe(); };
}, []);
```

Répéter pour `users` et `applications`. Remplacer toute la surface importée de `'../lib/backend'` dans les 3 fichiers. **Ne pas encore supprimer `backend.ts`** (Phase 6).

**Expected result :** Dashboard/Hub affichent des données réelles ; une création de job se reflète sans refresh.
**If it fails :** Realtime exige la **permission de lecture** sur la collection, sinon l'abonnement reste muet. Vérifier le format exact du channel.

---

### Phase 4 — Compléter les routes serverless `api/`

**4a. Vérifier l'existant (déjà fonctionnel) :**
- `api/moderation/check-job.ts` : modération Gemini ✅ — `PostJobView` l'appelle déjà via `fetch('/api/moderation/check-job')`, ce chemin marche tel quel sur Vercel.
- `api/payments/checkout-premium.ts` : checkout *simulé* ✅.

> Incohérence à corriger : le modèle Gemini diffère (`server.ts` = `gemini-3-flash-preview`, `api/` = `gemini-2.5-flash`). Choisir **un** modèle et l'aligner.

**4b. Porter le vrai paiement depuis `server.ts` :** créer `api/pay.ts` (handler Vercel) à partir de la route `/api/pay` existante — appel API Paiement Pro, retour `{ paymentUrl, referenceNumber }`. Adapter la signature `export default function handler(req: VercelRequest, res: VercelResponse)` et lire les secrets via `process.env`.

**4c. Porter le webhook :** créer `api/webhook.ts` à partir de `/api/webhook`. Différence clé : **remplacer `broadcastAction(...)` par une écriture Appwrite** (c'est elle qui déclenche le toast client via Realtime) :

```ts
import { Client, Databases } from 'node-appwrite';

const aw = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);     // server key, jamais exposée
const db = new Databases(aw);

// après vérification du token et statut SUCCESS :
await db.updateDocument(process.env.APPWRITE_DATABASE_ID!, 'jobs', jobId, {
  premium: true, paidAt: new Date().toISOString()
});
```

Ajouter `node-appwrite` aux dépendances **racine** :

```bash
npm install node-appwrite
```

URL à déclarer chez Paiement Pro : `https://<domaine-vercel>/api/webhook?token=<PAYMENT_WEBHOOK_SECRET>`.

**Expected result :** checkout renvoie une URL de paiement ; le webhook met à jour la DB ; le client reçoit le toast premium via l'abonnement Realtime de la Phase 3.
**If it fails :** Paiement Pro renvoie parfois du HTML au lieu de JSON — garder le parsing défensif `.text()` puis `JSON.parse` de l'ancien code. 401 sur `updateDocument` = scope manquant sur l'API key serveur.

---

### Phase 5 — Supprimer le WebSocket client

Dans `App.tsx` (~lignes 81-115), retirer le bloc `new WebSocket(...)`, `ws.onmessage`, la reconnexion et le mapping d'actions. Déplacer la logique des toasts (`job_moderation_approved`, `premium_payment_success`, candidatures…) dans les callbacks `client.subscribe` des Phases 3-4.

**Expected result :** zéro référence à `WebSocket` côté client ; notifications toujours fonctionnelles.
**If it fails :** un toast manquant = la route `api/` n'écrit pas le champ que l'abonnement surveille.

---

### Phase 6 — Démolition Express + config Vercel

Phases 2-5 validées :

```bash
git rm server.ts
git rm src/lib/backend.ts
git rm clean_app_firebase.cjs fix_imports.cjs fix_postjob.cjs migrate_app.cjs
```

`package.json` — retirer Express/WS, simplifier le build (Vercel compile `api/` tout seul) :

```jsonc
"scripts": {
  "dev": "vercel dev",      // local == prod (sert le build + les fonctions api/)
  "build": "vite build",
  "preview": "vite preview",
  "lint": "tsc --noEmit"
}
```

Retirer des `dependencies` : `express`, `express-rate-limit`, `ws`, `dotenv` (si plus utilisé front). Garder `@google/genai`, `zod`, `node-appwrite`, `appwrite`, `@vercel/node`. Puis `npm install`.

`vercel.json` — fallback SPA **sans avaler `/api`** :

```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

> Rate limiting : `express-rate-limit` disparaît avec Express. Sur Vercel serverless, le remplacer par Vercel Firewall / un rate-limit applicatif (ex. Upstash) si la protection anti-abus est requise sur `api/moderation` et `api/pay`. À défaut, noter la régression dans History.

CSP : il vivait dans `server.ts` (supprimé). Le réinjecter via `<meta http-equiv="Content-Security-Policy">` dans `index.html`, en **retirant les domaines Firebase** (`securetoken.googleapis.com`, `identitytoolkit.googleapis.com`) et en autorisant Appwrite : `connect-src 'self' https://cloud.appwrite.io wss://cloud.appwrite.io` (adapter à ton endpoint, `wss://` requis pour Realtime).

```bash
vercel --prod   # premier déploiement
```

**Expected result :** `npm run build` passe ; `git grep -i "firebase\|onSnapshot\|lib/backend\|new WebSocket\|express" src/` → 0 résultat ; le site tourne sur Vercel.
**If it fails :** build cassé sur un import = un fichier référence encore `backend.ts`.

---

## Verification

- [ ] `git grep -i "firebase\|firestore\|onSnapshot\|lib/backend\|new WebSocket" src/` → **0**
- [ ] Inscription / connexion / OAuth Google OK
- [ ] Publier une annonce → modération `api/` → apparition temps réel (Realtime)
- [ ] Postuler → doc `applications` + CV uploadé → email employeur reçu
- [ ] Paiement test → URL générée → `api/webhook` écrit en DB → toast premium live
- [ ] `vercel dev` en local se comporte comme la prod
- [ ] Aucun secret non-`VITE_` exposé dans le bundle (`grep -r "APPWRITE_API_KEY\|GEMINI_API_KEY" dist/` → 0)

## Troubleshooting

| Symptôme | Cause probable | Fix |
|----------|----------------|-----|
| `/api/*` renvoie l'`index.html` | rewrite SPA avale les routes API | Utiliser le negative-lookahead `/((?!api/).*)` |
| Clé secrète visible dans le navigateur | Variable préfixée `VITE_` à tort | Retirer le préfixe, redéployer |
| 401 sur `updateDocument` (webhook) | Scope manquant sur l'API key serveur | Ajouter `documents.write` |
| Realtime muet | Pas de permission lecture sur la collection | Ajouter lecture `any`/`users` |
| Toast premium absent | `api/webhook` n'écrit pas le champ surveillé | Aligner champ écrit ↔ champ surveillé par `subscribe` |
| Paiement : JSON parse error | Paiement Pro renvoie du HTML d'erreur | Conserver le parsing `.text()` défensif |
| Function timeout | Cold start + appel externe lent | Augmenter `maxDuration` dans `vercel.json` |

## Rollback

```bash
git checkout main                  # état pré-migration complet
git revert <hash_phase>            # annuler une phase précise
```

Conserver `server.ts` / `backend.ts` jusqu'à validation réelle des Phases 2-5 (filet). Sur Vercel, chaque déploiement est immuable : « Promote to Production » un déploiement antérieur depuis le dashboard en cas de régression.

## History

| Date | Exécuté par | Notes |
|------|-------------|-------|
| 30 juin 2026 | — | Runbook créé (voie Vercel + Appwrite). Phases 0-6 séquentielles. |
