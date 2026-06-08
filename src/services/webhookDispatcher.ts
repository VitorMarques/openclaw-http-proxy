import axios, { AxiosInstance } from 'axios';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { metrics } from '@/utils/metrics';
import { WebhookPayload } from '@/types';

export interface WebhookDispatcherOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Despacha payloads de job completion/error pra um webhook URL.
 *
 * Comportamento:
 *  - POST application/json com WebhookPayload
 *  - Headers extras podem ser injetados por job (auth, signature, etc)
 *  - Retry exponencial: 1s, 2s, 4s (até maxRetries)
 *  - Idempotência: header `X-Idempotency-Key: <jobId>`
 *  - Considera sucesso apenas 2xx; 4xx/5xx => retry (até max)
 *  - Timeout por tentativa; falha total não derruba o job (já está complete)
 */
export class WebhookDispatcher {
  private readonly http: AxiosInstance;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(opts: WebhookDispatcherOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? config.webhookTimeoutMs;
    this.maxRetries = opts.maxRetries ?? config.webhookMaxRetries;
    this.http = axios.create({ timeout: this.timeoutMs });
  }

  async dispatch(url: string, payload: WebhookPayload, extraHeaders: Record<string, string> = {}): Promise<boolean> {
    const headers = {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': payload.jobId,
      'X-Proxy-Event': `job.${payload.status}`,
      ...extraHeaders,
    };

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const resp = await this.http.post(url, payload, { headers, validateStatus: () => true });
        if (resp.status >= 200 && resp.status < 300) {
          metrics.webhookDelivery.inc({ result: 'success' });
          logger.info({ jobId: payload.jobId, url, attempt, status: resp.status }, 'webhook delivered');
          return true;
        }
        lastError = new Error(`HTTP ${resp.status}`);
        logger.warn(
          { jobId: payload.jobId, url, attempt, status: resp.status },
          'webhook returned non-2xx, will retry',
        );
      } catch (err) {
        lastError = err as Error;
        logger.warn(
          { jobId: payload.jobId, url, attempt, err: lastError.message },
          'webhook attempt failed',
        );
      }
      if (attempt < this.maxRetries) {
        await sleep(2 ** attempt * 1000);
      }
    }

    metrics.webhookDelivery.inc({ result: 'failure' });
    logger.error(
      { jobId: payload.jobId, url, err: lastError?.message, maxRetries: this.maxRetries },
      'webhook delivery failed permanently',
    );
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
