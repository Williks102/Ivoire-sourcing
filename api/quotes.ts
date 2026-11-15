import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, authenticate, db, readBody, sanitizeText } from './_lib/server.js';
import { parseQuote, quoteInputSchema, quoteProblem, quoteTotal } from './_lib/quote.js';

/**
 * Modèles de devis d'un artisan : devis enregistrés (lignes, remise, validité, conditions) qu'il réutilise
 * quand il envoie une offre. Chacun ne voit et ne modifie que les siens (identité = JWT).
 *
 *   list    -> mes modèles (les plus récemment modifiés d'abord)
 *   save    -> créer (sans id) ou modifier (avec id) un modèle
 *   delete  -> supprimer un modèle
 *
 * Le contenu est validé et nettoyé comme celui d'une offre (mêmes règles, même total recalculé).
 */

export const MAX_TEMPLATES = 30;

const Id = z.string().min(1).max(64);
const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('save'), id: Id.optional(), name: z.string().trim().min(1).max(80), quote: quoteInputSchema }),
  z.object({ action: z.literal('delete'), id: Id }),
]);

const present = (row: any) => {
  const quote = parseQuote(row.quote);
  return { id: row.$id, name: row.name, quote, total: quote ? quoteTotal(quote) : 0, createdAt: row.createdAt, updatedAt: row.updatedAt || row.createdAt };
};

/** Un modèle qui n'est pas le sien est traité comme inexistant (on ne révèle pas son existence). */
async function ownTemplate(id: string, userId: string) {
  let row: any;
  try { row = await db.get('quote_templates', id); } catch { throw new HttpError(404, 'Modèle introuvable.'); }
  if (row.ownerId !== userId) throw new HttpError(404, 'Modèle introuvable.');
  return row;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await authenticate(req);
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides : vérifiez le nom et les lignes du devis.' });
    const input = parsed.data;

    if (input.action === 'list') {
      const rows = await db.listAllEqual('quote_templates', 'ownerId', user.$id, 1);
      const templates = rows.map(present).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return res.status(200).json({ success: true, templates, max: MAX_TEMPLATES });
    }

    if (input.action === 'delete') {
      await ownTemplate(input.id, user.$id);
      await db.remove('quote_templates', input.id);
      return res.status(200).json({ success: true });
    }

    // save
    const quote = parseQuote(input.quote);
    const problem = quoteProblem(quote);
    if (problem) throw new HttpError(400, problem);
    const data = { name: sanitizeText(input.name, 80), quote: JSON.stringify(quote), updatedAt: new Date().toISOString() };

    if (input.id) {
      await ownTemplate(input.id, user.$id);
      const row = await db.update('quote_templates', input.id, data);
      return res.status(200).json({ success: true, template: present(row) });
    }
    const existing = await db.listAllEqual('quote_templates', 'ownerId', user.$id, 1);
    if (existing.length >= MAX_TEMPLATES) throw new HttpError(409, `Vous avez atteint le maximum de ${MAX_TEMPLATES} modèles : supprimez-en un pour en créer un nouveau.`);
    const row = await db.create('quote_templates', 'unique()', { ownerId: user.$id, ...data, createdAt: data.updatedAt });
    return res.status(200).json({ success: true, template: present(row) });
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('[quotes]', error?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
