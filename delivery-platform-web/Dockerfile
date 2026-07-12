# syntax=docker/dockerfile:1.7
# ============================================================
# Dockerfile — 交付管理平台前端服务
# 基础镜像固定 digest；依赖源可通过构建参数覆盖。
# ============================================================

ARG RELEASE_ID=development
ARG NODE_IMAGE=node:20-bookworm-slim@sha256:3d0f05455dea2c82e2f76e7e2543964c30f6b7d673fc1a83286736d44fe4c41c

FROM ${NODE_IMAGE} AS builder
ARG RELEASE_ID
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app
ENV VITE_RELEASE_ID=${RELEASE_ID}

RUN npm install --global pnpm@10.34.4 --registry=${NPM_REGISTRY}

ARG PNPM_REGISTRY=https://registry.npmjs.org
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
  pnpm config set registry ${PNPM_REGISTRY} \
  && pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY public/ ./public/
COPY src/ ./src/
RUN pnpm build

# ---- 运行阶段 ----
FROM nginx:alpine
ARG RELEASE_ID
LABEL org.opencontainers.image.title="delivery-platform-frontend" \
      org.opencontainers.image.version="${RELEASE_ID}"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
