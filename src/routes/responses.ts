import { Router } from 'express';
import { HttpError } from '@/middleware/errorHandler';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { asyncHandler } from '@/utils/asyncHandler';
import { extractHeaders, inferMode, buildJob, stripWebhookFieldsFromBody } from '@/utils/request';
import { JobStore } from '@/services/jobStore';
import { OpenClawClient } from '@/services/openclawClient';
import { JobProcessor } from '@/services/jobProcessor';

export function createResponsesRouter(deps: {
  store: JobStore;
  openclaw: OpenClawClient;
  processor: JobProcessor;
  publicBaseUrl: string;
}): Router {
  const router = Router();
  const { store, openclaw, processor, publicBaseUrl } = deps;

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const mode = inferMode(req);
      const headers = extractHeaders(req);

      if (!headers.authorization && !config.trustForwardedAuth) {
        throw new HttpError(401, 'MISSING_AUTH', 'Authorization header required');
      }

      if (mode === 'sync') {
        const result = await openclaw.call({ path: '/v1/responses', body: req.body, headers });
        res.status(result.status).json(result.data);
        return;
      }

      // async
      const { job, response } = buildJob({
        mode: 'async',
        openclawPath: '/v1/responses',
        body: req.body,
        headers,
        publicBaseUrl,
      });
      stripWebhookFieldsFromBody(req.body);
      await store.save(job);
      processor.process(job).catch((err) =>
        logger.error({ jobId: job.id, err: (err as Error).message }, 'async process crashed'),
      );

      res.status(202).json(response);
    }),
  );

  return router;
}
