# Deployment Guide

## Deployment Model

The platform uses Git based deployment:

1. Push `main` to GitHub.
2. SSH into the server.
3. Run `deploy-git.sh`.
4. The server pulls the latest Git revision, backs up data, migrates safely and recreates containers.

## Production Command

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

## Server Data Protection

Before switching application containers, `deploy-git.sh` creates:

- `mysql.sql.gz`
- `minio.tar.gz`
- `env.snapshot`
- `git-revision.txt`
- `docker-compose.resolved.yml`
- `table-counts.before.tsv`
- `table-counts.after.tsv`

Backups are stored under:

```text
backups/git-deploy/YYYYMMDD_HHMMSS-<release-id>/
```

## Migration Rules

- Use `prisma migrate deploy`.
- Do not use destructive `prisma db push --accept-data-loss` in production.
- Any table/column deletion or unique constraint tightening must be reviewed and rehearsed before production.
- Seeds must be idempotent and must not truncate business data.

## Health Checks

```bash
curl -fsS http://127.0.0.1:8080/build-info.json
curl -fsS http://127.0.0.1:8080/api/v1/health
docker compose ps
```

`build-info.json.releaseId`, `RELEASE_ID` and `git rev-parse --short=12 HEAD` must match.

## Verified Production Release

On `2026-07-08`, release `1df2a618471e` was deployed and verified:

- Frontend: healthy.
- Backend: healthy.
- MySQL: healthy.
- Redis: healthy.
- MinIO: healthy.
- Backup path: `backups/git-deploy/20260708_161928-1df2a618471e`.
