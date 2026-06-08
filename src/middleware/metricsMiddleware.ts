import { Request, Response, NextFunction } from 'express';
import { metrics } from '@/utils/metrics';

/**
 * Conta requests HTTP e mede latência. Usa `req.route.path` (pós-routing)
 * pra evitar cardinality alta de URL parametrizada.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route?.path || req.path || 'unknown';
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    metrics.httpRequests.inc(labels);
    metrics.httpDuration.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
  });
  next();
}
