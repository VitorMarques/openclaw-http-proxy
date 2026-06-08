import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    logger.warn(
      { requestId: req.requestId, status: err.status, code: err.code, msg: err.message },
      'http error',
    );
    res.status(err.status).json({
      error: { code: err.code, message: err.message, requestId: req.requestId },
    });
    return;
  }

  logger.error(
    { requestId: req.requestId, err: { name: err.name, message: err.message, stack: err.stack } },
    'unhandled error',
  );
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: req.requestId,
    },
  });
}
