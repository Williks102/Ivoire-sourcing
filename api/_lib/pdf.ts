import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { QuoteLine, lineTotal, money, quoteSubtotal } from './quote.js';

/**
 * Génération des documents PDF (devis, reçu, relevé de revenus) côté serveur : le contenu vient de la base,
 * pas du navigateur. Aucune coordonnée de contact (téléphone, e-mail) n'y figure : les échanges passent par la plateforme.
 * Polices standard PDF (WinAnsi) : les caractères non pris en charge sont remplacés par « ? ».
 */

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // marge
const GREEN = rgb(0.02, 0.45, 0.33);
const DARK = rgb(0.1, 0.12, 0.16);
const GREY = rgb(0.4, 0.44, 0.5);
const LIGHT = rgb(0.95, 0.96, 0.97);

const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
/** Rend un texte compatible avec les polices standard : typographie courante conservée, reste remplacé. */
export function safe(input: unknown): string {
  const map: Record<string, string> = { ' ': ' ', '→': '->', '•': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...' };
  return String(input ?? '').replace(/[\r\n\t]+/g, ' ').split('').map((ch) => {
    if (map[ch] !== undefined) return map[ch];
    const c = ch.charCodeAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.has(ch)) return ch;
    return '?';
  }).join('');
}

const fmtDate = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10).split('-').reverse().join('/') : '-';
};
const addDays = (iso: string, days: number) => { const d = new Date(iso); d.setUTCDate(d.getUTCDate() + days); return d.toISOString(); };

class Sheet {
  doc!: PDFDocument; page!: PDFPage; font!: PDFFont; bold!: PDFFont;
  y = 0;
  constructor(private title: string, private footer: string) {}

  static async create(title: string, footer: string) {
    const s = new Sheet(title, footer);
    s.doc = await PDFDocument.create();
    s.doc.setTitle(safe(title)); s.doc.setProducer('IvoireSource'); s.doc.setCreator('IvoireSource');
    s.font = await s.doc.embedFont(StandardFonts.Helvetica);
    s.bold = await s.doc.embedFont(StandardFonts.HelveticaBold);
    s.newPage(true);
    return s;
  }

  newPage(first = false) {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
    if (first) return;
    this.write(this.title + ' (suite)', M, 10, true, GREY);
    this.y -= 24;
  }

  width(text: string, size: number, bold = false) { return (bold ? this.bold : this.font).widthOfTextAtSize(safe(text), size); }
  need(h: number) { if (this.y - h < M + 28) this.newPage(); }

  write(text: string, x: number, size = 10, bold = false, color = DARK, align: 'left' | 'right' = 'left') {
    const t = safe(text);
    const f = bold ? this.bold : this.font;
    const px = align === 'right' ? x - f.widthOfTextAtSize(t, size) : x;
    this.page.drawText(t, { x: px, y: this.y, size, font: f, color });
  }

  /** Découpe un texte en lignes de largeur maximale donnée. */
  wrap(text: string, maxWidth: number, size: number, bold = false): string[] {
    const words = safe(text).split(' ').filter(Boolean);
    const lines: string[] = []; let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (this.width(next, size, bold) <= maxWidth) cur = next;
      else {
        if (cur) lines.push(cur);
        // mot plus large que la ligne : on le coupe
        let rest = w;
        while (this.width(rest, size, bold) > maxWidth && rest.length > 1) {
          let n = rest.length; while (n > 1 && this.width(rest.slice(0, n), size, bold) > maxWidth) n--;
          lines.push(rest.slice(0, n)); rest = rest.slice(n);
        }
        cur = rest;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  paragraph(text: string, x: number, maxWidth: number, size = 10, bold = false, color = DARK, gap = 4) {
    for (const line of this.wrap(text, maxWidth, size, bold)) { this.need(size + gap); this.write(line, x, size, bold, color); this.y -= size + gap; }
  }

  rule(color = LIGHT, thickness = 1) {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness, color });
  }

