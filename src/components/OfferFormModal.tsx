import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Wallet, Clock, Phone, User } from 'lucide-react';
import { JobPost, UserProfile } from '../types';
import { COMMISSION_RATE, formatFcfa } from '../constants';

interface OfferFormModalProps {
  job: JobPost | null;
  profile: UserProfile | null;
  onClose: () => void;
  onSubmit: (data: {
    artisanName: string;
    phone: string;
    experienceYears: number;
    proposedPrice: number;
    delay: string;
    message: string;
  }) => Promise<void> | void;
}

/** L'artisan propose un prix et un délai pour une mission. Aucun paiement à ce stade. */
export function OfferFormModal({ job, profile, onClose, onSubmit }: OfferFormModalProps) {
  const [name, setName] = useState(profile?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [experience, setExperience] = useState<number>(profile?.experienceYears ?? 1);
  const [price, setPrice] = useState<string>(job?.budget ? String(job.budget) : '');
  const [delay, setDelay] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  if (!job) return null;

  const priceNumber = Math.round(Number(price.replace(/\s/g, '')));
  const validPrice = Number.isFinite(priceNumber) && priceNumber > 0;
  const commission = validPrice ? Math.round(priceNumber * COMMISSION_RATE) : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !validPrice || !delay.trim()) return;
    setSending(true);
    try {
      await onSubmit({
        artisanName: name.trim(),
        phone: phone.trim(),
        experienceYears: Number(experience) || 0,
        proposedPrice: priceNumber,
        delay: delay.trim(),
        message: message.trim(),
      });
    } finally {
      setSending(false);
    }
  };

  const field = 'w-full bg-slate-50 px-4 py-3 rounded-xl border-none focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-sm';
  const label = 'text-[10px] uppercase font-bold text-slate-400 mb-1.5 block tracking-widest';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[190] flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto">
      <div className="bg-white max-w-lg w-full rounded-t-[32px] sm:rounded-[32px] shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="min-w-0">
            <span className="text-[10px] font-black text-emerald-600 tracking-wider uppercase">Proposer mon offre</span>
            <h3 className="font-bold text-slate-800 truncate">{job.title}</h3>
            <p className="text-xs text-slate-400">Budget du client : {formatFcfa(job.budget)}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={submit} className="p-6 overflow-y-auto space-y-4">
          {!profile?.trades?.length && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
              Votre profil n'indique pas encore vos métiers. Complétez-le dans « Mon Profil » : les clients voient vos métiers avec votre offre.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}><User className="inline h-3 w-3 mr-1" />Nom complet</label>
              <input required className={field} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className={label}><Phone className="inline h-3 w-3 mr-1" />Téléphone</label>
              <input required className={field} placeholder="07 00 00 00 00" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}><Wallet className="inline h-3 w-3 mr-1" />Votre prix (FCFA)</label>
              <input required inputMode="numeric" className={field} placeholder="ex: 25000" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
            <div>
              <label className={label}><Clock className="inline h-3 w-3 mr-1" />Délai / disponibilité</label>
              <input required className={field} placeholder="ex: demain matin, 2 jours" value={delay} onChange={e => setDelay(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={label}>Années d'expérience</label>
            <input type="number" min={0} max={60} className={field} value={experience} onChange={e => setExperience(Number(e.target.value))} />
          </div>

          <div>
            <label className={label}>Message au client</label>
            <textarea rows={3} className={field} placeholder="Décrivez votre approche, votre matériel, vos références…" value={message} onChange={e => setMessage(e.target.value)} />
          </div>

          {validPrice && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-xs text-emerald-900 space-y-1">
              <div className="flex justify-between"><span>Prix payé par le client</span><b>{formatFcfa(priceNumber)}</b></div>
              <div className="flex justify-between"><span>Commission IvoireSource ({Math.round(COMMISSION_RATE * 100)} %)</span><b>− {formatFcfa(commission)}</b></div>
              <div className="flex justify-between border-t border-emerald-200 pt-1 mt-1"><span>Vous recevez</span><b>{formatFcfa(priceNumber - commission)}</b></div>
              <p className="text-[10px] text-emerald-700 pt-1">Le client paie uniquement une fois la mission terminée.</p>
              <p className="text-[10px] text-emerald-700">Le client peut accepter votre prix ou vous répondre avec un autre : vous pourrez alors accepter, contre-proposer ou vous retirer.</p>
            </div>
          )}

          <button type="submit" disabled={sending || !validPrice}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black transition-all disabled:opacity-50">
            {sending ? 'Envoi…' : 'Envoyer mon offre'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
