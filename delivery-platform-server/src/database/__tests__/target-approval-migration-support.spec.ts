import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  LEGACY_DEMO_PROJECT_APPROVAL_TYPES,
  isKnownRetiredMissingKnowledgeFileUpdateApproval,
  isLegacyDemoProjectApprovalType,
  shouldCancelLegacyDemoProjectApproval,
  type RetiredMissingKnowledgeFileUpdateApprovalInput,
} from '../../../prisma/target-foundation-migration-support';

describe('target approval migration support', () => {
  it('maps only the ten retired demo project approval types explicitly', () => {
    expect(LEGACY_DEMO_PROJECT_APPROVAL_TYPES).toHaveLength(10);
    for (let index = 1; index <= 10; index += 1) {
      expect(
        isLegacyDemoProjectApprovalType(`demo-approval-${String(index).padStart(2, '0')}`),
      ).toBe(true);
    }
    expect(isLegacyDemoProjectApprovalType('demo-approval-11')).toBe(false);
    expect(isLegacyDemoProjectApprovalType('demo-approval-custom')).toBe(false);
    expect(isLegacyDemoProjectApprovalType('other-demo-approval-01')).toBe(false);
  });

  it('cancels only pending exact-demo approvals whose project has left active DRAFT', () => {
    const valid = {
      businessType: 'demo-approval-01',
      normalizedStatus: 'PENDING',
      projectExists: true,
      projectStatus: 'ACTIVE',
      projectDeleted: false,
      projectArchived: false,
    };
    expect(shouldCancelLegacyDemoProjectApproval(valid)).toBe(true);
    expect(shouldCancelLegacyDemoProjectApproval({ ...valid, projectStatus: 'DRAFT' })).toBe(false);
    expect(shouldCancelLegacyDemoProjectApproval({ ...valid, normalizedStatus: 'APPROVED' })).toBe(
      false,
    );
    expect(
      shouldCancelLegacyDemoProjectApproval({ ...valid, businessType: 'demo-approval-11' }),
    ).toBe(false);
    expect(shouldCancelLegacyDemoProjectApproval({ ...valid, projectExists: false })).toBe(false);
    expect(
      shouldCancelLegacyDemoProjectApproval({
        ...valid,
        projectStatus: 'DRAFT',
        projectArchived: true,
      }),
    ).toBe(true);
  });

  it('recognizes the retired knowledge file update only when its exact source is absent', () => {
    const valid: RetiredMissingKnowledgeFileUpdateApprovalInput = {
      businessType: 'knowledge-file-update',
      normalizedStatus: 'PENDING',
      templateCode: 'KNOWLEDGE_FILE_UPDATE',
      sourceCount: 0,
    };
    expect(isKnownRetiredMissingKnowledgeFileUpdateApproval(valid)).toBe(true);

    for (const invalid of [
      { businessType: 'knowledge-file-update-custom' },
      { normalizedStatus: 'APPROVED' },
      { templateCode: 'KNOWLEDGE' },
      { sourceCount: 1 },
      { sourceCount: 2 },
    ] satisfies Array<Partial<RetiredMissingKnowledgeFileUpdateApprovalInput>>) {
      expect(isKnownRetiredMissingKnowledgeFileUpdateApproval({ ...valid, ...invalid })).toBe(
        false,
      );
    }
  });

  it('keeps retired pending tasks auditable without manufacturing a knowledge review target', () => {
    const migrator = readFileSync(
      resolve(__dirname, '../../../prisma/migrate-target-foundation.ts'),
      'utf8',
    );

    expect(migrator).toContain("sourceType: 'PROJECT_CREATE'");
    expect(migrator).toContain('shouldCancelLegacyDemoProjectApproval');
    expect(migrator).toContain('CANCELLED_NON_ACTIONABLE_DEMO_PROJECT_APPROVAL');
    expect(migrator).toContain('RETIRED_KNOWLEDGE_FILE_UPDATE_SOURCE_MISSING');
    expect(migrator).toContain("status: 'RESOLVED'");
    expect(migrator).toContain('SOURCE_CONFIRMED_MISSING_RETIRED_FLOW');
    expect(migrator).toContain("increment(report.planned, 'demoDecisionHistorySynthesized')");
    expect(migrator).toContain('DECISION_SYNTHESIZED_FROM_TASK_STATE');
    expect(migrator).not.toContain("businessType.startsWith('demo-approval-')");
  });
});