  /** Bandeau vert : marque à gauche ; type de document, numéro et mentions (dates, statut) à droite. */
  header(kind: string, number: string, rightLines: string[]) {
    const band = 112;
    this.page.drawRectangle({ x: 0, y: A4.h - band, width: A4.w, height: band, color: GREEN });
    this.y = A4.h - 46;
    this.write('IvoireSource', M, 20, true, rgb(1, 1, 1));
    this.y -= 18; this.write('Artisans et missions en Côte d\'Ivoire', M, 9, false, rgb(0.85, 0.95, 0.9));
    this.y = A4.h - 38; this.write(kind, A4.w - M, 18, true, rgb(1, 1, 1), 'right');
    this.y -= 15; this.write(number, A4.w - M, 10, true, rgb(0.85, 0.95, 0.9), 'right');
    this.y -= 14;
    for (const l of rightLines) { this.write(l, A4.w - M, 8.5, false, rgb(0.85, 0.95, 0.9), 'right'); this.y -= 11; }
    this.y = A4.h - band - 26;
  }

  /** Bloc « libellé / valeur » sur la gauche, avec retour à la ligne. */
  field(label: string, value: string, x: number, maxWidth: number) {
    this.need(30);
    this.write(label.toUpperCase(), x, 7.5, true, GREY); this.y -= 11;
    for (const line of this.wrap(value || '-', maxWidth, 10.5, true)) { this.write(line, x, 10.5, true, DARK); this.y -= 13; }
    this.y -= 4;
  }

  finish(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: M + 14 }, end: { x: A4.w - M, y: M + 14 }, thickness: 0.5, color: LIGHT });
      p.drawText(safe(this.footer), { x: M, y: M, size: 7.5, font: this.font, color: GREY, maxWidth: A4.w - 2 * M - 50 });
      p.drawText(`${i + 1} / ${pages.length}`, { x: A4.w - M - 30, y: M, size: 7.5, font: this.font, color: GREY });
    });
    return this.doc.save();
  }
}

/** Tableau de lignes : désignation | qté | PU | total. */
function linesTable(s: Sheet, lines: QuoteLine[]) {
  const col = { label: M + 8, qty: 340, unit: 420, total: A4.w - M - 8 };
  const head = () => {
    s.need(26);
    s.page.drawRectangle({ x: M, y: s.y - 6, width: A4.w - 2 * M, height: 20, color: LIGHT });
    s.write('DÉSIGNATION', col.label, 7.5, true, GREY); s.write('QTÉ', col.qty, 7.5, true, GREY, 'right');
    s.write('PRIX UNIT.', col.unit + 40, 7.5, true, GREY, 'right'); s.write('TOTAL', col.total, 7.5, true, GREY, 'right');
    s.y -= 22;
  };
  head();
  for (const l of lines) {
    const labelLines = s.wrap(l.label, col.qty - col.label - 40, 10);
    const h = labelLines.length * 13 + 6;
    if (s.y - h < M + 40) { s.newPage(); head(); }
    labelLines.forEach((t, i) => { s.write(t, col.label, 10); if (i === 0) {
      s.write(`${l.qty}${l.unit ? ' ' + l.unit : ''}`, col.qty, 10, false, DARK, 'right');
      s.write(money(l.unitPrice), col.unit + 40, 10, false, DARK, 'right');
      s.write(money(lineTotal(l)), col.total, 10, true, DARK, 'right');
    } s.y -= 13; });
    s.y -= 3; s.rule();
    s.y -= 7;
  }
}

function totalsBlock(s: Sheet, rows: [string, string, boolean?][]) {
  s.need(rows.length * 18 + 20);
  for (const [label, value, strong] of rows) {
    if (strong) { s.page.drawRectangle({ x: 300, y: s.y - 7, width: A4.w - M - 300, height: 22, color: GREEN }); }
    s.write(label, 310, strong ? 11 : 10, !!strong, strong ? rgb(1, 1, 1) : DARK);
    s.write(value, A4.w - M - 8, strong ? 12 : 10, true, strong ? rgb(1, 1, 1) : DARK, 'right');
    s.y -= strong ? 26 : 17;
  }
}

// ------------------------------------------------------------------ DEVIS
export interface QuoteDoc {
  number: string;
  issuedAt: string;
  validUntil: string;
  statusLabel: string;
  agreedAt?: string;
  mission: { title: string; category: string; city: string; address?: string; description?: string };
  artisan: { name: string; trades: string[]; businessName?: string; businessRegistration?: string };
  client: { name: string };
  lines: QuoteLine[];
  discount: number;
  /** Prix en cours de négociation, ou prix convenu si accepté. */
  finalPrice: number;
  conditions?: string;
  history?: { by: 'client' | 'artisan'; price: number; at: string }[];
}

