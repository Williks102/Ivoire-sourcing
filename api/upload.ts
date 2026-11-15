import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError, db, readBody, storage } from './_lib/server.js';
import { audit, protect, sendError } from './_lib/security.js';
import { ALLOWED_TYPES, DOC_LABELS, MAX_FILE_BYTES, decodeBase64, detectMime, pdfHasActiveContent } from './_lib/files.js';

/**
 * Téléversement d'une pièce justificative (identité, casier, domicile) — commandement #11 du guide :
 *   0. connecté uniquement ; 1. taille limitée ; 2. type RÉEL lu dans les octets (jamais le nom ni l'en-tête) ;
 *   3. nom aléatoire (UUID), nom d'origine jamais conservé ; 4. stockage isolé (bucket privé, hors de la base).
 *
 * Le fichier n'est lisible que par son propriétaire et les administrateurs. Le statut « en attente » est imposé ici :
 * le navigateur ne peut pas se déclarer « validé ».
 */

const Schema = z.object({
  type: z.enum(['cni_passport', 'casier_judiciaire', 'justificatif_domicile']),
  // 3 Mo en base64 ≈ 4 Mo : reste sous la limite de 4,5 Mo d'une fonction Vercel.
  dataBase64: z.string().min(16).max(4_300_000),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const user = await protect(req, { name: 'upload', max: 10, windowSec: 3600 });
    const parsed = Schema.safeParse(readBody(req));
    if (!parsed.success) return res.status(400).json({ error: 'Données invalides.' });
    const { type, dataBase64 } = parsed.data;

    const bytes = decodeBase64(dataBase64);
    if (!bytes) return res.status(400).json({ error: 'Fichier illisible.' });
    if (bytes.length > MAX_FILE_BYTES) return res.status(400).json({ error: 'Fichier trop volumineux (3 Mo maximum).' });

    const mime = detectMime(bytes);
    if (!mime) return res.status(400).json({ error: 'Type de fichier non autorisé : envoyez une image (JPEG, PNG, WebP) ou un PDF.' });
    if (mime === 'application/pdf' && pdfHasActiveContent(bytes)) return res.status(400).json({ error: 'Ce PDF contient du contenu actif et est refusé.' });

    const profile = await db.get('users', user.$id).catch(() => { throw new HttpError(404, 'Profil introuvable.'); });
    let docs: any[] = [];
    try { const raw = typeof profile.verificationDocs === 'string' ? JSON.parse(profile.verificationDocs) : profile.verificationDocs; if (Array.isArray(raw)) docs = raw; } catch { /* liste illisible : on repart de zéro */ }

    // Nom aléatoire ; seuls le propriétaire et l'administration peuvent lire le fichier.
    const stored = await storage.upload(`${randomUUID()}.${ALLOWED_TYPES[mime]}`, bytes, mime, [`read("user:${user.$id}")`, 'read("label:admin")']);

    const replaced = docs.find((d) => d.type === type);
    const entry = { name: DOC_LABELS[type], type, status: 'pending', uploadedAt: new Date().toISOString(), fileId: stored.$id, mime, size: bytes.length };
    const next = [...docs.filter((d) => d.type !== type), entry];
    await db.update('users', user.$id, { verificationDocs: JSON.stringify(next), isVerified: false });

    // L'ancien fichier du même type est supprimé : pas de pièce d'identité orpheline dans le stockage.
    if (replaced?.fileId) await storage.remove(replaced.fileId).catch(() => { /* nettoyage au mieux */ });

    await audit(req, user.$id, 'upload.doc', stored.$id, { type, mime, size: bytes.length });
    return res.status(200).json({ success: true, doc: entry });
  } catch (error: any) {
    return sendError(res, error, '[upload]');
  }
}
