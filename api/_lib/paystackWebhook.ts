import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, readBody, safeEqual } from './server.js';
import { audit, clientIp, rateLimit, sendError } from './security.js';
import { settlePayment } from './settle.js';
import { paystackConfigured, verify } from './paystack.js';

/**
 * Notifications Paystack, reçues via l'adresse unique du compte (ici retransmises par l'autre application qui la détient).
 *
 * - L'appel doit porter l'en-tête `x-forward-secret` (secret partagé PAYSTACK_FORWARD_SECRET) : coupe le bruit.
 * - Seules les références `IVS-…` nous concernent ; toutes les autres reçoivent « OK » (elles appartiennent à un autre projet).
 * - Le paiement n'est JAMAIS validé d'après le contenu reçu : on relit la transaction chez Paystack (statut, devise, montant).
 */
export async function handlePaystack(req: VercelRequest, res: VercelResponse) {
  try {
    await rateLimit(`ip:paystack:${clientIp(req)}`, 300, 60);
    const expected = process.env.PAYSTACK_FORWARD_SECRET;
    if (!paystackConfigured() || !expected || !safeEqual(req.headers['x-forward-secret'], expected)) return res.status(401).json({ error: 'Unauthorized' });

    const payload = readBody(req);
    const reference = typeof payload?.data?.reference === 'string' ? payload.data.reference : '';
    if (payload?.event !== 'charge.success' || !/^IVS-[A-Za-z0-9-]{4,60}$/.test(reference)) return res.status(200).json({ ok: true, ignored: true });

    const payment = await db.get('payments', reference).catch(() => null);
    if (!payment) return res.status(200).json({ ok: true, ignored: true });

    const truth = await verify(reference);
    if (truth.reference !== reference || truth.currency !== 'XOF') {
      await audit(req, 'gateway', 'payment.mismatch', reference, { currency: truth.currency });
      return res.status(400).json({ error: 'Transaction incohérente.' });
    }
    const out = await settlePayment(req, reference, truth.status === 'success' ? 'SUCCESS' : truth.status.toUpperCase() || 'UNKNOWN', truth.amountXof);
    return res.status(out.status).json(out.body);
  } catch (error: any) {
    return sendError(res, error, '[paystack-webhook]');
  }
}
