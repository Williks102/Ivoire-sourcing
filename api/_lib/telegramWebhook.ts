import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, readBody } from './server.js';
import { audit, clientIp, rateLimit, sendError } from './security.js';
import { isTelegramSecret, linkTokenValid, parseLinkToken, sendTelegram, esc } from './telegram.js';

/**
 * Messages reçus par le bot. Appelé par api/webhook.ts quand l'en-tête secret de Telegram est présent
 * (une seule fonction pour les deux webhooks : limite de 12 fonctions de l'offre Vercel Hobby).
 *
 *   /start <jeton>  -> relie le compte IvoireSource à cette conversation
 *   /stop           -> coupe les notifications
 */

const HELP = 'Je vous préviens ici des missions et des offres IvoireSource.\n\nPour activer les notifications, ouvrez votre profil sur le site et touchez « Recevoir sur Telegram ». Envoyez /stop pour les couper.';

export async function handleTelegram(req: VercelRequest, res: VercelResponse) {
  try {
    await rateLimit(`ip:telegram:${clientIp(req)}`, 300, 60);
    if (!isTelegramSecret(req.headers['x-telegram-bot-api-secret-token'])) return res.status(401).json({ error: 'Unauthorized' });

    const message = readBody(req)?.message;
    const chatId = message?.chat?.id !== undefined ? String(message.chat.id) : '';
    const text = typeof message?.text === 'string' ? message.text.trim().slice(0, 200) : '';
    // Seules les conversations privées sont acceptées (pas de groupes) ; tout le reste est ignoré avec un 200.
    if (!chatId || message?.chat?.type !== 'private' || !text) return res.status(200).json({ ok: true });
    await rateLimit(`u:telegram:${chatId}`, 20, 60);

    const [command, arg] = text.split(/\s+/, 2);
    const cmd = command.toLowerCase().split('@')[0];

    if (cmd === '/start' && arg) {
      const parsed = parseLinkToken(arg);
      const profile = parsed ? await db.get('users', parsed.uid).catch(() => null) : null;
      // Signature vérifiée avec l'aléa du profil : lien à usage unique, remplacé par tout nouveau lien.
      if (!parsed || !profile || !linkTokenValid(parsed, profile.telegramLinkNonce)) {
        await sendTelegram(chatId, '⚠️ Ce lien a expiré ou n’est pas valide. Revenez sur le site et touchez à nouveau « Recevoir sur Telegram ».');
        return res.status(200).json({ ok: true });
      }
      const uid = parsed.uid;
      // Une conversation n'est reliée qu'à un seul compte.
      const previous = await db.listEqual('users', 'telegramChatId', chatId);
      await Promise.all(previous.filter((r) => r.$id !== uid).map((r) => db.update('users', r.$id, { telegramChatId: '' })));
      await db.update('users', uid, { telegramChatId: chatId, telegramLinkNonce: '' });
      await audit(req, uid, 'telegram.link', uid);
      await sendTelegram(chatId, `✅ <b>Notifications activées</b>${profile.displayName ? ` pour ${esc(profile.displayName)}` : ''}.\n\n${profile.role === 'candidate' ? 'Vous recevrez ici les missions de votre métier et de votre zone, ainsi que les réponses à vos offres.' : 'Vous serez prévenu ici des offres reçues et de l’avancement de vos missions.'}\n\nEnvoyez /stop pour les couper.`);
      return res.status(200).json({ ok: true });
    }

    if (cmd === '/stop') {
      const rows = await db.listEqual('users', 'telegramChatId', chatId);
      await Promise.all(rows.map((r) => db.update('users', r.$id, { telegramChatId: '' })));
      if (rows[0]) await audit(req, rows[0].$id, 'telegram.unlink', rows[0].$id, { by: 'bot' });
      await sendTelegram(chatId, '🔕 Notifications désactivées. Vous pouvez les réactiver depuis votre profil.');
      return res.status(200).json({ ok: true });
    }

    await sendTelegram(chatId, HELP);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    return sendError(res, error, '[telegram-webhook]');
  }
}
