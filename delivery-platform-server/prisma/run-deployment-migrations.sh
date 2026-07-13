#!/bin/sh
set -eu

actor_username="${INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME:-admin}"
archive_audit_report=""
current_stage="migration preflight"

finish_migration_run() {
  status="$?"
  trap - EXIT
  if [ -n "$archive_audit_report" ]; then
    rm -f "$archive_audit_report"
  fi
  if [ "$status" -ne 0 ]; then
    printf '[migrate] failed stage: %s (exit=%s)\n' "$current_stage" "$status" >&2
  fi
  exit "$status"
}

trap finish_migration_run EXIT

for required_file in \
  prisma/schema.prisma \
  prisma/migrations/migration_lock.toml \
  node_modules/.bin/prisma \
  node_modules/.bin/ts-node; do
  if [ ! -e "$required_file" ]; then
    printf '[migrate] required migration file is missing: %s\n' "$required_file" >&2
    exit 1
  fi
done

node <<'NODE'
const required = [
  'DATABASE_URL',
  'INTEGRATION_SECRET_ENCRYPTION_KEY',
  'SEED_ADMIN_PASSWORD',
  'SEED_DEFAULT_PASSWORD',
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  throw new Error(`missing required migration environment: ${missing.join(', ')}`);
}
const database = new URL(process.env.DATABASE_URL);
if (database.protocol !== 'mysql:') {
  throw new Error(`DATABASE_URL must use mysql:, received ${database.protocol}`);
}
const databaseName = database.pathname.replace(/^\//u, '');
if (!database.hostname || !databaseName) {
  throw new Error('DATABASE_URL must include a host and database name');
}
process.stdout.write(
  `[migrate] database target: ${database.hostname}:${database.port || '3306'}/${databaseName}\n`,
);
NODE

./node_modules/.bin/prisma validate

current_stage="schema preparation"
node prisma/prepare-migrate.js
current_stage="Prisma schema migration"
./node_modules/.bin/prisma migrate deploy

# Bootstrap the configured migration actor and target reference data first.
current_stage="first target seed"
./node_modules/.bin/ts-node --transpile-only prisma/seed.ts

# Stored levels are deterministically rebuilt from parent relations, and a
# folder with direct files is deterministically split into a folder plus a
# synthetic same-name item. Those two REVIEW codes remain visible in the
# report but do not block. Every ERROR and every unknown REVIEW fails closed
# before any data migrator applies target rows.
archive_audit_report="$(mktemp)"
current_stage="archive migration audit"
./node_modules/.bin/ts-node --transpile-only prisma/archive-migration-audit.ts \
  > "$archive_audit_report"
cat "$archive_audit_report"
# The single-quoted program is JavaScript; its template expression must be
# evaluated by Node rather than expanded by the shell.
# shellcheck disable=SC2016
node -e '
  const fs = require("fs");
  const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const deterministicReviewCodes = new Set([
    "STORED_LEVEL_MISMATCH",
    "FOLDER_WITH_DIRECT_FILES",
  ]);
  if (!Number.isInteger(report.errors) || report.errors < 0) {
    throw new Error("archive migration audit did not return a valid error count");
  }
  if (!Number.isInteger(report.reviewRequired) || report.reviewRequired < 0) {
    throw new Error("archive migration audit did not return a valid review count");
  }
  if (!Array.isArray(report.findings)) {
    throw new Error("archive migration audit did not return a findings array");
  }
  if (
    report.findings.some(
      (finding) =>
        !finding ||
        !["ERROR", "REVIEW"].includes(finding.severity) ||
        typeof finding.code !== "string" ||
        finding.code.length === 0,
    )
  ) {
    throw new Error("archive migration audit returned an invalid finding");
  }
  const errors = report.findings.filter((finding) => finding?.severity === "ERROR");
  const reviews = report.findings.filter((finding) => finding.severity === "REVIEW");
  const blockingReviews = reviews.filter(
    (finding) => !deterministicReviewCodes.has(finding.code),
  );
  if (errors.length !== report.errors) {
    throw new Error("archive migration audit error count does not match its findings");
  }
  if (reviews.length !== report.reviewRequired) {
    throw new Error("archive migration audit review count does not match its findings");
  }
  if (errors.length > 0 || blockingReviews.length > 0) {
    process.stderr.write(
      `Archive migration audit found ${errors.length} error(s) and ` +
        `${blockingReviews.length} non-automatable review finding(s).\n`,
    );
    process.exit(2);
  }
' "$archive_audit_report"
rm -f "$archive_audit_report"
archive_audit_report=""

# Every data migrator is dry-run first, applies with an auditable active actor,
# and later passes a read-only strict gate before application traffic can start.
current_stage="target content strict dry-run"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-content.ts --strict
current_stage="target content apply"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-content.ts \
  --apply "--actor-username=$actor_username"
current_stage="target foundation strict dry-run"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-foundation.ts --strict
current_stage="target foundation apply"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-foundation.ts \
  --apply "--actor-username=$actor_username" --strict
current_stage="integration secret dry-run"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-integration-secrets.ts
current_stage="integration secret apply"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-integration-secrets.ts \
  --apply "--actor-username=$actor_username"

# A second seed run is an idempotency gate and must not recreate retired data
# or file-less standard content after the migration has converged.
current_stage="second target seed"
./node_modules/.bin/ts-node --transpile-only prisma/seed.ts
current_stage="target content strict verification"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-content.ts --verify --strict
current_stage="target foundation strict verification"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-foundation.ts --verify --strict
current_stage="integration secret verification"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-integration-secrets.ts --verify
