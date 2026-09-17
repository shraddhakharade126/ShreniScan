import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import analyzeCraftHandler from './api/gemini/analyze-craft';
import healthHandler from './api/health';
import removeBackgroundHandler from './api/remove-background';

// Development-only server middleware: delegates requests to the standalone Vercel serverless function.
// Using apply: 'serve' ensures there is zero production dependency on configureServer().
function vercelDevServerPlugin(): Plugin {
  return {
    name: 'vercel-dev-server-plugin',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/gemini/analyze-craft') {
          return analyzeCraftHandler(req, res);
        }

        if (req.url === '/api/remove-background') {
          return removeBackgroundHandler(req, res);
        }

        if (req.url === '/api/health') {
          return healthHandler(req, res);
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      vercelDevServerPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'favicon.svg',
          'apple-touch-icon.png',
          'pwa-icon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'maskable-icon-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'KalaKart Artisans — Shreni Setu',
          short_name: 'KalaKart',
          description:
            'AI-powered marketplace and smart cataloging assistant with Shreni Scan, studio background removal, Gemini craft analysis, offline draft persistence, and installable PWA for Indian artisans.',
          theme_color: '#b45309',
          background_color: '#fffbeb',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
