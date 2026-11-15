import React, { useEffect, useState } from 'react';
import { Eye, Paperclip } from 'lucide-react';
import { missionService } from '../services/missionService';

/**
 * Affichage des pièces justificatives (guide du vibecoder sécurisé, commandement #5).
 *
 * Une pièce est récupérée via le serveur (droits vérifiés, type lu dans les octets) puis affichée à partir d'un
 * objet local (blob:). On n'insère JAMAIS dans la page une adresse lue dans la base : pas de `document.write`,
 * pas de `href` / `src` venant des données. Les anciennes pièces (adresse « data: ») ne sont affichées que si elles
 * correspondent exactement à une image base64 (PNG, JPEG, WebP) ; tout le reste est refusé.
 */

export interface SecureDocRef { name: string; fileId?: string; url?: string; mime?: string }

const LEGACY_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Anciennes pièces stockées en base64 : acceptées uniquement si c'est strictement une image. */
export const safeImageDataUrl = (url?: string): string | null => (typeof url === 'string' && url.length < 8_000_000 && LEGACY_IMAGE.test(url) ? url : null);

type Loaded = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; url: string; mime: string; ext: string };

function useSecureFile(doc: SecureDocRef): Loaded {
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setState({ status: 'loading' });
    (async () => {
      try {
        if (doc.fileId) {
          const f = await missionService.fetchFile(doc.fileId);
          const bytes = Uint8Array.from(atob(f.dataBase64), (c) => c.charCodeAt(0));
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
          if (!cancelled) setState({ status: 'ready', url: objectUrl, mime: f.mime, ext: f.ext });
          return;
        }
        const legacy = safeImageDataUrl(doc.url);
        if (legacy) { if (!cancelled) setState({ status: 'ready', url: legacy, mime: legacy.slice(5, legacy.indexOf(';')), ext: 'img' }); return; }
        if (!cancelled) setState({ status: 'error', message: "Ancien format non pris en charge : demandez à l'artisan de redéposer la pièce." });
      } catch (e: any) {
        if (!cancelled) setState({ status: 'error', message: e?.message || 'Pièce indisponible.' });
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc.fileId, doc.url]);
  return state;
}

const dlName = (doc: SecureDocRef, ext: string) => `${doc.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'piece'}.${ext}`;

/** Aperçu d'une pièce (image) ou lien de téléchargement (PDF), avec agrandissement. */
export function SecureDocPanel({ doc, onZoom }: { doc: SecureDocRef; onZoom?: (url: string) => void }) {
  const file = useSecureFile(doc);
  if (file.status === 'loading') return <div className="py-10 text-center text-xs text-slate-400 animate-pulse">Chargement sécurisé de la pièce…</div>;
  if (file.status === 'error') return <p role="alert" className="py-6 px-4 text-xs font-bold text-rose-600 bg-rose-50 rounded-xl">{file.message}</p>;

  if (file.mime.startsWith('image/')) {
    return (
      <div className="relative max-h-56 overflow-hidden bg-slate-100 rounded-xl flex items-center justify-center group">
        <img src={file.url} alt={doc.name} className="max-h-56 object-contain w-full" />
        <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center justify-center gap-3">
          {onZoom && (
            <button type="button" onClick={() => onZoom(file.url)} className="bg-white hover:bg-slate-100 text-slate-800 px-4 py-2 rounded-xl text-xs font-bold uppercase flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Agrandir
            </button>
          )}
          <a href={file.url} download={dlName(doc, file.ext)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase">Télécharger</a>
        </div>
      </div>
    );
  }
  return (
    <div className="py-6 px-4 bg-slate-50 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Paperclip className="h-5 w-5 text-slate-500" />
        <div className="text-left">
          <p className="text-xs font-bold text-slate-700 truncate max-w-xs">{doc.name}</p>
          <p className="text-[10px] text-slate-400">Document PDF</p>
        </div>
      </div>
      <a href={file.url} download={dlName(doc, file.ext)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold uppercase">Télécharger le PDF</a>
    </div>
  );
}

/** Bouton « Voir le fichier » : image agrandie dans la page, PDF téléchargé. Rien n'est ouvert dans une nouvelle fenêtre. */
export function SecureOpenButton({ doc, onZoom }: { doc: SecureDocRef; onZoom: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    setBusy(true); setError('');
    try {
      if (!doc.fileId) {
        const legacy = safeImageDataUrl(doc.url);
        if (!legacy) throw new Error('Ancien format non pris en charge : redéposez la pièce.');
        onZoom(legacy);
        return;
      }
      const f = await missionService.fetchFile(doc.fileId);
      const bytes = Uint8Array.from(atob(f.dataBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
      if (f.mime.startsWith('image/')) { onZoom(url); return; }
      const a = document.createElement('a'); a.href = url; a.download = dlName(doc, f.ext); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e: any) { setError(e?.message || 'Pièce indisponible.'); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={open} disabled={busy} className="text-[10px] font-bold text-slate-400 hover:text-slate-800 flex items-center gap-1 mt-2 cursor-pointer border-0 bg-transparent p-0 disabled:opacity-50">
        <Eye className="h-3.5 w-3.5" /> {busy ? 'Chargement…' : 'Voir le fichier'}
      </button>
      {error && <span role="alert" className="text-[10px] font-bold text-rose-600">{error}</span>}
    </span>
  );
}
