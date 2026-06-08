import { ExecutionMode, Job, JobRequestHeaders, JobSubmissionResponse } from '@/types';
import { config } from '@/config/config';
import { generateJobId } from '@/utils/jobId';

/**
 * Constantes canônicas dos headers HTTP normalizados (lowercase, conforme
 * RFC 7230 §3.2 + Node `http`).
 *
 * Single source of truth — usar sempre essas constantes em vez de strings
 * literais espalhadas no código.
 */
export const HEADER_NAMES = {
  authorization: 'authorization',
  cfAccessClientId: 'cf-access-client-id',
  cfAccessClientSecret: 'cf-access-client-secret',
  openclawAgentId: 'x-openclaw-agent-id',
  openclawModel: 'x-openclaw-model',
  openclawSessionKey: 'x-openclaw-session-key',
  openclawMessageChannel: 'x-openclaw-message-channel',
  openclawScopes: 'x-openclaw-scopes',
} as const;

export const PROXY_MODE_HEADER = 'x-proxy-mode';

/**
 * Minimal contract de "request-like" pra evitar acoplar com express.Request
 * (facilita testes e reuso).
 */
export type HeaderBag = { header: (k: string) => string | undefined };

/**
 * Extrai headers de auth/routing de um request Express.
 *
 * Retorna `undefined` pra valores vazios (em vez de string vazia), o que
 * facilita o `openclawClient` saber se deve repassar ou não.
 */
export function extractHeaders(req: HeaderBag): JobRequestHeaders {
  const get = (k: string): string | undefined => {
    const v = req.header(k);
    return v && v.length > 0 ? v : undefined;
  };
  return {
    authorization: get(HEADER_NAMES.authorization),
    cfAccessClientId: get(HEADER_NAMES.cfAccessClientId),
    cfAccessClientSecret: get(HEADER_NAMES.cfAccessClientSecret),
    openclawAgentId: get(HEADER_NAMES.openclawAgentId),
    openclawModel: get(HEADER_NAMES.openclawModel),
    openclawSessionKey: get(HEADER_NAMES.openclawSessionKey),
    openclawMessageChannel: get(HEADER_NAMES.openclawMessageChannel),
    openclawScopes: get(HEADER_NAMES.openclawScopes),
  };
}

/**
 * Infere o modo de execução a partir do header `X-Proxy-Mode`.
 * Case-insensitive. Default = `config.proxyDefaultMode`.
 */
export function inferMode(req: HeaderBag): ExecutionMode {
  const header = req.header(PROXY_MODE_HEADER)?.toLowerCase();
  if (header === 'sync' || header === 'async') return header;
  return config.proxyDefaultMode;
}

export interface BuildJobOptions {
  mode: 'async';
  openclawPath?: string; // se fornecido, injeta __openclaw_path no body
  body: unknown;
  headers: JobRequestHeaders;
  publicBaseUrl: string;
}

/**
 * Constrói o `Job` + a `JobSubmissionResponse` (202) a partir de um request.
 *
 * Extrai `webhook_url` e `webhook_headers` do body pra `job.request`, deixando
 * o body "limpo" pra ser repassado pro OpenClaw. (Nota: a remoção física das
 * chaves no body original fica por conta do caller, pois o body pode ser
 * `readonly` em alguns paths.)
 */
export function buildJob(opts: BuildJobOptions): { job: Job; response: JobSubmissionResponse } {
  const jobId = generateJobId();
  const bodyObj = (opts.body ?? {}) as Record<string, unknown>;
  const bodyForOpenClaw = opts.openclawPath
    ? { ...bodyObj, __openclaw_path: opts.openclawPath }
    : opts.body;

  const job: Job = {
    id: jobId,
    mode: 'async',
    status: 'queued',
    createdAt: new Date().toISOString(),
    request: {
      body: bodyForOpenClaw,
      headers: opts.headers,
      webhookUrl: typeof bodyObj.webhook_url === 'string' ? bodyObj.webhook_url : undefined,
      webhookHeaders:
        typeof bodyObj.webhook_headers === 'object' && bodyObj.webhook_headers !== null
          ? (bodyObj.webhook_headers as Record<string, string>)
          : undefined,
    },
    attempts: 0,
  };

  const response: JobSubmissionResponse = {
    jobId,
    status: 'queued',
    mode: 'async',
    createdAt: job.createdAt,
    links: {
      self: `${opts.publicBaseUrl}/v1/jobs/${jobId}`,
      ...(job.request.webhookUrl ? { webhook: job.request.webhookUrl } : {}),
    },
  };

  return { job, response };
}

/**
 * Remove `webhook_url` e `webhook_headers` do body em mutating fashion.
 * Usado pelos routers pra limpar o body antes de passar pro OpenClaw.
 */
export function stripWebhookFieldsFromBody(body: unknown): void {
  if (body && typeof body === 'object') {
    delete (body as Record<string, unknown>).webhook_url;
    delete (body as Record<string, unknown>).webhook_headers;
  }
}
