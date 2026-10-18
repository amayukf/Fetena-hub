import type { Plugin } from 'vite';
import type { Connect } from 'vite';
import { handleApiRequest } from './apiHandler';

/**
 * Mounts the ExamVault API inside Vite's dev and preview servers.
 *
 * Production does not use this — `server/index.ts` serves the API and the built
 * SPA from one process.
 */
export function examVaultApiPlugin(): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res, next) => {
    const urlPath = (req.url || '/').split('?')[0];

    // `/health` is handled here too, so the documented health check
    // (`GET /health`) reports database connectivity in dev rather than falling
    // through to the SPA fallback and returning index.html with a 200.
    if (!urlPath.startsWith('/api') && urlPath !== '/health') {
      return next();
    }

    try {
      await handleApiRequest(req, res);
    } catch (err) {
      console.error('[examvault-api] Unhandled API error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  };

  return {
    name: 'examvault-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
