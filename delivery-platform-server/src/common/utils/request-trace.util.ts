import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export const REQUEST_TRACE_HEADER = 'x-request-id';

interface RequestTraceStore {
  traceId: string;
  auditState: 'none' | 'transactional' | 'persisted';
}

export interface TraceableRequest extends Request {
  traceId?: string;
}

const requestTraceStorage = new AsyncLocalStorage<RequestTraceStore>();
const SAFE_TRACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u;

function normalizeTraceId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && SAFE_TRACE_ID_PATTERN.test(normalized) ? normalized : undefined;
}

export function resolveRequestTraceId(request: TraceableRequest): string {
  const existing = normalizeTraceId(request.traceId);
  if (existing) return existing;

  const supplied =
    normalizeTraceId(request.get(REQUEST_TRACE_HEADER)) ??
    normalizeTraceId(request.get('x-trace-id')) ??
    normalizeTraceId(request.get('x-correlation-id'));
  const traceId = supplied ?? randomUUID();
  request.traceId = traceId;
  return traceId;
}

export function getCurrentTraceId(): string | undefined {
  return requestTraceStorage.getStore()?.traceId;
}

export function markCurrentRequestAudited(persisted = true): void {
  const store = requestTraceStorage.getStore();
  if (store) store.auditState = persisted ? 'persisted' : 'transactional';
}

export function hasCurrentRequestAudit(): boolean {
  return requestTraceStorage.getStore()?.auditState !== 'none';
}

export function hasPersistedCurrentRequestAudit(): boolean {
  return requestTraceStorage.getStore()?.auditState === 'persisted';
}

export function hasTransactionalCurrentRequestAudit(): boolean {
  return requestTraceStorage.getStore()?.auditState === 'transactional';
}

export function runWithTraceId<T>(traceId: string, callback: () => T): T {
  const normalized = normalizeTraceId(traceId) ?? randomUUID();
  return requestTraceStorage.run({ traceId: normalized, auditState: 'none' }, callback);
}

export function requestTraceMiddleware(
  request: TraceableRequest,
  response: Response,
  next: NextFunction,
): void {
  const traceId = resolveRequestTraceId(request);
  response.setHeader(REQUEST_TRACE_HEADER, traceId);
  runWithTraceId(traceId, next);
}
