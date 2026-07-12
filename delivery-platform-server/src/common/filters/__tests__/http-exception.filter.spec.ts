import { BadRequestException, type ArgumentsHost, Logger } from '@nestjs/common';

import { HttpExceptionFilter } from '../http-exception.filter';

describe('HttpExceptionFilter', () => {
  function createHost(traceId = 'request-trace-456') {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const setHeader = jest.fn();
    const request = {
      get: jest.fn((name: string) => (name === 'x-request-id' ? traceId : undefined)),
    };
    const response = { status, setHeader };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    return { host, json, status, setHeader };
  }

  it('returns the same trace id for expected HTTP exceptions', () => {
    const { host, json, status, setHeader } = createHost();

    new HttpExceptionFilter().catch(new BadRequestException('参数不正确'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 400,
      message: '参数不正确',
      data: null,
      timestamp: expect.any(String),
      traceId: 'request-trace-456',
    });
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request-trace-456');
  });

  it('does not expose unexpected exception details or secrets', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, json, status } = createHost('request-trace-789');

    new HttpExceptionFilter().catch(new Error('token=must-not-be-exposed database failed'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: 500,
      message: '服务器内部错误',
      data: null,
      timestamp: expect.any(String),
      traceId: 'request-trace-789',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('must-not-be-exposed');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('must-not-be-exposed');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('traceId=request-trace-789'));
    errorSpy.mockRestore();
  });
});
