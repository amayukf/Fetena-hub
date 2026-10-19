import type { Plugin, Connect } from 'vite';

/**
 * Mounts the ExamVault API inside Vite's dev and preview servers.
 *
 * Production does not use this — `server/index.ts` serves the API and the built
 * SPA from one process.
 */
export function examVaultApiPlugin(): Plugin {
  const createMiddleware = (): Connect.NextHandleFunction => {
    return async (req, res, next) => {
      const urlPath = (req.url || '/').split('?')[0];

      // `/health` is handled here too, so the documented health check
      // (`GET /health`) reports database connectivity in dev rather than falling
      // through to the SPA fallback and returning index.html with a 200.
      if (!urlPath.startsWith('/api') && urlPath !== '/health') {
        return next();
      }

      try {
        const { handleApiRequest } = await import('./apiHandler');
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
  };

  return {
    name: 'examvault-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMiddleware());
    },
  };
}
