import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, authenticate, db, readBody, sanitizeText } from '../_lib/server.js';
import { moderateMission } from '../_lib/moderation.js';

/**
 * Publication d'une mission. Écrite par le serveur : l'identité du client vient du JWT
 * (pas de usurpation d'`employerId`) et la modération ne peut pas être contournée.
 */

const CATEGORIES = ['plomberie', 'electricite', 'climatisation', 'peinture', 'menage', 'autre'] as const;
const CITIES = ['Abidjan', 'Bouaké', 'Daloa', 'Yamoussoukro', 'San-Pédro', 'Korhogo', 'Man'] as const;

const Schema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(CATEGORIES),
  location: z.enum(CITIES),
  address: z.string().trim().max(200).optional(),
  scheduledDate: z.string().trim().max(32).optional(),
  budget: z.number().int().min(500).max(10_000_000),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await authenticate(req);
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides : vérifiez le titre, la description et le budget.' });
    const input = parsed.data;

    const title = sanitizeText(input.title, 150);
    const description = sanitizeText(input.description, 4000);

    const moderation = await moderateMission(title, description);
    if (!moderation.approved && !moderation.review) {
      return res.status(422).json({ error: `Annonce refusée par la modération : ${moderation.reason || 'contenu non conforme.'}` });
    }
    const status = moderation.approved ? MISSION_STATUS.OPEN : MISSION_STATUS.PENDING;

    const doc = await db.create('jobs', 'unique()', {
      employerId: user.$id,
      title,
      description,
      category: input.category,
      location: input.location,
      address: sanitizeText(input.address, 200),
      scheduledDate: input.scheduledDate || null,
      budget: input.budget,
      status,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, id: doc.$id, status });
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('[missions/create]', error?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
