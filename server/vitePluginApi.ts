import type { Plugin } from 'vite';
import { handleApiRequest } from './apiHandler';

export function examVaultApiPlugin(): Plugin {
  return {
    name: 'examvault-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api')) {
          return next();
        }
        await handleApiRequest(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api')) {
          return next();
        }
        await handleApiRequest(req, res);
      });
    },
  };
}
