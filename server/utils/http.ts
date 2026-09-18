import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function notFoundHandler(_request: Request, _response: Response, next: NextFunction) {
  next(new HttpError(404, 'Route not found'));
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const fallbackMessage = statusCode === 500 ? 'Internal server error' : 'Request failed';
  const message = error instanceof Error ? error.message : fallbackMessage;

  response.status(statusCode).json({
    error: env.nodeEnv === 'development' || statusCode < 500 ? message : fallbackMessage,
  });
}
