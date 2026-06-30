import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const app = express();
const PORT = 3000;

// Security Headers Middleware (Commandment #13: Tu durciras tes en-têtes HTTP)
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  // Hardened CSP dynamically locking unsafe script features in production (No 'unsafe-eval' in prod)
  const isProd = process.env.NODE_ENV === 'production';
  const scriptSrc = isProd
    ? "script-src 'self' https://apis.google.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com";

  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://images.unsplash.com https://via.placeholder.com https://*.googleusercontent.com",
    "connect-src 'self' ws: wss: https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.googleapis.com",
    "frame-src 'self'"
  ].join('; '));
  next();
});

// Middleware for parsing JSON
app.use(express.json());

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Rate Limiters to prevent AI API quota and system denial-of-wallet exhaustion
const moderationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 requests per 15 minutes per IP
  message: { error: 'Trop de requêtes de modération. Veuillez réessayer dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 simulated checks per 15 minutes per IP
  message: { error: 'Nombre maximal de de transactions simulées atteint. Réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Sanitization utility to defend against CSS, script injections, and AI prompt template manipulation
function sanitizeText(input: string, maxLength = 5000): string {
  if (!input) return '';
  // Strip common HTML/script tags
  let result = input.replace(/<\/?[^>]+(>|$)/g, "");
  // Restrict to specified security boundaries
  result = result.substring(0, maxLength);
  // Neutralize template literals and expression symbols to block Prompt Injection
  result = result.replace(/[`${}]/g, '');
  return result.trim();
}

// Input Schemas for Validation (Commandment #3: Tu valideras chaque donnée entrante)
const CheckJobSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(10).max(5000),
});

const CheckoutPremiumSchema = z.object({
  employerId: z.string().min(1).max(128),
  jobId: z.string().max(128).optional(),
});

// Create HTTP server wrapper around Express
const server = http.createServer(app);

// Create WebSocket server attached to HTTP server upgrade lifecycle
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WS] Client connected. Total connected: ${wsClients.size}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('[WS] Received client payload:', data);
      
      // Forward/broadcast the action validation across all other connected sockets
      if (data.type === 'action_validated') {
        const payload = JSON.stringify({
          type: 'action_validated',
          action: data.action,
          payload: data.payload,
          timestamp: new Date().toISOString()
        });

        for (const client of wsClients) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    } catch (err) {
      console.error('[WS] Protocol error parsing message:', err);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected. Total connected: ${wsClients.size}`);
  });
});

// Relay raw websocket upgrade handshakes from http server
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Broadcast hook helper
function broadcastAction(action: string, payload: any) {
  const payloadStr = JSON.stringify({
    type: 'action_validated',
    action,
    payload,
    timestamp: new Date().toISOString()
  });

  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payloadStr);
    }
  }
}

// Admin Moderation API
app.post('/api/moderation/check-job', moderationLimiter, async (req, res) => {
  // Validate input
  const parsed = CheckJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.format() });
  }

  // Sanitization of inputs before embedding in the prompt template
  const title = sanitizeText(parsed.data.title, 150);
  const description = sanitizeText(parsed.data.description, 4000);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
    if (result.approved) {
      broadcastAction('job_moderation_approved', { title });
    } else {
      broadcastAction('job_moderation_rejected', { title, reason: result.reason });
    }
    res.json(result);
  } catch (error) {
    // Secure generic internal logging to block stack or secret exposure
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Moderation Error logged internally:', {
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ approved: true, reason: 'Moderation skip due to error' });
  }
});

