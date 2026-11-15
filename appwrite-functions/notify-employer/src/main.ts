import { Client, Databases } from 'node-appwrite';
import { Resend } from 'resend';

// Typage des variables fournies par Appwrite
type Context = {
  req: any;
  res: any;
  log: (msg: string) => void;
  error: (msg: string) => void;
};

export default async function (context: Context) {
  const { req, res, log, error } = context;

  // Appwrite injecte les variables d'environnement définies dans la console
  const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || '';
  const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || '';
  const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || ''; // Clé d'API Serveur
  const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

  if (!req.bodyRaw) {
    return res.json({ success: false, message: 'Aucune donnée reçue' }, 400);
  }

  try {
    // 1. Initialisation du SDK Serveur d'Appwrite
    // Contrairement au SDK web, ici on utilise 'node-appwrite' avec une API Key (qui a les droits admin)
    const client = new Client()
      .setEndpoint(APPWRITE_ENDPOINT)
      .setProject(APPWRITE_PROJECT_ID)
      .setKey(APPWRITE_API_KEY);

    const databases = new Databases(client);
    const resend = new Resend(RESEND_API_KEY);

    // 2. Parser le payload de l'événement Appwrite (document créé)
    // Le déclencheur sera un événement de base de données : databases.*.collections.[applications_id].documents.*.create
    const applicationEvent = typeof req.bodyRaw === 'string' ? JSON.parse(req.bodyRaw) : req.bodyRaw;
    
    const jobId = applicationEvent.jobId;
    const candidateId = applicationEvent.candidateId;

    log(`Nouvelle candidature reçue: Job ${jobId} - Candidat ${candidateId}`);

    // 3. Retrouver la mission et l'adresse e-mail du client (profil dans la collection `users`)
    const databaseId = process.env.APPWRITE_DATABASE_ID || '';
    const job = await databases.getDocument(databaseId, 'jobs', jobId);
    const client_ = await databases.getDocument(databaseId, 'users', job.employerId);
    const clientEmail = client_.email;
    if (!clientEmail) {
      log(`Pas d'e-mail pour le client ${job.employerId} : notification ignorée.`);
      return res.json({ success: true, message: 'Aucun e-mail à notifier.' });
    }

    const price = applicationEvent.proposedPrice
      ? `${Number(applicationEvent.proposedPrice).toLocaleString('fr-FR')} FCFA`
      : 'prix non précisé';

    // 4. Envoi de l'email via Resend
    await resend.emails.send({
      from: process.env.MAIL_FROM || 'IvoireSource <notifications@votre-domaine.com>',
      to: [clientEmail],
      subject: `Nouvelle offre pour : ${job.title}`,
      html: `
        <h2>Bonjour,</h2>
        <p>Un artisan vient de vous envoyer une offre (<strong>${price}</strong>) pour votre mission <strong>${job.title}</strong>.</p>
        <p>Connectez-vous à votre tableau de bord pour comparer les offres et choisir. Vous ne payez qu'à la fin de la mission.</p>
        <br/>
        <p>L'équipe IvoireSource</p>
      `
    });

    log(`Email envoyé avec succès à ${clientEmail}`);

    return res.json({ success: true, message: 'Email envoyé avec succès.' });

  } catch (err: any) {
    error(`Erreur d'exécution de la fonction: ${err.message}`);
    return res.json({ success: false, message: err.message }, 500);
  }
}
