# Relais Paystack : ajouter IvoireSource dans clicbillet-2

clicbillet-2 détient l'adresse unique du compte Paystack (`/api/webhooks/paystack`) et relaie déjà les événements
« étrangers » (références ne commençant pas par `ORD-`) vers `PAYSTACK_FOREIGN_WEBHOOK_FORWARD_URL` (l'application
clicbapp / monticket). Il faut aiguiller les références `IVS-` vers IvoireSource.

## Modification à faire dans clicbillet-2 (`server/routes/payments.ts`)

1. Nouvelle variable Vercel (clicbillet-2) : `PAYSTACK_IVOIRESOURCE_WEBHOOK_URL=https://ivoire-sourcing.vercel.app/api/webhook`
   (à déclarer aussi dans `server/lib/config.ts`).
2. Rendre `relayForeignPaystackEvent` paramétrable par URL, par exemple :

```ts
async function relayPaystackEvent(req: express.Request, url: string): Promise<boolean> {
  if (!url) { console.warn("[Paystack Webhook] URL de relais non configurée — événement ignoré."); return false; }
  try {
    const signature = req.headers["x-paystack-signature"];
    const relayRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(signature ? { "x-paystack-signature": String(signature) } : {}) },
      body: (req as any).rawBody ?? JSON.stringify(req.body || {}),
    });
    return relayRes.ok;
  } catch (err: any) {
    console.error("[Paystack Webhook] Échec du relais:", err.message);
    return false;
  }
}
```

3. Dans le gestionnaire, remplacer le bloc `if (rawReference && !rawReference.startsWith("ORD-")) { … }` par :

```ts
if (rawReference && !rawReference.startsWith("ORD-")) {
  const target = rawReference.startsWith("IVS-") ? PAYSTACK_IVOIRESOURCE_WEBHOOK_URL : PAYSTACK_FOREIGN_WEBHOOK_FORWARD_URL;
  const relayed = await relayPaystackEvent(req, target);
  return res.status(relayed ? 200 : 502).json({ status: relayed ? "success" : "error" });
}
```

Les paiements `ORD-` de ClicBillet et les autres références (clicbapp) ne changent pas.

## Côté IvoireSource (Vercel)

`PAYSTACK_SECRET_KEY` (la même clé que clicbillet-2), puis `PAYMENT_PROVIDER=paystack`.
IvoireSource ne fait pas confiance au contenu relayé : il relit chaque transaction chez Paystack (statut, devise XOF, montant ×100).
