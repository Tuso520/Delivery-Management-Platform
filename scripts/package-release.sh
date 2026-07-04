#!/usr/bin/env bash
set -Eeuo pipefail
export COPYFILE_DISABLE=1

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/release"
RELEASE_ID="${1:-$(date +%Y%m%d-%H%M%S)}"
PACKAGE_NAME="delivery-platform-deploy-${RELEASE_ID}"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/delivery-platform-release.XXXXXX")"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

fail() {
  echo "[package] ERROR: $1" >&2
  exit 1
}

[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] \
  || fail "RELEASE_ID 只能包含字母、数字、点、下划线和短横线"

copy_file() {
  local source="$1"
  local target="$2"
  [ -f "${ROOT_DIR}/${source}" ] || fail "缺少必需文件: ${source}"
  mkdir -p "$(dirname "${STAGE_DIR}/${target}")"
  cp "${ROOT_DIR}/${source}" "${STAGE_DIR}/${target}"
}

copy_tree() {
  local source="$1"
  local target="$2"
  [ -d "${ROOT_DIR}/${source}" ] || fail "缺少必需目录: ${source}"
  mkdir -p "$(dirname "${STAGE_DIR}/${target}")"
  cp -R "${ROOT_DIR}/${source}" "${STAGE_DIR}/${target}"
}

mkdir -p "$OUTPUT_DIR"
find "$OUTPUT_DIR" -type f \( -name ".DS_Store" -o -name "._*" \) -delete

ARCHIVE_DIR="${OUTPUT_DIR}/archive/$(date +%Y%m%d)"
shopt -s nullglob
existing_packages=("${OUTPUT_DIR}"/delivery-platform-deploy-*)
if [ "${#existing_packages[@]}" -gt 0 ]; then
  mkdir -p "$ARCHIVE_DIR"
  for existing_package in "${existing_packages[@]}"; do
    mv "$existing_package" "$ARCHIVE_DIR/"
  done
fi
shopt -u nullglob

cp "${ROOT_DIR}/scripts/deploy-latest-release.sh" \
  "${OUTPUT_DIR}/deploy-latest-release.sh"
chmod 755 "${OUTPUT_DIR}/deploy-latest-release.sh"

copy_file ".env.example" ".env.example"
copy_file "docker-compose.yml" "docker-compose.yml"
copy_file "docker-compose.prod.yml" "docker-compose.prod.yml"
copy_file "deploy.sh" "deploy.sh"
copy_file "rollback.sh" "rollback.sh"
copy_file "healthcheck.sh" "healthcheck.sh"
copy_file "DEPLOYMENT.md" "DEPLOYMENT.md"
copy_file "CHANGELOG.md" "CHANGELOG.md"
copy_file "docker/mysql/init.sql" "docker/mysql/init.sql"

for file in \
  Dockerfile .dockerignore package.json pnpm-lock.yaml pnpm-workspace.yaml \
  tsconfig.json tsconfig.build.json nest-cli.json
do
  copy_file "delivery-platform-server/${file}" "delivery-platform-server/${file}"
done
copy_tree "delivery-platform-server/prisma" "delivery-platform-server/prisma"
copy_tree "delivery-platform-server/src" "delivery-platform-server/src"

for file in \
  Dockerfile .dockerignore package.json pnpm-lock.yaml pnpm-workspace.yaml \
  tsconfig.json tsconfig.node.json vite.config.ts index.html nginx.conf
do
  copy_file "delivery-platform-web/${file}" "delivery-platform-web/${file}"
done
copy_tree "delivery-platform-web/public" "delivery-platform-web/public"
copy_tree "delivery-platform-web/src" "delivery-platform-web/src"

find "$STAGE_DIR" -type d -name "__tests__" -prune -exec rm -rf {} +
find "$STAGE_DIR" -type f \( \
  -name "*.spec.ts" \
  -o -name "*.test.ts" \
  -o -name ".DS_Store" \
  -o -name "._*" \
\) -delete

printf '%s\n' "$RELEASE_ID" > "${STAGE_DIR}/RELEASE_ID"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "${STAGE_DIR}/RELEASE_BUILT_AT"
chmod 755 "${STAGE_DIR}/deploy.sh"
chmod 755 "${STAGE_DIR}/rollback.sh"
chmod 755 "${STAGE_DIR}/healthcheck.sh"

(
  cd "$STAGE_DIR"
  find . -type f ! -name "RELEASE_MANIFEST.txt" -print \
    | LC_ALL=C sort \
    | while IFS= read -r file; do
        if command -v sha256sum >/dev/null 2>&1; then
          checksum="$(sha256sum "$file" | awk '{print $1}')"
        else
          checksum="$(shasum -a 256 "$file" | awk '{print $1}')"
        fi
        size="$(wc -c < "$file" | tr -d '[:space:]')"
        printf '%s\t%s\t%s\n' "$checksum" "$size" "$file"
      done
) > "${STAGE_DIR}/RELEASE_MANIFEST.txt"

forbidden='^\./(node_modules|dist|coverage|release|backups|dev-docs|docs|archive|\.git)(/|$)|(^|/)__tests__(/|$)|(^|/)\.env$|(^|/)\._|\.DS_Store$|\.(spec|test)\.ts$'
if (
  cd "$STAGE_DIR"
  find . -mindepth 1 -print | grep -E "$forbidden"
) >/dev/null; then
  (
    cd "$STAGE_DIR"
    find . -mindepth 1 -print | grep -E "$forbidden"
  ) >&2
  fail "发布目录包含 forbidden 文件"
fi

ARCHIVE_PATH="${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
MANIFEST_PATH="${OUTPUT_DIR}/${PACKAGE_NAME}.manifest.txt"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"

COPYFILE_DISABLE=1 tar --no-xattrs -czf "$ARCHIVE_PATH" -C "$STAGE_DIR" .
cp "${STAGE_DIR}/RELEASE_MANIFEST.txt" "$MANIFEST_PATH"

if tar -tzf "$ARCHIVE_PATH" | grep -E '^\./delivery-platform/' >/dev/null; then
  fail "压缩包错误地包含 delivery-platform 外层目录"
fi
tar -tzf "$ARCHIVE_PATH" | grep -qx '\./docker-compose.yml' \
  || fail "压缩包根目录缺少 docker-compose.yml"

(
  cd "$OUTPUT_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$(basename "$ARCHIVE_PATH")"
  else
    shasum -a 256 "$(basename "$ARCHIVE_PATH")"
  fi
) > "$CHECKSUM_PATH"

find "$OUTPUT_DIR" -type f \( -name ".DS_Store" -o -name "._*" \) -delete

echo "[package] RELEASE_ID: ${RELEASE_ID}"
echo "[package] Archive: ${ARCHIVE_PATH}"
echo "[package] SHA256: ${CHECKSUM_PATH}"
echo "[package] Manifest: ${MANIFEST_PATH}"
