#!/bin/bash
set -Eeuo pipefail
# ============================================================
# 交付管理平台 — 一键部署脚本（宝塔面板专用）
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

load_release_metadata() {
  [ -f RELEASE_ID ] || err "缺少 RELEASE_ID；请使用 scripts/package-release.sh 生成的正式发布包"
  RELEASE_ID="$(tr -d '[:space:]' < RELEASE_ID)"
  [[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || err "RELEASE_ID 格式无效: ${RELEASE_ID}"
  export RELEASE_ID
}

validate_layout() {
  [ -f docker-compose.yml ] || err "当前目录缺少 docker-compose.yml"
  [ -f delivery-platform-web/Dockerfile ] || err "缺少前端 Dockerfile"
  [ -f delivery-platform-server/Dockerfile ] || err "缺少后端 Dockerfile"
  if [ -f delivery-platform/docker-compose.yml ]; then
    err "检测到双层 delivery-platform 目录；请把发布包直接解压到当前部署目录"
  fi
}

cleanup_source_tree() {
  [ -f RELEASE_ID ] || err "缺少 RELEASE_ID，拒绝清理非正式发布目录"
  [ -f RELEASE_MANIFEST.txt ] || err "缺少 RELEASE_MANIFEST.txt，拒绝清理非正式发布目录"

  rm -rf docs dev-docs archive
  rm -f AGENTS.md CLAUDE.md start.sh .gitignore
  rm -f ._*
  rm -rf docker/nginx docker/minio docker/redis
  rm -rf delivery-platform-server/node_modules delivery-platform-server/dist delivery-platform-server/coverage
  rm -rf delivery-platform-web/node_modules delivery-platform-web/dist delivery-platform-web/coverage
  rm -f delivery-platform-server/.env delivery-platform-web/.env
  find delivery-platform-server/src delivery-platform-web/src \
    -type d -name "__tests__" -prune -exec rm -rf {} + 2>/dev/null || true
  find delivery-platform-server/src delivery-platform-web/src \
    -type f \( -name "*.spec.ts" -o -name "*.test.ts" -o -name ".DS_Store" -o -name "._*" \) \
    -delete 2>/dev/null || true
  find . -maxdepth 3 -type f \( -name ".DS_Store" -o -name "._*" \) -delete

  log "服务器部署源码目录清理完成；.env、backups 和 Docker 数据卷未改动"
}

# ─── 配置 Docker 镜像加速（彻底重启模式）────────────────────
setup_mirror() {
  log "配置 Docker 镜像加速..."

  cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.1panel.live",
    "https://docker.registry.cyou",
    "https://docker-cf.registry.cyou",
    "https://docker.m.daocloud.io"
  ],
  "max-concurrent-downloads": 6
}
EOF

  python3 -m json.tool /etc/docker/daemon.json && log "daemon.json 语法检查通过" || {
    warn "daemon.json 语法错误，回退到最小配置"
    cat > /etc/docker/daemon.json << 'EOF'
{"registry-mirrors":["https://docker.1panel.live","https://docker.m.daocloud.io","https://docker.registry.cyou"]}
EOF
  }

  log "彻底停止 Docker 服务..."
  systemctl stop docker 2>/dev/null || service docker stop 2>/dev/null
  sleep 3
  systemctl daemon-reload 2>/dev/null || true
  log "重新启动 Docker..."
  systemctl start docker 2>/dev/null || service docker start 2>/dev/null
  sleep 5

  log "验证镜像加速..."
  docker info 2>/dev/null | grep -A8 "Registry Mirrors" && log "加速配置成功" || warn "加速验证失败，继续尝试"

  # 测试拉取
  log "测试镜像拉取..."
  docker pull alpine:latest 2>&1 | tail -3 && log "镜像拉取正常" || warn "镜像拉取失败，但继续部署"
}

# ─── 检查 ───────────────────────────────────────────────────
check_docker() {
  log "检查 Docker..."
  command -v docker >/dev/null 2>&1 || err "Docker 未安装 → 宝塔面板 → 软件商店 → Docker管理器 → 安装"
  command -v docker-compose >/dev/null 2>&1 || err "docker-compose 未安装，在宝塔 Docker管理器 设置里安装"
  log "Docker 就绪"
}

