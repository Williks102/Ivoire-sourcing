import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { savePdf } from '../lib/download';
import { PdfDoc } from '../services/missionService';

/** Bouton « Télécharger en PDF » : demande le document au serveur, puis l'enregistre. */
export function PdfButton({ label, load, className = '' }: { label: string; load: () => Promise<PdfDoc>; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const click = async () => {
    setBusy(true);
    setError('');
    try { savePdf(await load()); } catch (e: any) { setError(e?.message || 'Téléchargement impossible.'); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={click} disabled={busy}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 ${className}`}>
        <FileText className="h-3.5 w-3.5" /> {busy ? 'Préparation…' : label}
      </button>
      {error && <span role="alert" className="text-[10px] font-bold text-rose-600">{error}</span>}
    </span>
  );
}
