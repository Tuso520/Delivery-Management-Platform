import { readFile, writeFile } from 'node:fs/promises';

import { PrismaClient } from '@prisma/client';

interface TableRow {
  tableName: string;
}

interface CountRow {
  rowCount: bigint;
}

type Snapshot = Record<string, string>;

const prisma = new PrismaClient();

async function capture(): Promise<Snapshot> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT TABLE_NAME AS tableName
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `;
  const snapshot: Snapshot = {};
  for (const { tableName } of tables) {
    if (!/^[A-Za-z0-9_]+$/u.test(tableName)) throw new Error(`unsafe table name: ${tableName}`);
    const rows = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*) AS rowCount FROM \`${tableName}\``,
    );
    snapshot[tableName] = String(rows[0]?.rowCount ?? 0n);
  }
  return snapshot;
}

async function main(): Promise<void> {
  const [mode, snapshotPath] = process.argv.slice(2);
  if (!snapshotPath || !['--capture', '--verify'].includes(mode)) {
    throw new Error('usage: verify-seed-idempotency.ts --capture|--verify <snapshot.json>');
  }
  const current = await capture();
  if (mode === '--capture') {
    await writeFile(snapshotPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    console.log(`[seed] captured ${Object.keys(current).length} table counts`);
    return;
  }

  const before = JSON.parse(await readFile(snapshotPath, 'utf8')) as Snapshot;
  const tables = new Set([...Object.keys(before), ...Object.keys(current)]);
  const changed = [...tables]
    .filter((table) => before[table] !== current[table])
    .map((table) => `${table}: ${before[table] ?? 'missing'} -> ${current[table] ?? 'missing'}`);
  if (changed.length) throw new Error(`second seed changed table counts:\n- ${changed.join('\n- ')}`);
  console.log(`[seed] verified stable counts for ${tables.size} tables after the second seed`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
