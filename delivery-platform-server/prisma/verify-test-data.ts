/* eslint-disable no-console */

import { PrismaClient } from '@prisma/client';

import { testDatasetManifest } from './test-data-manifest';

const prisma = new PrismaClient();

function minimumCount(): number {
  const value = Number(process.env.TEST_DATA_MIN_COUNT ?? '20');
  if (!Number.isInteger(value) || value < 20 || value > 200) {
    throw new Error('TEST_DATA_MIN_COUNT must be an integer between 20 and 200');
  }
  return value;
}

async function main(): Promise<void> {
  if (process.env.DEPLOY_ENV !== 'test') {
    throw new Error('test-data verification is restricted to DEPLOY_ENV=test');
  }

  const minimum = minimumCount();
  const failures: string[] = [];
  for (const dataset of testDatasetManifest(prisma)) {
    const count = await dataset.count();
    console.log(`${dataset.name}: ${count}`);
    if (count < minimum) failures.push(`${dataset.name}=${count}`);
  }

  if (failures.length > 0) {
    throw new Error(`test datasets below minimum ${minimum}: ${failures.join(', ')}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('test-data verification failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
