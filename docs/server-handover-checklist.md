# 测试与生产服务器接管操作单

状态：等待服务器只读信息；仓库侧不可变 Release 和真实集成验收已通过。

本文是 [发布与服务器架构 v2](deployment-architecture-v2.md) 的执行工作单。先完整完成测试服务器，再用同一已验收 Release 接管生产。命令默认由有 sudo 权限的人工运维账号执行；`dmpdeploy` 只供 GitHub Actions 发布。

## 1. 安全边界

- 不在聊天、工单或 CI 日志中发送密码、私钥、Token、数据库备份、完整 `runtime.env` 或旧 `.env`。
- 只回传主机名、版本、端口、容器名、镜像名、卷名、目录权限、健康状态和 SHA；公网地址可按组织要求脱敏。
- 首次测试接管完成前保持仓库变量 `RELEASE_V2_ENABLED=false`。
- 停止旧栈时禁止 `down -v`，禁止 `docker volume prune`，禁止删除旧目录、旧卷和备份。
- production 始终保留 Environment 审批；测试接管和生产接管都必须安排维护窗口。

## 2. 第一批：两台服务器只读摸底

分别在测试、生产服务器执行：

```bash
hostname
uname -m
grep -E '^(ID|VERSION_ID|PRETTY_NAME)=' /etc/os-release

docker version --format 'Docker={{.Server.Version}}'
docker compose version
nginx -v
command -v nginx
command -v systemctl

sudo awk '/^user / { print }' /etc/nginx/nginx.conf
docker compose ls
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker volume ls
df -h / /srv 2>/dev/null
```

不要执行会输出容器环境变量的 `docker inspect ... Config.Env`。按以下格式回传：

```text
环境：test / production
SSH 地址和端口：
内网完整 origin：
公网 HTTPS origin：
旧应用绝对目录：
旧 Compose 启动命令：
操作系统与架构：
Docker / Compose / Nginx 版本：
Nginx worker 用户：
旧容器名与状态：
Docker 卷名：
磁盘可用空间：
```

## 3. 第二批：账号与目录

确认第一批结果后，每台服务器执行。命令可重复执行，不会重建已存在账号：

```bash
getent passwd dmpdeploy >/dev/null || sudo useradd --create-home --shell /bin/bash dmpdeploy
sudo usermod -aG docker dmpdeploy

sudo install -d -m 0751 -o dmpdeploy -g dmpdeploy /srv/delivery-platform
sudo -u dmpdeploy install -d -m 0700 \
  /srv/delivery-platform/config \
  /srv/delivery-platform/control \
  /srv/delivery-platform/incoming \
  /srv/delivery-platform/backups \
  /srv/delivery-platform/state
sudo -u dmpdeploy install -d -m 0711 /srv/delivery-platform/releases

sudo -u dmpdeploy id
sudo stat -c '%a %U:%G %n' \
  /srv/delivery-platform \
  /srv/delivery-platform/config \
  /srv/delivery-platform/releases
```

`id` 必须包含 `docker` 组；若刚加入组，关闭该账号已有 SSH 会话后重新登录再验证。预期权限依次为 `751`、`700`、`711`。

## 4. 第三批：两套独立 SSH 发布密钥

在受控管理终端生成，不在服务器生成私钥：

```bash
ssh-keygen -t ed25519 -a 64 -C dmp-test-github-actions -f dmp-test-deploy
ssh-keygen -t ed25519 -a 64 -C dmp-production-github-actions -f dmp-production-deploy
```

每台服务器只安装对应 `.pub`。先通过 `scp` 把对应公钥上传为 `/tmp/dmp-deploy.pub`（公钥不是私钥），再执行：

```bash
sudo install -d -m 0700 -o dmpdeploy -g dmpdeploy /home/dmpdeploy/.ssh
sudo touch /home/dmpdeploy/.ssh/authorized_keys
sudo chmod 0600 /home/dmpdeploy/.ssh/authorized_keys
sudo chown dmpdeploy:dmpdeploy /home/dmpdeploy/.ssh/authorized_keys

PUBKEY="$(cat /tmp/dmp-deploy.pub)"
sudo grep -qxF "$PUBKEY" /home/dmpdeploy/.ssh/authorized_keys || \
  printf '%s\n' "$PUBKEY" | sudo tee -a /home/dmpdeploy/.ssh/authorized_keys >/dev/null
unset PUBKEY
sudo rm -f /tmp/dmp-deploy.pub
```

该命令只在公钥不存在时追加，不覆盖既有有效密钥。私钥全文仅保存到对应 GitHub Environment 的 `DEPLOY_SSH_KEY`。

在服务器控制台读取 SSH host key 指纹；再从受控终端运行并人工比对：

```bash
ssh-keyscan -p <ssh-port> -H <ssh-host>
```

