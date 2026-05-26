import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

// A custom Vite plugin to prevent build crashes when firebase-applet-config.json is absent in Git/production-deployments
const firebaseConfigPlugin = {
  name: 'firebase-config-fallback',
  resolveId(id: string) {
    if (id.endsWith('firebase-applet-config.json')) {
      return '\0firebase-applet-config-json';
    }
    return null;
  },
  load(id: string) {
    if (id === '\0firebase-applet-config-json') {
      let config: Record<string, any> = {};
      try {
        const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
      } catch (err) {
        console.warn('[Vite Plugin] Failed reading local firebase config:', err);
      }
      return `export default ${JSON.stringify(config)};`;
    }
    return null;
  }
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), firebaseConfigPlugin],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
