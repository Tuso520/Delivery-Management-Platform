import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { ApiPaginatedResponse } from '../../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { resolveRequestTraceId } from '../../common/utils/request-trace.util';

import {
  CreateProjectPaymentDto,
  QueryProjectPaymentDto,
  UpdateProjectPaymentDto,
} from './dto/project-payment.dto';
import { ProjectPaymentService } from './project-payment.service';

@ApiTags('Project Payments')
@ApiBearerAuth('JWT-auth')
@Controller('project-payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectPaymentController {
  constructor(private readonly service: ProjectPaymentService) {}

  @Get()
  @RequirePermissions({ all: ['payment:view'] })
  @ApiOperation({ summary: '分页查询项目回款计划与到账情况' })
  @ApiPaginatedResponse('项目回款分页结果')
  findAll(
    @Query() query: QueryProjectPaymentDto,
    @CurrentUser('sub') userId: string,
    @Req() request: Request,
  ) {
    return this.service.findAll(query, userId, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
      traceId: resolveRequestTraceId(request),
    });
  }

  @Post()
  @RequirePermissions({ all: ['payment:operate'] })
  create(@Body() dto: CreateProjectPaymentDto, @CurrentUser('sub') userId: string) {
    return this.service.create(dto, userId);
  }

  @Put(':id')
  @RequirePermissions({ all: ['payment:operate'] })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectPaymentDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions({ all: ['payment:operate'] })
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @CurrentUser('sub') userId: string): Promise<null> {
    await this.service.remove(id, userId);
    return null;
  }
}
