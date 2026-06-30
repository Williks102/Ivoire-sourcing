import type { VercelRequest, VercelResponse } from '@vercel/node';
async function updateAppwriteDocument(collectionId: string, documentId: string, data: Record<string, unknown>) {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const project = process.env.APPWRITE_PROJECT_ID;
  const database = process.env.APPWRITE_DATABASE_ID;
  const key = process.env.APPWRITE_API_KEY;
  if (!endpoint || !project || !database || !key) throw new Error('Configuration Appwrite serveur incomplète.');

  const response = await fetch(`${endpoint}/databases/${database}/collections/${collectionId}/documents/${documentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': project,
      'X-Appwrite-Key': key
    },
    body: JSON.stringify({ data })
  });

  if (!response.ok) {
    throw new Error(`Appwrite update failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = req.query.token;
    const expected = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!expected || token !== expected) return res.status(401).json({ error: 'Unauthorized security token. Access denied.' });

    const payload = req.body || {};
    const reference = payload.reference || payload.referenceNumber || payload.ref;
    const status = payload.status || payload.payment_status;
    const amount = payload.amount;
    let returnContext = payload.returnContext;
    if (typeof returnContext === 'string') {
      try { returnContext = JSON.parse(returnContext); } catch { returnContext = {}; }
    }
    const jobId = payload.jobId || payload.customData?.jobId || returnContext?.jobId;

    if (!reference) return res.status(400).json({ error: 'Mandatory transaction reference is missing from hook body.' });

    if ((status === 'SUCCESS' || status === 'APPROVED') && jobId) {
      await updateAppwriteDocument('jobs', jobId, {
        isPremium: true,
        paidAt: new Date().toISOString(),
        paymentReference: reference,
        paymentAmount: amount ? Number(amount) : undefined
      });
    }

    return res.status(200).json({ success: true, message: 'Webhook processed and registered successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to parse or process notification payload.', details: error?.message });
  }
}