frontend_url() {
  local domain="${DOMAIN:-localhost}"
  if [ -n "${PUBLIC_URL:-}" ]; then
    printf '%s\n' "$PUBLIC_URL"
  else
    printf 'http://%s:%s\n' "$domain" "${FRONTEND_PORT:-8080}"
  fi
}

validate_env() {
  [ -f .env ] || err "缺少 .env，请先执行 cp .env.example .env 并填写生产配置"
  set -a
  source .env
  set +a

  local required_vars=(
    MYSQL_ROOT_PASSWORD MYSQL_DATABASE MYSQL_USER MYSQL_USER_PASSWORD
    REDIS_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_BUCKET
    MINIO_IMAGE MINIO_MC_IMAGE
    JWT_SECRET SEED_ADMIN_PASSWORD SEED_DEFAULT_PASSWORD
  )
  local name value
  for name in "${required_vars[@]}"; do
    value="${!name:-}"
    if [ -z "$value" ] || [[ "$value" == CHANGE_ME* ]]; then
      err ".env 中 ${name} 尚未配置"
    fi
  done
  [ "${#JWT_SECRET}" -ge 32 ] || err "JWT_SECRET 长度至少 32 个字符"
  [[ "${MINIO_IMAGE}" == minio/minio:RELEASE.* ]] \
    || err "MINIO_IMAGE 必须使用固定 RELEASE 版本，禁止使用 latest"
  [[ "${MINIO_MC_IMAGE}" == minio/mc:RELEASE.* ]] \
    || err "MINIO_MC_IMAGE 必须使用固定 RELEASE 版本，禁止使用 latest"
  log "生产环境变量检查通过"
}

preflight_checks() {
  validate_layout
  load_release_metadata
  check_docker
  validate_env
  docker-compose config -q >/dev/null
  log "部署预检通过，发布版本: ${RELEASE_ID}"
}

verify_release_version() {
  local expected actual response
  load_release_metadata
  expected="$RELEASE_ID"
  response="$(curl -fsS -H 'Cache-Control: no-cache' "http://localhost:${FRONTEND_PORT:-8080}/build-info.json")" \
    || return 1
  actual="$(printf '%s' "$response" | sed -n 's/.*"releaseId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"

  if [ "$actual" != "$expected" ]; then
    warn "前端版本不一致，期望 ${expected}，实际 ${actual:-未读取}"
    return 1
  fi

  log "前端发布版本一致: ${actual}"
}

# ─── 部署 ───────────────────────────────────────────────────
deploy_all() {
  preflight_checks
  log "构建镜像（使用缓存，首次约 5-10 分钟）..."
  docker-compose build backend backend-migrate frontend
  log "启动基础服务..."
  docker-compose pull minio minio-init || warn "MinIO 镜像拉取失败，尝试使用本地镜像"
  docker-compose up -d mysql redis minio
  docker-compose up -d minio-init
  sleep 10
  log "数据库初始化..."
  docker-compose run --rm backend-migrate
  log "启动全部服务..."
  docker-compose up -d backend frontend
  check_url "后端" "http://localhost:3000/api/v1/health"
  check_url "前端" "http://localhost:${FRONTEND_PORT:-8080}"
  verify_release_version || err "服务已启动，但前端版本校验失败"
  log "部署完成！"
  echo "  前端: $(frontend_url)"
  echo "  管理员账号: admin（密码取自 .env 的 SEED_ADMIN_PASSWORD）"
}

update_deploy() {
  preflight_checks
  docker-compose build backend backend-migrate frontend
  docker-compose pull minio minio-init || warn "MinIO 镜像拉取失败，尝试使用本地镜像"
  docker-compose up -d mysql redis minio
  docker-compose up -d minio-init
  docker-compose run --rm backend-migrate
  docker-compose up -d --force-recreate backend frontend
  check_url "后端" "http://localhost:3000/api/v1/health"
  check_url "前端" "http://localhost:${FRONTEND_PORT:-8080}"
  verify_release_version || err "更新后前端版本校验失败"
  log "更新完成"
}

