/* eslint-disable no-console */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const verify = args.includes('--verify');

function actorUsername(): string {
  const prefix = '--actor-username=';
  return (
    args
      .find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() || 'admin'
  );
}

const legacyFixtureWhere = {
  code: { startsWith: 'TS-' },
  name: { startsWith: '随机测试标准 ' },
  status: 'DRAFT',
  currentPublishedVersionId: null,
  archivedAt: null,
} as const;

async function main(): Promise<void> {
  if (process.env.DEPLOY_ENV !== 'test') {
    throw new Error('legacy test standard retirement is restricted to DEPLOY_ENV=test');
  }
  if (apply && verify) {
    throw new Error('--apply and --verify cannot be used together');
  }

  const candidates = await prisma.standard.findMany({
    where: legacyFixtureWhere,
    select: { id: true, code: true, name: true },
    orderBy: { id: 'asc' },
  });
  const report = {
    mode: apply ? 'APPLY' : verify ? 'VERIFY' : 'DRY_RUN',
    matched: candidates.length,
    retired: 0,
  };

  if (verify) {
    console.log(JSON.stringify(report));
    if (candidates.length > 0) {
      throw new Error(`${candidates.length} active legacy random test standard(s) remain`);
    }
    return;
  }
  if (!apply || candidates.length === 0) {
    console.log(JSON.stringify(report));
    return;
  }

  const actor = await prisma.user.findUnique({
    where: { username: actorUsername() },
    select: { id: true, deletedAt: true },
  });
  if (!actor || actor.deletedAt) {
    throw new Error('an active retirement actor is required');
  }

  const standardIds = candidates.map((candidate) => candidate.id);
  const versions = await prisma.standardVersion.findMany({
    where: { standardId: { in: standardIds } },
    select: { id: true },
  });
  const versionIds = versions.map((version) => version.id);
  if (versionIds.length > 0) {
    const activeReviews = await prisma.reviewTask.count({
      where: {
        sourceType: 'STANDARD',
        sourceVersionId: { in: versionIds },
        status: 'PENDING',
        archivedAt: null,
      },
    });
    if (activeReviews > 0) {
      throw new Error('legacy random test standards have active review tasks');
    }
  }

  const archivedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.standardVersion.updateMany({
      where: {
        standardId: { in: standardIds },
        status: { in: ['DRAFT', 'REJECTED'] },
        archivedAt: null,
      },
      data: { status: 'ARCHIVED', archivedAt },
    });
    const retired = await tx.standard.updateMany({
      where: { id: { in: standardIds }, ...legacyFixtureWhere },
      data: {
        status: 'ARCHIVED',
        archivedAt,
        isEnabled: false,
        updatedBy: actor.id,
      },
    });
    if (retired.count !== candidates.length) {
      throw new Error('legacy random test standard state changed during retirement');
    }
    await tx.operationLog.createMany({
      data: candidates.map((candidate) => ({
        userId: actor.id,
        module: 'standard',
        action: 'retire_legacy_test_fixture',
        targetType: 'standard',
        targetId: candidate.id,
        afterData: {
          code: candidate.code,
          name: candidate.name,
          status: 'ARCHIVED',
        },
        result: 'success',
      })),
    });
    report.retired = retired.count;
  });

  console.log(JSON.stringify(report));
}

void main()
  .catch((error: unknown) => {
    console.error(
      'legacy test standard retirement failed:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
