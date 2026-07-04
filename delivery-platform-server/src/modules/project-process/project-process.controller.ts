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
  CreateProjectProcessDto,
  QueryProjectProcessDto,
  UpdateProjectProcessDto,
} from './dto/project-process.dto';
import { ProjectProcessService } from './project-process.service';

@ApiTags('Project Process Records')
@ApiBearerAuth('JWT-auth')
@Controller('process-records')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectProcessController {
  constructor(private readonly service: ProjectProcessService) {}

  @Get()
  @Permissions('process_record:view')
  @ApiOperation({ summary: '分页查询项目过程记录' })
  findAll(
    @Query() query: QueryProjectProcessDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.findAll(query, userId);
  }

  @Get(':id')
  @Permissions('process_record:view')
  findOne(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.findById(id, userId);
  }

  @Post()
  @Permissions('process_record:upload')
  create(
    @Body() dto: CreateProjectProcessDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Put(':id')
  @Permissions('process_record:operate')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectProcessDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @Permissions('process_record:operate')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
  ): Promise<null> {
    await this.service.remove(id, userId);
    return null;
  }
}
