import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, MISSION_STATUS, authenticate, db, readBody, sanitizeText } from '../_lib/server.js';

/**
 * Envoi d'une offre (devis) par un artisan. Écrite par le serveur : l'identité de l'artisan
 * vient du JWT, le client concerné de la mission, et l'offre n'est lisible que par ces deux personnes.
 */

const CATEGORIES = ['plomberie', 'electricite', 'climatisation', 'peinture', 'menage', 'autre'] as const;

const Schema = z.object({
  missionId: z.string().min(1).max(64),
  proposedPrice: z.number().int().min(500).max(10_000_000),
  delay: z.string().trim().min(1).max(120),
  message: z.string().trim().max(1000).optional(),
  experienceYears: z.number().int().min(0).max(60).default(0),
  artisanName: z.string().trim().min(1).max(80),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await authenticate(req);
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides : vérifiez le prix et le délai.' });
    const input = parsed.data;

    const mission = await db.get('jobs', input.missionId);
    if (mission.status !== MISSION_STATUS.OPEN) throw new HttpError(409, "Cette mission n'accepte plus d'offres.");
    if (mission.employerId === user.$id) throw new HttpError(403, 'Vous ne pouvez pas répondre à votre propre mission.');

    const existing = await db.listEqual('applications', 'jobId', mission.$id);
    if (existing.some((o) => o.candidateId === user.$id)) throw new HttpError(409, 'Vous avez déjà envoyé une offre pour cette mission.');

    let photoURL: string | null = null;
    let trades: string[] = [];
    try {
      const profile = await db.get('users', user.$id);
      photoURL = profile.photoURL || null;
      // Les métiers viennent du profil (et non de la requête) : le client voit ce que l'artisan a déclaré.
      trades = (Array.isArray(profile.trades) ? profile.trades : []).filter((t: unknown) => typeof t === 'string' && (CATEGORIES as readonly string[]).includes(t)).slice(0, 6);
    } catch { /* profil absent */ }

    const doc = await db.create(
      'applications',
      'unique()',
      {
        jobId: mission.$id,
        employerId: mission.employerId,
        candidateId: user.$id,
        candidateName: sanitizeText(input.artisanName, 80),
        photoURL,
        trades,
        experienceYears: input.experienceYears,
        proposedPrice: input.proposedPrice,
        delay: sanitizeText(input.delay, 120),
        message: sanitizeText(input.message, 1000),
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      // Lisible uniquement par le client de la mission et par l'artisan auteur.
      [`read("user:${mission.employerId}")`, `read("user:${user.$id}")`],
    );

    return res.status(200).json({ success: true, id: doc.$id });
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('[missions/offer]', error?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
