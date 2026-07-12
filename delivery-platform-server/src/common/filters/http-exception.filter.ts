import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  REQUEST_TRACE_HEADER,
  resolveRequestTraceId,
  type TraceableRequest,
} from '../utils/request-trace.util';

interface ExceptionResponse {
  code: number;
  message: string;
  data: null;
  timestamp: string;
  traceId: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<TraceableRequest>();
    const traceId = resolveRequestTraceId(request);
    response.setHeader(REQUEST_TRACE_HEADER, traceId);

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        const responseMessage = resp.message;

        if (Array.isArray(responseMessage)) {
          message = String(responseMessage[0] || '参数校验失败');
        } else if (typeof responseMessage === 'string') {
          message = responseMessage;
        } else {
          message = exception.message;
        }
      }
    } else {
      const errorType = exception instanceof Error ? exception.name : typeof exception;
      this.logger.error(`Unhandled request exception traceId=${traceId} errorType=${errorType}`);
    }

    const errorResponse: ExceptionResponse = {
      code: statusCode,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      traceId,
    };

    response.status(statusCode).json(errorResponse);
  }
}
