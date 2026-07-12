import { PATH_METADATA } from '@nestjs/common/constants';

import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../../../common/decorators/permissions.decorator';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { DashboardController } from '../dashboard.controller';
import type { DashboardService } from '../dashboard.service';

function pathOf(method: object): string | undefined {
  return Reflect.getMetadata(PATH_METADATA, method) as string | undefined;
}

function permissionAllOf(method: object): string[] | undefined {
  const requirement = Reflect.getMetadata(PERMISSIONS_KEY, method) as
    | PermissionRequirement
    | undefined;
  return requirement?.all;
}

describe('DashboardController target partitions', () => {
  const actor: JwtPayload = {
    sub: 'user-1',
    username: 'project.manager',
    realName: '项目经理',
    email: null,
    roles: ['PROJECT_MANAGER'],
    permissions: ['dashboard:view'],
    permissionVersion: 1,
  };

  const endpointMethods = [
    'getProjectSummary',
    'getMyTasks',
    'getHighRisks',
    'getRecentProjects',
    'getRecentActivities',
  ] as const;

  it('only exposes the five documented dashboard endpoints', () => {
    const exposedPaths = Object.getOwnPropertyNames(DashboardController.prototype)
      .filter((name) => name !== 'constructor')
      .flatMap((name) => {
        const method = DashboardController.prototype[name as keyof DashboardController];
        return typeof method === 'function' ? [pathOf(method)] : [];
      })
      .filter((path): path is string => Boolean(path));

    expect(exposedPaths).toEqual([
      'project-summary',
      'my-tasks',
      'high-risks',
      'recent-projects',
      'recent-activities',
    ]);
    for (const methodName of endpointMethods) {
      expect(permissionAllOf(DashboardController.prototype[methodName])).toEqual([
        'dashboard:view',
      ]);
    }
  });

  it('delegates every partition with the full authenticated actor', async () => {
    const service = {
      getProjectSummary: jest.fn().mockResolvedValue({ total: 1 }),
      getMyTasks: jest.fn().mockResolvedValue([{ id: 'task-1' }]),
      getHighRisks: jest.fn().mockResolvedValue([{ id: 'project-risk' }]),
      getRecentProjects: jest.fn().mockResolvedValue([{ id: 'project-recent' }]),
      getRecentActivities: jest.fn().mockResolvedValue([{ id: 'activity-1' }]),
    } as unknown as DashboardService;
    const controller = new DashboardController(service);

    await controller.getProjectSummary(actor);
    await controller.getMyTasks(actor);
    await controller.getHighRisks(actor);
    await controller.getRecentProjects(actor);
    await controller.getRecentActivities(actor);

    expect(service.getProjectSummary).toHaveBeenCalledWith(actor);
    expect(service.getMyTasks).toHaveBeenCalledWith(actor);
    expect(service.getHighRisks).toHaveBeenCalledWith(actor);
    expect(service.getRecentProjects).toHaveBeenCalledWith(actor);
    expect(service.getRecentActivities).toHaveBeenCalledWith(actor);
  });
});
