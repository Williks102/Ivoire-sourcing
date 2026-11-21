import type { VercelRequest } from '@vercel/node';
import { HttpError, MISSION_STATUS, db } from './server.js';
import { audit } from './security.js';
import { esc, fcfa, notifyUser } from './telegram.js';

/**
 * Règlement d'un paiement, commun à toutes les passerelles (Paiement Pro, Paystack).
 * Contrôles : référence connue, montant égal à celui enregistré à l'initialisation, traitement idempotent.
 * Seul ce code fait passer une mission à « payée ».
 */
export const SUCCESS = new Set(['SUCCESS', 'APPROVED', 'SUCCESSFUL', 'PAID']);

export interface Settled { status: number; body: Record<string, unknown> }

export async function settlePayment(req: VercelRequest, reference: string, status: string, receivedAmount?: number): Promise<Settled> {
  const out = (code: number, body: Record<string, unknown>): Settled => ({ status: code, body });
    const payment = await db.get('payments', reference);

    // Déjà traité : on répond 200 pour que la passerelle arrête de renvoyer.
    if (payment.status === 'success') return out(200, { success: true, duplicate: true });

    if (!SUCCESS.has(status)) {
      await db.update('payments', reference, { status: 'failed', gatewayStatus: status.slice(0, 40) });
      await audit(req, 'gateway', 'payment.failed', reference, { status: status.slice(0, 40) });
      return out(200, { success: true, recorded: 'failed' });
    }

    // Si la passerelle renvoie un montant, il doit correspondre exactement à celui attendu.
    if (receivedAmount !== undefined && Math.round(Number(receivedAmount)) !== Number(payment.amount)) {
      await db.update('payments', reference, { status: 'mismatch', gatewayStatus: status.slice(0, 40) });
      await audit(req, 'gateway', 'payment.mismatch', reference, { received: Number(receivedAmount) || null, expected: Number(payment.amount) });
      console.error('[webhook] montant incohérent', reference, receivedAmount, payment.amount);
      return out(400, { error: 'Montant incohérent.' });
    }

    const mission = await db.get('jobs', payment.jobId);
    if (mission.status === MISSION_STATUS.PAID) {
      await db.update('payments', reference, { status: 'success', paidAt: new Date().toISOString() });
      return out(200, { success: true, duplicate: true });
    }
    if (mission.status !== MISSION_STATUS.COMPLETED) throw new HttpError(409, 'Mission dans un état inattendu.');

    const paidAt = new Date().toISOString();
    // Le compte de reversement est figé au moment du paiement : un changement ultérieur ne redirige pas cet argent.
    const artisan = await db.get('users', payment.artisanId).catch(() => null);
    await db.update('payments', reference, { status: 'success', paidAt, gatewayStatus: status.slice(0, 40) });
    await db.update('jobs', mission.$id, {
      status: MISSION_STATUS.PAID,
      paidAt,
      paymentReference: reference,
      commissionAmount: payment.commission,
      artisanPayout: payment.payout,
      payoutStatus: 'pending', // reversement à l'artisan à effectuer
      payoutOperator: artisan?.payoutOperator || '',
      payoutPhone: artisan?.payoutPhone || '',
    });

    await audit(req, 'gateway', 'payment.success', reference, { mission: mission.$id, amount: payment.amount });
    await notifyUser(payment.artisanId, `💰 <b>Paiement reçu</b>\nLe client a payé la mission « ${esc(String(mission.title).slice(0, 80))} ». Montant net pour vous : ${fcfa(payment.payout)}.`);
  return out(200, { success: true });
}
