import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { createApiRouter } from './src/server/adminRoutes';
import { ensureInitialOwnerFromEnv, getDb } from './src/server/db';
import { DECOY_ADMIN_PATHS, normalizeAdminPath } from './src/server/securityPolicy';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  // Initialize SQLite schema + seed Owner only when ADMIN_INITIAL_PASSWORD env is provided
  getDb();
  await ensureInitialOwnerFromEnv();

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers (preserve iframe compatibility by not setting X-Frame-Options)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  // Mount API routes
  app.use('/api', createApiRouter());

  // Enforce noindex headers on secret admin path & decoy paths
  const secretAdminPath = normalizeAdminPath(process.env.ADMIN_PATH);
  app.use((req, res, next) => {
    const cleanPath = req.path.replace(/\/+$/, '') || '/';
    if (cleanPath === secretAdminPath || DECOY_ADMIN_PATHS.has(cleanPath.toLowerCase())) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
    next();
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        const cleanPath = req.path.replace(/\/+$/, '') || '/';
        if (cleanPath === secretAdminPath) {
          template = template.replace(
            '</head>',
            '    <meta name="robots" content="noindex, nofollow, noarchive" />\n  </head>'
          );
        }
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));

    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexPath = path.resolve(distDir, 'index.html');
      if (!fs.existsSync(indexPath)) {
        res.status(500).send('Build output not found. Run npm run build first.');
        return;
      }
      let html = fs.readFileSync(indexPath, 'utf-8');
      const cleanPath = req.path.replace(/\/+$/, '') || '/';
      if (cleanPath === secretAdminPath) {
        html = html.replace(
          '</head>',
          '    <meta name="robots" content="noindex, nofollow, noarchive" />\n  </head>'
        );
      }
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ALSTORE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ALSTORE server:', err instanceof Error ? err.message : err);
  process.exit(1);
});
