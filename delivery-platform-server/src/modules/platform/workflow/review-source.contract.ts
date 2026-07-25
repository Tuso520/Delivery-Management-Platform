export const REGISTERED_REVIEW_SOURCE_TYPES = [
  'PROJECT_CREATE',
  'PROJECT_ARCHIVE',
  'ARCHIVE_TEMPLATE',
  'STANDARD',
  'KNOWLEDGE',
] as const;

export type RegisteredReviewSourceType =
  (typeof REGISTERED_REVIEW_SOURCE_TYPES)[number];

export interface ReviewBusinessDecisionInput {
  sourceType: string;
  sourceId: string;
  fileVersionId: string | null;
  decision: 'APPROVED' | 'REJECTED';
  actorUserId: string;
  decidedAt: Date;
}
