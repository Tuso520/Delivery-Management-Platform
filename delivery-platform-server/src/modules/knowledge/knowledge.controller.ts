import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto';
import { CreateKnowledgeCategoryDto } from './dto/create-knowledge-category.dto';
import { QueryKnowledgeArticleDto } from './dto/query-knowledge-article.dto';
import { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto';
import { UpdateKnowledgeCategoryDto } from './dto/update-knowledge-category.dto';
import { KnowledgeService } from './knowledge.service';

const allowedKnowledgeFileExtensions = new Set([
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
  'md',
  'txt',
]);

@ApiTags('Knowledge')
@ApiBearerAuth('JWT-auth')
@Controller('knowledge')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  // ========== Category Endpoints ==========

  @Get('categories')
  @Permissions('knowledge:view')
  @ApiOperation({ summary: '获取知识分类树' })
  @ApiResponse({ status: 200, description: '分类树列表' })
  async findAllCategories() {
    return this.knowledgeService.findAllCategories();
  }

  @Post('categories')
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('knowledge:create')
  @ApiOperation({ summary: '创建知识分类' })
  @ApiBody({ type: CreateKnowledgeCategoryDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createCategory(@Body() dto: CreateKnowledgeCategoryDto) {
    return this.knowledgeService.createCategory(dto);
  }

  @Get('categories/:id')
  @Permissions('knowledge:view')
  @ApiOperation({ summary: '获取知识分类详情' })
  @ApiResponse({ status: 200, description: '分类详情' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async findCategory(@Param('id') id: string) {
    return this.knowledgeService.findCategoryById(id);
  }

  @Put('categories/:id')
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('knowledge:update')
  @ApiOperation({ summary: '更新知识分类' })
  @ApiBody({ type: UpdateKnowledgeCategoryDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeCategoryDto,
  ) {
    return this.knowledgeService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('knowledge:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除知识分类' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '分类不存在' })
  async removeCategory(@Param('id') id: string) {
    await this.knowledgeService.deleteCategory(id);
    return null;
  }

  // ========== Article Endpoints ==========

  @Get('articles')
  @Permissions('knowledge:view')
  @ApiOperation({ summary: '获取知识文章列表（分页+筛选）' })
  @ApiResponse({ status: 200, description: '文章列表' })
  async findAllArticles(@Query() query: QueryKnowledgeArticleDto) {
    return this.knowledgeService.findAllArticles(query);
  }

  @Post('articles')
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('knowledge:create')
  @ApiOperation({ summary: '创建知识文章' })
  @ApiBody({ type: CreateKnowledgeArticleDto })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createArticle(
    @Body() dto: CreateKnowledgeArticleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.knowledgeService.createArticle(dto, user.sub);
  }

  @Get('articles/:id')
  @Permissions('knowledge:view')
  @ApiOperation({ summary: '获取知识文章详情' })
  @ApiResponse({ status: 200, description: '文章详情' })
  @ApiResponse({ status: 404, description: '文章不存在' })
  async findArticle(@Param('id') id: string) {
    return this.knowledgeService.findArticleById(id);
  }

  @Put('articles/:id')
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('knowledge:update')
  @ApiOperation({ summary: '更新知识文章' })
  @ApiBody({ type: UpdateKnowledgeArticleDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '文章不存在' })
  async updateArticle(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeArticleDto,
  ) {
    return this.knowledgeService.updateArticle(id, dto);
  }

  @Delete('articles/:id')
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('knowledge:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除知识文章' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '文章不存在' })
  async removeArticle(@Param('id') id: string) {
    await this.knowledgeService.deleteArticle(id);
    return null;
  }

  @Post('articles/:id/publish')
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('knowledge:publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发布知识文章' })
  @ApiResponse({ status: 200, description: '发布成功' })
  @ApiResponse({ status: 400, description: '文章已发布' })
  @ApiResponse({ status: 404, description: '文章不存在' })
  async publishArticle(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.knowledgeService.publishArticle(id, user.sub);
  }

  @Get('articles/:id/versions')
  @Permissions('knowledge:view')
  @ApiOperation({ summary: '获取知识文章版本记录' })
  async findVersions(@Param('id') id: string) {
    return this.knowledgeService.findVersions(id);
  }

  @Post('articles/:articleId/files/:attachmentId/revisions')
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('knowledge:update')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FilesInterceptor('files', 1, {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
        if (!allowedKnowledgeFileExtensions.has(extension)) {
          callback(
            new BadRequestException(`不支持的知识库文件类型: .${extension}`),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '提交知识库文件更新审批' })
  async submitFileRevision(
    @Param('articleId') articleId: string,
    @Param('attachmentId') attachmentId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
  ) {
    const file = files?.[0];
    if (!file) {
      throw new BadRequestException('请至少选择一个更新文件');
    }
    return this.knowledgeService.submitFileRevision(
      articleId,
      attachmentId,
      file,
      user.sub,
    );
  }

  @Get('file-revisions/:id/diff')
  @Permissions('knowledge:view')
  @ApiOperation({ summary: '查看知识库文件更新差异' })
  async findFileRevisionDiff(@Param('id') id: string) {
    return this.knowledgeService.findFileRevisionDiff(id);
  }

  @Post('articles/:id/deprecate')
  @Roles('DELIVERY_MANAGER', 'STANDARD_ADMIN')
  @Permissions('knowledge:publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '废弃知识文章' })
  @ApiResponse({ status: 200, description: '废弃成功' })
  @ApiResponse({ status: 400, description: '文章已废弃' })
  @ApiResponse({ status: 404, description: '文章不存在' })
  async deprecateArticle(@Param('id') id: string) {
    return this.knowledgeService.deprecateArticle(id);
  }
}
