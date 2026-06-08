import { Router } from 'express';
import { Job, ExecutionMode, JobRequestHeaders, JobSubmissionResponse } from '@/types';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { generateJobId } from '@/utils/jobId';
import { HttpError } from '@/middleware/errorHandler';
import { asyncHandler } from '@/utils/asyncHandler';
import { JobStore } from '@/services/jobStore';
import { OpenClawClient } from '@/services/openclawClient';
import { JobProcessor } from '@/services/jobProcessor';

function extractHeaders(req: { header: (k: string) => string | undefined }): JobRequestHeaders {
  const get = (k: string): string | undefined => {
    const v = req.header(k);
    return v && v.length > 0 ? v : undefined;
  };
  return {
    authorization: get('authorization'),
    cfAccessClientId: get('cf-access-client-id'),
    cfAccessClientSecret: get('cf-access-client-secret'),
    openclawAgentId: get('x-openclaw-agent-id'),
    openclawModel: get('x-openclaw-model'),
    openclawSessionKey: get('x-openclaw-session-key'),
    openclawMessageChannel: get('x-openclaw-message-channel'),
    openclawScopes: get('x-openclaw-scopes'),
  };
}

function inferMode(req: { header: (k: string) => string | undefined }): ExecutionMode {
  const header = req.header('x-proxy-mode')?.toLowerCase();
  if (header === 'sync' || header === 'async') return header;
  return config.proxyDefaultMode;
}

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
      const jobId = generateJobId();
      const job: Job = {
        id: jobId,
        mode: 'async',
        status: 'queued',
        createdAt: new Date().toISOString(),
        request: {
          body: { ...req.body, __openclaw_path: '/v1/responses' },
          headers,
          webhookUrl: req.body?.webhook_url,
          webhookHeaders: req.body?.webhook_headers,
        },
        attempts: 0,
      };
      if (req.body && typeof req.body === 'object') {
        delete (req.body as Record<string, unknown>).webhook_url;
        delete (req.body as Record<string, unknown>).webhook_headers;
      }
      await store.save(job);
      processor.process(job).catch((err) =>
        logger.error({ jobId, err: (err as Error).message }, 'async process crashed'),
      );

      const response: JobSubmissionResponse = {
        jobId,
        status: 'queued',
        mode: 'async',
        createdAt: job.createdAt,
        links: {
          self: `${publicBaseUrl}/v1/jobs/${jobId}`,
          ...(job.request.webhookUrl ? { webhook: job.request.webhookUrl } : {}),
        },
      };
      res.status(202).json(response);
    }),
  );

  return router;
}
