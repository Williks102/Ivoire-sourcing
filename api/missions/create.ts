import type { VercelRequest, VercelResponse } from '@vercel/node';
import { audit, protect, sendError } from '../_lib/security.js';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, db, readBody, sanitizeText } from '../_lib/server.js';
import { moderateMission } from '../_lib/moderation.js';
import { notifyMissionArtisans } from '../_lib/telegram.js';

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
    const user = await protect(req, { name: 'mission-create', max: 10, windowSec: 600 });
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
    const analysis = moderation.analysis;

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
      // Analyse IA (facultative) : résumé pour les artisans, spécialités, infos manquantes, métier suggéré.
      aiSummary: analysis?.summary || null,
      aiTags: analysis?.tags || [],
      aiMissing: analysis?.missing || [],
      aiCategory: analysis?.category || null,
    });

    await audit(req, user.$id, 'mission.create', doc.$id, { status, budget: input.budget });
    // Mission ouverte : les artisans concernés (métier + zone, Telegram relié) sont prévenus tout de suite.
    if (status === MISSION_STATUS.OPEN) await notifyMissionArtisans(doc);
    return res.status(200).json({
      success: true,
      id: doc.$id,
      status,
      // Conseils affichés au client après la publication.
      hints: {
        missing: analysis?.missing || [],
        suggestedCategory: analysis?.category && analysis.category !== input.category ? analysis.category : null,
      },
    });
  } catch (error: any) {
    return sendError(res, error, '[missions/create]');
  }
}
