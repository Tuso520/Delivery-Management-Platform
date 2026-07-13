#!/bin/sh
set -eu

actor_username="${INTEGRATION_SECRET_MIGRATION_ACTOR_USERNAME:-admin}"
archive_audit_report=""

cleanup_archive_audit_report() {
  if [ -n "$archive_audit_report" ]; then
    rm -f "$archive_audit_report"
  fi
}

trap cleanup_archive_audit_report EXIT

node prisma/prepare-migrate.js
./node_modules/.bin/prisma migrate deploy

# Bootstrap the configured migration actor and target reference data first.
./node_modules/.bin/ts-node --transpile-only prisma/seed.ts

# Stored levels are deterministically rebuilt from parent relations, and a
# folder with direct files is deterministically split into a folder plus a
# synthetic same-name item. Those two REVIEW codes remain visible in the
# report but do not block. Every ERROR and every unknown REVIEW fails closed
# before any data migrator applies target rows.
archive_audit_report="$(mktemp)"
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
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-content.ts --strict
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-content.ts \
  --apply "--actor-username=$actor_username"
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-foundation.ts --strict
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-foundation.ts \
  --apply "--actor-username=$actor_username" --strict
./node_modules/.bin/ts-node --transpile-only prisma/migrate-integration-secrets.ts
./node_modules/.bin/ts-node --transpile-only prisma/migrate-integration-secrets.ts \
  --apply "--actor-username=$actor_username"

# A second seed run is an idempotency gate and must not recreate retired data
# or file-less standard content after the migration has converged.
./node_modules/.bin/ts-node --transpile-only prisma/seed.ts
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-content.ts --verify --strict
./node_modules/.bin/ts-node --transpile-only prisma/migrate-target-foundation.ts --verify --strict
./node_modules/.bin/ts-node --transpile-only prisma/migrate-integration-secrets.ts --verify
