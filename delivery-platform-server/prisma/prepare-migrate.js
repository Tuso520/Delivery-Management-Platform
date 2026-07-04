const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const BASELINE_MIGRATION = '20260703000000_init';
const CORE_TABLES = ['users', 'roles', 'permissions', 'projects'];

const prisma = new PrismaClient();

async function tableExists(tableName) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    tableName,
  );
  const count = Number(rows[0]?.count ?? 0);
  return count > 0;
}

function runPrisma(args) {
  const prismaBin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma');
  execFileSync(prismaBin, args, { stdio: 'inherit' });
}

async function main() {
  const hasMigrationTable = await tableExists('_prisma_migrations');
  if (hasMigrationTable) {
    console.log('[migrate] Prisma migration history exists; continuing.');
    return;
  }

  const coreTableStates = await Promise.all(
    CORE_TABLES.map(async (tableName) => [tableName, await tableExists(tableName)]),
  );
  const existingCoreTables = coreTableStates.filter(([, exists]) => exists);

  if (existingCoreTables.length === 0) {
    console.log('[migrate] Empty schema detected; baseline migration will be applied.');
    return;
  }

  if (existingCoreTables.length !== CORE_TABLES.length) {
    const existing = existingCoreTables.map(([tableName]) => tableName).join(', ');
    throw new Error(
      `[migrate] Existing schema is incomplete (${existing}); refusing to auto-baseline. Restore from backup or inspect database manually.`,
    );
  }

  console.log(
    `[migrate] Existing schema without migration history detected; marking ${BASELINE_MIGRATION} as applied.`,
  );
  runPrisma(['migrate', 'resolve', '--applied', BASELINE_MIGRATION]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
