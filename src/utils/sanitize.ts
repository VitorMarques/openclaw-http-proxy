import { Job, JobRequestHeaders } from '@/types';

/**
 * Headers que JAMAIS devem aparecer no response do `GET /v1/jobs/:id`,
 * mesmo redacted, porque saber o NOME do header pode ajudar atacante
 * a mapear a superfície de auth.
 */
const SENSITIVE_HEADER_KEYS: ReadonlySet<keyof JobRequestHeaders> = new Set([
  'authorization',
  'cfAccessClientId',
  'cfAccessClientSecret',
]);

export interface PublicJobHeadersView {
  /** Lista dos NOMES dos headers que foram enviados (sem valores). */
  sent: string[];
  /** Lista dos headers que foram OMITIDOS por serem sensíveis. */
  redacted: string[];
}

export interface PublicJobRequestView {
  body: unknown;
  webhookUrl?: string;
  /** O que vai pro `Idempotency-Key` etc. (não é secret, ok expor). */
  webhookConfigured: boolean;
  headers: PublicJobHeadersView;
}

export interface PublicJobView {
  id: string;
  mode: Job['mode'];
  status: Job['status'];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  attempts: number;
  lastError?: string;
  result?: { status: number; data: unknown };
  error?: { code: string; message: string };
  request: PublicJobRequestView;
}

/**
 * Sanitiza um `Job` pra retornar no `GET /v1/jobs/:id`.
 *
 * Garante:
 *  - `request.headers`: NUNCA retorna valores. Só lista nomes enviados vs omitidos.
 *  - `request.webhookHeaders`: omitido (potenciais secrets de auth do receiver).
 *  - `request.webhookUrl`: ok expor (cliente mandou, ele já sabe).
 *  - `request.body`: retornado (não tem auth dentro, é só o body OpenAI/Responses).
 *  - `result.data` e `error`: retornados (são do OpenClaw upstream).
 */
export function publicJobView(job: Job): PublicJobView {
  const sent: string[] = [];
  const redacted: string[] = [];
  for (const key of Object.keys(job.request.headers) as (keyof JobRequestHeaders)[]) {
    if (job.request.headers[key]) {
      if (SENSITIVE_HEADER_KEYS.has(key)) {
        redacted.push(key);
      } else {
        sent.push(key);
      }
    }
  }

  return {
    id: job.id,
    mode: job.mode,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    durationMs: job.durationMs,
    attempts: job.attempts,
    lastError: job.lastError,
    result: job.result,
    error: job.error,
    request: {
      body: job.request.body,
      webhookUrl: job.request.webhookUrl,
      webhookConfigured: !!job.request.webhookUrl,
      headers: { sent, redacted },
    },
  };
}
