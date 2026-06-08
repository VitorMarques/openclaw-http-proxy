import { createApp } from './server';
import { config } from './config/config';
import { logger } from './utils/logger';

const { app, store } = createApp();

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, mode: config.proxyDefaultMode, openclaw: config.openclawUrl },
    'openclaw-http-proxy listening',
  );
});

// Cleanup periódico de jobs antigos
const cleanupTimer = setInterval(() => {
  void store
    .deleteOlderThan(config.jobResultTtlMs)
    .then((removed) => {
      if (removed > 0) logger.info({ removed }, 'cleaned up expired jobs');
    })
    .catch((err) => logger.error({ err: (err as Error).message }, 'job cleanup failed'));
}, config.jobCleanupIntervalMs);
cleanupTimer.unref();

// Graceful shutdown
function shutdown(signal: string): void {
  logger.info({ signal }, 'shutdown initiated');
  server.close((err) => {
    if (err) logger.error({ err: err.message }, 'server close error');
    clearInterval(cleanupTimer);
    logger.info('shutdown complete');
    process.exit(err ? 1 : 0);
  });
  // Force exit after 30s
  setTimeout(() => process.exit(1), 30_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason: (reason as Error)?.message ?? String(reason) }, 'unhandledRejection');
});
