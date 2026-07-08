# Development Guide

## Prerequisites

- Node.js 20.
- pnpm.
- Docker Desktop or Docker Engine for container tests.

## Install

```powershell
pnpm install
```

## Local Mock Server

```powershell
node scripts/local-test-server.mjs
```

Default URL:

- `http://127.0.0.1:18080`

Default mock account:

- `admin / Admin@123456`

## Frontend

```powershell
pnpm --dir delivery-platform-web build
```

Frontend conventions:

- Use Arco Design Vue components.
- Keep controls compact and work-focused.
- Prefer square or low-radius operational surfaces.
- Keep filters simple and in one row when possible.
- Validate real browser screenshots for layout-heavy changes.
- Follow [UI/UX and Arco Design](ui-ux.md).

## Backend

```powershell
pnpm --filter ./delivery-platform-server type-check
```

Backend conventions:

- Keep Prisma migrations guarded and explicit.
- Seed scripts must be idempotent.
- Do not clear business tables from seeds.
- Preserve existing approved file versions when new uploads enter review.
- Keep file preview logic centralized in attachment/file preview services.

## Documentation Updates

Update `docs/` when changing:

- Product behavior.
- Permission rules.
- API contracts.
- Data model or migration behavior.
- Deployment flow.
- Browser-tested workflows.
