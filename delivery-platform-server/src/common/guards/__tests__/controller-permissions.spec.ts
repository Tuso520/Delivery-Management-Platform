import { GUARDS_METADATA } from '@nestjs/common/constants';

import { DashboardController } from '../../../modules/dashboard/dashboard.controller';
import { KnowledgeController } from '../../../modules/knowledge/knowledge.controller';
import { OperationLogController } from '../../../modules/operation-log/operation-log.controller';
import {
  FileReviewController,
  ReviewController,
} from '../../../modules/review/review.controller';
import { SystemConfigController } from '../../../modules/system-config/system-config.controller';
import { ToolController } from '../../../modules/tool/tool.controller';
import { PERMISSIONS_KEY } from '../../decorators/permissions.decorator';
import { PermissionsGuard } from '../permissions.guard';

function permissions(
  controller: object,
  methodName: string,
): string[] | undefined {
  const method = controller[methodName as keyof typeof controller];
  return Reflect.getMetadata(PERMISSIONS_KEY, method as object);
}

function usesPermissionsGuard(controller: object): boolean {
  const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as
    | Array<new (...args: never[]) => unknown>
    | undefined;
  return guards?.includes(PermissionsGuard) ?? false;
}

describe('controller backend permission boundaries', () => {
  it('protects dashboard, knowledge and tools read endpoints', () => {
    expect(permissions(DashboardController.prototype, 'getOverview')).toEqual([
      'dashboard:view',
    ]);
    expect(
      permissions(KnowledgeController.prototype, 'findAllArticles'),
    ).toEqual(['knowledge:view']);
    expect(permissions(ToolController.prototype, 'findAllTools')).toEqual([
      'tools:view',
    ]);
  });

  it('protects review actions with file permissions', () => {
    expect(permissions(ReviewController.prototype, 'findPending')).toEqual([
      'file:review',
    ]);
    expect(permissions(FileReviewController.prototype, 'approve')).toEqual([
      'file:review',
    ]);
    expect(
      permissions(FileReviewController.prototype, 'getFileReviews'),
    ).toEqual(['file:view']);
  });

  it('activates PermissionsGuard wherever permission metadata is used', () => {
    expect(usesPermissionsGuard(ToolController)).toBe(true);
    expect(usesPermissionsGuard(ReviewController)).toBe(true);
    expect(usesPermissionsGuard(FileReviewController)).toBe(true);
    expect(usesPermissionsGuard(DashboardController)).toBe(true);
    expect(usesPermissionsGuard(SystemConfigController)).toBe(true);
    expect(usesPermissionsGuard(OperationLogController)).toBe(true);
  });
});
