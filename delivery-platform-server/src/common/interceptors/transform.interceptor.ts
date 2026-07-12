import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';
import {
  REQUEST_TRACE_HEADER,
  resolveRequestTraceId,
  type TraceableRequest,
} from '../utils/request-trace.util';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
  traceId: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | T> {
    const isRawResponse = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRawResponse) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<TraceableRequest>();
    const response = context.switchToHttp().getResponse<{
      setHeader(name: string, value: string): void;
    }>();
    const traceId = resolveRequestTraceId(request);
    response.setHeader(REQUEST_TRACE_HEADER, traceId);

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'success',
        data: this.serializeBigInt(data),
        timestamp: new Date().toISOString(),
        traceId,
      })),
    );
  }

  private serializeBigInt(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === 'bigint' ? item.toString() : item,
      ),
    ) as T;
  }
}
