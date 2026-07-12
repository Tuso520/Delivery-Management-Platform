import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { CreateToolDefinitionDto, QueryToolsDto, UpdateToolDefinitionDto } from './dto/tool.dto';
import { ToolService } from './tool.service';

@ApiTags('Tools')
@ApiBearerAuth('JWT-auth')
@Controller('tools')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ToolController {
  constructor(private readonly toolService: ToolService) {}

  @Get()
  @RequirePermissions({ all: ['tools:view'] })
  @ApiOperation({ summary: '获取工具目录' })
  @ApiResponse({ status: 200, description: '工具定义列表' })
  findAllTools(@Query() query: QueryToolsDto, @CurrentUser() actor: JwtPayload) {
    return this.toolService.findAll(query, actor);
  }

  @Post()
  @RequirePermissions({ all: ['tools:manage'] })
  @ApiOperation({ summary: '创建工具定义' })
  @ApiBody({ type: CreateToolDefinitionDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  createTool(@Body() dto: CreateToolDefinitionDto) {
    return this.toolService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions({ all: ['tools:manage'] })
  @ApiOperation({ summary: '更新工具定义' })
  @ApiBody({ type: UpdateToolDefinitionDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  updateTool(@Param('id') id: string, @Body() dto: UpdateToolDefinitionDto) {
    return this.toolService.update(id, dto);
  }

  @Post(':id/enable')
  @RequirePermissions({ all: ['tools:manage'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '启用工具' })
  enableTool(@Param('id') id: string) {
    return this.toolService.setEnabled(id, true);
  }

  @Post(':id/disable')
  @RequirePermissions({ all: ['tools:manage'] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '停用工具' })
  disableTool(@Param('id') id: string) {
    return this.toolService.setEnabled(id, false);
  }
}
