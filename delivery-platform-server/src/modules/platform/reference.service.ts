import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ReviewerEligibilityService } from '../review/reviewer-eligibility.service';

import {
  CreateDepartmentDto,
  CreateDictionaryCategoryDto,
  UpdateDepartmentDto,
  UpsertDictionaryItemDto,
} from './dto/platform.dto';
import type {
  RoleReferencePurpose,
  UserReferencePurpose,
} from './dto/reference.dto';

export interface UserReferenceOption {
  id: string;
  name: string;
  displayName: string;
  departmentName: string | null;
  active: boolean;
}

const PURPOSE_ROLE_CODES: Partial<Record<UserReferencePurpose, string[]>> = {
  'project-manager': ['PROJECT_MANAGER'],
  'sales-owner': ['DELIVERY_MANAGER', 'COUNTRY_MANAGER'],
};

interface DepartmentTreeNode {
  id: string;
  departmentCode: string;
  departmentName: string;
  parentId: string | null;
  managerId: string | null;
  status: string;
  sortOrder: number;
  manager: { id: string; realName: string } | null;
  userCount: number;
  children: DepartmentTreeNode[];
}

@Injectable()
export class ReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewerEligibility: ReviewerEligibilityService,
  ) {}

  async findDictionaries() {
    return this.prisma.dictionaryCategory.findMany({
      include: {
        items: {
          where: { status: 'Active' },
          orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { categoryName: 'asc' }],
    });
  }

  async findDictionaryByCode(code: string) {
    const category = await this.prisma.dictionaryCategory.findUnique({
      where: { categoryCode: code },
      include: {
        items: {
          where: { status: 'Active' },
          orderBy: [{ sortOrder: 'asc' }, { itemLabel: 'asc' }],
        },
      },
    });
    if (!category) {
      throw new NotFoundException('字典分类不存在');
    }
    return category;
  }

  async findRoleOptions(_purpose: RoleReferencePurpose) {
    return this.prisma.role.findMany({
      where: { status: 'Active' },
      select: { id: true, roleCode: true, roleName: true },
      orderBy: { roleName: 'asc' },
    });
  }

  async findUserOptions(
    purpose: UserReferencePurpose,
    projectId?: string,
  ): Promise<UserReferenceOption[]> {
    if (purpose === 'file-reviewer') {
      const reviewers = await this.reviewerEligibility.findEligibleReviewers(projectId);
      return reviewers.map((user) => ({
        id: user.id,
        name: user.username,
        displayName: user.realName,
        departmentName: user.departmentName,
        active: true,
      }));
    }

    const roleCodes = PURPOSE_ROLE_CODES[purpose];
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'Active',
        ...(roleCodes && {
          userRoles: {
            some: {
              role: {
                status: 'Active',
                roleCode: { in: roleCodes },
              },
            },
          },
        }),
      },
      select: {
        id: true,
        username: true,
        realName: true,
        department: { select: { departmentName: true } },
      },
      orderBy: [{ realName: 'asc' }, { username: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      name: user.username,
      displayName: user.realName,
      departmentName: user.department?.departmentName ?? null,
      active: true,
    }));
  }

  async createDictionaryCategory(dto: CreateDictionaryCategoryDto) {
    const existing = await this.prisma.dictionaryCategory.findUnique({
      where: { categoryCode: dto.categoryCode },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('字典分类编码已存在');
    }
    return this.prisma.dictionaryCategory.create({ data: dto });
  }

  async upsertDictionaryItem(
    categoryId: string,
    dto: UpsertDictionaryItemDto,
  ) {
    const category = await this.prisma.dictionaryCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('字典分类不存在');
    }
    return this.prisma.dictionaryItem.upsert({
      where: {
        categoryId_itemValue: {
          categoryId,
          itemValue: dto.itemValue,
        },
      },
      create: {
        categoryId,
        itemValue: dto.itemValue,
        itemLabel: dto.itemLabel,
        extraData: dto.extraData as Prisma.InputJsonValue | undefined,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? 'Active',
      },
      update: {
        itemLabel: dto.itemLabel,
        extraData: dto.extraData as Prisma.InputJsonValue | undefined,
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
    });
  }

  async findDepartmentTree(): Promise<DepartmentTreeNode[]> {
    const departments = await this.prisma.department.findMany({
      include: {
        manager: { select: { id: true, realName: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { departmentName: 'asc' }],
    });
    const nodes = new Map<string, DepartmentTreeNode>();
    for (const department of departments) {
      nodes.set(department.id, {
        id: department.id,
        departmentCode: department.departmentCode,
        departmentName: department.departmentName,
        parentId: department.parentId,
        managerId: department.managerId,
        status: department.status,
        sortOrder: department.sortOrder,
        manager: department.manager,
        userCount: department._count.users,
        children: [],
      });
    }
    const roots: DepartmentTreeNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async createDepartment(dto: CreateDepartmentDto) {
    if (dto.parentId) {
      await this.assertDepartment(dto.parentId);
    }
    return this.prisma.department.create({
      data: {
        departmentCode: dto.departmentCode,
        departmentName: dto.departmentName,
        parentId: dto.parentId,
        managerId: dto.managerId,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    await this.assertDepartment(id);
    if (dto.parentId === id) {
      throw new BadRequestException('部门不能将自身设为上级部门');
    }
    if (dto.parentId) {
      await this.assertDepartment(dto.parentId);
    }
    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async deactivateDepartment(id: string): Promise<void> {
    await this.assertDepartment(id);
    const childCount = await this.prisma.department.count({
      where: { parentId: id, status: 'Active' },
    });
    if (childCount > 0) {
      throw new BadRequestException('请先停用下级部门');
    }
    await this.prisma.department.update({
      where: { id },
      data: { status: 'Inactive' },
    });
  }

  private async assertDepartment(id: string): Promise<void> {
    const department = await this.prisma.department.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('部门不存在');
    }
  }
}
