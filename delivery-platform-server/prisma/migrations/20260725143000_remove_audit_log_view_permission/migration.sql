DELETE rp
FROM role_permissions rp
INNER JOIN permissions p ON p.id = rp.permission_id
WHERE p.permission_code = 'audit_log:view';

DELETE FROM permissions
WHERE permission_code = 'audit_log:view';
