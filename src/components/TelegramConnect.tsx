import { useState } from 'react';
import { missionService } from '../services/missionService';
import type { UserProfile } from '../types';

/**
 * Notifications Telegram : l'utilisateur ouvre le bot via un lien signé (valable 24 h) qui relie sa conversation à son compte.
 * L'identifiant de conversation reste côté serveur ; ici on ne sait que « relié » ou « non relié ».
 */
export function TelegramConnect({ profile, onProfileUpdate }: { profile: UserProfile; onProfileUpdate: (p: UserProfile) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const isArtisan = profile.role === 'candidate';

  const connect = async () => {
    setBusy(true); setMessage('');
    try {
      const { url } = await missionService.telegramLink();
      window.open(url, '_blank', 'noopener,noreferrer');
      setMessage("Telegram s'ouvre : touchez « Démarrer ». Revenez ensuite ici et actualisez la page.");
    } catch (err: any) {
      setMessage(err?.message || "Le lien Telegram n'a pas pu être créé.");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true); setMessage('');
    try {
      const { profile: next } = await missionService.telegramUnlink();
      onProfileUpdate({ ...profile, ...next, role: profile.role });
    } catch (err: any) {
      setMessage(err?.message || 'Désactivation impossible.');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 space-y-2 text-left">
      <p className="text-[11px] font-black text-sky-800 uppercase tracking-wider">✈️ Notifications Telegram</p>
      <p className="text-xs text-slate-600 leading-relaxed">
        {isArtisan
          ? 'Recevez les nouvelles missions de votre métier et de votre zone, et les réponses à vos offres.'
          : 'Soyez prévenu dès qu’un artisan répond à votre mission, négocie ou termine le travail.'}
      </p>
      {profile.telegramLinked ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-emerald-700">✅ Activées</span>
          <button type="button" onClick={disconnect} disabled={busy} className="text-xs font-bold text-slate-500 underline disabled:opacity-50">Désactiver</button>
        </div>
      ) : (
        <button type="button" onClick={connect} disabled={busy} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold disabled:opacity-50">
          {busy ? 'Ouverture…' : 'Recevoir sur Telegram'}
        </button>
      )}
      {message && <p className="text-[11px] text-slate-500">{message}</p>}
    </div>
  );
}
