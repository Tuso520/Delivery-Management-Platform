import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Prisma interactive transaction defaults', () => {
  it('keeps atomic review, audit and outbox writes within a bounded production-safe window', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/database/prisma.service.ts'), 'utf8');

    expect(source).toContain('transactionOptions: {');
    expect(source).toContain('maxWait: 10_000');
    expect(source).toContain('timeout: 30_000');
  });
});
