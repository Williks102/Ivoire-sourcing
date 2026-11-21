import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError, MISSION_STATUS, db, readBody, safeEqual } from './_lib/server.js';
import { audit, clientIp, rateLimit, sendError } from './_lib/security.js';
import { handleTelegram } from './_lib/telegramWebhook.js';
import { esc, fcfa, notifyUser } from './_lib/telegram.js';

/**
 * Notification de la passerelle Paiement Pro.
 *
 * Contrôles : secret en temps constant, référence connue, montant égal à celui
 * enregistré à l'initialisation, traitement idempotent. Seul ce webhook peut
 * faire passer une mission à « payée ».
 */

const SUCCESS = new Set(['SUCCESS', 'APPROVED', 'SUCCESSFUL', 'PAID']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Messages du bot Telegram : même fonction, reconnus à leur en-tête secret.
  if (req.headers['x-telegram-bot-api-secret-token'] !== undefined) return handleTelegram(req, res);

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

    const payment = await db.get('payments', reference);

    // Déjà traité : on répond 200 pour que la passerelle arrête de renvoyer.
    if (payment.status === 'success') return res.status(200).json({ success: true, duplicate: true });

    if (!SUCCESS.has(status)) {
      await db.update('payments', reference, { status: 'failed', gatewayStatus: status.slice(0, 40) });
      await audit(req, 'gateway', 'payment.failed', reference, { status: status.slice(0, 40) });
      return res.status(200).json({ success: true, recorded: 'failed' });
    }

    // Si la passerelle renvoie un montant, il doit correspondre exactement à celui attendu.
    if (payload.amount !== undefined && Math.round(Number(payload.amount)) !== Number(payment.amount)) {
      await db.update('payments', reference, { status: 'mismatch', gatewayStatus: status.slice(0, 40) });
      await audit(req, 'gateway', 'payment.mismatch', reference, { received: Number(payload.amount) || null, expected: Number(payment.amount) });
      console.error('[webhook] montant incohérent', reference, payload.amount, payment.amount);
      return res.status(400).json({ error: 'Montant incohérent.' });
    }

    const mission = await db.get('jobs', payment.jobId);
    if (mission.status === MISSION_STATUS.PAID) {
      await db.update('payments', reference, { status: 'success', paidAt: new Date().toISOString() });
      return res.status(200).json({ success: true, duplicate: true });
    }
    if (mission.status !== MISSION_STATUS.COMPLETED) throw new HttpError(409, 'Mission dans un état inattendu.');

    const paidAt = new Date().toISOString();
    await db.update('payments', reference, { status: 'success', paidAt, gatewayStatus: status.slice(0, 40) });
    await db.update('jobs', mission.$id, {
      status: MISSION_STATUS.PAID,
      paidAt,
      paymentReference: reference,
      commissionAmount: payment.commission,
      artisanPayout: payment.payout,
      payoutStatus: 'pending', // reversement à l'artisan à effectuer
    });

    await audit(req, 'gateway', 'payment.success', reference, { mission: mission.$id, amount: payment.amount });
    await notifyUser(payment.artisanId, `💰 <b>Paiement reçu</b>\nLe client a payé la mission « ${esc(String(mission.title).slice(0, 80))} ». Montant net pour vous : ${fcfa(payment.payout)}.`);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return sendError(res, error, '[webhook]');
  }
}
