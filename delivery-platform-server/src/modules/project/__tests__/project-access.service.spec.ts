import type { DataScopeService } from '../../identity/data-scope/data-scope.service';
import { ProjectAccessService } from '../project-access.service';

describe('ProjectAccessService', () => {
  it('delegates project list scope to DataScopeService', async () => {
    const projectWhere = {
      deletedAt: null,
      members: { some: { userId: 'user-1' } },
    };
    const dataScope = {
      buildProjectWhere: jest.fn().mockResolvedValue(projectWhere),
      assertProjectAccess: jest.fn(),
    } as unknown as DataScopeService;
    const service = new ProjectAccessService(dataScope);

    await expect(service.buildProjectWhere('user-1')).resolves.toEqual(projectWhere);
    expect(dataScope.buildProjectWhere).toHaveBeenCalledWith('user-1');
  });

  it('delegates single-project authorization to DataScopeService', async () => {
    const dataScope = {
      buildProjectWhere: jest.fn(),
      assertProjectAccess: jest.fn().mockResolvedValue(undefined),
    } as unknown as DataScopeService;
    const service = new ProjectAccessService(dataScope);

    await expect(service.assertProjectAccess('project-1', 'user-1')).resolves.toBeUndefined();
    expect(dataScope.assertProjectAccess).toHaveBeenCalledWith('project-1', 'user-1');
  });
});
