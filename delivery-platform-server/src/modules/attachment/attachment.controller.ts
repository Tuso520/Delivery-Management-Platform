import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { AttachmentService } from './attachment.service';
import {
  QueryAttachmentDto,
  UploadAttachmentDto,
} from './dto/attachment.dto';

const allowedExtensions = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'mp4',
  'mov',
  'webm',
  'md',
]);

@ApiTags('Attachments')
@ApiBearerAuth('JWT-auth')
@Controller('attachments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post()
  @Permissions('attachment:upload')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
        if (!allowedExtensions.has(extension)) {
          callback(
            new BadRequestException(`不支持的文件类型: .${extension}`),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传一个或多个通用附件' })
  async upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadAttachmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachmentService.uploadMany(files ?? [], dto, user.sub);
  }

  @Get()
  @Permissions('attachment:view')
  @ApiOperation({ summary: '分页查询附件' })
  async findAll(
    @Query() query: QueryAttachmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachmentService.findAll(query, user.sub);
  }

  @Get(':id/content')
  @Permissions('attachment:download')
  @RawResponse()
  @ApiOperation({ summary: '通过鉴权接口预览或下载私有附件' })
  async getContent(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.attachmentService.getContent(id, user.sub, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    );
    return new StreamableFile(content.stream);
  }

  @Get(':id/preview')
  @Permissions('attachment:download')
  @ApiOperation({ summary: '获取私有附件在线预览内容' })
  async getPreview(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.attachmentService.getPreview(id, user.sub, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Delete(':id')
  @Permissions('attachment:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '软删除附件' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<null> {
    await this.attachmentService.softDelete(id, user.sub);
    return null;
  }
}
