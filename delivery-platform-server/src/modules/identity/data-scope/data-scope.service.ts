import { Injectable, NotFoundException } from '@nestjs/common';
import { DataScopeType, Prisma } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';

interface ScopeConfig {
  countryCodes?: string[];
  projectIds?: string[];
}

@Injectable()
export class DataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async buildProjectWhere(userId: string): Promise<Prisma.ProjectWhereInput> {
    const assignments = await this.prisma.userRole.findMany({
      where: { userId, role: { status: 'Active' } },
      select: { dataScope: true, scopeConfig: true },
    });

    if (assignments.some(({ dataScope }) => dataScope === DataScopeType.ALL)) {
      return { deletedAt: null };
    }

    const clauses: Prisma.ProjectWhereInput[] = [];
    const scopes = new Set(assignments.map(({ dataScope }) => dataScope));

    if (scopes.has(DataScopeType.PARTICIPATED)) {
      clauses.push({ members: { some: { userId, deletedAt: null } } });
    }

    if (scopes.has(DataScopeType.DEPARTMENT)) {
      const departmentId = await this.findUserDepartmentId(userId);
      clauses.push(
        departmentId
          ? { members: { some: { deletedAt: null, user: { departmentId } } } }
          : { members: { some: { userId, deletedAt: null } } },
      );
    }

    if (scopes.has(DataScopeType.OWNED)) {
      clauses.push({
        OR: [
          { createdBy: userId },
          { salesOwnerId: userId },
          { projectManagerId: userId },
          { electricalOwnerId: userId },
          { softwareOwnerId: userId },
        ],
      });
    }

    if (scopes.has(DataScopeType.COUNTRY)) {
      const configuredCountries = assignments
        .filter(({ dataScope }) => dataScope === DataScopeType.COUNTRY)
        .flatMap(
          ({ scopeConfig }) =>
            this.parseScopeConfig(scopeConfig).countryCodes ?? [],
        );
      const countryCodes =
        configuredCountries.length > 0
          ? configuredCountries
          : await this.findParticipatedCountryCodes(userId);
      clauses.push({ countryCode: { in: [...new Set(countryCodes)] } });
    }

    if (scopes.has(DataScopeType.CUSTOM)) {
      const customProjectIds = assignments
        .filter(({ dataScope }) => dataScope === DataScopeType.CUSTOM)
        .flatMap(
          ({ scopeConfig }) =>
            this.parseScopeConfig(scopeConfig).projectIds ?? [],
        );
      clauses.push({ id: { in: [...new Set(customProjectIds)] } });
    }

    return {
      deletedAt: null,
      OR: clauses.length > 0 ? clauses : [{ id: { in: [] } }],
    };
  }

  async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const scope = await this.buildProjectWhere(userId);
    const project = await this.prisma.project.findFirst({
      where: { ...scope, id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
  }

  private async findParticipatedCountryCodes(
    userId: string,
  ): Promise<string[]> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId, deletedAt: null, project: { deletedAt: null } },
      select: { project: { select: { countryCode: true } } },
    });
    return memberships.map(({ project }) => project.countryCode);
  }

  private async findUserDepartmentId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'Active' },
      select: { departmentId: true },
    });
    return user?.departmentId ?? null;
  }

  private parseScopeConfig(value: Prisma.JsonValue | null): ScopeConfig {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const candidate = value as Prisma.JsonObject;
    return {
      countryCodes: this.toStringArray(candidate.countryCodes),
      projectIds: this.toStringArray(candidate.projectIds),
    };
  }

  private toStringArray(value: Prisma.JsonValue | undefined): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
