import { getAllPermissionCodes } from '../../../../prisma/seed-data/permissions';
import { roleDefs } from '../../../../prisma/seed-data/roles';

describe('role seed permission matrix', () => {
  const roles = new Map(
    roleDefs.map((role) => [role.roleCode, new Set(role.permissionCodes)]),
  );

  it('only references registered permission codes', () => {
    const registered = new Set(getAllPermissionCodes());
    for (const role of roleDefs) {
      for (const permission of role.permissionCodes) {
        expect(registered.has(permission)).toBe(true);
      }
    }
  });

  it('allows standard administrators to manage private knowledge and template attachments', () => {
    const permissions = roles.get('STANDARD_ADMIN');
    expect(permissions).toEqual(expect.any(Set));
    expect(permissions?.has('template:create')).toBe(true);
    expect(permissions?.has('knowledge:publish')).toBe(true);
    expect(permissions?.has('attachment:view')).toBe(true);
    expect(permissions?.has('attachment:upload')).toBe(true);
    expect(permissions?.has('attachment:delete')).toBe(true);
    expect(permissions?.has('approval:view')).toBe(true);
  });

  it('allows project managers to process project workflows and performance', () => {
    const permissions = roles.get('PROJECT_MANAGER');
    expect(permissions?.has('checklist:review')).toBe(true);
    expect(permissions?.has('retrospective:manage')).toBe(true);
    expect(permissions?.has('approval:view')).toBe(true);
    expect(permissions?.has('okr:score')).toBe(true);
  });
});
