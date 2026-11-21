# Sécurité — IvoireSource

Application du « Guide du Vibecoder Sécurisé » (règle d'or : *ne jamais faire confiance au client*).

## Ce qui est en place

| Commandement | Mise en œuvre |
|---|---|
| 1. Authentification déléguée | Appwrite Auth ; JWT court envoyé en `Authorization: Bearer` ; rôle admin = label Appwrite, jamais un champ modifiable |
| 2. Vérification serveur | Montants, commission, statuts, droits : tout est recalculé dans `/api` (`api/_lib/server.ts`) |
| 3. Validation | Zod strict sur chaque route ; liste blanche des champs de profil (`api/profile.ts`) |
| 4. Secrets | Uniquement en variables Vercel ; aucune clé dans le code ni préfixée `VITE_` ; scan dans la CI |
| 5. XSS | Plus de `document.write`, `innerHTML` ni d'adresse lue en base : pièces affichées via `blob:` (`SecureDoc.tsx`) |
| 6. Routes protégées | `protect()` = origine → quota IP → authentification → quota utilisateur ; IDOR → 404 |
| 7. Dépendances | `npm audit --omit=dev` = 0 ; Dependabot (mises à jour mineures) — pas de CI GitHub, lancer `npm audit --omit=dev` à la main |
| 8. Limitation de débit | Par IP et par utilisateur ; Upstash si configuré, sinon mémoire ; webhook limité avant comparaison du secret |
| 9. Audit | Table `audit_logs` (paiements, acceptations, téléversements, échecs) |
| 10. Plan B | `npm run backup:appwrite` ; journal d'audit ; retour arrière Vercel (Deployments → Promote) |
| 11. Fichiers | Type lu dans les octets (PNG/JPEG/WebP/PDF), 3 Mo max, PDF actifs refusés, nom aléatoire, bucket sans droit navigateur |
| 12. CSRF | Contrôle de l'en-tête `Origin` sur toutes les écritures |
| 13. En-têtes | CSP stricte, HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy (`vercel.json`) |

## Notifications Telegram

- Jeton du bot (`TELEGRAM_BOT_TOKEN`) uniquement dans Vercel ; le secret du webhook et les liens de liaison en sont dérivés (HMAC), valables 24 h.
- Le webhook (`/api/webhook`, en-tête secret Telegram) refuse tout appel sans le bon secret ; seules les conversations privées sont acceptées.
- L'identifiant de conversation reste côté serveur (jamais renvoyé au navigateur, non modifiable depuis `/api/profile`).
- Un envoi ne bloque jamais une action : en cas de panne ou de bot bloqué, la mission/offre passe quand même.

## À faire par le propriétaire (non automatisable ici)

1. **Relancer `npm run setup:appwrite`** : retire les droits d'écriture navigateur sur `users` et le bucket, crée `audit_logs`.
2. Ajouter dans Vercel : `APPWRITE_BUCKET_ID`, `PAIEMENTPRO_MERCHANT_ID`, `ALLOWED_ORIGINS` si domaine personnalisé.
3. Créer une base Upstash Redis gratuite et renseigner `UPSTASH_REDIS_REST_URL` / `_TOKEN`.
4. Domaine personnalisé pour l'app *et* l'API Appwrite (sous-domaine) : cookies de session en même site.
5. Activer la double authentification sur les comptes admin, Vercel, GitHub et Appwrite.
6. Révoquer les anciennes clés Firebase ; supprimer les variables Vercel `VITE_FIREBASE_*` devenues inutiles.
7. Brancher une alerte d'erreurs (Sentry) et planifier la sauvegarde (`backup:appwrite`).

## Limites connues

- Les images ne sont pas ré-encodées côté serveur (le navigateur le fait avant l'envoi) ; antivirus Appwrite activé sur le bucket.
- Les actions admin sur profils/missions passent encore par les droits Appwrite du label `admin` (pas par `/api`).

## Incident : marche à suivre

1. Vercel → Deployments → promouvoir la dernière version saine.
2. Appwrite → révoquer/recréer la clé API, mettre à jour `APPWRITE_API_KEY` dans Vercel, redéployer.
3. Consulter `audit_logs`, restaurer depuis `backups/` si besoin.

## Reversement aux artisans

- Compte Mobile Money de l'artisan (opérateur + numéro) saisi dans son profil, validé par le serveur ; chaque changement est tracé (numéro tronqué dans le journal) et signalé à l'artisan sur Telegram.
- Le compte est **figé sur la mission au moment du paiement** : un changement ultérieur ne redirige pas l'argent déjà encaissé.
- L'admin voit « Payer sur <opérateur> : <numéro> » dans « Reversements à faire », envoie le transfert, saisit la référence puis marque « Reversement effectué » ; l'artisan est prévenu.

## Paystack (adresse de notification unique partagée)

- Paystack n'a qu'une adresse de notification par compte : elle est détenue par `clicbillet.com`, qui retransmet à `/api/webhook` les événements dont la référence commence par `IVS-` tels quels (corps brut et en-tête `x-paystack-signature` d'origine, comme clicbillet le fait déjà pour l'autre projet).
- IvoireSource ignore (« OK ») toute autre référence, et **ne valide jamais d'après le contenu reçu** : la transaction est relue chez Paystack (`/transaction/verify`) avec la clé secrète ; statut, devise (XOF) et montant (×100) doivent correspondre à ce qui est enregistré.
- Activation : `PAYMENT_PROVIDER=paystack` + `PAYSTACK_SECRET_KEY`. Sans cela, Paiement Pro reste utilisé.
