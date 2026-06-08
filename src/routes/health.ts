import { Router } from 'express';
import { config } from '@/config/config';
import { OpenClawClient } from '@/services/openclawClient';
import { asyncHandler } from '@/utils/asyncHandler';

export function createHealthRouter(openclaw: OpenClawClient): Router {
  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      res.json({ status: 'ok', uptimeSeconds: process.uptime() });
    }),
  );

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        await openclaw.call({ path: '/v1/models', headers: {} }).finally(() => clearTimeout(t));
        res.json({ status: 'ready', openclaw: 'reachable' });
      } catch (err) {
        res.status(503).json({
          status: 'not_ready',
          openclaw: 'unreachable',
          error: (err as Error).message,
          hint: `verifique OPENCLAW_URL=${config.openclawUrl}`,
        });
      }
    }),
  );

  return router;
}
