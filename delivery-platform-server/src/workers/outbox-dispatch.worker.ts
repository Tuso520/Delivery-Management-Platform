import { NestFactory } from '@nestjs/core';

import { OutboxDispatcherService } from '../modules/outbox/outbox-dispatcher.service';

import { OutboxWorkerModule } from './outbox-worker.module';

const idleDelayMs = 2_000;
const errorDelayMs = 5_000;
let stopping = false;
const shutdownController = new AbortController();

const stop = (): void => {
  stopping = true;
  shutdownController.abort();
};

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(OutboxWorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  const dispatcher = app.get(OutboxDispatcherService);

  try {
    while (!stopping) {
      try {
        const processed = await dispatcher.processBatch(20, () => stopping);
        if (processed === 0) await delay(idleDelayMs, shutdownController.signal);
      } catch {
        process.stderr.write('[outbox-dispatch-worker] batch failed\n');
        await delay(errorDelayMs, shutdownController.signal);
      }
    }
  } finally {
    await app.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done, { once: true });

    function done(): void {
      clearTimeout(timeout);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

void main().catch(() => {
  process.stderr.write('[outbox-dispatch-worker] bootstrap failed\n');
  process.exitCode = 1;
});
