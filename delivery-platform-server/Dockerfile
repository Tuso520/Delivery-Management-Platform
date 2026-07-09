# syntax=docker/dockerfile:1.7
# ============================================================
# Dockerfile — 交付管理平台后端服务
# 国内构建专用：使用 Docker 镜像加速 + pnpm 镜像源
# ============================================================

ARG RELEASE_ID=development
ARG NODE_IMAGE=node:20-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c

FROM ${NODE_IMAGE} AS builder
ARG RELEASE_ID
WORKDIR /app

RUN npm install --global pnpm@10.34.4 --registry=https://registry.npmmirror.com

RUN sed -i \
    -e 's#http://deb.debian.org/debian#http://mirrors.cloud.tencent.com/debian#g' \
    -e 's#http://deb.debian.org/debian-security#http://mirrors.cloud.tencent.com/debian-security#g' \
    /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
  pnpm config set registry https://registry.npmmirror.com \
  && pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ ./src/
COPY prisma/ ./prisma/

RUN pnpm prisma:generate
RUN pnpm build

FROM builder AS runtime-deps
RUN pnpm prune --prod

# ---- 运行阶段 ----
FROM ${NODE_IMAGE}
ARG RELEASE_ID
WORKDIR /app
ENV RELEASE_ID=${RELEASE_ID}
LABEL org.opencontainers.image.title="delivery-platform-backend" \
      org.opencontainers.image.version="${RELEASE_ID}"

RUN sed -i \
    -e 's#http://deb.debian.org/debian#http://mirrors.cloud.tencent.com/debian#g' \
    -e 's#http://deb.debian.org/debian-security#http://mirrors.cloud.tencent.com/debian-security#g' \
    /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl default-mysql-client \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=runtime-deps /app/node_modules ./node_modules

# 非 root 用户运行
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/main"]
