import { Prisma } from '@prisma/client';

import { getCurrentTraceId } from '../utils/request-trace.util';

export interface DomainEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
  deduplicationKey?: string;
  availableAt?: Date;
  traceId?: string;
}

export async function enqueueDomainEvent(
  tx: Prisma.TransactionClient,
  event: DomainEventInput,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      deduplicationKey: event.deduplicationKey,
      availableAt: event.availableAt,
      traceId: event.traceId ?? getCurrentTraceId(),
    },
  });
}
