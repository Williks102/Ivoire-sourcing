/** Enregistre un fichier reçu du serveur (PDF en base64) ou généré sur place (CSV). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function savePdf(doc: { filename: string; pdfBase64: string }) {
  const bytes = Uint8Array.from(atob(doc.pdfBase64), (c) => c.charCodeAt(0));
  saveBlob(new Blob([bytes], { type: 'application/pdf' }), doc.filename);
}

export const saveCsv = (csv: string, filename: string) => saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
