import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { getAllPermissionCodes } from '../../../../prisma/seed-data/permissions';
import { roleDefs } from '../../../../prisma/seed-data/roles';

describe('role seed permission matrix', () => {
  const roles = new Map(roleDefs.map((role) => [role.roleCode, new Set(role.permissionCodes)]));

  it('only references registered permission codes', () => {
    const registered = new Set(getAllPermissionCodes());
    for (const role of roleDefs) {
      for (const permission of role.permissionCodes) {
        expect(registered.has(permission)).toBe(true);
      }
    }
  });

  it('allows standard administrators to manage unified standards and knowledge', () => {
    const permissions = roles.get('STANDARD_ADMIN');
    expect(permissions).toEqual(expect.any(Set));
    expect(permissions?.has('standard:create')).toBe(true);
    expect(permissions?.has('standard:update_draft')).toBe(true);
    expect(permissions?.has('standard:submit_review')).toBe(true);
    expect(permissions?.has('standard:publish')).toBe(true);
    expect(permissions?.has('standard:archive')).toBe(true);
    expect(permissions?.has('knowledge:publish')).toBe(true);
    expect(permissions?.has('knowledge:update_draft')).toBe(true);
    expect(permissions?.has('knowledge:submit_review')).toBe(true);
    expect(permissions?.has('knowledge:archive')).toBe(true);
    expect(permissions?.has('tools:view')).toBe(true);
    expect(permissions?.has('tools:manage')).toBe(true);
    expect(permissions?.has('attachment:view')).toBe(false);
    expect(permissions?.has('tools:manage')).toBe(true);
    expect(permissions?.has('approval_config:view')).toBe(true);
  });

  it('does not seed retired or duplicate-domain permissions', () => {
    const registered = getAllPermissionCodes();
    expect(new Set(registered).size).toBe(registered.length);
    expect(
      registered.filter(
        (code) =>
          code.startsWith('workflow:') ||
          code.startsWith('template:') ||
          code.startsWith('country:') ||
          code.startsWith('language:') ||
          code.startsWith('report:') ||
          code.startsWith('okr:') ||
          code.startsWith('skill:') ||
          code.startsWith('training:') ||
          code.startsWith('retrospective:') ||
          code.startsWith('process_record:') ||
          code.startsWith('checklist:') ||
          [
            'currency:create',
            'currency:update',
            'currency:delete',
            'approval:view',
            'approval:manage',
            'system:view_log',
            'system:manage_config',
            'system:manage_backup',
            'system:view_storage',
          ].includes(code),
      ),
    ).toEqual([]);
  });

  it('keeps compatibility filters and retired permission sources out of seed declarations', () => {
    const seedRoot = path.resolve(__dirname, '../../../../prisma/seed-data');
    const permissionSource = readFileSync(path.join(seedRoot, 'permissions.ts'), 'utf8');
    const roleSource = readFileSync(path.join(seedRoot, 'roles.ts'), 'utf8');

    expect(permissionSource).not.toMatch(
      /retiredPermission|activePermissionDefs|isActivePermissionCode/,
    );
    expect(roleSource).not.toMatch(/expandPermissionCodes/);
    expect(roleSource).not.toMatch(
      /'(?:attachment:[^']+|todo:view|file:view|file:upload|file:delete|file:set_current|archive:review|archive:delete|archive:update|archive:view_statistics|archive:mark_not_applicable|project:view_cost)'/,
    );
  });

  it('allows project managers to use target project and review capabilities', () => {
    const permissions = roles.get('PROJECT_MANAGER');
    expect(permissions?.has('project:update')).toBe(true);
    expect(permissions?.has('project:archive')).toBe(true);
    expect(permissions?.has('file_review:view')).toBe(true);
    expect(permissions?.has('file_review:act')).toBe(true);
    expect(Array.from(permissions ?? []).some((code) => code.startsWith('checklist:'))).toBe(false);
  });

  it('gives system administrators only target settings permissions', () => {
    const permissions = roles.get('SYSTEM_ADMIN');
    expect(permissions?.has('settings:view')).toBe(true);
    expect(permissions?.has('audit_log:view')).toBe(true);
    expect(permissions?.has('system_setting:manage')).toBe(true);
    expect(permissions?.has('approval_config:manage')).toBe(true);
    expect(permissions?.has('integration:manage')).toBe(true);
  });
});
