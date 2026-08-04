/* eslint-disable no-console */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TableRow {
  tableName: string;
}

interface CountRow {
  count: bigint;
}

interface ForeignKeyRow {
  constraintName: string;
  tableName: string;
  columnName: string;
  referencedTableName: string;
  referencedColumnName: string;
  ordinalPosition: number;
}

const EMPTY_RUNTIME_TABLES = [
  'api_keys',
  'approval_actions',
  'approval_tasks',
  'attachments',
  'audit_failures',
  'backup_records',
  'daily_reports',
  'external_contact_candidates',
  'external_identities',
  'file_processing_jobs',
  'file_reviews',
  'files',
  'integration_sync_logs',
  'key_results',
  'migration_exceptions',
  'notifications',
  'notification_deliveries',
  'okr_objectives',
  'operation_logs',
  'outbox_events',
  'performance_scores',
  'project_archive_entries',
  'project_archive_files',
  'project_archive_folders',
  'project_archive_items',
  'project_checklist_items',
  'project_members',
  'project_payments',
  'project_process_records',
  'project_retrospectives',
  'projects',
  'refresh_sessions',
  'retrospective_actions',
  'review_action_events',
  'review_assignees',
  'review_steps',
  'review_tasks',
  'skill_assessments',
  'training_participants',
  'training_plans',
  'user_department_memberships',
  'user_permission_overrides',
] as const;

function requireGuardrails(): { host: string; database: string; targetId: string } {
  if (process.env.DEPLOY_ENV !== 'test') {
    throw new Error('clean baseline verification is restricted to DEPLOY_ENV=test');
  }
  if (process.env.CONFIRM_CLEAN_TEST_BASELINE !== 'YES') {
    throw new Error('CONFIRM_CLEAN_TEST_BASELINE=YES is required');
  }
  const targetId = process.env.DEPLOY_TARGET_ID?.trim() ?? '';
  if (!targetId || !/(^|[-_.])test([-_.]|$)/i.test(targetId)) {
    throw new Error('DEPLOY_TARGET_ID must explicitly identify the test target');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== 'mysql:') throw new Error('DATABASE_URL must use mysql:');
  const database = parsed.pathname.replace(/^\//u, '');
  if (!parsed.hostname || !database) {
    throw new Error('DATABASE_URL must include an explicit host and database');
  }
  return { host: parsed.hostname, database, targetId };
}

function identifier(value: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`unsafe SQL identifier: ${value}`);
  return `\`${value}\``;
}

async function tableCounts(database: string): Promise<Record<string, number>> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT TABLE_NAME AS tableName
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ${database} AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `;
  const counts: Record<string, number> = {};
  for (const { tableName } of tables) {
    const rows = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*) AS count FROM ${identifier(tableName)}`,
    );
    counts[tableName] = Number(rows[0]?.count ?? 0n);
  }
  return counts;
}

async function orphanCounts(database: string): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<ForeignKeyRow[]>`
    SELECT
      CONSTRAINT_NAME AS constraintName,
      TABLE_NAME AS tableName,
      COLUMN_NAME AS columnName,
      REFERENCED_TABLE_NAME AS referencedTableName,
      REFERENCED_COLUMN_NAME AS referencedColumnName,
      ORDINAL_POSITION AS ordinalPosition
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ${database} AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
  `;
  const groups = new Map<string, ForeignKeyRow[]>();
  for (const row of rows) {
    const key = `${row.tableName}.${row.constraintName}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const result: Record<string, number> = {};
  for (const [key, columns] of groups) {
    const first = columns[0];
    if (!first) continue;
    const join = columns
      .map(
        ({ columnName, referencedColumnName }) =>
          `child.${identifier(columnName)} = parent.${identifier(referencedColumnName)}`,
      )
      .join(' AND ');
    const populated = columns
      .map(({ columnName }) => `child.${identifier(columnName)} IS NOT NULL`)
      .join(' AND ');
    const missing = `parent.${identifier(first.referencedColumnName)} IS NULL`;
    const count = await prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*) AS count FROM ${identifier(first.tableName)} child ` +
        `LEFT JOIN ${identifier(first.referencedTableName)} parent ON ${join} ` +
        `WHERE ${populated} AND ${missing}`,
    );
    result[key] = Number(count[0]?.count ?? 0n);
  }
  return result;
}

async function main(): Promise<void> {
  const guardrails = requireGuardrails();
  const databaseRows = await prisma.$queryRaw<Array<{ databaseName: string | null }>>`
    SELECT DATABASE() AS databaseName
  `;
  if (databaseRows[0]?.databaseName !== guardrails.database) {
    throw new Error('connected database does not match DATABASE_URL');
  }

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      username: true,
      status: true,
      userRoles: { select: { role: { select: { roleCode: true } } } },
    },
  });
  if (
    users.length !== 1 ||
    users[0]?.username !== 'admin' ||
    users[0].status !== 'Active' ||
    !users[0].userRoles.some(({ role }) => role.roleCode === 'SUPER_ADMIN')
  ) {
    throw new Error('clean test baseline must contain one active SUPER_ADMIN named admin');
  }

  const counts = await tableCounts(guardrails.database);
  const unexpected = EMPTY_RUNTIME_TABLES.filter((table) => (counts[table] ?? 0) !== 0);
  if (unexpected.length > 0) {
    throw new Error(
      `clean test baseline contains runtime data: ${unexpected
        .map((table) => `${table}=${counts[table]}`)
        .join(', ')}`,
    );
  }

  const orphans = await orphanCounts(guardrails.database);
  const orphanFailures = Object.entries(orphans).filter(([, count]) => count !== 0);
  if (orphanFailures.length > 0) {
    throw new Error(
      `foreign-key orphan verification failed: ${orphanFailures
        .map(([key, count]) => `${key}=${count}`)
        .join(', ')}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        status: 'CLEAN_TEST_BASELINE_PASS',
        targetId: guardrails.targetId,
        databaseHost: guardrails.host,
        databaseName: guardrails.database,
        users: users.length,
        adminRoles: users[0].userRoles.map(({ role }) => role.roleCode),
        tableCounts: counts,
        foreignKeyOrphans: orphans,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error('clean test baseline verification failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