rebuild_deploy() {
  preflight_checks
  log "无缓存重建镜像（用于依赖异常或旧镜像残留）..."
  docker-compose build --no-cache backend backend-migrate frontend
  docker-compose pull minio minio-init || warn "MinIO 镜像拉取失败，尝试使用本地镜像"
  docker-compose up -d mysql redis minio
  docker-compose up -d minio-init
  docker-compose run --rm backend-migrate
  docker-compose up -d --force-recreate backend frontend
  check_url "后端" "http://localhost:3000/api/v1/health"
  check_url "前端" "http://localhost:${FRONTEND_PORT:-8080}"
  verify_release_version || err "重建后前端版本校验失败"
  log "无缓存重建完成"
}

backup_database() {
  set -a && source .env && set +a
  if [ -z "$(docker-compose ps -q mysql 2>/dev/null)" ]; then
    warn "MySQL 尚未启动，跳过数据库备份"
    return 0
  fi
  mkdir -p backups
  F="backups/db_$(date +%Y%m%d_%H%M%S).sql"
  docker-compose exec -T mysql mysqldump -u root -p"${MYSQL_ROOT_PASSWORD}" --single-transaction "${MYSQL_DATABASE}" > "$F" 2>/dev/null
  gzip "$F" && log "备份: ${F}.gz"
  find backups -name '*.gz' -mtime +7 -delete
}

backup_minio() {
  mkdir -p backups/minio
  local volume_name
  volume_name="$(docker volume ls -q | grep -E '(^|_)minio_data$' | head -1 || true)"
  if [ -z "$volume_name" ]; then
    warn "MinIO 数据卷不存在，跳过对象存储备份"
    return 0
  fi
  F="backups/minio/minio_$(date +%Y%m%d_%H%M%S).tar.gz"
  docker run --rm -v "${volume_name}:/data" -v "$(pwd)/backups/minio:/backup" alpine tar czf "/backup/$(basename "$F")" -C /data .
  log "MinIO 备份: ${F}"
  find backups/minio -name '*.tar.gz' -mtime +7 -delete
}

tag_current_images() {
  docker image inspect delivery-platform-backend:latest >/dev/null 2>&1 \
    && docker tag delivery-platform-backend:latest delivery-platform-backend:rollback \
    || true
  docker image inspect delivery-platform-frontend:latest >/dev/null 2>&1 \
    && docker tag delivery-platform-frontend:latest delivery-platform-frontend:rollback \
    || true
}

capture_failure_diagnostics() {
  local stamp output
  stamp="$(date +%Y%m%d_%H%M%S)"
  mkdir -p backups/failures
  output="backups/failures/release_failure_${stamp}.log"
  {
    echo "release_id=${RELEASE_ID:-unknown}"
    echo "captured_at=$(date -Iseconds)"
    echo
    echo "===== docker-compose ps -a ====="
    docker-compose ps -a || true
    echo
    echo "===== application logs ====="
    docker-compose logs --no-color --tail=300 backend backend-migrate frontend || true
    echo
    echo "===== backend state ====="
    docker inspect delivery-backend \
      --format '{{json .State}}' 2>/dev/null || true
  } > "$output" 2>&1
  warn "失败现场已保存: ${output}"
}

restore_database() {
  set -a && source .env && set +a
  local latest
  latest="$(find backups -maxdepth 1 -name 'db_*.sql.gz' -type f | sort | tail -1)"
  [ -n "$latest" ] || { warn "没有数据库备份可恢复"; return 0; }
  log "恢复数据库: $latest"
  docker-compose exec -T mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
    -e "DROP DATABASE IF EXISTS \`${MYSQL_DATABASE}\`; CREATE DATABASE \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  gunzip -c "$latest" | docker-compose exec -T mysql mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}"
}

