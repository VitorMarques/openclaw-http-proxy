import { Router } from 'express';
import { HttpError } from '@/middleware/errorHandler';
import { asyncHandler } from '@/utils/asyncHandler';
import { publicJobView } from '@/utils/sanitize';
import { JobStore } from '@/services/jobStore';

export function createJobsRouter(store: JobStore): Router {
  const router = Router();

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const job = await store.get(req.params.id);
      if (!job) throw new HttpError(404, 'JOB_NOT_FOUND', `No job with id ${req.params.id}`);
      // IMPORTANTE: nunca retornar o Job cru — usar publicJobView pra evitar
      // expor authorization, CF-Access-Client-Secret, webhookHeaders, etc.
      res.json(publicJobView(job));
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const status = req.query.status as 'queued' | 'running' | 'complete' | 'error' | undefined;
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
      const jobs = await store.list({ status, limit });
      res.json({
        data: jobs.map(publicJobView),
        count: jobs.length,
      });
    }),
  );

  return router;
}
