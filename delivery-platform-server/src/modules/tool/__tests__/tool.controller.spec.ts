import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../../../common/decorators/permissions.decorator';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { ToolController } from '../tool.controller';
import type { ToolService } from '../tool.service';

function metadataOf(methodName: keyof ToolController) {
  const method = ToolController.prototype[methodName];
  return {
    path: Reflect.getMetadata(PATH_METADATA, method as object) as string,
    requestMethod: Reflect.getMetadata(METHOD_METADATA, method as object) as RequestMethod,
    permissions: Reflect.getMetadata(PERMISSIONS_KEY, method as object) as PermissionRequirement,
  };
}

describe('ToolController target routes', () => {
  it('exposes only the five target tool endpoints', () => {
    const routes = Object.getOwnPropertyNames(ToolController.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => metadataOf(name as keyof ToolController));

    expect(routes).toEqual([
      { path: '/', requestMethod: RequestMethod.GET, permissions: { all: ['tools:view'] } },
      { path: '/', requestMethod: RequestMethod.POST, permissions: { all: ['tools:manage'] } },
      { path: ':id', requestMethod: RequestMethod.PATCH, permissions: { all: ['tools:manage'] } },
      {
        path: ':id/enable',
        requestMethod: RequestMethod.POST,
        permissions: { all: ['tools:manage'] },
      },
      {
        path: ':id/disable',
        requestMethod: RequestMethod.POST,
        permissions: { all: ['tools:manage'] },
      },
    ]);
  });

  it('delegates list visibility with the full authenticated actor', async () => {
    const actor: JwtPayload = {
      sub: 'user-1',
      username: 'standard.admin',
      realName: '标准管理员',
      email: null,
      roles: ['STANDARD_ADMIN'],
      permissions: ['tools:view', 'tools:manage'],
      permissionVersion: 1,
    };
    const service = {
      findAll: jest.fn().mockResolvedValue([]),
    } as unknown as ToolService;
    const controller = new ToolController(service);

    await controller.findAllTools({ includeDisabled: true }, actor);

    expect(service.findAll).toHaveBeenCalledWith({ includeDisabled: true }, actor);
  });
});
