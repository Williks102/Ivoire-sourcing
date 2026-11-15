import { account } from './appwrite';

/**
 * Appelle une fonction serveur /api en joignant un JWT Appwrite.
 * Le serveur vérifie l'identité ; on n'envoie jamais de montant ni de droit.
 */
export async function authFetch<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const { jwt } = await account.createJWT();
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Erreur ${response.status}`);
  return data as T;
}
