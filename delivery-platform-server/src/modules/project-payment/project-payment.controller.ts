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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

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
  @Permissions('payment:view')
  @ApiOperation({ summary: '分页查询项目回款计划与到账情况' })
  findAll(
    @Query() query: QueryProjectPaymentDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.findAll(query, userId);
  }

  @Post()
  @Permissions('payment:operate')
  create(
    @Body() dto: CreateProjectPaymentDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Put(':id')
  @Permissions('payment:operate')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectPaymentDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @Permissions('payment:operate')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ): Promise<null> {
    await this.service.remove(id, userId);
    return null;
  }
}
