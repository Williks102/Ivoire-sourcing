import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from "@google/genai";
import { z } from 'zod';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const CheckJobSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(10).max(5000),
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

  const parsed = CheckJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.format() });
  }

  const title = sanitizeText(parsed.data.title, 150);
  const description = sanitizeText(parsed.data.description, 4000);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Moderation d'annonce d'emploi pour la Côte d'Ivoire. 
      Titre: ${title.replace(/[\n\r]/g, ' ')}
      Description: ${description}
      
      Vérifie si l'annonce est explicite, frauduleuse ou inappropriée (ex: traite humaine, arnaque, contenu sexuel). 
      Retourne un JSON avec:
      - approved: boolean
      - reason: string (explication courte si refusé)`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            approved: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          },
          required: ["approved", "reason"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"approved": false, "reason": "Erreur d\'analyse"}');
    res.status(200).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Moderation Error logged internally:', {
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
    res.status(200).json({ approved: true, reason: 'Moderation skip due to error' });
  }
}
