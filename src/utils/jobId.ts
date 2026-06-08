import { randomBytes } from 'crypto';

/**
 * Gera um jobId único: `job_<22 chars base62>` (~128 bits de entropia).
 * Mesma forma do Stripe (`evt_...`) pra fácil reconhecimento.
 */
export function generateJobId(): string {
  return `job_${randomBytes(16).toString('base64url')}`;
}
