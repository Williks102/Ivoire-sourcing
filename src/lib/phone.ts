/**
 * Numéro au format international sans « + » (prêt pour wa.me), ou null s'il est invalide.
 * MÊME RÈGLE que `toWhatsAppNumber` dans api/_lib/outreach.ts (un test vérifie que les deux restent identiques).
 */
export function toWhatsAppNumber(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const international = raw.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (international || digits.startsWith('225')) {
    if (digits.startsWith('225')) {
      const national = digits.slice(3);
      if (national.length === 10) return digits;
      if (national.length === 11 && national.startsWith('0')) return '225' + national.slice(1).padStart(10, '0');
      return null;
    }
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  return digits.length === 10 ? '225' + digits : null;
}
