import { Job, WebhookPayload } from '@/types';
import { logger } from '@/utils/logger';
import { metrics } from '@/utils/metrics';
import { config } from '@/config/config';
import { JobStore } from './jobStore';
import { OpenClawClient, OpenClawCallOptions } from './openclawClient';
import { WebhookDispatcher } from './webhookDispatcher';

export interface JobProcessorDeps {
  store: JobStore;
  openclaw: OpenClawClient;
  webhook: WebhookDispatcher;
}

/**
 * Processa um job async:
 *  1. Marca como 'running'
 *  2. Chama OpenClaw (POST /v1/chat/completions ou /v1/responses)
 *  3. Marca 'complete' ou 'error' (com retries exponenciais)
 *  4. Dispara webhook se configurado
 *  5. Atualiza métricas
 *
 * Não faz parse/validação do body — passa direto. Validação fica no router.
 */
export class JobProcessor {
  constructor(private readonly deps: JobProcessorDeps) {}

  async process(job: Job): Promise<void> {
    metrics.jobsInFlight.inc({ mode: job.mode });
    metrics.jobsSubmitted.inc({ mode: job.mode });
    const startedAt = new Date().toISOString();

    await this.deps.store.update(job.id, { status: 'running', startedAt, attempts: job.attempts + 1 });

    try {
      const path = this.inferPath(job);
      const result = await this.deps.openclaw.call<unknown>({
        path,
        body: job.request.body,
        headers: job.request.headers,
      });
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      await this.deps.store.update(job.id, {
        status: 'complete',
        completedAt,
        durationMs,
        result: { status: result.status, data: result.data },
      });

      metrics.jobsInFlight.dec({ mode: job.mode });
      metrics.jobsCompleted.inc({ mode: job.mode, status: 'complete' });
      metrics.jobDuration.observe({ mode: job.mode, status: 'complete' }, durationMs / 1000);
      logger.info({ jobId: job.id, status: result.status, durationMs }, 'job complete');

      await this.deliverWebhook(job.id);
    } catch (err) {
      await this.handleFailure(job, err as Error);
    }
  }

  private inferPath(job: Job): OpenClawCallOptions['path'] {
    const body = job.request.body as { __openclaw_path?: string } | null;
    if (body?.__openclaw_path === '/v1/responses') return '/v1/responses';
    return '/v1/chat/completions';
  }

  private async handleFailure(job: Job, err: Error): Promise<void> {
    const nextAttempts = (await this.deps.store.get(job.id))?.attempts ?? job.attempts;
    logger.warn({ jobId: job.id, err: err.message, attempts: nextAttempts }, 'job failed');

    if (nextAttempts < config.jobMaxAttempts) {
      await this.deps.store.update(job.id, {
        status: 'queued',
        lastError: err.message,
        attempts: nextAttempts,
      });
      const delay = config.jobRetryDelayMs * 2 ** (nextAttempts - 1);
      setTimeout(() => {
        this.process({ ...job, attempts: nextAttempts }).catch((e) =>
          logger.error({ jobId: job.id, err: (e as Error).message }, 'retry crashed'),
        );
      }, delay);
      return;
    }

    const completedAt = new Date().toISOString();
    await this.deps.store.update(job.id, {
      status: 'error',
      completedAt,
      error: { code: 'UPSTREAM_ERROR', message: err.message },
    });
    metrics.jobsInFlight.dec({ mode: job.mode });
    metrics.jobsCompleted.inc({ mode: job.mode, status: 'error' });
    await this.deliverWebhook(job.id);
  }

  private async deliverWebhook(jobId: string): Promise<void> {
    const job = await this.deps.store.get(jobId);
    if (!job || !job.request.webhookUrl) return;
    const whPayload: WebhookPayload = {
      jobId: job.id,
      status: job.status,
      mode: job.mode,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs: job.durationMs,
      result: job.result,
      error: job.error,
    };
    await this.deps.webhook.dispatch(job.request.webhookUrl, whPayload, job.request.webhookHeaders);
  }
}
