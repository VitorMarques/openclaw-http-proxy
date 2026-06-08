import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { metrics } from '@/utils/metrics';
import { JobRequestHeaders } from '@/types';

export interface OpenClawCallOptions {
  path: '/v1/chat/completions' | '/v1/responses' | '/v1/models';
  body?: unknown;
  headers: JobRequestHeaders;
}

/**
 * Cliente HTTP pro OpenClaw gateway.
 *
 * Encapsula:
 *  - auth: reenvia Authorization, CF-Access, x-openclaw-* headers
 *  - timeout: configurável, suficiente pra skills longas (default 10min)
 *  - observability: mede latência upstream, loga erros
 */
export class OpenClawClient {
  private readonly http: AxiosInstance;

  constructor(baseURL: string = config.openclawUrl, timeoutMs: number = config.openclawTimeoutMs) {
    this.http = axios.create({ baseURL, timeout: timeoutMs });
  }

  async call<T = unknown>(opts: OpenClawCallOptions): Promise<{ status: number; data: T }> {
    const start = process.hrtime.bigint();
    const path = opts.path;
    const upstreamStatus = { status: 'error' };

    try {
      const axiosConfig: AxiosRequestConfig = {
        method: 'POST',
        url: path,
        data: opts.body,
        headers: this.buildHeaders(opts.headers),
        validateStatus: () => true, // não lançar; tratamos status manualmente
      };
      const resp = await this.http.request<unknown>(axiosConfig);
      upstreamStatus.status = String(resp.status);
      if (resp.status >= 400) {
        logger.warn(
          { path, status: resp.status, requestId: (opts.headers as { requestId?: string })?.requestId ?? undefined },
          'openclaw returned non-2xx',
        );
      }
      return { status: resp.status, data: resp.data as T };
    } catch (err) {
      logger.error(
        { path, err: (err as Error).message },
        'openclaw client error',
      );
      throw err;
    } finally {
      metrics.upstreamDuration.observe({ path, status: upstreamStatus.status }, Number(process.hrtime.bigint() - start) / 1e9);
    }
  }

  private buildHeaders(h: JobRequestHeaders): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (h.authorization) headers['Authorization'] = h.authorization;
    if (h.cfAccessClientId) headers['CF-Access-Client-Id'] = h.cfAccessClientId;
    if (h.cfAccessClientSecret) headers['CF-Access-Client-Secret'] = h.cfAccessClientSecret;
    if (h.openclawAgentId) headers['x-openclaw-agent-id'] = h.openclawAgentId;
    if (h.openclawModel) headers['x-openclaw-model'] = h.openclawModel;
    if (h.openclawSessionKey) headers['x-openclaw-session-key'] = h.openclawSessionKey;
    if (h.openclawMessageChannel) headers['x-openclaw-message-channel'] = h.openclawMessageChannel;
    if (h.openclawScopes) headers['x-openclaw-scopes'] = h.openclawScopes;
    return headers;
  }
}
