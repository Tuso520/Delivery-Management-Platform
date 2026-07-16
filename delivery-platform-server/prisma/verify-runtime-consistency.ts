import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const marker =
  process.env.RUNTIME_ACCEPTANCE_CHANGE_DESCRIPTION ??
  'CI MinIO and File Worker consistency acceptance';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function verify(): Promise<boolean> {
  const version = await prisma.fileVersion.findFirst({
    where: { changeDescription: marker, archivedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      logicalFile: {
        select: { id: true, displayName: true },
      },
      asset: {
        select: {
          id: true,
          status: true,
          processingInputs: {
            select: {
              id: true,
              type: true,
              status: true,
              progress: true,
              outputAssetId: true,
              errorCode: true,
            },
          },
        },
      },
    },
  });
  if (!version) return false;
  const file = version.logicalFile;
  const asset = version.asset;
  const thumbnail = asset.processingInputs.find((job) => job.type === 'THUMBNAIL');
  if (!thumbnail || thumbnail.status !== 'COMPLETED' || thumbnail.progress !== 100 || !thumbnail.outputAssetId) {
    if (thumbnail?.status === 'FAILED') {
      throw new Error(`file worker failed acceptance job: ${thumbnail.errorCode ?? 'unknown error'}`);
    }
    return false;
  }

  const events = await prisma.outboxEvent.findMany({
    where: {
      OR: [
        { eventType: 'ArchiveFileUploaded', aggregateId: file.id },
        { eventType: 'FileProcessingCompleted', aggregateId: asset.id },
      ],
    },
    select: { eventType: true, status: true, processedAt: true, lastError: true },
  });
  for (const eventType of ['ArchiveFileUploaded', 'FileProcessingCompleted']) {
    const event = events.find((candidate) => candidate.eventType === eventType);
    if (!event || !['PROCESSED', 'SKIPPED'].includes(event.status) || !event.processedAt) {
      if (event?.status === 'DEAD') throw new Error(`${eventType} is dead: ${event.lastError ?? 'unknown error'}`);
      return false;
    }
  }
  return true;
}

async function main(): Promise<void> {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    if (await verify()) {
      console.log(
        `[runtime] MinIO file, thumbnail job and outbox events verified for ${marker}`,
      );
      return;
    }
    await delay(2_000);
  }
  throw new Error(`runtime consistency did not converge for ${marker}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
