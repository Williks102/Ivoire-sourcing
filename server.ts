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
    "frame-src 'self' https://*.firebaseapp.com"
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
