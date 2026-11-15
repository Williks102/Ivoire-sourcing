export const CITIES = ['Abidjan', 'Bouaké', 'Daloa', 'Yamoussoukro', 'San-Pédro', 'Korhogo', 'Man'];

// Métiers proposés au lancement (Abidjan en priorité). Ajouter une ligne suffit pour ouvrir un métier.
export const CATEGORIES = [
  { id: 'plomberie', label: 'Plomberie', icon: '🔧' },
  { id: 'electricite', label: 'Électricité', icon: '💡' },
  { id: 'climatisation', label: 'Climatisation', icon: '❄️' },
  { id: 'peinture', label: 'Peinture', icon: '🎨' },
  { id: 'menage', label: 'Ménage & entretien', icon: '🧹' },
  { id: 'autre', label: 'Autre', icon: '🛠️' },
];

// Taux de commission AFFICHÉ au client et à l'artisan. Le taux réellement appliqué est celui du
// serveur (variable COMMISSION_RATE) : gardez les deux valeurs identiques.
const rawRate = Number(import.meta.env.VITE_COMMISSION_RATE ?? '0.12');
export const COMMISSION_RATE = Number.isFinite(rawRate) ? Math.min(Math.max(rawRate, 0), 0.5) : 0.12;

export const formatFcfa = (value: number | string | undefined | null) =>
  `${Math.round(Number(value) || 0).toLocaleString('fr-FR')} FCFA`;

// Libellés d'état d'une mission, partagés par tous les écrans.
export const MISSION_STATUS_LABELS: Record<string, { text: string; color: string }> = {
  pending: { text: 'En modération', color: 'bg-amber-50 text-amber-600' },
  approved: { text: 'Ouverte aux offres', color: 'bg-emerald-50 text-emerald-600' },
  assigned: { text: 'En cours', color: 'bg-sky-50 text-sky-600' },
  completed: { text: 'Terminée • à payer', color: 'bg-violet-50 text-violet-600' },
  paid: { text: 'Payée', color: 'bg-slate-900 text-white' },
  rejected: { text: 'Refusée', color: 'bg-rose-50 text-rose-600' },
  closed: { text: 'Clôturée', color: 'bg-slate-100 text-slate-500' },
};
