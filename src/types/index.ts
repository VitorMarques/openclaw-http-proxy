/**
 * Tipos compartilhados pelo proxy.
 *
 * Design:
 *  - Job é o "contrato" entre quem submete e quem processa.
 *  - OpenClawRequest é o body que vai pra OpenClaw (pass-through).
 *  - OpenClawResponse é o body que volta do OpenClaw (pass-through).
 */

export type ExecutionMode = 'sync' | 'async';

export type JobStatus = 'queued' | 'running' | 'complete' | 'error';

export interface JobRequestHeaders {
  authorization?: string;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
  openclawAgentId?: string;
  openclawModel?: string;
  openclawSessionKey?: string;
  openclawMessageChannel?: string;
  openclawScopes?: string;
}

export interface Job {
  readonly id: string;
  readonly mode: ExecutionMode;
  status: JobStatus;
  readonly createdAt: string;
  startedAt?: string;
  completedAt?: string;
  readonly request: {
    body: unknown;
    headers: JobRequestHeaders;
    webhookUrl?: string;
    webhookHeaders?: Record<string, string>;
  };
  result?: {
    status: number;
    data: unknown;
  };
  error?: {
    code: string;
    message: string;
  };
  attempts: number;
  lastError?: string;
  durationMs?: number;
}

export interface JobSubmissionResponse {
  jobId: string;
  status: JobStatus;
  mode: ExecutionMode;
  createdAt: string;
  links: {
    self: string;
    webhook?: string;
  };
}

export interface OpenClawError {
  code: string;
  message: string;
  httpStatus?: number;
}

export interface WebhookPayload {
  jobId: string;
  status: JobStatus;
  mode: ExecutionMode;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  result?: {
    status: number;
    data: unknown;
  };
  error?: {
    code: string;
    message: string;
  };
}
