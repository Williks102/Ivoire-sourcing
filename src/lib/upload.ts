/**
 * Préparation d'un fichier avant envoi au serveur (guide du vibecoder sécurisé, commandement #11).
 * Le serveur revérifie TOUT (le navigateur n'est jamais une garantie) ; ces contrôles évitent surtout d'envoyer
 * des fichiers inutilisables et suppriment les métadonnées des photos (position GPS, appareil…).
 */

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export type UploadMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const MAX_SIDE = 1600; // une pièce d'identité reste parfaitement lisible à cette taille

/** Type réel d'après les premiers octets (le nom du fichier et `file.type` se falsifient). */
export async function sniffMime(file: Blob): Promise<UploadMime | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const is = (sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
  if (is([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (is([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (is([0x52, 0x49, 0x46, 0x46]) && is([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (is([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

async function toBase64(bytes: Uint8Array): Promise<string> {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export interface PreparedUpload { dataBase64: string; mime: UploadMime; size: number; /** Aperçu local (images) ; jamais envoyé ni stocké. */ previewUrl: string }

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  const mime = await sniffMime(file);
  if (!mime) throw new Error('Type de fichier non autorisé : choisissez une image (JPEG, PNG, WebP) ou un PDF.');

  if (mime === 'application/pdf') {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('PDF trop volumineux (3 Mo maximum).');
    return { dataBase64: await toBase64(new Uint8Array(await file.arrayBuffer())), mime, size: file.size, previewUrl: '' };
  }

  // Image : réencodée en JPEG, ce qui retire les métadonnées EXIF et borne le poids.
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("Cette image n'a pas pu être lue."); }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Le traitement de l'image n'est pas disponible sur cet appareil.");
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  let quality = 0.88;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length * 0.75 > MAX_UPLOAD_BYTES * 0.9 && quality > 0.4) { quality -= 0.1; dataUrl = canvas.toDataURL('image/jpeg', quality); }
  const dataBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const size = Math.floor(dataBase64.length * 0.75);
  if (size > MAX_UPLOAD_BYTES) throw new Error('Image trop volumineuse (3 Mo maximum).');
  return { dataBase64, mime: 'image/jpeg', size, previewUrl: dataUrl };
}
