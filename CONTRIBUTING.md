# Contributing

## Development Flow

1. Read the affected product, architecture and development docs under `docs/`.
2. Keep changes scoped to the requested module.
3. Use Arco Design Vue for frontend UI unless a module has a documented exception.
4. Update docs when behavior, deployment, data model, permissions or user workflows change.
5. Run the relevant validation before committing.

## Local Validation

```powershell
pnpm --filter ./delivery-platform-server type-check
pnpm --dir delivery-platform-web build
```

For browser-facing changes, run the app or local mock server and capture actual screenshots for the changed workflow.

## Commit Rules

- Do not commit `.env`, backups, release bundles, browser screenshots or generated artifacts.
- Do not commit production secrets, server passwords, tokens or private deployment logs.
- Keep commit messages concise and behavior-oriented.

## Pull Request Checklist

- Product behavior documented when needed.
- API/data model/permission changes documented when needed.
- Type check and build pass.
- Browser workflow verified for user-facing UI.
- Deployment or migration risk called out clearly.
