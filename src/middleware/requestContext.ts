import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

/**
 * Atribui um requestId único a cada request (lê `X-Request-Id` do cliente
 * ou gera um novo). Propaga no response header e nos logs.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
