import { Router } from 'express';
import { HttpError } from '@/middleware/errorHandler';
import { asyncHandler } from '@/utils/asyncHandler';
import { JobStore } from '@/services/jobStore';

export function createJobsRouter(store: JobStore): Router {
  const router = Router();

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const job = await store.get(req.params.id);
      if (!job) throw new HttpError(404, 'JOB_NOT_FOUND', `No job with id ${req.params.id}`);
      res.json(job);
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const status = req.query.status as 'queued' | 'running' | 'complete' | 'error' | undefined;
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
      const jobs = await store.list({ status, limit });
      res.json({ data: jobs, count: jobs.length });
    }),
  );

  return router;
}
