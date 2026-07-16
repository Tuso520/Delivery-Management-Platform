import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';

import type { OperationLogService } from '../../../modules/operation-log/operation-log.service';
import { OperationAuditInterceptor } from '../operation-audit.interceptor';

describe('OperationAuditInterceptor', () => {
  it('links the audit record to the request trace and redacts request secrets', async () => {
    const log = jest.fn().mockResolvedValue({ id: 'log-1' });
    const interceptor = new OperationAuditInterceptor({
      log,
    } as unknown as OperationLogService);
    const request = {
      method: 'PATCH',
      path: '/api/v1/integrations/integration-1',
      params: { id: 'integration-1' },
      body: {
        name: '飞书',
        appSecret: 'must-not-be-stored',
        nested: { accessToken: 'must-not-be-stored' },
      },
      user: { sub: 'user-1' },
      ip: '127.0.0.1',
      get: jest.fn((name: string) => {
        if (name === 'x-request-id') return 'request-trace-audit';
        if (name === 'user-agent') return 'jest';
        return undefined;
      }),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next = {
      handle: jest.fn().mockReturnValue(of({ updated: true })),
    } as CallHandler;

    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      updated: true,
    });

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'request-trace-audit',
        afterData: {
          path: '/api/v1/integrations/integration-1',
          body: {
            name: '飞书',
            appSecret: '[REDACTED]',
            nested: { accessToken: '[REDACTED]' },
          },
        },
      }),
    );
  });

  it('leaves GET auditing to the domain service that can guarantee atomic persistence', async () => {
    const log = jest.fn().mockResolvedValue({ id: 'log-2' });
    const interceptor = new OperationAuditInterceptor({
      log,
    } as unknown as OperationLogService);
    const request = {
      method: 'GET',
      path: '/api/v1/project-payments',
      params: {},
      body: {},
      user: { sub: 'finance-1' },
      ip: '127.0.0.1',
      get: jest.fn((name: string) =>
        name === 'x-request-id' ? 'request-trace-payment-read' : 'jest',
      ),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next = { handle: jest.fn().mockReturnValue(of({ list: [] })) } as CallHandler;

    await firstValueFrom(interceptor.intercept(context, next));

    expect(log).not.toHaveBeenCalled();
  });

  it('records failed mutations and preserves the original business error', async () => {
    const log = jest.fn().mockResolvedValue({ id: 'log-failure' });
    const interceptor = new OperationAuditInterceptor({ log } as unknown as OperationLogService);
    const businessError = new Error('项目状态不允许删除');
    const request = {
      method: 'DELETE',
      path: '/api/v1/projects/project-1/permanent',
      params: { id: 'project-1' },
      body: { confirmation: 'project-1' },
      user: { sub: 'admin-1' },
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('jest'),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next = { handle: jest.fn().mockReturnValue(throwError(() => businessError)) } as CallHandler;

    await expect(firstValueFrom(interceptor.intercept(context, next))).rejects.toBe(businessError);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        targetId: 'project-1',
        errorReason: '项目状态不允许删除',
      }),
    );
  });

  it('does not let an audit storage outage change a successful response', async () => {
    const log = jest.fn().mockRejectedValue(new Error('audit database unavailable'));
    const interceptor = new OperationAuditInterceptor({ log } as unknown as OperationLogService);
    const request = {
      method: 'POST',
      path: '/api/v1/projects',
      params: {},
      body: { projectName: '项目A' },
      user: { sub: 'user-1' },
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('jest'),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next = { handle: jest.fn().mockReturnValue(of({ id: 'project-1' })) } as CallHandler;

    await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
      id: 'project-1',
    });
  });

  it('skips mutation auditing when authentication has not established an actor', async () => {
    const log = jest.fn();
    const interceptor = new OperationAuditInterceptor({ log } as unknown as OperationLogService);
    const request = { method: 'POST', path: '/api/v1/auth/login', params: {}, body: {}, get: jest.fn() };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const next = { handle: jest.fn().mockReturnValue(of({ accessToken: 'token' })) } as CallHandler;

    await firstValueFrom(interceptor.intercept(context, next));
    expect(log).not.toHaveBeenCalled();
  });
});
