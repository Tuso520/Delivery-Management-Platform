import {
  getCurrentTraceId,
  resolveRequestTraceId,
  runWithTraceId,
  type TraceableRequest,
} from '../request-trace.util';

describe('request trace context', () => {
  it('rejects unsafe inbound request ids', () => {
    const request = {
      get: jest.fn((name: string) =>
        name === 'x-request-id' ? 'trace\r\ninjected-header' : undefined,
      ),
    } as unknown as TraceableRequest;

    const traceId = resolveRequestTraceId(request);

    expect(traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(traceId).not.toContain('injected-header');
  });

  it('isolates trace ids between concurrent async chains', async () => {
    const readTrace = (traceId: string) =>
      runWithTraceId(traceId, async () => {
        await Promise.resolve();
        return getCurrentTraceId();
      });

    await expect(
      Promise.all([readTrace('trace-chain-a'), readTrace('trace-chain-b')]),
    ).resolves.toEqual(['trace-chain-a', 'trace-chain-b']);
  });
});
