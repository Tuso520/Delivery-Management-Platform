import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { FileProcessingService } from '../modules/file/file-processing.service';

const idleDelayMs = 3_000;
const errorDelayMs = 5_000;
let stopping = false;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const processor = app.get(FileProcessingService);
  const stop = (): void => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    while (!stopping) {
      try {
        const processed = await processor.processBatch(10, () => stopping);
        if (processed === 0) await delay(idleDelayMs);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown worker error';
        process.stderr.write(`[file-processing-worker] ${message}\n`);
        await delay(errorDelayMs);
      }
    }
  } finally {
    await app.close();
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'worker bootstrap failed';
  process.stderr.write(`[file-processing-worker] fatal: ${message}\n`);
  process.exitCode = 1;
});
