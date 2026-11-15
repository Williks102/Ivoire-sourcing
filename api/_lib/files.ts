/**
 * Contrôle des fichiers téléversés (guide du vibecoder sécurisé, commandement #11).
 * Le type est lu dans les PREMIERS OCTETS du fichier, jamais d'après le nom ou l'en-tête envoyé par le navigateur.
 */

export const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 Mo : la limite d'une fonction Vercel est de 4,5 Mo, et le corps est en base64

export const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;
export type AllowedMime = keyof typeof ALLOWED_TYPES;

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Type réel d'après les octets de signature, ou null s'il n'est pas autorisé. */
export function detectMime(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

/** Un PDF qui lance du code à l'ouverture (JavaScript, lancement de programme, fichier embarqué) est refusé. */
export function pdfHasActiveContent(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes).toString('latin1');
  return /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/.test(text);
}

/** Décode du base64 strict (ou null). Accepte un préfixe « data:…;base64, » éventuel. */
export function decodeBase64(input: string): Uint8Array | null {
  const raw = input.replace(/^data:[^;,]*;base64,/, '').trim();
  if (!raw || raw.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  return new Uint8Array(Buffer.from(raw, 'base64'));
}

/** Libellés affichés : le nom d'origine n'est jamais conservé (donnée utilisateur, potentiellement piégée). */
export const DOC_LABELS = {
  cni_passport: "Pièce d'identité (CNI ou passeport)",
  casier_judiciaire: 'Casier judiciaire',
  justificatif_domicile: 'Justificatif de domicile',
} as const;
export type DocType = keyof typeof DOC_LABELS;
