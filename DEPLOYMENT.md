# Deployment Quick Entry

The full deployment guide is maintained in [docs/deployment.md](docs/deployment.md).

## Production Update

```bash
cd /www/wwwroot/delivery-platform
BRANCH=main bash deploy-git.sh deploy
```

The Git deployment script:

1. Fetches the target branch, tag or commit.
2. Writes `RELEASE_ID` and `RELEASE_MANIFEST.txt`.
3. Validates `.env`, Docker Compose, Dockerfiles and Prisma migration guards.
4. Builds backend, backend-migrate and frontend images.
5. Starts MySQL, Redis and MinIO.
6. Stops backend/frontend before migration.
7. Backs up MySQL, MinIO and `.env`.
8. Runs guarded Prisma migration and idempotent seed data.
9. Recreates backend/frontend.
10. Verifies backend health, frontend health and release id.

## Health Checks

```bash
curl -fsS http://127.0.0.1:8080/build-info.json
curl -fsS http://127.0.0.1:8080/api/v1/health
docker compose ps
```

The `releaseId` in `build-info.json` must match `git rev-parse --short=12 HEAD`.