export async function renderQuotePdf(d: QuoteDoc): Promise<Uint8Array> {
  const s = await Sheet.create(`Devis ${d.number}`, 'Devis établi via IvoireSource. Paiement sécurisé à la fin de la mission. Ce document est un devis, pas une facture.');
  s.header('DEVIS', d.number, [`Émis le ${fmtDate(d.issuedAt)}`, `Valable jusqu'au ${fmtDate(d.validUntil)}`, `Statut : ${d.statusLabel}`]);

  const top = s.y;
  s.field('Artisan', d.artisan.name, M, 230);
  if (d.artisan.businessName) s.field('Entreprise', d.artisan.businessName, M, 230);
  if (d.artisan.businessRegistration) s.field('N° contribuable / RCCM', d.artisan.businessRegistration, M, 230);
  if (d.artisan.trades.length) s.field('Métiers', d.artisan.trades.join(', '), M, 230);
  const leftEnd = s.y;
  s.y = top;
  s.field('Client', d.client.name, 330, 215);
  s.field('Mission', d.mission.title, 330, 215);
  s.field('Lieu', [d.mission.city, d.mission.address].filter(Boolean).join(' - '), 330, 215);
  s.y = Math.min(s.y, leftEnd) - 6;

  if (d.mission.description) { s.write('DESCRIPTION DE LA MISSION', M, 7.5, true, GREY); s.y -= 12; s.paragraph(d.mission.description.slice(0, 400), M, A4.w - 2 * M, 9.5, false, DARK, 3); s.y -= 14; }

  linesTable(s, d.lines);
  const sub = quoteSubtotal({ lines: d.lines });
  const computed = sub - d.discount;
  const rows: [string, string, boolean?][] = [['Sous-total', money(sub)]];
  if (d.discount > 0) rows.push(['Remise', `- ${money(d.discount)}`]);
  if (d.finalPrice !== computed) rows.push([d.finalPrice < computed ? 'Ajustement négocié' : 'Ajustement', `${d.finalPrice < computed ? '-' : '+'} ${money(Math.abs(d.finalPrice - computed))}`]);
  rows.push([d.agreedAt ? 'PRIX CONVENU' : 'TOTAL PROPOSÉ', money(d.finalPrice), true]);
  s.y -= 4;
  totalsBlock(s, rows);

  if (d.history && d.history.length > 1) {
    s.y -= 4; s.need(40);
    s.write('HISTORIQUE DES PRIX', M, 7.5, true, GREY); s.y -= 13;
    for (const h of d.history.slice(-8)) { s.need(14); s.write(`${fmtDate(h.at)}  -  ${h.by === 'artisan' ? 'Artisan' : 'Client'} : ${money(h.price)}`, M, 9, false, DARK); s.y -= 12; }
  }
  if (d.agreedAt) { s.y -= 6; s.need(20); s.write(`Prix accepté par les deux parties le ${fmtDate(d.agreedAt)}.`, M, 9.5, true, GREEN); s.y -= 14; }
  if (d.conditions) { s.y -= 6; s.need(30); s.write('CONDITIONS', M, 7.5, true, GREY); s.y -= 12; s.paragraph(d.conditions, M, A4.w - 2 * M, 9.5, false, DARK, 3); }
  return s.finish();
}

// ------------------------------------------------------------------ REÇU
export interface ReceiptDoc {
  number: string; // référence de paiement
  paidAt: string;
  channel: string;
  mission: { title: string; category: string; city: string };
  artisan: { name: string; businessName?: string; businessRegistration?: string };
  client: { name: string };
  lines: QuoteLine[];
  discount: number;
  amount: number;
}

