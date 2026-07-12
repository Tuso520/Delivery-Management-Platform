import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';

import { RAW_RESPONSE_KEY } from '../../decorators/raw-response.decorator';
import { TransformInterceptor } from '../transform.interceptor';

describe('TransformInterceptor', () => {
  it('wraps successful responses with the request trace id', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const interceptor = new TransformInterceptor(reflector);
    const setHeader = jest.fn();
    const request = {
      get: jest.fn((name: string) => (name === 'x-request-id' ? 'request-trace-123' : undefined)),
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => request,
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    const next = {
      handle: jest.fn().mockReturnValue(of({ value: BigInt(7) })),
    } as CallHandler;

    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      code: 0,
      message: 'success',
      data: { value: '7' },
      timestamp: expect.any(String),
      traceId: 'request-trace-123',
    });
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request-trace-123');
  });

  it('does not wrap raw file responses', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const interceptor = new TransformInterceptor(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    const streamResponse = { stream: true };
    const next = {
      handle: jest.fn().mockReturnValue(of(streamResponse)),
    } as CallHandler;

    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toBe(
      streamResponse,
    );
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(RAW_RESPONSE_KEY, expect.any(Array));
  });
});
