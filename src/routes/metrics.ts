import { Request, Response, Router } from 'express';
import { metrics } from '@/utils/metrics';

export function createMetricsRouter(): Router {
  const router = Router();
  router.get('/', async (_req: Request, res: Response) => {
    res.set('Content-Type', metrics.registry.contentType);
    res.end(await metrics.registry.metrics());
  });
  return router;
}
