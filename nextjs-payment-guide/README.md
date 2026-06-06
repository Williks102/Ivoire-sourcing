# Guide d'Intégration Hybride Next.js + Prisma + Neon + Firebase Auth + Paiement Pro

Ce guide présente une architecture robuste et sécurisée pour gérer un flux de paiement complet et performant.

## 📁 Fichiers inclus dans ce dossier de référence
1. `schema.prisma` : Modélisation de votre base de données relationnelle PostgreSQL sur Neon. L'identifiant utilisateur `User.id` correspond directement à l'UID généré par Firebase Auth.
2. `route-pay.ts.txt` : Implémentation complète de votre Route Handler Next.js `app/api/pay/route.ts` pour enregistrer la commande en statut `PENDING` et se connecter d'un serveur à l'autre avec Paiement Pro.
3. `route-webhook.ts.txt` : Implémentation du webhook public `app/api/webhook/route.ts` avec protection par jeton secret partagé et vérification anti-fraude.
4. `checkout-page.tsx.txt` : Composant client React `app/checkout/page.tsx` doté de la gestion d'état de session Firebase, récupération de l'UID et déclenchement d'itinéraire de paiement.

---

## ⚙️ Configuration de l'environnement (`.env.local`)

Pour faire tourner cette intégration sur Next.js, déclarez les variables d'environnement suivantes dans votre fichier `.env.local` :

```env
# URL de connexion à votre cluster Neon PostgreSQL (Prisma supporté)
DATABASE_URL="postgresql://[user]:[password]@[host]/[database]?sslmode=require"

# Identifiants Merchant officiels de votre compte Paiement Pro (reçus du support Paiement Pro)
PAIEMENTPRO_MERCHANT_ID="votre_merchant_id"

# Clé de signature partagée pour sécuriser l'URL du webhook de notification
PAYMENT_WEBHOOK_SECRET="votre_token_secret_pour_webhook_unique_et_difficile_a_deviner"

# URL de production de votre site web (nécessaire pour la génération automatique des URL de retour/notification)
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## 🛡️ Mesures de Sécurité Clés Implémentées

### 1. Clé ID Securisée de Session (Firebase Auth → Neon/Prisma)
- Le client d'authentification s'authentifie auprès de Firebase Auth (SDK Client).
- Lors de l'envoi de la requête de checkout, l'application transmet l'UID utilisateur. 
- Dans la route `/api/pay`, le serveur effectue une transaction `upsert` sécurisée dans Neon. Ceci assure la synchronisation transparente sans dépendre d'OAuth complexes pour créer le profil de l'utilisateur.

### 2. Sécurisation Anti-Splitting et Injection de Webhook via TOKEN secret
- L'URL de notification transmise à Paiement Pro contient un paramètre token unique (ex: `/api/webhook?token=VOTRE_TOKEN_SECRET`).
- Ainsi, un pirate ne peut pas lancer de requête falsifiée en envoyant des faux statuts `SUCCESS` sur votre route `/api/webhook` sans posséder ce secret d'environnement.

### 3. Protection Anti-Fraude par comparaison des montants
- Le webhook vérifie si le montant déclaré payé par Paiement Pro correspond exactement au centime près au montant enregistré sur la commande en base. Si un écart est détecté, la transaction échoue immédiatement pour bloquer l'attaque de type "man-in-the-middle".
