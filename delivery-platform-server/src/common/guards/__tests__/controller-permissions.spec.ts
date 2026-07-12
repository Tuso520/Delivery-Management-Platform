import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as ts from 'typescript';

import { getAllPermissionCodes } from '../../../../prisma/seed-data/permissions';
import { ArchiveTemplateVersionController } from '../../../modules/archive-template/archive-template-version.controller';
import { DashboardController } from '../../../modules/dashboard/dashboard.controller';
import { FileController } from '../../../modules/file/file.controller';
import { KnowledgeItemController } from '../../../modules/knowledge/knowledge-item.controller';
import { AuditLogController } from '../../../modules/operation-log/operation-log.controller';
import { ReviewTaskController } from '../../../modules/review/review-task.controller';
import {
  SystemConfigController,
  SystemSettingsController,
} from '../../../modules/system-config/system-config.controller';
import { ToolController } from '../../../modules/tool/tool.controller';
import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../../decorators/permissions.decorator';
import { PermissionsGuard } from '../permissions.guard';

const MODULES_ROOT = resolve(__dirname, '../../../modules');
const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);
const PERMISSION_DECORATORS = new Set(['RequirePermissions']);

interface RoutePermissionBoundary {
  key: string;
  hasPermission: boolean;
  isPublic: boolean;
}

function controllerFiles(directory = MODULES_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return controllerFiles(entryPath);
    }
    return entry.name.endsWith('.controller.ts') ? [entryPath] : [];
  });
}

function decoratorName(decorator: ts.Decorator): string | undefined {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  return ts.isIdentifier(expression) ? expression.text : undefined;
}

function routePermissionBoundaries(): RoutePermissionBoundary[] {
  return controllerFiles().flatMap((filePath) => {
    const sourceText = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const boundaries: RoutePermissionBoundary[] = [];
    const relativePath = relative(MODULES_ROOT, filePath).replace(/\\/g, '/');

    const visit = (node: ts.Node): void => {
      if (ts.isMethodDeclaration(node) && node.name) {
        const decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
        const names = decorators.map(decoratorName).filter((name): name is string => Boolean(name));

        if (names.some((name) => HTTP_DECORATORS.has(name))) {
          boundaries.push({
            key: `${relativePath}#${node.name.getText(sourceFile)}`,
            hasPermission: names.some((name) => PERMISSION_DECORATORS.has(name)),
            isPublic: names.includes('Public'),
          });
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return boundaries;
  });
}

function controllerPermissionCodes(): string[] {
  const codes = new Set<string>();
  for (const filePath of controllerFiles()) {
    const sourceFile = ts.createSourceFile(
      filePath,
      readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isDecorator(node) &&
        ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'RequirePermissions'
      ) {
        const collectStrings = (child: ts.Node): void => {
          if (ts.isStringLiteral(child)) codes.add(child.text);
          ts.forEachChild(child, collectStrings);
        };
        node.expression.arguments.forEach(collectStrings);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return [...codes].sort();
}

function permissions(controller: object, methodName: string): string[] | undefined {
  const method = controller[methodName as keyof typeof controller];
  const metadata = Reflect.getMetadata(PERMISSIONS_KEY, method as object) as
    | PermissionRequirement
    | string[]
    | undefined;
  return Array.isArray(metadata) ? metadata : (metadata?.any ?? metadata?.all);
}

function usesPermissionsGuard(controller: object): boolean {
  const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as
    | Array<new (...args: never[]) => unknown>
    | undefined;
  return guards?.includes(PermissionsGuard) ?? false;
}

describe('controller backend permission boundaries', () => {
  it('protects dashboard, knowledge and tools read endpoints', () => {
    expect(permissions(DashboardController.prototype, 'getProjectSummary')).toEqual([
      'dashboard:view',
    ]);
    expect(permissions(KnowledgeItemController.prototype, 'findAll')).toEqual(['knowledge:view']);
    expect(permissions(ToolController.prototype, 'findAllTools')).toEqual(['tools:view']);
  });

  it('allows every authenticated user to query only their service-filtered review data', () => {
    expect(permissions(ReviewTaskController.prototype, 'getSummary')).toBeUndefined();
    expect(permissions(ReviewTaskController.prototype, 'findAll')).toBeUndefined();
    expect(permissions(ReviewTaskController.prototype, 'findById')).toBeUndefined();
    expect(permissions(ReviewTaskController.prototype, 'getHistory')).toBeUndefined();
    expect(permissions(ReviewTaskController.prototype, 'approve')).toEqual(['file_review:act']);
    expect(permissions(ReviewTaskController.prototype, 'reject')).toEqual(['file_review:act']);
    expect(
      permissions(ArchiveTemplateVersionController.prototype, 'approveAssignedReviewStep'),
    ).toEqual(['file_review:act']);
    expect(permissions(FileController.prototype, 'findOne')).toEqual(
      expect.arrayContaining(['file_review:view', 'file_review:view_all', 'file_review:manage']),
    );
  });

  it('activates PermissionsGuard wherever permission metadata is used', () => {
    expect(usesPermissionsGuard(ToolController)).toBe(true);
    expect(usesPermissionsGuard(ReviewTaskController)).toBe(true);
    expect(usesPermissionsGuard(DashboardController)).toBe(true);
    expect(usesPermissionsGuard(SystemConfigController)).toBe(true);
    expect(usesPermissionsGuard(SystemSettingsController)).toBe(true);
    expect(usesPermissionsGuard(AuditLogController)).toBe(true);
  });

  it('does not combine permission checks with controller role allowlists', () => {
    const violations = controllerFiles().flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      const relativePath = relative(MODULES_ROOT, filePath).replace(/\\/g, '/');
      return [
        /@Roles\s*\(/.test(source) ? `${relativePath}:@Roles` : undefined,
        /\bRolesGuard\b/.test(source) ? `${relativePath}:RolesGuard` : undefined,
        /roles\.decorator/.test(source) ? `${relativePath}:roles.decorator` : undefined,
      ].filter((violation): violation is string => Boolean(violation));
    });

    expect(violations).toEqual([]);
  });

  it('references only active permission codes from the deployment seed', () => {
    const activeCodes = new Set(getAllPermissionCodes());
    expect(controllerPermissionCodes().filter((code) => !activeCodes.has(code))).toEqual([]);
  });

  it('keeps routes without permission metadata limited to documented boundaries', () => {
    const documentedBoundaries = routePermissionBoundaries()
      .filter(
        ({ key, hasPermission, isPublic }) =>
          !hasPermission && !isPublic && !key.startsWith('auth/auth.controller.ts#'),
      )
      .map(({ key }) => key)
      .sort();

    expect(documentedBoundaries).toEqual(
      [
        'notification/notification.controller.ts#findAll',
        'notification/notification.controller.ts#getUnreadCount',
        'notification/notification.controller.ts#markAllAsRead',
        'notification/notification.controller.ts#markAsRead',
        'platform/reference.controller.ts#findRoleOptions',
        'platform/reference.controller.ts#findUserOptions',
        'review/review-task.controller.ts#findAll',
        'review/review-task.controller.ts#findById',
        'review/review-task.controller.ts#getHistory',
        'review/review-task.controller.ts#getSummary',
      ].sort(),
    );
  });
});
