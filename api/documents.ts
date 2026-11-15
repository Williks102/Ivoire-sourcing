import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, authenticate, db, readBody } from './_lib/server.js';
import { QuoteLine, parseQuote, quoteNumber } from './_lib/quote.js';
import { currentPrice, readHistory } from './_lib/negotiation.js';
import { CATEGORY_LABELS } from './_lib/outreach.js';
import { renderQuotePdf, renderReceiptPdf, renderStatementPdf } from './_lib/pdf.js';

/**
 * Documents PDF, produits côté serveur à partir de la base :
 *
 *   quote      -> devis d'une offre (client ou artisan concerné) ; avec ou sans lignes détaillées
 *   receipt    -> reçu de paiement d'une mission payée (client ou artisan concerné)
 *   statement  -> relevé annuel de revenus (l'artisan lui-même)
 *
 * Aucun téléphone ni e-mail dans les documents. Réponse : { filename, pdfBase64 }.
 */

const Id = z.string().min(1).max(64);
const Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quote'), applicationId: Id }),
  z.object({ kind: z.literal('receipt'), missionId: Id }),
  z.object({ kind: z.literal('statement'), year: z.number().int().min(2020).max(2100).optional() }),
]);

const CHANNELS: Record<string, string> = { WAVECI: 'Wave', OMCIV2: 'Orange Money', MOMOCI: 'MTN MoMo', FLOOZ: 'Moov Money', CARD: 'Carte bancaire' };
const catLabel = (id: string) => CATEGORY_LABELS[id] || id || '-';

async function profileOf(id: string) {
  try { return await db.get('users', id); } catch { return null; }
}
const publicIdentity = (p: any, fallback: string) => ({
  name: String(p?.displayName || fallback).slice(0, 80),
  businessName: p?.businessName ? String(p.businessName).slice(0, 120) : undefined,
  businessRegistration: p?.businessRegistration ? String(p.businessRegistration).slice(0, 60) : undefined,
});

/** Lignes du devis ; à défaut de détail, une ligne unique au prix de l'offre. */
function linesOf(quote: ReturnType<typeof parseQuote>, title: string, price: number): { lines: QuoteLine[]; discount: number } {
  if (quote) return { lines: quote.lines, discount: quote.discount };
  return { lines: [{ label: title, qty: 1, unit: '', unitPrice: price }], discount: 0 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await authenticate(req);
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides' });
    const input = parsed.data;
    const isAdmin = user.labels.includes('admin');
    let bytes: Uint8Array;
    let filename: string;

    if (input.kind === 'quote') {
      const offer = await db.get('applications', input.applicationId);
      const mission = await db.get('jobs', offer.jobId);
      if (!isAdmin && user.$id !== mission.employerId && user.$id !== offer.candidateId) throw new HttpError(403, "Vous n'êtes pas concerné par ce devis.");

      const [artisan, client] = await Promise.all([profileOf(offer.candidateId), profileOf(mission.employerId)]);
      const quote = parseQuote(offer.quote);
      const agreed = offer.status === 'accepted' && mission.assignedApplicationId === offer.$id;
      const finalPrice = agreed ? Math.round(Number(mission.agreedPrice) || currentPrice(offer)) : currentPrice(offer);
      const { lines, discount } = linesOf(quote, String(mission.title || 'Prestation'), finalPrice);
      const number = quoteNumber(offer);
      const statusLabel = agreed ? 'Prix convenu' : offer.status === 'rejected' ? 'Offre refusée' : offer.status === 'withdrawn' ? 'Offre retirée' : 'Proposition en cours';

      bytes = await renderQuotePdf({
        number,
        issuedAt: offer.createdAt,
        validUntil: new Date(new Date(offer.createdAt).getTime() + (quote?.validityDays || 15) * 86400000).toISOString(),
        statusLabel,
        agreedAt: agreed ? mission.assignedAt : undefined,
        mission: { title: String(mission.title), category: catLabel(mission.category), city: String(mission.location || ''), address: mission.address || undefined, description: mission.description || undefined },
        artisan: { ...publicIdentity(artisan, offer.candidateName || 'Artisan'), trades: (Array.isArray(offer.trades) ? offer.trades : []).map(catLabel) },
        client: { name: publicIdentity(client, 'Client').name },
        lines, discount, finalPrice,
        conditions: quote?.conditions || undefined,
        history: readHistory(offer),
      });
      filename = `devis-${number}.pdf`;
    } else if (input.kind === 'receipt') {
      const mission = await db.get('jobs', input.missionId);
      if (!isAdmin && user.$id !== mission.employerId && user.$id !== mission.assignedArtisanId) throw new HttpError(403, "Vous n'êtes pas concerné par cette mission.");
      if (mission.status !== MISSION_STATUS.PAID) throw new HttpError(409, "Le reçu n'est disponible qu'une fois la mission payée.");

      let payment: any = null;
      if (mission.paymentReference) { try { payment = await db.get('payments', mission.paymentReference); } catch { /* repli sur la mission */ } }
      let quote = null as ReturnType<typeof parseQuote>;
      if (mission.assignedApplicationId) { try { quote = parseQuote((await db.get('applications', mission.assignedApplicationId)).quote); } catch { /* sans détail */ } }
      const amount = Math.round(Number(payment?.amount ?? mission.agreedPrice) || 0);
      const { lines, discount } = linesOf(quote, String(mission.title), amount);
      const [artisan, client] = await Promise.all([profileOf(mission.assignedArtisanId), profileOf(mission.employerId)]);

      bytes = await renderReceiptPdf({
        number: String(mission.paymentReference || mission.$id),
        paidAt: payment?.paidAt || mission.paidAt,
        channel: CHANNELS[payment?.channel] || 'Mobile Money',
        mission: { title: String(mission.title), category: catLabel(mission.category), city: String(mission.location || '') },
        artisan: publicIdentity(artisan, 'Artisan'),
        client: { name: publicIdentity(client, 'Client').name },
        lines, discount, amount,
      });
      filename = `recu-${mission.paymentReference || mission.$id}.pdf`;
    } else {
      const year = input.year || new Date().getUTCFullYear();
      const missions = await db.listAllEqual('jobs', 'assignedArtisanId', user.$id);
      const rows = missions
        .filter((m) => m.status === MISSION_STATUS.PAID && String(m.paidAt || '').startsWith(String(year)))
        .sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt)))
        .map((m) => ({
          paidAt: m.paidAt, title: String(m.title), category: catLabel(m.category),
          gross: Math.round(Number(m.agreedPrice) || 0), commission: Math.round(Number(m.commissionAmount) || 0),
          net: Math.round(Number(m.artisanPayout) || 0), payoutSent: m.payoutStatus === 'sent',
        }));
      bytes = await renderStatementPdf({ year, artisan: publicIdentity(await profileOf(user.$id), user.name || 'Artisan'), generatedAt: new Date().toISOString(), rows });
      filename = `releve-revenus-${year}.pdf`;
    }

    return res.status(200).json({ success: true, filename, pdfBase64: Buffer.from(bytes).toString('base64') });
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('[documents]', error?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
