import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { amount, userId, email, firstName, lastName, phoneNumber, channel, jobId } = req.body || {};
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Le montant est obligatoire et doit être supérieur à 0.' });
    }

    const merchantId = process.env.PAIEMENTPRO_MERCHANT_ID || '';
    if (!merchantId) {
      return res.status(500).json({ error: "Le serveur n'est pas lié à un identifiant de marchand Paiement Pro valide." });
    }

    const referenceNumber = `IVS-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const baseUrl = process.env.APP_URL || process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` || 'https://ivoiresource.ci';
    const notificationURL = `${baseUrl}/api/webhook?token=${process.env.PAYMENT_WEBHOOK_SECRET || ''}`;
    const returnURL = `${baseUrl}/checkout-confirmation?reference=${referenceNumber}`;

    const paymentPayload = {
      merchantId,
      amount: Math.round(Number(amount)),
      description: `Premium Profile Activation for User ${userId || 'guest-session'}`,
      channel: channel || 'WAVECI',
      countryCurrencyCode: '952',
      referenceNumber,
      customerEmail: email || 'client@ivoiresource.ci',
      customerFirstName: firstName || 'Abonné',
      customerFirstname: firstName || 'Abonné',
      customerLastName: lastName || 'Acheteur',
      customerLastname: lastName || 'Acheteur',
      customerPhoneNumber: phoneNumber ? String(phoneNumber).trim().replace(/\s+/g, '') : '0700000000',
      notificationURL,
      returnURL,
      returnContext: JSON.stringify({ userId, jobId, reference: referenceNumber })
    };

    const apiResponse = await fetch('https://www.paiementpro.net/webservice/onlinepayment/js/initialize/initialize.php', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentPayload)
    });

    const responseText = await apiResponse.text();
    if (!apiResponse.ok) return res.status(apiResponse.status).json({ error: `La passerelle de paiement a retourné une erreur HTTP ${apiResponse.status}`, details: responseText });

    let apiData: any;
    try { apiData = JSON.parse(responseText); }
    catch { return res.status(502).json({ error: 'Erreur de format renvoyée par le serveur Paiement Pro.', rawResponse: responseText }); }

    if (!apiData.success || !apiData.url) {
      return res.status(400).json({ success: false, error: apiData.message || "Paiement Pro a refusé d'initier la transaction.", gatewayResponse: apiData });
    }

    return res.status(200).json({ success: true, paymentUrl: apiData.url, referenceNumber });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "Une erreur critique d'exécution est survenue sur le serveur.", details: error?.message });
  }
}
