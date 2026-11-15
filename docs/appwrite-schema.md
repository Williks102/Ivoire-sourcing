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
`verificationDocs` string (JSON) 

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

## Permissions à régler dans la console (important)

Appwrite n'a pas de permissions par champ ; il faut donc que le navigateur ne puisse pas écrire les champs sensibles.

- `jobs` : *Create* pour les utilisateurs connectés ; *Read* pour tous. **Pas d'Update/Delete côté client**
  (document security activée, le créateur peut seulement lire). La modification d'une mission passe par le serveur.
  Tant que le client peut mettre à jour `jobs`, il pourrait écrire `status: "paid"` : ne laissez pas cet accès.
- `applications` : *Create* pour les utilisateurs connectés ; lecture réservée au client concerné (`employerId`) et
  à l'artisan (`candidateId`) via les permissions de document ; **pas d'Update client** (le serveur gère `accepted`/`rejected`).
- `users` : chaque utilisateur crée/modifie son propre document. Limite connue : `isVerified`, `averageRating`,
  `reviewCount` restent modifiables par leur propriétaire ; à déplacer vers une fonction serveur.
- `payments` : aucune permission client.

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
