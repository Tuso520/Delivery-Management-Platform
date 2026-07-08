# Security Policy

## Supported Scope

Security fixes are expected for the current `main` branch.

## Sensitive Data

Do not commit:

- `.env` files or production environment values.
- GitHub tokens, SSH passwords, database passwords or JWT secrets.
- Production backups, MinIO archives or database dumps.
- Browser screenshots that expose private customer data.
- Local generated release packages.

## Deployment Safety

Production updates must use `deploy-git.sh` or an equivalent audited flow that:

- Creates a MySQL backup before migration.
- Creates a MinIO backup before switching containers.
- Preserves server-only `.env`.
- Uses `prisma migrate deploy`, not destructive schema push.
- Keeps seed scripts idempotent.

## Reporting

For internal use, report security issues to the delivery platform maintainer and include:

- Affected module.
- Reproduction steps.
- Expected and actual behavior.
- Impact assessment.
- Suggested mitigation if available.
