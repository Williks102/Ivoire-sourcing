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
`averageRating` float · `reviewCount` int · `trades` string[] (métiers de l'artisan : plomberie, electricite, …) · `serviceCities` string[] · `experienceYears` int · `whatsappConsent` bool · `whatsappConsentAt` string · `businessName` string · `businessRegistration` string · `phone` string · `cvName` string · `cvUrl` string · `createdAt` string ·
`verificationDocs` string (JSON ; à terme, stocker les fichiers dans Storage plutôt qu'en base64)

### `jobs` (= missions)
`employerId` string · `title` string · `description` string · `category` string · `location` string · `address` string ·
`scheduledDate` string · `budget` int (FCFA) · `status` string · `createdAt` string ·
*(écrits par le serveur)* `assignedArtisanId` string · `assignedApplicationId` string · `agreedPrice` int · `assignedAt` string ·
`completedAt` string · `paidAt` string · `paymentReference` string · `commissionAmount` int · `artisanPayout` int ·
`payoutStatus` string (`pending` | `sent`) · `payoutSentAt` string · `payoutReference` string · `aiSummary` string · `aiTags` string[] · `aiMissing` string[] · `aiCategory` string

Index conseillés : `employerId`, `assignedArtisanId`, `status`.

### `applications` (= offres / devis)
`jobId` string · `employerId` string · `candidateId` string · `candidateName` string · `photoURL` string ·
`experienceYears` int · `trades` string[] (copiés du profil par le serveur) · `proposedPrice` int (FCFA, **prix en cours de négociation**) · `lastProposedBy` string (`artisan` | `client`) · `rounds` int · `history` string (JSON) · `quote` string (JSON, devis détaillé facultatif, texte long) · `delay` string · `message` string · `status` string
(`pending` = en discussion | `accepted` | `rejected` = refusée par le client | `withdrawn` = retirée par l'artisan) · `createdAt` string

Index conseillés : `jobId`, `candidateId`.

### `outreach` (journal des diffusions, **serveur uniquement**)
`missionId` string · `artisanId` string · `channel` string (`whatsapp`) · `adminId` string · `createdAt` string.
Aucune permission côté navigateur : lu et écrit par `/api/admin/outreach`.

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
| `payments` | aucun accès | aucun accès en direct ; lecture et suivi des reversements via `/api/admin/payments` (label `admin` vérifié côté serveur) | tout |
| `users` | crée son profil, lit/modifie le sien | lecture/écriture | lecture |

Conséquences : un client ne peut ni se faire passer pour un autre (`employerId` vient du JWT), ni contourner la
modération, ni écrire `status: "paid"`. Limite connue : dans `users`, `isVerified`, `averageRating` et `reviewCount`
restent modifiables par leur propriétaire ; à déplacer vers une fonction serveur.

Les missions sont lisibles par tous, y compris celles en attente de modération et l'adresse saisie : n'y mettez
pas d'information sensible.

## Administration

Le panneau admin s'ouvre sur « À traiter » : missions à valider, reversements à faire aux artisans, certifications en
attente, et (pour information) missions terminées en attente de paiement du client. L'onglet « Paiements » affiche
l'encaissé, les commissions et les reversements. « Reversement effectué » passe par `POST /api/admin/payments`
(action `markPayoutSent`) : réservé au label `admin`, uniquement sur une mission payée, une seule fois.

Garde-fous : une mission en cours, terminée ou payée ne peut plus être validée, refusée, clôturée ni supprimée depuis
l'admin, et une offre retenue ne peut pas être supprimée.

## Devis, reçus et revenus

**Devis détaillé (facultatif).** À l'envoi d'une offre, l'artisan peut joindre un devis : lignes (désignation, quantité, unité,
prix unitaire), remise, validité (1 à 90 jours) et conditions. Le **serveur recalcule le total**, qui devient le prix de l'offre
(le prix envoyé par le navigateur est ignoré). Maximum 30 lignes ; textes nettoyés (pas de HTML). Sans devis détaillé, l'offre
reste un simple prix. Le devis suit la négociation : si le prix change, le document affiche une ligne « Ajustement négocié » et
le total reste égal au prix en cours, puis au **prix convenu** une fois accepté.

**Documents PDF** (`POST /api/documents`, produits côté serveur à partir de la base) :
- `quote` : devis d'une offre, avec ou sans lignes détaillées (client, artisan concerné, admin) ; numéro `DEV-AAAAMMJJ-XXXX`
  dérivé de l'offre ;
- `receipt` : reçu d'une mission **payée** (client, artisan concerné, admin) ; ne mentionne ni la commission ni la part de l'artisan ;
- `statement` : relevé annuel de revenus de l'artisan connecté (missions payées de l'année, commission, net, reversement).

Aucun numéro de téléphone ni e-mail dans les documents (les échanges restent sur la plateforme). Informations d'entreprise
facultatives (`businessName`, `businessRegistration`) reprises sur les documents si elles sont renseignées. Ce sont des **devis et
reçus de la plateforme, pas des factures fiscales certifiées** : à faire valider par un comptable avant tout usage comptable.

**Revenus de l'artisan** (onglet « Mes revenus », sans donnée supplémentaire) : gagné (net), déjà reçu, à recevoir, à venir
(estimation au taux de commission affiché), prix cumulé, commission payée, panier moyen, taux d'offres retenues, revenus par mois et
par métier, liste des missions payées avec reçu, export CSV (séparateur « ; », ouvert directement par Excel).

## Négociation du prix (façon inDrive)

L'artisan propose un prix ; le client peut **accepter**, **refuser** ou **contre-proposer** ; l'artisan peut alors **accepter**,
**contre-proposer** ou **se retirer** ; et ainsi de suite, à tour de rôle, jusqu'à ce que l'un accepte le dernier prix de l'autre.
La mission est alors attribuée **au prix négocié** (`agreedPrice`), les autres offres sont refusées, et le paiement de fin de
mission / la commission se calculent sur ce prix.

Règles (vérifiées par `/api/missions/negotiate`, pas par le navigateur) : seules les deux parties concernées ; on ne répond que
**quand c'est son tour** ; on n'accepte que le **dernier prix de l'autre** ; une contre-offre du client est **inférieure** au prix
demandé et celle de l'artisan **supérieure** à celle du client ; prix entier entre 500 et 10 000 000 FCFA ; **8 propositions au
maximum** (offre initiale comprise), ensuite il ne reste qu'à accepter ou refuser ; le prix affiché à l'écran est renvoyé avec la
réponse (`expectedPrice`) : si l'autre partie vient de le modifier, l'action est refusée. Chaque échange (qui, prix, heure, message
de 200 caractères max) est conservé dans `history`. Les offres créées avant cette fonction sont lues comme une proposition de
l'artisan, sans historique.

Notifications en temps réel : l'autre partie est prévenue à chaque proposition, à l'acceptation, au refus ou au retrait.

## Diffusion aux artisans (WhatsApp) et IA

Sur une mission **ouverte**, l'admin ouvre « Trouver des artisans » (onglet Missions) ou « Diffuser » (onglet À traiter).
`/api/admin/outreach` (label `admin` vérifié) calcule les artisans concernés : même **métier**, **ville** couverte
(zones d'intervention, sinon ville du profil), **consentement WhatsApp** coché, **numéro valide** (ivoirien à 10 chiffres,
ou international avec « + »). Classement : jamais contactés, certifiés, mieux notés, plus expérimentés. Les profils
pertinents écartés faute de consentement ou de numéro sont comptés, pas listés.

L'envoi est **manuel** : chaque bouton ouvre `wa.me` avec le message prérempli, depuis le WhatsApp de l'admin. Le contact est
journalisé dans `outreach`. Le message est un modèle fixe ; si `GEMINI_API_KEY` est configurée, « Améliorer avec l'IA » en
propose une version. La version IA n'est retenue que si elle contient notre lien et `{prenom}` et aucun autre lien ni numéro.

IA (Gemini, côté serveur uniquement) : (1) à la publication, **un seul appel** modère la mission et l'analyse (résumé,
spécialités, informations manquantes, métier suggéré) ; (2) brouillon du message WhatsApp. Aucune donnée personnelle
(nom, téléphone, e-mail) n'est envoyée à l'IA ; les textes saisis par les utilisateurs sont traités comme des données.
Sans clé ou en cas de panne : modération manuelle et message fixe. Variables : `GEMINI_API_KEY`, `GEMINI_MODEL` (facultatif).

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