export async function renderReceiptPdf(d: ReceiptDoc): Promise<Uint8Array> {
  const s = await Sheet.create(`Reçu ${d.number}`, 'Reçu de paiement établi par IvoireSource. Ce document atteste un paiement sur la plateforme ; ce n\'est pas une facture fiscale.');
  s.header('REÇU DE PAIEMENT', d.number, [`Payé le ${fmtDate(d.paidAt)}`, `Moyen de paiement : ${d.channel}`]);
  const top = s.y;
  s.field('Client', d.client.name, M, 230);
  s.field('Mission', d.mission.title, M, 230);
  const leftEnd = s.y; s.y = top;
  s.field('Artisan', d.artisan.name, 330, 215);
  if (d.artisan.businessName) s.field('Entreprise', d.artisan.businessName, 330, 215);
  if (d.artisan.businessRegistration) s.field('N° contribuable / RCCM', d.artisan.businessRegistration, 330, 215);
  s.y = Math.min(s.y, leftEnd) - 6;
  linesTable(s, d.lines);
  const sub = quoteSubtotal({ lines: d.lines });
  const rows: [string, string, boolean?][] = [['Sous-total', money(sub)]];
  if (d.discount > 0) rows.push(['Remise', `- ${money(d.discount)}`]);
  if (d.amount !== sub - d.discount) rows.push(['Ajustement négocié', `${d.amount < sub - d.discount ? '-' : '+'} ${money(Math.abs(d.amount - (sub - d.discount)))}`]);
  rows.push(['MONTANT PAYÉ', money(d.amount), true]);
  s.y -= 4; totalsBlock(s, rows);
  s.y -= 8; s.paragraph('Le paiement a été effectué via IvoireSource à la fin de la mission, après validation par le client.', M, A4.w - 2 * M, 9.5, false, GREY);
  return s.finish();
}

// ------------------------------------------------------------------ RELEVÉ
export interface StatementRow { paidAt: string; title: string; category: string; gross: number; commission: number; net: number; payoutSent: boolean }
export interface StatementDoc { year: number; artisan: { name: string; businessName?: string; businessRegistration?: string }; generatedAt: string; rows: StatementRow[] }

export async function renderStatementPdf(d: StatementDoc): Promise<Uint8Array> {
  const s = await Sheet.create(`Relevé de revenus ${d.year}`, 'Relevé établi par IvoireSource à partir des missions payées sur la plateforme. Ce document n\'est pas une déclaration fiscale.');
  s.header('RELEVÉ DE REVENUS', String(d.year), [`Établi le ${fmtDate(d.generatedAt)}`]);
  s.field('Artisan', d.artisan.name, M, 400);
  if (d.artisan.businessName) s.field('Entreprise', d.artisan.businessName, M, 400);
  if (d.artisan.businessRegistration) s.field('N° contribuable / RCCM', d.artisan.businessRegistration, M, 400);
  s.y -= 4;

  const col = { date: M + 6, title: M + 70, gross: 395, comm: 463, net: A4.w - M - 6 };
  const head = () => {
    s.need(26);
    s.page.drawRectangle({ x: M, y: s.y - 6, width: A4.w - 2 * M, height: 20, color: LIGHT });
    s.write('DATE', col.date, 7.5, true, GREY); s.write('MISSION', col.title, 7.5, true, GREY);
    s.write('PRIX', col.gross, 7.5, true, GREY, 'right'); s.write('COMMISSION', col.comm, 7.5, true, GREY, 'right'); s.write('NET', col.net, 7.5, true, GREY, 'right');
    s.y -= 22;
  };
  head();
  if (d.rows.length === 0) { s.write('Aucune mission payée sur cette période.', col.date, 10, false, GREY); s.y -= 16; }
  for (const r of d.rows) {
    const lines = s.wrap(r.title, col.gross - col.title - 70, 9.5);
    const h = lines.length * 12 + 6;
    if (s.y - h < M + 40) { s.newPage(); head(); }
    lines.forEach((t, i) => { s.write(t, col.title, 9.5); if (i === 0) {
      s.write(fmtDate(r.paidAt), col.date, 9.5); s.write(money(r.gross), col.gross, 9.5, false, DARK, 'right');
      s.write(money(r.commission), col.comm, 9.5, false, DARK, 'right'); s.write(money(r.net), col.net, 9.5, true, DARK, 'right');
    } s.y -= 12; });
    s.y -= 2; s.rule(); s.y -= 6;
  }
  const gross = d.rows.reduce((n, r) => n + r.gross, 0), comm = d.rows.reduce((n, r) => n + r.commission, 0), net = d.rows.reduce((n, r) => n + r.net, 0);
  const sent = d.rows.filter((r) => r.payoutSent).reduce((n, r) => n + r.net, 0);
  s.y -= 6;
  totalsBlock(s, [['Missions payées', String(d.rows.length)], ['Total des prix', money(gross)], ['Commission IvoireSource', `- ${money(comm)}`], ['Déjà reversé', money(sent)], ['NET ' + d.year, money(net), true]]);
  return s.finish();
}
