# Configuration Appwrite — Ivoire-Sourcing

Instructions pour configurer le projet Appwrite (Cloud ou self-hosted) requis par le code
actuel (`src/services/*.ts`). Sans ça, l'app refuse de démarrer (`lib/appwrite.ts` lève une
erreur explicite si les variables sont absentes).

> **État actuel du projet `6a432b8a0012ed104e1b`** : base de données, 4 collections, tous les
> attributs/index et le bucket Storage ont déjà été créés via un script automatisé
> (`APPWRITE_ENDPOINT`/`APPWRITE_PROJECT_ID`/`APPWRITE_API_KEY` + appels REST). Valeurs réelles :
> `VITE_APPWRITE_DATABASE_ID=sourcing_db`, `VITE_APPWRITE_BUCKET_CV_ID=documents`, déjà dans
> `.env.local`. Il reste : activer Google OAuth (section 4) et poser le Label `admin` sur ton
> compte une fois inscrit. Le reste de ce document sert de référence sur ce qui a été créé, et de
> guide manuel si tu dois répliquer la config ailleurs (autre environnement, autre projet).

Compte ~20-30 min pour tout créer à la main dans la console (si tu n'as pas de script). L'ordre
ci-dessous est important : crée le projet et récupère les IDs avant de renseigner `.env.local`.

---

## 1. Projet

1. [cloud.appwrite.io](https://cloud.appwrite.io) (ou ton instance self-hosted) → **Create Project**.
2. Note le **Project ID** (visible dans Settings → général, ou dans l'URL de la console).
3. **Settings → Platforms → Add Platform → Web App** :
   - Name : `Ivoire Sourcing Web`
   - Hostname : `localhost` (dev). Ajoute aussi ton domaine Vercel plus tard (`ton-projet.vercel.app`).

## 2. Base de données

**Databases → Create Database** — nomme-la comme tu veux (ex. `sourcing_db`), note le **Database ID**.

Crée ensuite 4 collections. **L'ID de chaque collection doit être exactement celui indiqué**
(le code s'y réfère en dur) : `users`, `jobs`, `applications`, `unlocks`.

Pour chacune : active **Document Security** (Settings de la collection → Permissions → toggle
"Document Security"). C'est ce qui permet au code de donner à chaque utilisateur le contrôle de
*son propre* document, en plus des permissions globales ci-dessous.

### Collection `users`

| Attribut | Type | Config | Requis | Défaut |
|---|---|---|---|---|
| role | Enum | `candidate`, `employer`, `admin` | ✅ | — |
| displayName | String | 200 | ✅ | — |
| email | Email | | ✅ | — |
| photoURL | URL | | | — |
| location | String | 100 | | — |
| bio | String | 2000 | | — |
| skills | String | 50, **Array** | ✅ | `[]` |
| isVerified | Boolean | | ✅ | `false` |
| isPremium | Boolean | | ✅ | `false` |
| averageRating | Float | min 0, max 5 | ✅ | `0` |
| reviewCount | Integer | min 0 | ✅ | `0` |
| phone | String | 30 | | — |
| cvName | String | 200 | | — |
| cvUrl | URL | | | — |
| createdAt | Datetime | | ✅ | — |
| verificationDocs | String | **3000** | | — |

> `verificationDocs` est un tableau d'objets côté app (CNI, casier, domicile) — Appwrite n'a pas
> d'attribut "tableau d'objets", donc `userService.ts` le sérialise en JSON avant écriture et le
> parse à la lecture. 3000 caractères suffit pour 3 documents avec leurs URLs de fichiers.
> **Attention à la taille totale des attributs string d'une collection** : Appwrite Cloud a
> renvoyé `attribute_limit_exceeded` quand on a tenté 10000 (la ligne dépasse une limite interne
> une fois tous les champs `string`/`url` cumulés) — reste prudent si tu ajoutes des champs.

Index créés (nécessaires pour que `Query.equal`/`Query.orderDesc` restent performants aux yeux
d'Appwrite) : `idx_role` (role), `idx_role_verified` (role, isVerified).

Permissions de collection :
- **Create** : `users` (tout compte connecté)
- **Read** : `any` (public — nécessaire pour la recherche de candidats sur la landing page, visible sans connexion)
- **Update** : `label:admin`
- **Delete** : `label:admin`

(Le contrôle de son propre profil — update/delete de son propre document — est accordé par le
code à la création via des permissions par document, pas ici.)

### Collection `jobs`

| Attribut | Type | Config | Requis | Défaut |
|---|---|---|---|---|
| employerId | String | 50 | ✅ | — |
| title | String | 150 | ✅ | — |
| description | String | 5000 | ✅ | — |
| category | Enum | `nounou`, `chauffeur`, `boy`, `cuisinier`, `autre` | ✅ | — |
| location | String | 100 | ✅ | — |
| salaryRange | String | 50 | ✅ | — |
| status | Enum | `pending`, `approved`, `rejected`, `closed` | ✅ | — |
| isPremium | Boolean | | ✅ | `false` |
| createdAt | Datetime | | ✅ | — |

Permissions : Create `users` · Read `any` · Update `label:admin` · Delete `label:admin`.
Index : `idx_status` (status), `idx_employerId` (employerId).

### Collection `applications`

| Attribut | Type | Config | Requis | Défaut |
|---|---|---|---|---|
| jobId | String | 50 | ✅ | — |
| candidateId | String | 50 | ✅ | — |
| employerId | String | 50 | ✅ | — |
| status | Enum | `pending`, `accepted`, `rejected`, `approved` | ✅ | — |
| message | String | 2000 | ✅ | — |
| candidateName | String | 200 | | — |
| photoURL | URL | | | — |
| experienceYears | Integer | | | — |
| cvName | String | 200 | | — |
| cvFileId | String | 50 | | — |
| createdAt | Datetime | | ✅ | — |

Permissions : Create `users` · Read `users` · Update `users` · Delete `label:admin`.
Index : `idx_employerId` (employerId), `idx_candidateId` (candidateId).

> **Pourquoi `Read`/`Update` ouverts à `users` (tout compte connecté) et pas plus scopé.**
> Testé en vrai : Appwrite refuse qu'une session client accorde une permission par document à un
> `user:<id>` qui n'est pas *elle-même* (erreur 401 `Permissions must be one of: (any, users,
> user:<son-propre-id>, ..., label:admin)`). Or `sourcingService.submitApplication` est appelé par
> le **candidat**, qui ne peut donc pas accorder l'accès à l'**employeur** au moment de la création.
> Impossible à résoudre proprement avec uniquement le SDK client — d'où le repli sur la permission
> de collection `users`. Conséquence concrète : n'importe quel compte connecté pourrait, en
> contournant l'UI, lire ou modifier le statut de candidatures qui ne le concernent pas. L'UI ne
> l'expose pas (chaque vue filtre par `employerId`/`candidateId`), mais ce n'est pas une garantie
> serveur. Le vrai correctif serait une Appwrite Function côté serveur qui crée la candidature avec
> la bonne permission ciblée (clé API, pas de cette contrainte) — pertinent quand la logique de
> paiement/modération migrera aussi côté serveur.

### Collection `unlocks`

| Attribut | Type | Config | Requis | Défaut |
|---|---|---|---|---|
| employerId | String | 50 | ✅ | — |
| candidateId | String | 50 | ✅ | — |
| createdAt | Datetime | | ✅ | — |

Permissions : Create `users` · Read `label:admin` · Update — (aucune) · Delete `label:admin`.
Index : `idx_employerId` (employerId).

## 3. Storage (CV et pièces de vérification)

**Storage → Create Bucket** :
- Note le **Bucket ID** → variable `VITE_APPWRITE_BUCKET_CV_ID`.
- Taille max fichier : 5 Mo (aligné avec le texte affiché dans l'UI).
- Extensions autorisées : `pdf`, `doc`, `docx`.
- Permissions : **Create** `users` · **Read** `users` (connecté — les CV ne doivent pas être publics).

## 4. Authentification

**Auth → Settings** :
- **Email/Password** : activé par défaut, laisse tel quel.
- **Google OAuth2** (utilisé par `authService.loginWithGoogle`) : active le provider, renseigne
  Client ID / Client Secret depuis Google Cloud Console, et ajoute cette URL de redirection côté
  Google : `https://<ton-endpoint-appwrite>/v1/account/sessions/oauth2/callback/google/<PROJECT_ID>`.

### Compte admin

`App.tsx` attribue le rôle `admin` (côté affichage) à l'email `koffiw4@gmail.com` automatiquement.
**Mais** ça ne suffit pas pour les permissions Appwrite : le champ `role: admin` dans le document
`users` n'a aucun effet sur les droits d'accès — seul un **Label** Appwrite sur le compte Auth
active les permissions `label:admin` définies ci-dessus. Sans ce label, l'admin ne pourra ni
modérer les offres, ni vérifier les candidats, ni rien administrer.

Étapes :
1. Inscris-toi une première fois dans l'app avec `koffiw4@gmail.com` (ça crée le compte Auth).
2. Console Appwrite → **Auth → Users** → sélectionne ce compte → **Labels** → ajoute `admin`.

## 5. Variables d'environnement

Crée `.env.local` à la racine (jamais commité) :

```
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=<Project ID de l'étape 1>
VITE_APPWRITE_DATABASE_ID=<Database ID de l'étape 2>
VITE_APPWRITE_BUCKET_CV_ID=<Bucket ID de l'étape 3>
```

Puis les mêmes variables dans **Vercel → Settings → Environment Variables** (Production + Preview)
pour le déploiement — voir `RUNBOOK_migration_vercel_appwrite.md` Phase 1.

## 6. Test

```bash
npm run dev          # ou: npx vite
```

Parcours à valider dans le navigateur :
- [ ] Inscription candidat → un document apparaît dans la collection `users` (console Appwrite)
- [ ] Connexion `koffiw4@gmail.com` (après label `admin`) → accès au dashboard admin
- [ ] Publication d'une offre (employeur) → apparaît dans `jobs`
- [ ] Candidature avec CV → document dans `applications` + fichier dans le bucket Storage
- [ ] Modération admin (approuver/rejeter une offre) → `jobs.status` change
- [ ] Vérification d'identité (upload CNI) → `users.verificationDocs` se remplit, approbation admin fonctionne

## Limite connue

Les permissions ci-dessus sont ce qu'on peut faire avec **uniquement le SDK client** — elles ne
protègent pas totalement contre un utilisateur qui appellerait directement l'API Appwrite avec
son propre token (ex. rien n'empêche techniquement un compte non-admin d'essayer un
`databases.updateDocument` sur `jobs` — Appwrite refusera faute de `label:admin`, donc c'est
couvert). Le vrai point faible restant : le champ `role` dans le document `users` sert uniquement
à l'affichage/la navigation dans l'UI, pas à l'autorisation. C'est acceptable pour l'instant ; si
un jour la logique de modération/paiement passe en Appwrite Functions (Module 4), ce sera
l'occasion de durcir ça côté serveur avec la clé API.