restore_minio() {
  local latest volume_name
  latest="$(find backups/minio -name 'minio_*.tar.gz' -type f | sort | tail -1)"
  volume_name="$(docker volume ls -q | grep -E '(^|_)minio_data$' | head -1 || true)"
  [ -n "$latest" ] && [ -n "$volume_name" ] || { warn "没有 MinIO 备份可恢复"; return 0; }
  log "恢复 MinIO: $latest"
  docker-compose stop minio >/dev/null 2>&1 || true
  docker run --rm -v "${volume_name}:/data" -v "$(pwd)/backups/minio:/backup" alpine \
    sh -c "find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar xzf /backup/$(basename "$latest") -C /data"
  docker-compose up -d minio
}

rollback_release() {
  warn "开始恢复上一版本..."
  restore_database || warn "数据库恢复失败，请人工检查 backups/"
  restore_minio || warn "MinIO 恢复失败，请人工检查 backups/minio/"
  docker image inspect delivery-platform-backend:rollback >/dev/null 2>&1 \
    && docker tag delivery-platform-backend:rollback delivery-platform-backend:latest \
    || true
  docker image inspect delivery-platform-frontend:rollback >/dev/null 2>&1 \
    && docker tag delivery-platform-frontend:rollback delivery-platform-frontend:latest \
    || true
  docker-compose up -d --force-recreate backend frontend || true
  warn "已执行回滚，请运行 bash deploy.sh status 和 bash deploy.sh logs"
}

release_deploy() {
  preflight_checks
  log "启动基础服务并创建发布前备份..."
  docker-compose up -d mysql redis minio
  docker-compose up -d minio-init
  backup_database
  backup_minio
  tag_current_images

  log "按发布版本构建迁移、后端和前端镜像..."
  if ! docker-compose build backend backend-migrate frontend; then
    capture_failure_diagnostics
    err "镜像构建失败；当前运行容器和业务数据未切换"
  fi

  log "执行 Prisma 5.22.0 数据同步和幂等种子..."
  if ! docker-compose run --rm backend-migrate; then
    capture_failure_diagnostics
    rollback_release
    err "数据库初始化失败，已尝试回滚"
  fi

  log "切换应用服务..."
  if ! docker-compose up -d --force-recreate backend frontend; then
    capture_failure_diagnostics
    rollback_release
    err "服务切换失败，已尝试回滚"
  fi

  if ! check_url "后端" "http://localhost:3000/api/v1/health" \
    || ! check_url "前端" "http://localhost:${FRONTEND_PORT:-8080}" \
    || ! verify_release_version; then
    capture_failure_diagnostics
    rollback_release
    err "健康检查失败，已尝试回滚"
  fi
  log "发布完成: $(frontend_url)"
}

show_status() {
  load_release_metadata
  echo ""; echo "===== 服务状态 ====="; docker-compose ps
  echo ""; echo "===== 健康检查 ====="
  check_url "后端" "http://localhost:3000/api/v1/health"
  check_url "前端" "http://localhost:${FRONTEND_PORT:-8080}"
  verify_release_version || warn "当前运行版本与发布目录不一致"
}

check_url() {
  local name="$1"
  local url="$2"
  local attempt

  for attempt in $(seq 1 40); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log "${name}: 正常"
      return 0
    fi
    sleep 3
  done

  warn "${name}: 无响应"
  return 1
}

show_logs() { docker-compose logs -f --tail=200 backend; }

case "${1:-deploy}" in
  setup)   setup_mirror ;;
  preflight) preflight_checks ;;
  cleanup-source) cleanup_source_tree ;;
  deploy)  deploy_all ;;
  update)  update_deploy ;;
  rebuild) rebuild_deploy ;;
  release) release_deploy ;;
  rollback) rollback_release ;;
  backup)       backup_database && backup_minio ;;
  backup-db)    backup_database ;;
  backup-minio) backup_minio ;;
  status)  show_status ;;
  logs)    show_logs ;;
  restart) docker-compose restart backend frontend && log "已重启" ;;
  stop)    docker-compose down && log "已停止" ;;
  *)
    echo "用法: bash deploy.sh {setup|preflight|cleanup-source|deploy|update|rebuild|release|rollback|backup|status|logs|restart|stop}"
    echo "首次务必先运行: bash deploy.sh setup"
    ;;
esac
