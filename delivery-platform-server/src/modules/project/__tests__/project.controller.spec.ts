import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';

import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { CreateProjectDto } from '../dto/create-project.dto';
import { ProjectStatusActionDto } from '../dto/project-status-action.dto';
import { UpdateProjectProgressDto } from '../dto/update-project-progress.dto';
import type { ProjectConfigurationService } from '../project-configuration.service';
import { ProjectController } from '../project.controller';
import type { ProjectService } from '../project.service';

describe('ProjectController project creation', () => {
  const actor: JwtPayload = {
    sub: 'user-1',
    username: 'project-manager',
    realName: '项目经理',
    email: null,
    roles: ['PROJECT_MANAGER'],
    permissions: ['project:create'],
    permissionVersion: 1,
  };
  const dto: CreateProjectDto = {
    projectName: '新项目',
    countryCode: 'VN',
    archiveTemplateId: 'archive-template-1',
  };

  let projectService: { create: jest.Mock };
  let projectConfiguration: { getConfiguration: jest.Mock };
  let controller: ProjectController;

  beforeEach(() => {
    projectService = {
      create: jest.fn().mockResolvedValue({ id: 'project-1' }),
    };
    projectConfiguration = {
      getConfiguration: jest.fn().mockResolvedValue({ projectTypes: [] }),
    };
    controller = new ProjectController(
      projectService as unknown as ProjectService,
      projectConfiguration as unknown as ProjectConfigurationService,
    );
  });

  it('returns the aggregate project configuration from its domain service', async () => {
    await expect(controller.getConfiguration()).resolves.toEqual({ projectTypes: [] });
    expect(projectConfiguration.getConfiguration).toHaveBeenCalledTimes(1);
  });

  it('requires Idempotency-Key on POST /projects', async () => {
    await expect(controller.create(dto, actor, undefined)).rejects.toThrow(BadRequestException);
    expect(projectService.create).not.toHaveBeenCalled();
  });

  it.each(['short', 'project key with spaces', `key-${'a'.repeat(97)}`])(
    'rejects an unsafe Idempotency-Key: %s',
    async (idempotencyKey) => {
      await expect(controller.create(dto, actor, idempotencyKey)).rejects.toThrow(
        BadRequestException,
      );
      expect(projectService.create).not.toHaveBeenCalled();
    },
  );

  it('forwards a validated Idempotency-Key to ProjectService', async () => {
    await controller.create(dto, actor, 'project-create-key-0001');

    expect(projectService.create).toHaveBeenCalledWith(dto, actor, 'project-create-key-0001');
  });

  it('requires archiveTemplateId in the create DTO', async () => {
    const invalidDto = Object.assign(new CreateProjectDto(), {
      projectName: '新项目',
      countryCode: 'VN',
    });

    const errors = await validate(invalidDto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'archiveTemplateId' })]),
    );
  });

  it.each([
    Object.assign(new UpdateProjectProgressDto(), {
      targetStage: 'TESTING',
      progressPercent: 80,
    }),
    Object.assign(new ProjectStatusActionDto(), { reason: '状态调整' }),
  ])('requires revision in every project command DTO', async (commandDto) => {
    const errors = await validate(commandDto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'revision' })]),
    );
  });
});
