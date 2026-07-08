# Security Guide

## Secrets

Never commit:

- `.env`
- JWT secrets
- database credentials
- MinIO credentials
- SSH credentials
- GitHub tokens
- production backup archives

## Data Protection

- Production deployment must back up MySQL and MinIO before migration.
- File upload review must not overwrite the current approved file before approval.
- Rejected uploads must remain non-current.
- Approved uploads must deactivate previous current versions.

## Access Control

- UI menus and buttons should follow permission codes.
- Backend routes must enforce auth and permission checks.
- Project data should be limited by project membership unless the role is elevated.
- Knowledge and template management should be limited to standard administrators or elevated roles.

## File Preview Safety

- Online preview is read-only.
- Preview links should be signed or authenticated.
- Unsupported files should fall back to download rather than attempting unsafe execution.
- Browser preview should not expose storage credentials.

## Operational Safety

- Do not remove Docker named volumes manually.
- Do not restore database backups unless the maintenance window and target backup are explicitly confirmed.
- Keep `.env` only on the server.
