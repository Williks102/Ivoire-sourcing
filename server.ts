import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';
import { z } from 'zod';

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
  // Allow google APIs, unsplash images and local resources
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com https://via.placeholder.com https://*.googleusercontent.com; connect-src 'self' https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://*.googleapis.com; frame-src 'self' https://*.firebaseapp.com;");
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

// Input Schemas for Validation (Commandment #3: Tu valideras chaque donnée entrante)
const CheckJobSchema = z.object({
  title: z.string().min(3).max(150),
  description: z.string().min(10).max(5000),
});

const CheckoutPremiumSchema = z.object({
  employerId: z.string().min(1).max(128),
  jobId: z.string().max(128).optional(),
});

// Admin Moderation API
app.post('/api/moderation/check-job', async (req, res) => {
  // Validate input
  const parsed = CheckJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.format() });
  }

  const { title, description } = parsed.data;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Moderation d'annonce d'emploi pour la Côte d'Ivoire. 
      Titre: ${title.replace(/[\n\r]/g, ' ')}
      Description: ${description.replace(/[`${}]/g, '')}
      
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
    res.json(result);
  } catch (error) {
    console.error('Moderation Error:', error);
    // Secure Fallback: Log internally, do not expose stack trace
    res.status(500).json({ approved: true, reason: 'Moderation skip due to error' });
  }
});

// "Payment" Simulation
app.post('/api/payments/checkout-premium', async (req, res) => {
  const parsed = CheckoutPremiumSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.format() });
  }

  const { jobId, employerId } = parsed.data;
  console.log(`Simulating premium payment for job ${jobId || 'new'} by ${employerId}`);
  
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

start();
