import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { AddProjectMemberDto, UpdateMemberRoleDto } from './dto/project-member.dto';
import { ProjectMemberService } from './project-member.service';


@ApiTags('Project Members')
@ApiBearerAuth('JWT-auth')
@Controller('projects/:projectId/members')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('DELIVERY_MANAGER', 'COUNTRY_MANAGER', 'PROJECT_MANAGER')
export class ProjectMemberController {
  constructor(private readonly projectMemberService: ProjectMemberService) {}

  @Get()
  @Permissions('project:view')
  @ApiOperation({ summary: '获取项目成员列表' })
  @ApiResponse({ status: 200, description: '成员列表' })
  async findAll(
    @Param('projectId') projectId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectMemberService.findByProject(projectId, userId);
  }

  @Post()
  @Permissions('project:manage_member')
  @ApiOperation({ summary: '添加项目成员' })
  @ApiBody({ type: AddProjectMemberDto })
  @ApiResponse({ status: 201, description: '添加成功' })
  @ApiResponse({ status: 409, description: '用户已是项目成员' })
  async addMember(
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectMemberService.addMember(projectId, dto, userId);
  }

  @Put(':memberId')
  @Permissions('project:manage_member')
  @ApiOperation({ summary: '更新成员角色' })
  @ApiBody({ type: UpdateMemberRoleDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '成员不存在' })
  async updateRole(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.projectMemberService.updateRole(
      projectId,
      memberId,
      dto,
      userId,
    );
  }

  @Delete(':memberId')
  @Permissions('project:manage_member')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '移除项目成员' })
  @ApiResponse({ status: 200, description: '移除成功' })
  @ApiResponse({ status: 404, description: '成员不存在' })
  async removeMember(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.projectMemberService.removeMember(projectId, memberId, userId);
    return null;
  }
}