核对后的完整行保存为对应 Environment 的 `DEPLOY_KNOWN_HOSTS`。

## 5. 第四批：受限 Nginx 权限与服务器身份

先记录真实程序路径：

```bash
command -v nginx
command -v systemctl
```

使用 `sudo visudo -f /etc/sudoers.d/delivery-platform-deploy` 写入真实绝对路径。常见示例：

```text
dmpdeploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t
dmpdeploy ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx
```

校验：

```bash
sudo chmod 0440 /etc/sudoers.d/delivery-platform-deploy
sudo visudo -cf /etc/sudoers.d/delivery-platform-deploy
sudo -u dmpdeploy sudo -n nginx -t
```

只在目标身份不存在时生成，不能在后续发布中重建：

```bash
if ! sudo test -s /srv/delivery-platform/state/target-id; then
  openssl rand -hex 16 | sudo -u dmpdeploy tee /srv/delivery-platform/state/target-id >/dev/null
fi
sudo chown dmpdeploy:dmpdeploy /srv/delivery-platform/state/target-id
sudo chmod 0600 /srv/delivery-platform/state/target-id
sudo -u dmpdeploy cat /srv/delivery-platform/state/target-id
```

最后一行不是密码，但仍只保存到对应 Environment Variable `DEPLOY_TARGET_ID`，不要跨环境复用。

## 6. 第五批：运行配置和旧数据卷

从仓库复制 `deploy/runtime-config.template` 到服务器临时路径，再安装：

```bash
sudo -u dmpdeploy install -m 0600 /path/to/runtime-config.template \
  /srv/delivery-platform/config/runtime.env
sudo -u dmpdeploy editor /srv/delivery-platform/config/runtime.env
```

配置规则：

- test 的项目、网络和卷前缀使用 `delivery-platform-test-*`；production 使用 `delivery-platform-production-*`。
- 旧栈接管必须把 MySQL、Redis、MinIO 的真实命名卷写入三个 `*_VOLUME_NAME`，不能换成空卷。
- `CORS_ORIGIN` 写公网 HTTPS origin；测试和生产的所有密码、JWT、MinIO、Redis、数据库凭据必须不同。
- `INTEGRATION_SECRET_ENCRYPTION_KEY` 使用 `openssl rand -base64 32` 生成并长期保存，不能随发布轮换。
- `SEED_RESET_EXISTING_USER_PASSWORDS=false` 保持不变。
- `SEED_ADMIN_PASSWORD` 和 `SEED_DEFAULT_PASSWORD` 必须来自密码管理器；既有账号默认不会被重置。

只做脱敏校验，不输出配置内容：

```bash
sudo -u dmpdeploy grep -n '<' /srv/delivery-platform/config/runtime.env
sudo stat -c '%a %U:%G %n' /srv/delivery-platform/config/runtime.env
```

第一条必须无输出；第二条必须为 `600 dmpdeploy:dmpdeploy`。

旧卷按真实容器名逐个查询：

```bash
docker inspect <mysql-container> --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
docker inspect <redis-container> --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
docker inspect <minio-container> --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
```

这里只回传卷名和挂载目标，不回传容器环境变量。

## 7. 第六批：GitHub Environments

在仓库 GitHub 页面执行：

1. `Settings → Environments → New environment`，分别创建 `test`、`production`。
2. `test` 首次接管期间临时设置 Required reviewers；接管稳定后移除，实现自动发布。
3. `production` 永久设置 Required reviewers，并禁止管理员绕过。
4. 两个 Environment 分别创建以下 Variables：

| Variable | 值 |
| --- | --- |
| `DEPLOY_HOST` | GitHub Runner 可连接的 SSH 地址 |
| `DEPLOY_PORT` | SSH 端口 |
| `DEPLOY_USER` | `dmpdeploy` |
| `DEPLOY_APP_ROOT` | `/srv/delivery-platform` |
| `DEPLOY_TARGET_ID` | 本机稳定 target-id |
| `INTERNAL_ORIGIN` | 本环境内网完整 origin |
| `PUBLIC_ORIGIN` | 本环境公网 HTTPS origin |

5. 两个 Environment 分别创建 Secrets：`DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS`。
6. `Settings → Secrets and variables → Actions → Variables` 创建仓库变量 `RELEASE_V2_ENABLED=false`。

不创建长期 GHCR PAT。每次部署使用该 job 的短期 `GITHUB_TOKEN`，经固定 host key 的 SSH 标准输入临时登录目标服务器；流程结束无论成功失败都执行 `docker logout ghcr.io`，退出凭据失败会使发布 job 失败。

完成变量和密钥后，在 Actions 手动运行“服务器接管预检”：

