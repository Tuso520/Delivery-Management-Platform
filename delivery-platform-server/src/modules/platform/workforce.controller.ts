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
  AssessSkillDto,
  QueryPlatformDto,
  TrainingParticipantDto,
  UpsertSkillDto,
  UpsertTrainingDto,
} from './dto/platform.dto';
import { WorkforceService } from './workforce.service';

@ApiTags('Workforce')
@ApiBearerAuth('JWT-auth')
@Controller('workforce')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkforceController {
  constructor(private readonly workforceService: WorkforceService) {}

  @Get('skills')
  @Permissions('skill:view')
  @ApiOperation({ summary: '查询技能矩阵及季度评估' })
  findSkills(@Query() query: QueryPlatformDto) {
    return this.workforceService.findSkills(query);
  }

  @Post('skills')
  @Permissions('skill:manage')
  upsertSkill(@Body() dto: UpsertSkillDto) {
    return this.workforceService.upsertSkill(dto);
  }

  @Post('skill-assessments')
  @Permissions('skill:manage')
  assessSkill(
    @Body() dto: AssessSkillDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workforceService.assessSkill(dto, user.sub);
  }

  @Get('training')
  @Permissions('training:view')
  @ApiOperation({ summary: '查询培训计划、人员与签到完成记录' })
  findTraining(@Query() query: QueryPlatformDto) {
    return this.workforceService.findTraining(query);
  }

  @Post('training')
  @Permissions('training:manage')
  createTraining(@Body() dto: UpsertTrainingDto) {
    return this.workforceService.createTraining(dto);
  }

  @Put('training/:id')
  @Permissions('training:manage')
  @ApiOperation({ summary: '更新培训计划' })
  updateTraining(@Param('id') id: string, @Body() dto: UpsertTrainingDto) {
    return this.workforceService.updateTraining(id, dto);
  }

  @Post('training/:id/complete')
  @Permissions('training:manage')
  @ApiOperation({ summary: '完成培训并记录参加人员完成时间' })
  completeTraining(@Param('id') id: string) {
    return this.workforceService.completeTraining(id);
  }

  @Post('training/:id/participants')
  @Permissions('training:manage')
  addParticipant(
    @Param('id') id: string,
    @Body() dto: TrainingParticipantDto,
  ) {
    return this.workforceService.addTrainingParticipant(id, dto);
  }

  @Post('training/:id/sign')
  @Permissions('training:view')
  signTraining(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workforceService.signTraining(id, user.sub);
  }

}
