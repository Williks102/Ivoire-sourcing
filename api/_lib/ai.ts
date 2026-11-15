import { GoogleGenAI } from '@google/genai';

/** Vrai si une clé Gemini est configurée (sinon toutes les fonctions IA se replient sur des modèles fixes). */
export const aiAvailable = () => !!process.env.GEMINI_API_KEY;

/**
 * Appelle Gemini et renvoie un objet JSON, ou `null` en cas d'absence de clé, d'erreur ou de délai dépassé.
 * Jamais d'exception : l'appelant prévoit toujours un repli sans IA.
 */
export async function askJson(prompt: string, schema: unknown, timeoutMs = 6000): Promise<any | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const call = ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', responseSchema: schema as any, temperature: 0.3 },
    });
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('délai dépassé')), timeoutMs); });
    const response = await Promise.race([call, timeout]);
    return JSON.parse(response.text || '');
  } catch (error) {
    console.error('[ai]', error instanceof Error ? error.message : 'erreur inconnue');
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Texte d'un utilisateur destiné à être inséré dans un prompt : une seule ligne, longueur bornée, sans balises. */
export function forPrompt(value: unknown, max = 400): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Retire des textes produits par l'IA tout ce qui ressemble à un lien ou à un numéro de téléphone. */
export function stripContacts(text: string): string {
  return text
    .replace(/https?:\/\/\S+|www\.\S+/gi, '')
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
