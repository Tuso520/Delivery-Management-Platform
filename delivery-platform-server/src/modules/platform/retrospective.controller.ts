import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import {
  QueryPlatformDto,
  RetrospectiveActionDto,
  UpsertRetrospectiveDto,
} from './dto/platform.dto';
import { RetrospectiveService } from './retrospective.service';

@ApiTags('Retrospectives')
@ApiBearerAuth('JWT-auth')
@Controller('retrospectives')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RetrospectiveController {
  constructor(private readonly retrospectiveService: RetrospectiveService) {}

  @Get()
  @Permissions('retrospective:view')
  @ApiOperation({ summary: '分页查询项目复盘和整改任务' })
  findAll(
    @Query() query: QueryPlatformDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retrospectiveService.findAll(query, user.sub);
  }

  @Post()
  @Permissions('retrospective:manage')
  create(
    @Body() dto: UpsertRetrospectiveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retrospectiveService.create(dto, user.sub);
  }

  @Put(':id')
  @Permissions('retrospective:manage')
  @ApiOperation({ summary: '更新复盘内容和状态' })
  update(
    @Param('id') id: string,
    @Body() dto: UpsertRetrospectiveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retrospectiveService.update(id, dto, user.sub);
  }

  @Post(':id/actions')
  @Permissions('retrospective:manage')
  addAction(
    @Param('id') id: string,
    @Body() dto: RetrospectiveActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retrospectiveService.addAction(id, dto, user.sub);
  }

  @Put('actions/:id')
  @Permissions('retrospective:manage')
  updateAction(
    @Param('id') id: string,
    @Body() dto: RetrospectiveActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retrospectiveService.updateAction(id, dto, user.sub);
  }
}
