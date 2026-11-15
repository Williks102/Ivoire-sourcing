# IvoireSource — mise en relation clients / artisans

Marketplace de missions ponctuelles en Côte d'Ivoire (plomberie, électricité, climatisation, peinture, ménage…).
Un client publie une mission, des artisans envoient des offres, le client choisit, puis **paie à la fin de la
mission** par Mobile Money. La plateforme prélève une commission sur le prix convenu.

Stack : Vite + React, Vercel (fonctions `/api`), Appwrite (auth, base, stockage), Paiement Pro.

## Démarrer

```
npm install
cp .env.example .env.local   # renseigner Appwrite, Paiement Pro, COMMISSION_RATE
npm run dev                  # vercel dev
```

Schéma de la base, permissions et cycle de vie d'une mission : [`docs/appwrite-schema.md`](docs/appwrite-schema.md).
