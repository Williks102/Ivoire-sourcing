import { HttpError } from './server.js';

/**
 * Passerelle Paystack (alternative à Paiement Pro, activée par PAYMENT_PROVIDER=paystack + PAYSTACK_SECRET_KEY).
 *
 * Les montants XOF sont envoyés ×100 (règle de Paystack : pas de sous-unité mais multiplication obligatoire).
 * La notification (webhook) n'est qu'un déclencheur : le statut et le montant sont TOUJOURS relus auprès de Paystack
 * avec la clé secrète avant de marquer une mission comme payée ; une notification falsifiée ne peut donc rien valider.
 */

const API = 'https://api.paystack.co';
const key = () => process.env.PAYSTACK_SECRET_KEY || '';

export const paystackConfigured = () => !!key();
/** Paystack n'est utilisé que si on le demande explicitement ET que la clé est présente. */
export const useStack = () => process.env.PAYMENT_PROVIDER === 'paystack' && paystackConfigured();

async function api(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new HttpError(502, 'Paystack injoignable.');
  }
  const data: any = await response.json().catch(() => null);
  if (!response.ok || !data?.status) {
    console.error('[paystack]', method, path, response.status, String(data?.message || '').slice(0, 160));
    throw new HttpError(502, "La passerelle de paiement a refusé la demande.");
  }
  return data.data;
}

export const toSubunit = (xof: number) => Math.round(xof) * 100;
export const fromSubunit = (sub: number) => Math.round(Number(sub) / 100);

export async function initialize(input: { email: string; amountXof: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }): Promise<{ url: string }> {
  const data = await api('POST', '/transaction/initialize', {
    email: input.email,
    amount: toSubunit(input.amountXof),
    currency: 'XOF',
    reference: input.reference,
    callback_url: input.callbackUrl,
    metadata: input.metadata,
  });
  if (typeof data?.authorization_url !== 'string' || !data.authorization_url.startsWith('https://')) throw new HttpError(502, 'Réponse Paystack invalide.');
  return { url: data.authorization_url };
}

/** Relit la transaction chez Paystack : seule source de vérité du statut et du montant. */
export async function verify(reference: string): Promise<{ status: string; amountXof: number; currency: string; reference: string }> {
  const data = await api('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  return { status: String(data?.status || ''), amountXof: fromSubunit(data?.amount), currency: String(data?.currency || ''), reference: String(data?.reference || '') };
}
