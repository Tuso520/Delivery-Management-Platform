import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';

import { RAW_RESPONSE_KEY } from '../../decorators/raw-response.decorator';
import { TransformInterceptor } from '../transform.interceptor';

describe('TransformInterceptor', () => {
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

    await expect(
      firstValueFrom(interceptor.intercept(context, next)),
    ).resolves.toBe(streamResponse);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      RAW_RESPONSE_KEY,
      expect.any(Array),
    );
  });
});
