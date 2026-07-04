#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${1:-/www/wwwroot}"
APP="${ROOT_DIR}/delivery-platform"

fail() {
  echo "[deploy-release] ERROR: $1" >&2
  exit 1
}

latest_package() {
  find "$ROOT_DIR" \
    -maxdepth 1 \
    -type f \
    -name 'delivery-platform-deploy-*.tar.gz' \
    -printf '%T@ %p\n' \
    | sort -nr \
    | sed -n '1p' \
    | cut -d' ' -f2-
}

PKG="$(latest_package)"
[ -n "$PKG" ] || fail "未在 ${ROOT_DIR} 找到正式发布包"

PKG_BASENAME="$(basename "$PKG")"
SUM="${PKG}.sha256"
RELEASE_ID="${PKG_BASENAME#delivery-platform-deploy-}"
RELEASE_ID="${RELEASE_ID%.tar.gz}"

[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] \
  || fail "从文件名解析出的发布版本无效: ${RELEASE_ID}"
[ -f "$SUM" ] || fail "缺少校验文件: $(basename "$SUM")"

echo "[deploy-release] 使用发布包: ${PKG_BASENAME}"
echo "[deploy-release] 发布版本: ${RELEASE_ID}"

cd "$ROOT_DIR"
sha256sum -c "$(basename "$SUM")"
tar -tzf "$PKG" | grep -qx './docker-compose.yml' \
  || fail "压缩包根目录缺少 docker-compose.yml"

if tar -tzf "$PKG" | grep -q '^\./delivery-platform/'; then
  fail "压缩包包含错误的 delivery-platform 外层目录"
fi

ARCHIVE_RELEASE_ID="$(tar -xOf "$PKG" ./RELEASE_ID | tr -d '[:space:]')"
[ "$ARCHIVE_RELEASE_ID" = "$RELEASE_ID" ] \
  || fail "文件名版本与压缩包内部 RELEASE_ID 不一致"

if [ ! -e "$APP" ]; then
  mkdir -p "$APP"
  if ! tar -xzf "$PKG" -C "$APP"; then
    rm -rf "$APP"
    fail "首次部署解压失败"
  fi
  cp "$APP/.env.example" "$APP/.env"
  chmod +x "$APP/deploy.sh"
  echo "[deploy-release] 已完成首次部署解压。"
  echo "[deploy-release] 请填写 ${APP}/.env 后再次运行本脚本。"
  exit 0
fi

[ -d "$APP" ] || fail "${APP} 不是目录"
[ -f "$APP/.env" ] || fail "${APP}/.env 不存在，拒绝覆盖现有目录"

STAMP="$(date +%Y%m%d_%H%M%S)"
OLD="${ROOT_DIR}/delivery-platform.source-${STAMP}"

mv "$APP" "$OLD"
mkdir -p "$APP"

restore_source() {
  rm -rf "$APP"
  mv "$OLD" "$APP"
}

if ! tar -xzf "$PKG" -C "$APP"; then
  restore_source
  fail "解压失败，已恢复旧源码目录"
fi

cp "$OLD/.env" "$APP/.env"
if [ -d "$OLD/backups" ]; then
  cp -a "$OLD/backups" "$APP/backups"
fi

cd "$APP"
chmod +x deploy.sh

if ! bash deploy.sh preflight; then
  cd "$ROOT_DIR"
  restore_source
  fail "部署预检失败，已恢复旧源码目录"
fi

if ! bash deploy.sh release; then
  bash deploy.sh status || true
  fail "发布失败；部署脚本已执行自动回滚，旧源码保留在 ${OLD}"
fi

bash deploy.sh status
SERVER_ARCHIVE_DIR="${ROOT_DIR}/release-archive/${RELEASE_ID}"
mkdir -p "$SERVER_ARCHIVE_DIR"
mv "$PKG" "$SUM" "$SERVER_ARCHIVE_DIR/"
MANIFEST="${ROOT_DIR}/delivery-platform-deploy-${RELEASE_ID}.manifest.txt"
if [ -f "$MANIFEST" ]; then
  mv "$MANIFEST" "$SERVER_ARCHIVE_DIR/"
fi
echo "[deploy-release] 发布完成: ${RELEASE_ID}"
echo "[deploy-release] 旧源码保留在: ${OLD}"
echo "[deploy-release] 发布文件归档在: ${SERVER_ARCHIVE_DIR}"
