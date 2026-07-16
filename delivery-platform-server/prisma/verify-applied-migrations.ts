import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

interface MigrationRow {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: bigint | number;
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const migrationRoot = resolve(__dirname, 'migrations');
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  const expected = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sql = await readFile(resolve(migrationRoot, entry.name, 'migration.sql'));
    expected.set(entry.name, createHash('sha256').update(sql).digest('hex'));
  }

  const requiredCount = Number.parseInt(process.env.EXPECTED_MIGRATION_COUNT ?? '', 10);
  if (!Number.isInteger(requiredCount) || requiredCount <= 0) {
    throw new Error('EXPECTED_MIGRATION_COUNT must be a positive integer');
  }
  if (expected.size !== requiredCount) {
    throw new Error(
      `migration source count mismatch: expected ${requiredCount}, found ${expected.size}`,
    );
  }

  const rows = await prisma.$queryRaw<MigrationRow[]>`
    SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    ORDER BY migration_name, started_at
  `;
  const active = rows.filter((row) => row.rolled_back_at === null);
  const failures: string[] = [];

  for (const [name, checksum] of expected) {
    const applied = active.filter((row) => row.migration_name === name);
    if (applied.length !== 1) {
      failures.push(`${name}: expected one active application, found ${applied.length}`);
      continue;
    }
    const [row] = applied;
    if (!row.finished_at || Number(row.applied_steps_count) !== 1) {
      failures.push(`${name}: migration is not completely applied`);
    }
    if (row.checksum !== checksum) failures.push(`${name}: database checksum differs from migration.sql`);
  }

  for (const row of active) {
    if (!expected.has(row.migration_name)) {
      failures.push(`${row.migration_name}: active database migration is absent from source`);
    }
  }
  if (active.length !== requiredCount) {
    failures.push(`active migration count: expected ${requiredCount}, found ${active.length}`);
  }
  if (failures.length) throw new Error(`applied migration verification failed:\n- ${failures.join('\n- ')}`);

  console.log(`[migrate] verified ${requiredCount} applied migrations and source checksums`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
