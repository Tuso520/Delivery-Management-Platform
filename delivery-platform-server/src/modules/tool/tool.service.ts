import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

import type {
  CreateToolDefinitionDto,
  QueryToolsDto,
  ToolType,
  UpdateToolDefinitionDto,
} from './dto/tool.dto';

const ACTIVE_STATUS = 'Active';
const INACTIVE_STATUS = 'Inactive';

const toolInclude = {
  category: {
    select: {
      id: true,
      name: true,
      sortOrder: true,
      status: true,
    },
  },
} satisfies Prisma.ToolItemInclude;

type ToolRecord = Prisma.ToolItemGetPayload<{ include: typeof toolInclude }>;

export interface ToolDefinition {
  id: string;
  name: string;
  category: string;
  description: string | null;
  toolType: ToolType;
  routeOrUrl: string | null;
  enabled: boolean;
  sortOrder: number;
  configuration: Prisma.JsonObject | null;
}

@Injectable()
export class ToolService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryToolsDto, actor: JwtPayload): Promise<ToolDefinition[]> {
    const includeDisabled = query.includeDisabled === true;
    if (includeDisabled && !this.canManage(actor)) {
      throw new ForbiddenException('没有查看停用工具的权限');
    }

    const category = query.category?.trim();
    const tools = await this.prisma.toolItem.findMany({
      where: {
        ...(includeDisabled ? {} : { status: ACTIVE_STATUS }),
        category: {
          ...(includeDisabled ? {} : { status: ACTIVE_STATUS }),
          ...(category ? { name: category } : {}),
        },
      },
      include: toolInclude,
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    return tools.map((tool) => this.toDefinition(tool));
  }

  async create(dto: CreateToolDefinitionDto): Promise<ToolDefinition> {
    const name = this.requiredTrimmed(dto.name, '工具名称不能为空');
    const categoryName = this.requiredTrimmed(dto.category, '工具分类不能为空');
    const routeOrUrl = this.optionalTrimmed(dto.routeOrUrl);
    this.assertRoute(dto.toolType, routeOrUrl);

    return this.prisma.$transaction(async (transaction) => {
      const category = await this.ensureCategory(transaction, categoryName);
      const tool = await transaction.toolItem.create({
        data: {
          categoryId: category.id,
          name,
          description: this.optionalTrimmed(dto.description),
          toolType: dto.toolType.toLowerCase(),
          url: routeOrUrl,
          sortOrder: dto.sortOrder ?? 0,
          status: ACTIVE_STATUS,
          configuration: dto.configuration as Prisma.InputJsonValue | undefined,
        },
        include: toolInclude,
      });

      return this.toDefinition(tool);
    });
  }

  async update(id: string, dto: UpdateToolDefinitionDto): Promise<ToolDefinition> {
    const existing = await this.prisma.toolItem.findUnique({
      where: { id },
      include: toolInclude,
    });
    if (!existing) {
      throw new NotFoundException('工具不存在');
    }

    const toolType = dto.toolType ?? this.toToolType(existing.toolType);
    const routeOrUrl =
      dto.routeOrUrl === undefined ? existing.url : this.optionalTrimmed(dto.routeOrUrl);
    this.assertRoute(toolType, routeOrUrl);

    return this.prisma.$transaction(async (transaction) => {
      const category = dto.category
        ? await this.ensureCategory(
            transaction,
            this.requiredTrimmed(dto.category, '工具分类不能为空'),
          )
        : existing.category;
      const tool = await transaction.toolItem.update({
        where: { id },
        data: {
          categoryId: category.id,
          name:
            dto.name === undefined ? undefined : this.requiredTrimmed(dto.name, '工具名称不能为空'),
          description:
            dto.description === undefined ? undefined : this.optionalTrimmed(dto.description),
          toolType: dto.toolType?.toLowerCase(),
          url: dto.routeOrUrl === undefined ? undefined : routeOrUrl,
          sortOrder: dto.sortOrder,
          configuration:
            dto.configuration === undefined
              ? undefined
              : (dto.configuration as Prisma.InputJsonValue),
        },
        include: toolInclude,
      });

      return this.toDefinition(tool);
    });
  }

  async setEnabled(id: string, enabled: boolean): Promise<ToolDefinition> {
    const existing = await this.prisma.toolItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('工具不存在');
    }

    const tool = await this.prisma.toolItem.update({
      where: { id },
      data: { status: enabled ? ACTIVE_STATUS : INACTIVE_STATUS },
      include: toolInclude,
    });
    return this.toDefinition(tool);
  }

  private async ensureCategory(
    transaction: Prisma.TransactionClient,
    name: string,
  ): Promise<{ id: string; name: string; sortOrder: number; status: string }> {
    const existing = await transaction.toolCategory.findFirst({
      where: { name },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, sortOrder: true, status: true },
    });
    if (!existing) {
      return transaction.toolCategory.create({
        data: { name, status: ACTIVE_STATUS },
        select: { id: true, name: true, sortOrder: true, status: true },
      });
    }
    if (existing.status === ACTIVE_STATUS) return existing;

    return transaction.toolCategory.update({
      where: { id: existing.id },
      data: { status: ACTIVE_STATUS },
      select: { id: true, name: true, sortOrder: true, status: true },
    });
  }

  private toDefinition(tool: ToolRecord): ToolDefinition {
    return {
      id: tool.id,
      name: tool.name,
      category: tool.category.name,
      description: tool.description,
      toolType: this.toToolType(tool.toolType),
      routeOrUrl: tool.url,
      enabled: tool.status === ACTIVE_STATUS,
      sortOrder: tool.sortOrder,
      configuration: this.toConfiguration(tool.configuration),
    };
  }

  private toToolType(value: string): ToolType {
    return value.toLowerCase() === 'external' ? 'EXTERNAL' : 'INTERNAL';
  }

  private toConfiguration(value: Prisma.JsonValue | null): Prisma.JsonObject | null {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }
    return value;
  }

  private assertRoute(toolType: ToolType, routeOrUrl: string | null): void {
    if (toolType === 'EXTERNAL') {
      if (!routeOrUrl) {
        throw new BadRequestException('外部工具必须配置访问地址');
      }
      try {
        const parsed = new URL(routeOrUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new BadRequestException('外部工具仅支持 HTTP(S) 地址');
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('外部工具访问地址无效');
      }
      return;
    }

    if (routeOrUrl && !routeOrUrl.startsWith('/')) {
      throw new BadRequestException('内部工具入口必须是站内绝对路由');
    }
  }

  private canManage(actor: JwtPayload): boolean {
    return actor.roles.includes('SUPER_ADMIN') || actor.permissions.includes('tools:manage');
  }

  private requiredTrimmed(value: string, message: string): string {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }

  private optionalTrimmed(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
