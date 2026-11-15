import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, authenticate, db, readBody, splitPrice } from './_lib/server.js';

/**
 * Paiement de FIN de mission.
 *
 * Le client ne paie qu'une fois la mission déclarée terminée par l'artisan.
 * Le montant n'est JAMAIS lu dans la requête : il vient du prix convenu
 * (`agreedPrice`) figé côté serveur lors de l'acceptation de l'offre.
 * La commission de la plateforme est prélevée sur ce montant.
 */

const CHANNELS = ['WAVECI', 'OMCIV2', 'MOMOCI', 'FLOOZ', 'CARD'] as const;

const Schema = z.object({
  missionId: z.string().min(1).max(64),
  channel: z.enum(CHANNELS).default('WAVECI'),
  phoneNumber: z.string().trim().min(8).max(20).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
    const { missionId, channel, phoneNumber } = parsed.data;

    if (channel !== 'CARD' && !phoneNumber) {
      return res.status(400).json({ error: 'Le numéro Mobile Money est obligatoire.' });
    }

    const mission = await db.get('jobs', missionId);
    if (mission.employerId !== user.$id) throw new HttpError(403, 'Seul le client de la mission peut la payer.');
    if (mission.status === MISSION_STATUS.PAID) throw new HttpError(409, 'Cette mission est déjà payée.');
    if (mission.status !== MISSION_STATUS.COMPLETED) {
      throw new HttpError(409, "Le paiement n'est possible qu'une fois la mission terminée par l'artisan.");
    }

    const { amount, commission, payout } = splitPrice(Number(mission.agreedPrice));
    if (!(amount > 0)) throw new HttpError(409, 'Aucun prix convenu pour cette mission.');

    const merchantId = process.env.PAIEMENTPRO_MERCHANT_ID || '';
    if (!merchantId) throw new HttpError(500, "Le serveur n'est pas lié à un identifiant de marchand Paiement Pro.");
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || '';
    if (!webhookSecret) throw new HttpError(500, 'PAYMENT_WEBHOOK_SECRET non configuré.');

    const referenceNumber = `IVS-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const baseUrl = process.env.APP_URL || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) || '';
    if (!baseUrl) throw new HttpError(500, 'APP_URL non configuré.');

    // On enregistre l'intention de paiement AVANT d'appeler la passerelle :
    // le webhook retrouvera le montant attendu par sa référence.
    await db.create('payments', referenceNumber, {
      reference: referenceNumber,
      jobId: mission.$id,
      employerId: mission.employerId,
      artisanId: mission.assignedArtisanId,
      amount,
      commission,
      payout,
      channel,
      status: 'initiated',
      createdAt: new Date().toISOString(),
    });

    const [firstName = 'Client', ...rest] = (user.name || 'Client IvoireSource').split(' ');
    const paymentPayload = {
      merchantId,
      amount,
      description: `Paiement mission « ${String(mission.title).slice(0, 60)} »`,
      channel,
      countryCurrencyCode: '952',
      referenceNumber,
      customerEmail: user.email,
      customerFirstName: firstName,
      customerFirstname: firstName,
      customerLastName: rest.join(' ') || firstName,
      customerLastname: rest.join(' ') || firstName,
      customerPhoneNumber: phoneNumber ? phoneNumber.replace(/\s+/g, '') : '',
      notificationURL: `${baseUrl}/api/webhook?token=${encodeURIComponent(webhookSecret)}`,
      returnURL: `${baseUrl}/?payment=${encodeURIComponent(referenceNumber)}`,
      returnContext: JSON.stringify({ missionId: mission.$id, reference: referenceNumber }),
    };

    const apiResponse = await fetch('https://www.paiementpro.net/webservice/onlinepayment/js/initialize/initialize.php', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentPayload),
    });
    const responseText = await apiResponse.text();

    let apiData: any = null;
    try { apiData = JSON.parse(responseText); } catch { /* réponse non JSON */ }

    if (!apiResponse.ok || !apiData?.success || !apiData?.url) {
      await db.update('payments', referenceNumber, { status: 'failed' }).catch(() => {});
      console.error('[pay] passerelle:', apiResponse.status, responseText.slice(0, 300));
      return res.status(502).json({ error: "La passerelle de paiement a refusé d'initier la transaction." });
    }

    // Seuls le total et la commission sont renvoyés pour affichage ; la décision reste serveur.
    return res.status(200).json({ success: true, paymentUrl: apiData.url, referenceNumber, amount, commission, payout });
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('[pay]', error?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
