# syntax=docker/dockerfile:1.7
# ============================================================
# Dockerfile — 交付管理平台后端服务
# Debian 软件源默认使用上游地址，也允许构建环境显式覆盖。
# ============================================================

ARG RELEASE_ID=development
ARG NODE_IMAGE=node:20-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c

FROM ${NODE_IMAGE} AS builder
ARG RELEASE_ID
ARG NPM_REGISTRY=https://registry.npmjs.org
ARG DEBIAN_MIRROR=http://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=http://deb.debian.org/debian-security
WORKDIR /app

RUN npm install --global pnpm@10.34.4 --registry=${NPM_REGISTRY}

RUN sed -i \
    -e "s#http://deb.debian.org/debian-security#${DEBIAN_SECURITY_MIRROR}#g" \
    -e "s#http://deb.debian.org/debian#${DEBIAN_MIRROR}#g" \
    /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG PNPM_REGISTRY=https://registry.npmjs.org
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
  pnpm config set registry ${PNPM_REGISTRY} \
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
ARG DEBIAN_MIRROR=http://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=http://deb.debian.org/debian-security
WORKDIR /app
ENV RELEASE_ID=${RELEASE_ID}
LABEL org.opencontainers.image.title="delivery-platform-backend" \
      org.opencontainers.image.version="${RELEASE_ID}"

RUN sed -i \
    -e "s#http://deb.debian.org/debian-security#${DEBIAN_SECURITY_MIRROR}#g" \
    -e "s#http://deb.debian.org/debian#${DEBIAN_MIRROR}#g" \
    /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl default-mysql-client \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=runtime-deps /app/node_modules ./node_modules

# 非 root 用户运行
USER node

EXPOSE 3000
CMD ["node", "dist/main"]
