import express, { Application } from 'express';
import pinoHttp from 'pino-http';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { requestContext } from '@/middleware/requestContext';
import { errorHandler } from '@/middleware/errorHandler';
import { metricsMiddleware } from '@/middleware/metricsMiddleware';
import { InMemoryJobStore } from '@/services/inMemoryJobStore';
import { OpenClawClient } from '@/services/openclawClient';
import { WebhookDispatcher } from '@/services/webhookDispatcher';
import { JobProcessor } from '@/services/jobProcessor';
import { createHealthRouter } from '@/routes/health';
import { createChatCompletionsRouter } from '@/routes/chatCompletions';
import { createResponsesRouter } from '@/routes/responses';
import { createJobsRouter } from '@/routes/jobs';
import { createMetricsRouter } from '@/routes/metrics';

export interface ServerDeps {
  store?: InMemoryJobStore;
  openclaw?: OpenClawClient;
  webhook?: WebhookDispatcher;
  publicBaseUrl?: string;
}

export function createApp(deps: ServerDeps = {}): { app: Application; store: InMemoryJobStore; processor: JobProcessor } {
  const store = deps.store ?? new InMemoryJobStore();
  const openclaw = deps.openclaw ?? new OpenClawClient();
  const webhook = deps.webhook ?? new WebhookDispatcher();
  const processor = new JobProcessor({ store, openclaw, webhook });
  const publicBaseUrl = deps.publicBaseUrl ?? `http://127.0.0.1:${config.port}`;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.json({ limit: '2mb' }));
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { requestId: string }).requestId,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url, id: req.id }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(metricsMiddleware);

  app.use(createHealthRouter(openclaw));
  app.use('/metrics', createMetricsRouter());
  app.use('/v1/chat/completions', createChatCompletionsRouter({ store, openclaw, processor, publicBaseUrl }));
  app.use('/v1/responses', createResponsesRouter({ store, openclaw, processor, publicBaseUrl }));
  app.use('/v1/jobs', createJobsRouter(store));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `route ${req.method} ${req.path} not found` } });
  });

  app.use(errorHandler);

  return { app, store, processor };
}
