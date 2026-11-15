import { Application, JobPost } from '../types';

/**
 * Revenus d'un artisan, calculés à partir de ses missions et de ses offres (aucune donnée supplémentaire).
 *  - missions payées : montants réels enregistrés par le serveur (commission, part de l'artisan, reversement) ;
 *  - missions en cours / terminées : estimation au taux de commission affiché.
 */

export interface RevenueRow { id: string; title: string; category: string; paidAt: string; gross: number; commission: number; net: number; payoutSent: boolean }

export interface Revenue {
  inProgress: { count: number; gross: number; net: number };
  awaitingPayment: { count: number; gross: number; net: number };
  toReceive: { count: number; amount: number };
  received: { count: number; amount: number };
  earned: number;
  grossPaid: number;
  commissionPaid: number;
  paidCount: number;
  averageBasket: number;
  byMonth: { month: string; net: number }[];
  byTrade: { category: string; net: number; count: number }[];
  offers: { sent: number; retained: number; inDiscussion: number; declined: number; successRate: number };
  rows: RevenueRow[];
}

const netOf = (gross: number, rate: number) => gross - Math.round(gross * rate);
const monthKey = (iso: string) => (iso || '').slice(0, 7);

export function computeRevenue(missions: JobPost[], offers: Application[], rate: number, now: Date = new Date()): Revenue {
  const inProgress = { count: 0, gross: 0, net: 0 };
  const awaitingPayment = { count: 0, gross: 0, net: 0 };
  const toReceive = { count: 0, amount: 0 };
  const received = { count: 0, amount: 0 };
  const rows: RevenueRow[] = [];
  const months = new Map<string, number>();
  const trades = new Map<string, { net: number; count: number }>();
  let grossPaid = 0, commissionPaid = 0;

  for (const m of missions) {
    const gross = Math.round(Number(m.agreedPrice) || 0);
    if (m.status === 'assigned') { inProgress.count++; inProgress.gross += gross; inProgress.net += netOf(gross, rate); }
    else if (m.status === 'completed') { awaitingPayment.count++; awaitingPayment.gross += gross; awaitingPayment.net += netOf(gross, rate); }
    else if (m.status === 'paid') {
      const commission = Math.round(Number(m.commissionAmount) || 0);
      const net = Math.round(Number(m.artisanPayout) || (gross - commission));
      const sent = m.payoutStatus === 'sent';
      if (sent) { received.count++; received.amount += net; } else { toReceive.count++; toReceive.amount += net; }
      grossPaid += gross; commissionPaid += commission;
      const paidAt = m.paidAt || m.completedAt || m.createdAt || '';
      months.set(monthKey(paidAt), (months.get(monthKey(paidAt)) || 0) + net);
      const t = trades.get(m.category) || { net: 0, count: 0 };
      trades.set(m.category, { net: t.net + net, count: t.count + 1 });
      rows.push({ id: m.id, title: m.title, category: m.category, paidAt, gross, commission, net, payoutSent: sent });
    }
  }

  // 12 derniers mois, y compris ceux sans revenu (pour un graphique régulier)
  const byMonth: { month: string; net: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    byMonth.push({ month: key, net: months.get(key) || 0 });
  }

  const retained = offers.filter((o) => o.status === 'accepted' || o.status === 'approved').length;
  const inDiscussion = offers.filter((o) => o.status === 'pending').length;
  const declined = offers.filter((o) => o.status === 'rejected' || o.status === 'withdrawn').length;
  const paidCount = rows.length;

  return {
    inProgress, awaitingPayment, toReceive, received,
    earned: toReceive.amount + received.amount,
    grossPaid, commissionPaid, paidCount,
    averageBasket: paidCount ? Math.round(grossPaid / paidCount) : 0,
    byMonth,
    byTrade: [...trades.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.net - a.net),
    offers: { sent: offers.length, retained, inDiscussion, declined, successRate: offers.length ? Math.round((retained / offers.length) * 100) : 0 },
    rows: rows.sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
  };
}

/** Export CSV (séparateur « ; » et BOM pour une ouverture directe dans Excel en français). */
export function revenueCsv(rows: RevenueRow[], categoryLabel: (id: string) => string): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Date de paiement', 'Mission', 'Métier', 'Prix convenu (FCFA)', 'Commission (FCFA)', 'Net artisan (FCFA)', 'Reversement'];
  const body = rows.map((r) => [r.paidAt.slice(0, 10), r.title, categoryLabel(r.category), r.gross, r.commission, r.net, r.payoutSent ? 'Effectué' : 'À recevoir'].map(esc).join(';'));
  return '﻿' + [head.map(esc).join(';'), ...body].join('\r\n');
}
