import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import {
  CreateObjectiveDto,
  UpdateObjectiveDto,
  CreateKeyResultDto,
  UpdateKeyResultDto,
  CreateScoreDto,
  UpdateScoreDto,
} from './dto/okr.dto';
import { OkrService } from './okr.service';

@ApiTags('OKR')
@ApiBearerAuth('JWT-auth')
@Controller('okr')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class OkrController {
  constructor(private readonly okrService: OkrService) {}

  // ==================== Objectives ====================

  @Get('objectives')
  @Permissions('okr:view')
  @ApiOperation({ summary: '获取 OKR 目标列表' })
  async findAllObjectives(
    @Query('ownerId') ownerId?: string,
    @Query('period') period?: string,
  ) {
    return this.okrService.findAllObjectives(ownerId, period);
  }

  @Post('objectives')
  @Permissions('okr:create')
  @ApiOperation({ summary: '创建 OKR 目标' })
  async createObjective(
    @Body() dto: CreateObjectiveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.okrService.createObjective(dto, user.sub);
  }

  @Get('objectives/:id')
  @Permissions('okr:view')
  @ApiOperation({ summary: '获取 OKR 目标详情' })
  async findObjective(@Param('id') id: string) {
    return this.okrService.findObjectiveById(id);
  }

  @Put('objectives/:id')
  @Permissions('okr:update')
  @ApiOperation({ summary: '更新 OKR 目标' })
  async updateObjective(
    @Param('id') id: string,
    @Body() dto: UpdateObjectiveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.okrService.updateObjective(id, dto, user.sub);
  }

  @Delete('objectives/:id')
  @Permissions('okr:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除 OKR 目标' })
  async deleteObjective(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.okrService.deleteObjective(id, user.sub);
    return null;
  }

  @Get('my-objectives')
  @Permissions('okr:view')
  @ApiOperation({ summary: '获取我的 OKR 目标' })
  async getMyObjectives(@CurrentUser() user: JwtPayload) {
    return this.okrService.getMyObjectives(user.sub);
  }

  @Get('team-objectives')
  @Permissions('okr:view_team')
  @ApiOperation({ summary: '获取团队 OKR 目标（主管视角）' })
  async getTeamObjectives(@CurrentUser() user: JwtPayload) {
    return this.okrService.getTeamObjectives(user.sub);
  }

  // ==================== Key Results ====================

  @Post('objectives/:id/key-results')
  @Permissions('okr:update')
  @ApiOperation({ summary: '添加关键结果' })
  async createKeyResult(
    @Param('id') id: string,
    @Body() dto: CreateKeyResultDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.okrService.createKeyResult(id, dto, user.sub);
  }

  @Put('key-results/:krId')
  @Permissions('okr:update')
  @ApiOperation({ summary: '更新关键结果' })
  async updateKeyResult(
    @Param('krId') krId: string,
    @Body() dto: UpdateKeyResultDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.okrService.updateKeyResult(krId, dto, user.sub);
  }

  @Delete('key-results/:krId')
  @Permissions('okr:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除关键结果' })
  async deleteKeyResult(
    @Param('krId') krId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.okrService.deleteKeyResult(krId, user.sub);
    return null;
  }

  // ==================== Performance Scores ====================

  @Post('objectives/:id/scores')
  @Permissions('okr:score')
  @ApiOperation({ summary: '自评打分' })
  async createScore(
    @Param('id') id: string,
    @Body() dto: CreateScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.okrService.createScore(id, dto, user.sub);
  }

  @Put('scores/:scoreId')
  @Permissions('okr:score')
  @ApiOperation({ summary: '更新评分（主管打分）' })
  async updateScore(
    @Param('scoreId') scoreId: string,
    @Body() dto: UpdateScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.okrService.updateScore(scoreId, dto, user.sub);
  }

  @Post('scores/:scoreId/submit')
  @Permissions('okr:score')
  @ApiOperation({ summary: '提交主管评分并发起绩效审批' })
  async submitScore(
    @Param('scoreId') scoreId: string,
    @Body() dto: UpdateScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.okrService.submitScore(scoreId, dto, user.sub);
  }
}
