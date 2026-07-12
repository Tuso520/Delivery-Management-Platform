import { Prisma } from '@prisma/client';

import { withTransientPrismaReadRetry } from '../prisma-transient-read';

describe('withTransientPrismaReadRetry', () => {
  it('retries one idempotent read after Prisma reports a closed server connection', async () => {
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Server has closed the connection.', {
          code: 'P1017',
          clientVersion: '5.22.0',
        }),
      )
      .mockResolvedValueOnce('recovered');

    await expect(withTransientPrismaReadRetry(operation, 0)).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient Prisma failures', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    const operation = jest.fn<Promise<never>, []>().mockRejectedValue(error);

    await expect(withTransientPrismaReadRetry(operation, 0)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('never loops when the retried read also fails', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Server has closed the connection.', {
      code: 'P1017',
      clientVersion: '5.22.0',
    });
    const operation = jest.fn<Promise<never>, []>().mockRejectedValue(error);

    await expect(withTransientPrismaReadRetry(operation, 0)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