1. `environment_name` 先选 `test`，生产准备时再选 `production`。
2. `release_sha` 填已通过不可变 Release 验收的完整 40 位 main SHA。
3. 首次接管审批人批准预检。
4. 工作流验证 SSH、target-id、目录和文件权限、运行配置占位符、旧数据卷、Compose、Nginx sudo、内外网 `/ready`，并用短期凭据确认服务器能读取该 Release 的后端和迁移镜像。
5. 预检只上传临时检查文件并执行 `docker manifest inspect`、`docker compose config` 等检查；不会启动、停止、重建或删除容器和卷，结束后清理临时文件和 GHCR 凭据。

预检必须 PASS 后才能进入 Nginx 和维护窗口步骤。此时仍保持 `RELEASE_V2_ENABLED=false`。

## 8. 第七批：宿主 Nginx

从 `deploy/nginx/delivery-platform.conf.template` 生成本环境配置，替换全部 `__...__`。把 HTTP 规则并入现有 HTTPS server，保持：

- `root /srv/delivery-platform/current/frontend`
- `/api/` 代理到 `127.0.0.1:3000` 或实际 `BACKEND_HOST_PORT`
- `client_max_body_size 501m`
- `proxy_request_buffering off`
- `index.html` 和 `build-info.json` 禁止缓存

旧栈仍提供流量时只准备配置，不立即启用指向尚不存在的 `current/frontend`。维护窗口内切换后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 9. 第八批：测试服务器首次接管

1. 保持旧服务在线，确认目标 SHA 的 quality、build、integration 全部 PASS。
2. 给 `test` Environment 设置临时审批人。
3. 把仓库 Variable `RELEASE_V2_ENABLED` 改为 `true`。
4. 在 Actions 手动运行“构建并发布不可变 Release”，`ref` 填完整 40 位 main SHA。
5. 等待“自动部署测试服务器”进入审批，不要提前停旧服务。
6. 在旧应用目录执行 `bash deploy-git.sh status` 和 `bash deploy-git.sh backup`，验证 MySQL gzip、MinIO tar 和 checksums。
7. 记录旧 Compose 的完整启动参数和三个真实卷名。
8. 在维护窗口执行旧 Compose 的 `down --remove-orphans`，绝对不要加 `-v`。
9. 再次 `docker volume inspect <volume>`，确认三个旧卷存在。
10. 启用宿主 Nginx v2 配置，然后批准 test Environment 部署。
11. 部署会再次创建 v2 成对备份、执行 migration、启动 API/Worker、原子切换前端并检查内外网入口。

验收命令：

```bash
sudo -u dmpdeploy /srv/delivery-platform/control/deploy-release.sh status
curl -fsS <internal-origin>/api/v1/ready
curl -fsS <public-origin>/api/v1/ready
curl -fsS <public-origin>/build-info.json
sudo -u <nginx-worker-user> test -r /srv/delivery-platform/current/frontend/index.html
```

再使用 `admin` 和一个受限账号验证项目、档案、上传/预览/下载、审核、标准、知识、通知和权限矩阵。全部 PASS 后记录完整 SHA、备份路径和 GitHub run URL。

## 10. 第九批：生产推广

生产只能复用已经成功部署 test 并生成 `tested-release` 凭据的同一完整 SHA：

1. 按第 2～8 节准备 production，但保持旧生产服务在线。
2. 先做 legacy 成对备份并核对 checksum。
3. 在 Actions 手动运行“推广已验收 Release 到生产”，输入 test 已验收的完整 SHA。
4. 工作流先验证 `tested-release`；验证通过后才允许 production Environment 审批。
5. 在维护窗口停止旧栈但保留卷，启用 Nginx v2 配置并批准部署。
6. 执行与 test 相同的状态、内外网、静态可读和业务矩阵验收。

生产失败时，migration 开始前可由脚本恢复上一 v2 应用；migration 一旦开始，禁止只回退代码或只切前端。必须按主教程选择同一成对备份执行受控数据恢复。

## 11. 完成记录

| 项目 | test | production |
| --- | --- | --- |
| target-id 已核对 |  |  |
| runtime.env 为 0600 |  |  |
| SSH host key 已线下核对 |  |  |
| Nginx 配置检查 |  |  |
| 旧数据卷已确认 |  |  |
| legacy 成对备份路径 |  |  |
| Release 完整 SHA |  |  |
| backend / migrator digest |  |  |
| frontend checksum |  |  |
| migration |  |  |
| 内网 ready |  |  |
| 公网 ready |  |  |
| build-info releaseId |  |  |
| 管理员业务验收 |  |  |
| 受限账号权限验收 |  |  |
| GitHub run / 审批记录 |  |  |
| 回滚或恢复演练 |  |  |

只有表中全部记录真实 PASS，且 production 已复用 test 的同一 Release，服务器架构接管才算完成。
