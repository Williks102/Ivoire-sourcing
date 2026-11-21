import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readBody, safeEqual } from './_lib/server.js';
import { clientIp, rateLimit, sendError } from './_lib/security.js';
import { settlePayment } from './_lib/settle.js';
import { handleTelegram } from './_lib/telegramWebhook.js';
import { handlePaystack } from './_lib/paystackWebhook.js';

/**
 * Notification de la passerelle Paiement Pro.
 *
 * Contrôles : secret en temps constant, référence connue, montant égal à celui
 * enregistré à l'initialisation, traitement idempotent. Seul ce webhook peut
 * faire passer une mission à « payée ».
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Messages du bot Telegram : même fonction, reconnus à leur en-tête secret.
  if (req.headers['x-telegram-bot-api-secret-token'] !== undefined) return handleTelegram(req, res);

  // Notifications Paystack retransmises par l'application qui détient l'adresse du compte (en-tête de signature d'origine).
  if (req.headers['x-paystack-signature'] !== undefined) return handlePaystack(req, res);

  try {
    // Limitation par IP avant de comparer le secret (freine les essais répétés).
    await rateLimit(`ip:webhook:${clientIp(req)}`, 300, 60);
    const expected = process.env.PAYMENT_WEBHOOK_SECRET;
    const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
    if (!expected || !safeEqual(token, expected)) return res.status(401).json({ error: 'Unauthorized' });

    const payload = readBody(req);
    const reference = payload.reference || payload.referenceNumber || payload.ref;
    const status = String(payload.status || payload.payment_status || '').toUpperCase();
    if (!reference || typeof reference !== 'string') return res.status(400).json({ error: 'Référence manquante.' });

    const out = await settlePayment(req, reference, status, payload.amount === undefined ? undefined : Number(payload.amount));
    return res.status(out.status).json(out.body);
  } catch (error: any) {
    return sendError(res, error, '[webhook]');
  }
}
