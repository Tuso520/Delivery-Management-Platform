# syntax=docker/dockerfile:1.7
# ============================================================
# Dockerfile — 交付管理平台前端服务
# 国内构建专用：使用 Docker 镜像加速 + pnpm 镜像源
# ============================================================

ARG RELEASE_ID=development

FROM node:20-bookworm-slim AS builder
ARG RELEASE_ID
WORKDIR /app
ENV VITE_RELEASE_ID=${RELEASE_ID}

RUN npm install --global pnpm@10.34.4 --registry=https://registry.npmmirror.com

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
  pnpm config set registry https://registry.npmmirror.com \
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
