import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewService } from './review.service';

@ApiTags('Reviews')
@ApiBearerAuth('JWT-auth')
@Controller('reviews')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get('pending')
  @Permissions('file:review')
  @ApiOperation({ summary: '获取当前用户待审核列表' })
  @ApiResponse({ status: 200, description: '待审核列表' })
  async findPending(@CurrentUser() user: JwtPayload) {
    return this.reviewService.findPending(user.sub);
  }
}

@ApiTags('File Reviews')
@ApiBearerAuth('JWT-auth')
@Controller('files')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FileReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post(':fileId/review')
  @Permissions('file:review')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '发起文件审核' })
  @ApiBody({ type: CreateReviewDto })
  @ApiResponse({ status: 201, description: '审核已发起' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async createReview(
    @Param('fileId') fileId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reviewService.createReview(fileId, dto, user.sub);
  }

  @Get(':fileId/reviews')
  @Permissions('file:view')
  @ApiOperation({ summary: '获取文件的审核历史' })
  @ApiResponse({ status: 200, description: '审核历史列表' })
  async getFileReviews(
    @Param('fileId') fileId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reviewService.findByFile(fileId, userId);
  }

  @Post(':fileId/review/approve')
  @Permissions('file:review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '审核通过' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        comment: { type: 'string', description: '审核意见' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '审核通过' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async approve(
    @Param('fileId') fileId: string,
    @Body('comment') comment: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.reviewService.approve(fileId, comment, user.sub);
    return null;
  }

  @Post(':fileId/review/reject')
  @Permissions('file:review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '审核驳回' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        comment: { type: 'string', description: '驳回意见' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '已驳回' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async reject(
    @Param('fileId') fileId: string,
    @Body('comment') comment: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.reviewService.reject(fileId, comment, user.sub);
    return null;
  }
}
