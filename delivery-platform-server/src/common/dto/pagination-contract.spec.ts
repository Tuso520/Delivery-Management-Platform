import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGINATED_SERVICES = [
  'modules/user/user.service.ts',
  'modules/operation-log/operation-log.service.ts',
  'modules/standard/standard.service.ts',
  'modules/project-payment/project-payment.service.ts',
  'modules/project/project.service.ts',
  'modules/country/country.service.ts',
  'modules/platform/approval-template.service.ts',
  'modules/platform/integration.service.ts',
  'modules/knowledge/knowledge-item.service.ts',
  'modules/review/review-task.service.ts',
  'modules/notification/notification.service.ts',
] as const;

const PAGINATED_CONTROLLERS = [
  'modules/user/user.controller.ts',
  'modules/operation-log/operation-log.controller.ts',
  'modules/standard/standard.controller.ts',
  'modules/project-payment/project-payment.controller.ts',
  'modules/project/project.controller.ts',
  'modules/country/country.controller.ts',
  'modules/platform/approval-template.controller.ts',
  'modules/platform/integration.controller.ts',
  'modules/knowledge/knowledge-item.controller.ts',
  'modules/review/review-task.controller.ts',
  'modules/notification/notification.controller.ts',
] as const;

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

describe('canonical pagination response contract', () => {
  it('defines only the flat items/page/pageSize/total result', () => {
    const source = readSource('common/dto/pagination.dto.ts');

    expect(source).toContain('items: T[]');
    expect(source).toContain('page: number');
    expect(source).toContain('pageSize: number');
    expect(source).toContain('total: number');
    expect(source).not.toContain('PaginationMeta');
    expect(source).not.toContain('totalPages');
    expect(source).not.toMatch(/\blist:\s*T\[\]/);
    expect(source).not.toMatch(/\bpagination:/);
  });

  it.each(PAGINATED_SERVICES)('%s has no legacy pagination response keys', (path) => {
    const source = readSource(path);

    expect(source).not.toMatch(/\btotalPages\s*:/);
    expect(source).not.toMatch(/\bpagination\s*:/);
    expect(source).not.toMatch(/\blist\s*:/);
  });

  it.each(PAGINATED_CONTROLLERS)('%s documents the flat pagination payload', (path) => {
    const source = readSource(path);

    expect(source).toMatch(/ApiPaginatedResponse|\bitems\s*:/);
    expect(source).not.toContain('totalPages');
    expect(source).not.toMatch(/\bpagination\s*:/);
  });
});
