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

import { CreateReportDto } from './dto/create-report.dto';
import { QueryReportDto } from './dto/query-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportService } from './report.service';

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @Permissions('report:create')
  @ApiOperation({ summary: '创建报告' })
  async create(@Body() dto: CreateReportDto, @CurrentUser() user: JwtPayload) {
    return this.reportService.create(dto, user.sub);
  }

  @Get()
  @Permissions('report:view')
  @ApiOperation({ summary: '报告列表（分页+过滤）' })
  async findAll(
    @Query() query: QueryReportDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportService.findAll(query, userId);
  }

  @Get('my-reports')
  @Permissions('report:view')
  @ApiOperation({ summary: '获取当前用户的报告' })
  async getMyReports(@Query() query: QueryReportDto, @CurrentUser() user: JwtPayload) {
    return this.reportService.getMyReports(query, user.sub);
  }

  @Get('summary/project/:projectId')
  @Permissions('report:view')
  @ApiOperation({ summary: '项目进度汇总（最近4周）' })
  async getProjectSummary(
    @Param('projectId') projectId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportService.getProjectSummary(projectId, userId);
  }

  @Get(':id')
  @Permissions('report:view')
  @ApiOperation({ summary: '报告详情' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reportService.findById(id, userId);
  }

  @Put(':id')
  @Permissions('report:update')
  @ApiOperation({ summary: '更新报告' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reportService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @Permissions('report:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除报告' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.reportService.softDelete(id, user.sub);
    return null;
  }

  @Post(':id/submit')
  @Permissions('report:submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交报告（草稿→已提交）' })
  async submit(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reportService.submit(id, user.sub);
  }

  @Post(':id/review')
  @Permissions('report:review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '审核报告（已提交→已审核）' })
  async review(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.reportService.review(id, user.sub);
  }
}