// Real Paiement Pro Integration API Route with Deep Auditing and Debugging Logs
app.post('/api/pay', async (req, res) => {
  const logSeparator = '='.repeat(60);
  console.log(logSeparator);
  console.log('[PAY_ROUTE_TRIGGERED] Received checkout generation request');
  console.log('[PAY_ROUTE_REQUEST_HEADERS]:', JSON.stringify(req.headers, null, 2));
  console.log('[PAY_ROUTE_REQUEST_BODY]:', JSON.stringify(req.body, null, 2));
  console.log(logSeparator);

  try {
    const {
      amount,
      userId,
      email,
      firstName,
      lastName,
      phoneNumber,
      channel
    } = req.body;

    // Validate inputs
    if (!amount || Number(amount) <= 0) {
      console.warn('⚠️ [PAY_ROUTE_VALIDATION_ERROR]: Invalid or missing amount parameter:', amount);
      return res.status(400).json({ error: 'Le montant est obligatoire et doit être supérieur à 0.' });
    }

    const merchantId = process.env.PAIEMENTPRO_MERCHANT_ID || process.env.VITE_PAIEMENTPRO_MERCHANT_ID || '';
    console.log('[PAY_ROUTE_CONFIG_CHECK] Checked environment for credentials:');
    console.log('- PAIEMENTPRO_MERCHANT_ID:', merchantId ? `Loaded (${merchantId.substring(0, 4)}...)` : 'MISSING ❌');
    console.log('- PAYMENT_WEBHOOK_SECRET:', process.env.PAYMENT_WEBHOOK_SECRET ? 'Defined' : 'NOT DEFINED (Using fallback: SUPER_SECRET_TOKEN)');
    console.log('- NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_APP_URL : 'NOT DEFINED (Using sandbox fallback)');

    if (!merchantId) {
      const configErr = 'PAIEMENTPRO_MERCHANT_ID is completely blank. Route cannot generate secure token links.';
      console.error('❌ [PAY_ROUTE_CONFIG_ERROR]:', configErr);
      return res.status(500).json({
        error: "Le serveur n'est pas lié à un identifiant de marchand Paiement Pro valide.",
        diagnostics: "Assurez-vous d'avoir déclaré PAIEMENTPRO_MERCHANT_ID ou VITE_PAIEMENTPRO_MERCHANT_ID dans vos secrets / variables d'environnement."
      });
    }

    // Generate unique reference
    const referenceNumber = `IVS-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const localWebhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'SUPER_SECRET_TOKEN';
    
    // Dynamically retrieve base app URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ivoiresource.ci';
    const notificationURL = `${baseUrl}/api/webhook?token=${localWebhookSecret}`;
    const returnURL = `${baseUrl}/checkout-confirmation?reference=${referenceNumber}`;

    // Compile exact request payload according to Paiement Pro specifications (checking casing variations)
    const paymentPayload = {
      merchantId: merchantId,
      amount: Math.round(Number(amount)),
      description: `Premium Profile Activation for User ${userId || 'guest-session'}`,
      channel: channel || 'WAVECI', // e.g., WAVECI, OMCI, MTNCI, MOOVCI, CARD
      countryCurrencyCode: '952',   // FCFA
      referenceNumber: referenceNumber,
      customerEmail: email || 'client@ivoiresource.ci',
      customerFirstName: firstName || 'Abonné',
      customerFirstname: firstName || 'Abonné', // Casing compatibility
      customerLastName: lastName || 'Acheteur',
      customerLastname: lastName || 'Acheteur',   // Casing compatibility
      customerPhoneNumber: phoneNumber ? phoneNumber.trim().replace(/\s+/g, '') : '0700000000',
      notificationURL: notificationURL,
      returnURL: returnURL,
      returnContext: JSON.stringify({ userId, reference: referenceNumber })
    };

    console.log('[PAY_ROUTE_API_CALL] Preparing POST request call to Paiement Pro webservice:');
    console.log('Target URL: https://www.paiementpro.net/webservice/onlinepayment/js/initialize/initialize.php');
    console.log('Headers Sent: { Accept: "application/json", Content-Type: "application/json" }');
    console.log('Body Sent:', JSON.stringify(paymentPayload, null, 2));

    const startTime = Date.now();
    let apiResponse;
    try {
      apiResponse = await fetch("https://www.paiementpro.net/webservice/onlinepayment/js/initialize/initialize.php", {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentPayload)
      });
    } catch (networkError: any) {
      const callDuration = Date.now() - startTime;
      console.error(`❌ [PAY_ROUTE_NETWORK_ERROR] Network layer crashed after ${callDuration}ms:`);
      console.error('- Message:', networkError.message);
      console.error('- Error Code:', networkError.code);
      console.error('- Stack Trace:', networkError.stack);
      return res.status(502).json({
        error: "Impossible d'établir une connexion réseau avec l'API officielle de Paiement Pro.",
        network_diagnostics: {
          message: networkError.message,
          code: networkError.code,
          duration_ms: callDuration
        }
      });
    }

    const duration = Date.now() - startTime;
    console.log(`[PAY_ROUTE_API_RESPONSE] HTTP Response received in ${duration}ms:`);
    console.log(`- Status Code: ${apiResponse.status} (${apiResponse.statusText})`);
    console.log('- Headers Received:', JSON.stringify(Array.from(apiResponse.headers.entries()), null, 2));

    // Safely retrieve the response body as plain text first (to avoid crashes from HTML/PHP error stacks)
    const responseText = await apiResponse.text();
    console.log('[PAY_ROUTE_API_RESPONSE] Raw Body Received:', responseText);

    if (!apiResponse.ok) {
      console.error(`❌ [PAY_ROUTE_RESPONSE_NOT_OK] Server rejected the request: HTTP ${apiResponse.status}`);
      return res.status(apiResponse.status).json({
        error: `La passerelle de paiement a retourné une erreur HTTP ${apiResponse.status}`,
        details: responseText
      });
    }

    // Try parsing JSON safely
    let apiData: any;
    try {
      apiData = JSON.parse(responseText);
    } catch (jsonParseErr: any) {
      console.error('❌ [PAY_ROUTE_JSON_PARSE_ERROR] Failed to parse return text as JSON:');
      console.error('- Error message:', jsonParseErr.message);
      console.error('- Raw text dump:', responseText);
      return res.status(502).json({
        error: "Erreur de format renvoyée par le serveur Paiement Pro.",
        diagnostics: "Le serveur a répondu avec du texte brut ou du HTML au lieu d'un objet JSON.",
        rawResponse: responseText
      });
    }

    console.log('[PAY_ROUTE_PARSED_JSON]:', JSON.stringify(apiData, null, 2));

    if (!apiData.success || !apiData.url) {
      console.warn('⚠️ [PAY_ROUTE_GATEWAY_REJECTED]: Paiement Pro declined order creation:', apiData.message);
      return res.status(400).json({
        success: false,
        error: apiData.message || "Paiement Pro a refusé d'initier la transaction.",
        gatewayResponse: apiData
      });
    }

    console.log('✅ [PAY_ROUTE_SUCCESS]: Generated Checkout URL:', apiData.url);

    return res.json({
      success: true,
      paymentUrl: apiData.url,
      referenceNumber: referenceNumber
    });

  } catch (outerErr: any) {
    console.error('❌ [PAY_ROUTE_UNCAUGHT_FATAL_ERROR] Unhandled crash in backend route handler:');
    console.error('- Error Message:', outerErr.message);
    console.error('- Stack Trace:', outerErr.stack);
    return res.status(500).json({
      success: false,
      error: "Une erreur critique d'exécution est survenue sur le serveur.",
      details: outerErr.message
    });
  }
});

// Real Paiement Pro Webhook Listener route with Security auditing logs
app.post('/api/webhook', async (req, res) => {
  const logSeparator = '='.repeat(60);
  console.log(logSeparator);
  console.log('[WEBHOOK_ROUTE_TRIGGERED] Received Instant Payment Notification (IPN)');
  console.log('[WEBHOOK_QUERY_PARAMS]:', JSON.stringify(req.query, null, 2));
  console.log('[WEBHOOK_HEADERS]:', JSON.stringify(req.headers, null, 2));
  console.log('[WEBHOOK_RAW_BODY]:', JSON.stringify(req.body, null, 2));
  console.log(logSeparator);

  try {
    // 1. Audit Security Token Query Param
    const token = req.query.token;
    const localWebhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || 'SUPER_SECRET_TOKEN';

    if (!token || token !== localWebhookSecret) {
      console.warn('❌ [WEBHOOK_UNAUTHORIZED_ALERT]: Verification token mismatched or absent!');
      console.warn(`- Token received: "${token || 'N/A'}"`);
      console.warn(`- Expected token length: ${localWebhookSecret.length} chars`);
      return res.status(401).json({ error: "Unauthorized security token. Access denied." });
    }

    const payload = req.body;
    const reference = payload.reference || payload.referenceNumber || payload.ref;
    const status = payload.status || payload.payment_status;
    const amount = payload.amount;

    console.log('[WEBHOOK_DATA_EXTRACTED]:', { reference, status, amount });

    if (!reference) {
      console.error('❌ [WEBHOOK_BAD_PAYLOAD]: No unique reference is attached to this request!');
      return res.status(400).json({ error: "Mandatory transaction reference is missing from hook body." });
    }

    if (status === 'SUCCESS' || status === 'APPROVED') {
      console.log(`🎉 [WEBHOOK_SUCCESS] Transaction ${reference} was verified as PAID!`);
      // Broadcast payment success instantly over WebSockets to client frames
      broadcastAction('premium_payment_success', {
        referenceNumber: reference,
        amount: amount,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`⚠️ [WEBHOOK_STATUS_UPDATE] Transaction ${reference} is currently marked as failed or cancelled (Status: ${status})`);
      broadcastAction('premium_payment_failed', {
        referenceNumber: reference,
        status: status,
        timestamp: new Date().toISOString()
      });
    }

    // Acknowledge payload with 200 OK so Paiement Pro stops retrying
    return res.json({ success: true, message: "Webhook processed and registered successfully" });

  } catch (webhookErr: any) {
    console.error('❌ [WEBHOOK_CRITICAL_ERROR]: Failed to process standard Webhook payload:');
    console.error('- Message:', webhookErr.message);
    console.error('- Stack:', webhookErr.stack);
    return res.status(500).json({ error: "Failed to parse or process notification payload." });
  }
});

// "Payment" Simulation
app.post('/api/payments/checkout-premium', paymentLimiter, async (req, res) => {
  const parsed = CheckoutPremiumSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.format() });
  }

  const { jobId, employerId } = parsed.data;
  console.log(`[SECURE LOG] Simulating premium payment: Job ${sanitizeText(jobId || 'new', 128)} by User ${sanitizeText(employerId, 128)}`);
  
  broadcastAction('premium_payment_success', { jobId, employerId });
  res.json({ success: true, message: 'Payment simulated successfully' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

start();
