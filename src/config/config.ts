import { z } from 'zod';
import { ExecutionMode } from '@/types';

const ConfigSchema = z.object({
  port: z.number().int().positive().default(18791),
  nodeEnv: z.enum(['development', 'production', 'test']).default('production'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  openclawUrl: z.string().url().default('http://127.0.0.1:18789'),
  openclawTimeoutMs: z.number().int().positive().default(600_000),
  proxyDefaultMode: z.enum(['sync', 'async']).default('sync'),
  jobMaxAttempts: z.number().int().positive().default(3),
  jobRetryDelayMs: z.number().int().nonnegative().default(2_000),
  jobResultTtlMs: z.number().int().positive().default(3_600_000),
  jobCleanupIntervalMs: z.number().int().positive().default(300_000),
  webhookTimeoutMs: z.number().int().positive().default(10_000),
  webhookMaxRetries: z.number().int().nonnegative().default(3),
  trustForwardedAuth: z.boolean().default(true),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse({
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    openclawUrl: process.env.OPENCLAW_URL,
    openclawTimeoutMs: process.env.OPENCLAW_TIMEOUT_MS
      ? Number(process.env.OPENCLAW_TIMEOUT_MS)
      : undefined,
    proxyDefaultMode: process.env.PROXY_DEFAULT_MODE as ExecutionMode | undefined,
    jobMaxAttempts: process.env.JOB_MAX_ATTEMPTS ? Number(process.env.JOB_MAX_ATTEMPTS) : undefined,
    jobRetryDelayMs: process.env.JOB_RETRY_DELAY_MS
      ? Number(process.env.JOB_RETRY_DELAY_MS)
      : undefined,
    jobResultTtlMs: process.env.JOB_RESULT_TTL_MS ? Number(process.env.JOB_RESULT_TTL_MS) : undefined,
    jobCleanupIntervalMs: process.env.JOB_CLEANUP_INTERVAL_MS
      ? Number(process.env.JOB_CLEANUP_INTERVAL_MS)
      : undefined,
    webhookTimeoutMs: process.env.WEBHOOK_TIMEOUT_MS
      ? Number(process.env.WEBHOOK_TIMEOUT_MS)
      : undefined,
    webhookMaxRetries: process.env.WEBHOOK_MAX_RETRIES
      ? Number(process.env.WEBHOOK_MAX_RETRIES)
      : undefined,
    trustForwardedAuth: process.env.TRUST_FORWARDED_AUTH
      ? process.env.TRUST_FORWARDED_AUTH === 'true'
      : undefined,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return parsed.data;
}

export const config: Config = loadConfig();
