import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

const CheckoutPremiumSchema = z.object({
  employerId: z.string().min(1).max(128),
  jobId: z.string().max(128).optional(),
});

function sanitizeText(input: string, maxLength = 5000): string {
  if (!input) return '';
  let result = input.replace(/<\/?[^>]+(>|$)/g, "");
  result = result.substring(0, maxLength);
  result = result.replace(/[`${}]/g, '');
  return result.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const parsed = CheckoutPremiumSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.format() });
  }

  const { jobId, employerId } = parsed.data;
  console.log(`[Vercel Serverless API] Simulating premium payment: Job ${sanitizeText(jobId || 'new', 128)} by User ${sanitizeText(employerId, 128)}`);
  
  res.status(200).json({ success: true, message: 'Payment simulated successfully' });
}
