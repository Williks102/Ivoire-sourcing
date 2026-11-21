import { useState } from 'react';
import { missionService } from '../services/missionService';
import type { UserProfile } from '../types';

const OPERATORS = [
  { code: 'wave', label: 'Wave' },
  { code: 'orange', label: 'Orange Money' },
  { code: 'mtn', label: 'MTN MoMo' },
  { code: 'moov', label: 'Moov Money' },
] as const;

export const payoutLabel = (code?: string) => OPERATORS.find(o => o.code === code)?.label || 'Mobile Money';

/** Compte Mobile Money où l'artisan reçoit ses reversements (enregistré par le serveur ; chaque changement est tracé et signalé). */
export function PayoutAccountCard({ profile, onProfileUpdate }: { profile: UserProfile; onProfileUpdate: (p: UserProfile) => void }) {
  const [operator, setOperator] = useState(profile.payoutOperator || '');
  const [phone, setPhone] = useState(profile.payoutPhone || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = operator !== (profile.payoutOperator || '') || phone !== (profile.payoutPhone || '');

  const save = async () => {
    setMessage('');
    if (!operator || phone.replace(/\D/g, '').length < 8) { setMessage('Choisissez un opérateur et saisissez un numéro valide.'); return; }
    setBusy(true);
    try {
      const { profile: saved } = await missionService.updateProfile({ payoutOperator: operator as any, payoutPhone: phone });
      onProfileUpdate({ ...profile, ...saved, role: profile.role });
      setMessage('✅ Compte de reversement enregistré.');
    } catch (err: any) {
      setMessage(err?.message || "Enregistrement impossible.");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3 text-left">
      <p className="text-[11px] font-black text-emerald-800 uppercase tracking-wider">💸 Où recevoir vos paiements</p>
      <p className="text-xs text-slate-600 leading-relaxed">Une fois la mission payée par le client, nous vous reversons le prix convenu moins la commission sur ce compte Mobile Money.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select aria-label="Opérateur de reversement" value={operator} onChange={e => setOperator(e.target.value as any)} className="bg-white px-3 py-2 rounded-xl text-xs border border-slate-200">
          <option value="">Opérateur…</option>
          {OPERATORS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
        </select>
        <input aria-label="Numéro de reversement" inputMode="tel" maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Numéro (ex. 07 48 92 11 02)" className="bg-white px-3 py-2 rounded-xl text-xs border border-slate-200" />
      </div>
      <button type="button" onClick={save} disabled={busy || !dirty} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      {message && <p className="text-[11px] text-slate-600">{message}</p>}
    </div>
  );
}
