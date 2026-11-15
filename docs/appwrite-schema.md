# Schéma Appwrite — marketplace de missions

Cycle de vie d'une mission (le paiement n'intervient **qu'à la fin**) :

```
pending ──(modération)──> approved ──(client choisit une offre)──> assigned
   ──(artisan : "terminé")──> completed ──(client paie, webhook confirme)──> paid
```

Les transitions `approved → assigned` et `assigned → completed` passent par `POST /api/missions/transition`,
le paiement par `POST /api/pay`, la confirmation par `POST /api/webhook`. Ces trois fonctions utilisent la clé API
serveur : **seul le serveur** écrit `agreedPrice`, `assignedArtisanId`, `paid*`, `commissionAmount`, `artisanPayout`.

## Collections

### `users` (id du document = id du compte Appwrite)
`uid` string · `role` string (`candidate` = artisan, `employer` = client) · `displayName` string · `email` string ·
`photoURL` string · `location` string · `bio` string · `skills` string[] · `isVerified` bool · `isPremium` bool ·
`averageRating` float · `reviewCount` int · `phone` string · `cvName` string · `cvUrl` string · `createdAt` string ·
`verificationDocs` string (JSON ; à terme, stocker les fichiers dans Storage plutôt qu'en base64)

### `jobs` (= missions)
`employerId` string · `title` string · `description` string · `category` string · `location` string · `address` string ·
`scheduledDate` string · `budget` int (FCFA) · `status` string · `createdAt` string ·
*(écrits par le serveur)* `assignedArtisanId` string · `assignedApplicationId` string · `agreedPrice` int · `assignedAt` string ·
`completedAt` string · `paidAt` string · `paymentReference` string · `commissionAmount` int · `artisanPayout` int ·
`payoutStatus` string (`pending` | `sent`)

Index conseillés : `employerId`, `assignedArtisanId`, `status`.

### `applications` (= offres / devis)
`jobId` string · `employerId` string · `candidateId` string · `candidateName` string · `photoURL` string ·
`experienceYears` int · `proposedPrice` int (FCFA) · `delay` string · `message` string · `status` string
(`pending` | `accepted` | `rejected`) · `createdAt` string

Index conseillés : `jobId`, `candidateId`.

### `payments` (nouvelle, **à créer**)
Id du document = référence de paiement. `reference` string · `jobId` string · `employerId` string · `artisanId` string ·
`amount` int · `commission` int · `payout` int · `channel` string · `status` string (`initiated` | `success` | `failed` | `mismatch`) ·
`createdAt` string · `paidAt` string · `gatewayStatus` string

**Permissions : aucune pour les clients** (ni lecture ni écriture). Seule la clé API serveur y accède.

## Mise en place automatique

Après avoir créé le projet Appwrite et une clé API (voir l'en-tête de `scripts/setup-appwrite.ts`) :

```
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1 APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... npm run setup:appwrite
```

Le script crée la base, les collections, les attributs, les index, les permissions et le bucket ; il peut être
relancé sans risque (il réapplique les permissions). Il affiche à la fin les variables à copier dans Vercel.
À faire à la main : ajouter une plateforme Web dans la console, et poser le label `admin` (voir plus bas).

## Permissions (appliquées par le script)

Appwrite n'a pas de permissions par champ ; la règle retenue est donc : **les clients n'écrivent pas** dans
`jobs`, `applications` et `payments`. Tout passe par les fonctions serveur, qui vérifient l'identité (JWT) et les droits.

| Collection | Client (utilisateur connecté) | Admin (label `admin`) | Serveur (clé API) |
|---|---|---|---|
| `jobs` | lecture publique, aucune écriture | lecture/écriture | création (`/api/missions/create`), transitions, paiement |
| `applications` | lecture de ses propres offres (permission de document : client de la mission + artisan) | lecture/écriture | création (`/api/missions/offer`), acceptation |
| `payments` | aucun accès | aucun accès | tout |
| `users` | crée son profil, lit/modifie le sien | lecture/écriture | lecture |

Conséquences : un client ne peut ni se faire passer pour un autre (`employerId` vient du JWT), ni contourner la
modération, ni écrire `status: "paid"`. Limite connue : dans `users`, `isVerified`, `averageRating` et `reviewCount`
restent modifiables par leur propriétaire ; à déplacer vers une fonction serveur.

Les missions sont lisibles par tous, y compris celles en attente de modération et l'adresse saisie : n'y mettez
pas d'information sensible.

## Administrateur

Le rôle `admin` n'est plus déduit d'un e-mail ni du champ `role` : il vient du **label Appwrite `admin`** posé sur le
compte depuis la console (Auth → utilisateur → Labels).

## Variables d'environnement

Voir `.env.example`. Le taux de commission réellement appliqué est `COMMISSION_RATE` (serveur) ;
`VITE_COMMISSION_RATE` ne sert qu'à l'affichage : gardez les deux identiques.

## Reversement à l'artisan

Au paiement, le webhook enregistre `artisanPayout` et `payoutStatus: "pending"`. Le reversement vers l'artisan
(Mobile Money) est **manuel** pour l'instant : il reste à automatiser avec une API de décaissement
(à confirmer avec Paiement Pro) ou à traiter depuis l'écran admin.
