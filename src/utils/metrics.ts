import client from 'prom-client';

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

/**
 * Métricas expostas em /metrics pra Prometheus scrape.
 *
 * - `http_requests_total{method,route,status}`: contador de requests
 * - `http_request_duration_seconds{method,route,status}`: histograma de latência
 * - `jobs_submitted_total{mode}`: jobs submetidos (sync/async)
 * - `jobs_completed_total{mode,status}`: jobs terminados (complete/error)
 * - `jobs_in_flight{mode}`: jobs rodando agora
 * - `job_duration_seconds{mode,status}`: histograma de tempo de execução
 * - `webhook_delivery_total{result}`: success/failure
 * - `openclaw_upstream_duration_seconds{path,status}`: latência pro OpenClaw
 */
export const metrics = {
  registry,
  httpRequests: new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  }),
  httpDuration: new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
    registers: [registry],
  }),
  jobsSubmitted: new client.Counter({
    name: 'jobs_submitted_total',
    help: 'Total jobs submitted',
    labelNames: ['mode'],
    registers: [registry],
  }),
  jobsCompleted: new client.Counter({
    name: 'jobs_completed_total',
    help: 'Total jobs completed',
    labelNames: ['mode', 'status'],
    registers: [registry],
  }),
  jobsInFlight: new client.Gauge({
    name: 'jobs_in_flight',
    help: 'Jobs currently running',
    labelNames: ['mode'],
    registers: [registry],
  }),
  jobDuration: new client.Histogram({
    name: 'job_duration_seconds',
    help: 'Job execution duration in seconds',
    labelNames: ['mode', 'status'],
    buckets: [1, 5, 10, 30, 60, 120, 300, 600],
    registers: [registry],
  }),
  webhookDelivery: new client.Counter({
    name: 'webhook_delivery_total',
    help: 'Webhook delivery attempts',
    labelNames: ['result'],
    registers: [registry],
  }),
  upstreamDuration: new client.Histogram({
    name: 'openclaw_upstream_duration_seconds',
    help: 'OpenClaw upstream call duration in seconds',
    labelNames: ['path', 'status'],
    buckets: [0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
    registers: [registry],
  }),
};
