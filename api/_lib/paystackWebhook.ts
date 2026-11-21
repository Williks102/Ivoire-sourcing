import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, readBody } from './server.js';
import { audit, clientIp, rateLimit, sendError } from './security.js';
import { settlePayment } from './settle.js';
import { paystackConfigured, verify } from './paystack.js';

/**
 * Notifications Paystack, reçues via l'adresse unique du compte : clicbillet.com la détient et retransmet les événements
 * `IVS-…` tels quels (corps brut + en-tête `x-paystack-signature` d'origine).
 *
 * - L'en-tête `x-paystack-signature` sert d'aiguillage ; son contenu n'est pas la garantie d'authenticité (le corps brut
 *   n'est pas disponible ici après lecture JSON).
 * - La garantie, c'est la relecture : le paiement n'est JAMAIS validé d'après le contenu reçu, on interroge Paystack
 *   (clé secrète, TLS) pour le statut, la devise et le montant. Un faux événement ne peut donc rien valider.
 * - Seules les références `IVS-…` nous concernent ; toutes les autres reçoivent « OK » (autre projet).
 */
export async function handlePaystack(req: VercelRequest, res: VercelResponse) {
  try {
    await rateLimit(`ip:paystack:${clientIp(req)}`, 300, 60);
    if (!paystackConfigured()) return res.status(503).json({ error: 'Paystack non configuré.' });

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
