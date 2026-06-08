import pino from 'pino';
import { config } from '@/config/config';

/**
 * Logger estruturado (JSON em prod, pretty em dev).
 * Cada log tem: timestamp, level, msg, requestId (via middleware), ...
 */
export const logger = pino({
  level: config.logLevel,
  ...(config.nodeEnv === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        },
      }
    : {}),
  base: { service: 'openclaw-http-proxy' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["cf-access-client-secret"]',
      'request.headers.authorization',
      'request.headers.cfAccessClientSecret',
      '*.password',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
});
