import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const incoming = request.header('x-request-id');
    const requestId =
      incoming && /^[A-Za-z0-9._-]{1,100}$/.test(incoming)
        ? incoming
        : randomUUID();
    const started = performance.now();
    let errorStatus: number | undefined;
    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          errorStatus =
            error instanceof HttpException ? error.getStatus() : 500;
        },
      }),
      finalize(() => {
        this.logger.log(
          JSON.stringify({
            requestId,
            method: request.method,
            route: request.originalUrl.split('?')[0],
            status: errorStatus ?? response.statusCode,
            durationMs: Math.round((performance.now() - started) * 100) / 100,
          }),
        );
      }),
    );
  }
}
