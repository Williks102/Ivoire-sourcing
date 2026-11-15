import { GoogleGenAI, Type } from '@google/genai';

export interface ModerationResult {
  approved: boolean;
  /** true = l'analyse automatique n'a pas pu se faire : revue manuelle requise (jamais validé d'office). */
  review: boolean;
  reason: string;
}

/**
 * Modération d'une mission par IA. Appelée uniquement par le serveur (pas d'endpoint public :
 * un endpoint ouvert permettrait de consommer le quota Gemini). Échec fermé : toute erreur
 * renvoie `review: true`, la mission part alors en attente de validation par un admin.
 */
export async function moderateMission(title: string, description: string): Promise<ModerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { approved: false, review: true, reason: 'Modération automatique non configurée : revue manuelle.' };

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Modération d'une annonce de mission (artisan / service à domicile) pour la Côte d'Ivoire.
Titre: ${title.replace(/[\n\r]/g, ' ')}
Description: ${description}

Vérifie si l'annonce est explicite, frauduleuse ou inappropriée (ex: traite humaine, arnaque, demande de paiement hors plateforme, contenu sexuel).
Retourne un JSON avec:
- approved: boolean
- reason: string (explication courte si refusé)`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: { approved: { type: Type.BOOLEAN }, reason: { type: Type.STRING } },
          required: ['approved', 'reason'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '');
    if (typeof parsed.approved !== 'boolean') throw new Error('Réponse inattendue');
    return { approved: parsed.approved, review: false, reason: String(parsed.reason || '') };
  } catch (error) {
    console.error('[moderation]', error instanceof Error ? error.message : 'erreur inconnue');
    return { approved: false, review: true, reason: 'Vérification automatique indisponible : revue manuelle.' };
  }
}
