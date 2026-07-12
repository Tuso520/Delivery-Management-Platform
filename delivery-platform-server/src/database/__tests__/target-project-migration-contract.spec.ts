import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  TARGET_PROJECT_DELIVERY_STAGES,
  TARGET_PROJECT_LIFECYCLE_STATUSES,
} from '../../../prisma/target-foundation-migration-support';
import {
  PROJECT_DELIVERY_STAGES,
  PROJECT_LIFECYCLE_STATUSES,
} from '../../modules/project/project.constants';

describe('target project migration contract', () => {
  it('keeps runtime and migration validation dictionaries aligned', () => {
    expect(TARGET_PROJECT_LIFECYCLE_STATUSES).toEqual(PROJECT_LIFECYCLE_STATUSES);
    expect(TARGET_PROJECT_DELIVERY_STAGES).toEqual(PROJECT_DELIVERY_STAGES);
  });

  it('allows every target stage during the destructive state-switch preflight', () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../prisma/migrations/20260712094000_finalize_project_template_states_and_member_soft_delete/migration.sql',
      ),
      'utf8',
    );

    for (const stage of TARGET_PROJECT_DELIVERY_STAGES) {
      expect(migration).toContain(`'${stage}'`);
    }
    expect(migration).toContain("WHEN 'commissioning' THEN 'COMMISSIONING'");
    expect(migration).toContain("WHEN 'testing' THEN 'TESTING'");
    expect(migration).not.toContain("ELSE 'STARTUP'");
    expect(migration).not.toContain("ELSE 'ACTIVE'");
    expect(migration).toContain("'UNMAPPED_LEGACY_PROJECT_STATUS'");
    expect(migration).toContain("'UNMAPPED_LEGACY_PROJECT_STAGE'");
  });
});
