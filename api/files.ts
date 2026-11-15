import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, readBody, storage } from './_lib/server.js';
import { audit, protect, sendError } from './_lib/security.js';
import { ALLOWED_TYPES, detectMime } from './_lib/files.js';

/**
 * Lecture d'une pièce justificative : réservée à son propriétaire et aux administrateurs (vérifié ici, côté serveur).
 * Un fichier qui n'est pas le sien est traité comme inexistant. Le type renvoyé est celui lu dans les octets,
 * jamais un type fourni par un utilisateur : le navigateur ne reçoit que de l'image ou du PDF, jamais du HTML.
 */

const Schema = z.object({ fileId: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await protect(req, { name: 'files', max: 60, windowSec: 60 });
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides.' });

    let meta: any;
    try { meta = await storage.meta(parsed.data.fileId); } catch { throw new HttpError(404, 'Fichier introuvable.'); }
    const isAdmin = user.labels.includes('admin');
    const isOwner = (meta.$permissions || []).includes(`read("user:${user.$id}")`);
    if (!isAdmin && !isOwner) throw new HttpError(404, 'Fichier introuvable.');

    const bytes = await storage.download(parsed.data.fileId);
    const mime = detectMime(bytes);
    if (!mime) throw new HttpError(409, 'Type de fichier non reconnu.');

    // L'accès d'un administrateur à la pièce d'un autre est tracé.
    if (!isOwner) await audit(req, user.$id, 'file.read', parsed.data.fileId, { by: 'admin' });
    res.setHeader?.('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, mime, ext: ALLOWED_TYPES[mime], dataBase64: Buffer.from(bytes).toString('base64') });
  } catch (error: any) {
    return sendError(res, error, '[files]');
  }
}
