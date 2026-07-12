import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

import { ApprovalTemplateService } from './approval-template.service';
import {
  CreateTargetApprovalTemplateDto,
  QueryTargetApprovalTemplateDto,
  UpdateTargetApprovalTemplateDto,
} from './dto/approval-template.dto';

@ApiTags('ApprovalTemplates')
@ApiBearerAuth('JWT-auth')
@Controller('approval-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalTemplateController {
  constructor(private readonly approvalTemplates: ApprovalTemplateService) {}

  @Get()
  @RequirePermissions({ any: ['approval_config:view', 'approval_config:manage'] })
  @ApiOperation({ summary: '分页查询审批模板配置' })
  @ApiPaginatedResponse('审批模板分页结果')
  findAll(@Query() query: QueryTargetApprovalTemplateDto) {
    return this.approvalTemplates.findAll(query);
  }

  @Post()
  @RequirePermissions({ all: ['approval_config:manage'] })
  @ApiOperation({ summary: '创建审批模板配置' })
  create(@Body() dto: CreateTargetApprovalTemplateDto, @CurrentUser('sub') userId: string) {
    return this.approvalTemplates.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions({ all: ['approval_config:manage'] })
  @ApiOperation({ summary: '局部更新审批模板配置' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTargetApprovalTemplateDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.approvalTemplates.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions({ all: ['approval_config:manage'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软删除审批模板配置' })
  async remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    await this.approvalTemplates.remove(id, userId);
    return null;
  }

  @Post(':id/toggle')
  @RequirePermissions({ all: ['approval_config:manage'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '切换审批模板启用状态' })
  toggle(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.approvalTemplates.toggle(id, userId);
  }
}
