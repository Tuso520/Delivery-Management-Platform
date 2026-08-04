# 测试与生产服务器接管操作单

状态：测试服务器 v2 接管、空库重建、不可变 Release 真实集成验收和自动部署均已通过；生产服务器尚待按本文准备。

本文是 [发布与服务器架构 v2](deployment-architecture-v2.md) 的执行工作单。先完整完成测试服务器，再用同一已验收 Release 接管生产。命令默认由有 sudo 权限的人工运维账号执行；`dmpdeploy` 只供 GitHub Actions 发布。

## 1. 安全边界

- 不在聊天、工单或 CI 日志中发送密码、私钥、Token、数据库备份、完整 `runtime.env` 或旧 `.env`。
- 只回传主机名、版本、端口、容器名、镜像名、卷名、目录权限、健康状态和 SHA；公网地址可按组织要求脱敏。
- 测试环境已由所有者明确授权为可销毁环境；只允许通过受控的 `reset_test_data=true` 工作流重建三个测试数据卷，不手工全局清卷。
- 生产停止旧栈时禁止 `down -v`，禁止 `docker volume prune`，禁止删除旧目录、旧卷和备份。
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

### 3.1 测试服务器已确认基线（2026-08-02）

- 公网/私网：`1.117.73.165` / `10.0.0.6`；SSH `22`。
- 旧 Compose：`delivery-platform-test`，7 个容器健康运行；前端 `18080`，后端 `127.0.0.1:3000`。
- 测试数据卷：`delivery-platform-test_mysql_data`、`delivery-platform-test_redis_data`、`delivery-platform-test_minio_data`；原历史数据已获授权删除，并已通过受控发布重建为空数据层。
- 测试数据库按 `runtime.env` 固定为 `mysql:8.0`；空库启动后执行 Prisma migration 和正式基础 seed，不执行 legacy 数据恢复或历史模型回灌。
- 宿主 Nginx 是宝塔 `1.30.3`：二进制 `/www/server/nginx/sbin/nginx`，配置 `/www/server/nginx/conf/nginx.conf`，worker 用户 `www`；systemd unit 为 inactive，禁止使用 `systemctl reload nginx`。
- 服务器 3.6 GiB 内存且无 Swap；系统盘曾有 44.96 GiB 可回收 Docker build cache。只允许 `docker builder prune --all --force` 清构建缓存，禁止 `docker system prune`、`docker volume prune` 和任何 `down -v`。

构建缓存清理后确认至少 10 GiB 可用，再创建 2 GiB Swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 0600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -q '^/swapfile[[:space:]]' /etc/fstab || \
  printf '/swapfile none swap sw 0 0\n' | sudo tee -a /etc/fstab >/dev/null
swapon --show
free -h
```

若 `/swapfile` 已存在，不重复执行创建命令，先核对 `swapon --show` 和 `/etc/fstab`。

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

## 5. 第四批：受限 Nginx 适配器与服务器身份

将 `deploy/nginx/dmp-nginx-control.template` 中两个占位符替换为本机真实路径，以 `755 root:root` 安装到 `/usr/local/sbin/dmp-nginx-control`。测试服务器固定为：

```text
__NGINX_BINARY__=/www/server/nginx/sbin/nginx
__NGINX_CONFIG__=/www/server/nginx/conf/nginx.conf
```

然后使用 `sudo visudo -f /etc/sudoers.d/delivery-platform-deploy` 写入：

```text
dmpdeploy ALL=(root) NOPASSWD: /usr/local/sbin/dmp-nginx-control check
dmpdeploy ALL=(root) NOPASSWD: /usr/local/sbin/dmp-nginx-control reload
```

校验：

```bash
sudo chmod 0440 /etc/sudoers.d/delivery-platform-deploy
sudo visudo -cf /etc/sudoers.d/delivery-platform-deploy
sudo stat -c '%a %U:%G %n' /usr/local/sbin/dmp-nginx-control
sudo -u dmpdeploy sudo -n /usr/local/sbin/dmp-nginx-control check
```

适配器必须为 `755 root:root`。它只控制宿主 Nginx 的指定二进制和配置，不会向旧前端容器中的 Nginx master 发送信号。

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

## 6. 第五批：运行配置和数据卷

测试服务器当前采用全新数据基线：保留既有 `runtime.env` 凭据和稳定卷名，但不保留旧业务数据。再次需要清空测试数据时，只能手动运行“部署已存在 Release 到测试”并设置 `reset_test_data=true`；脚本会核对 `test` Environment、target-id、Compose 解析出的精确卷名和发布清单后再重建。生产永远不允许该选项。

旧 Docker 栈仍在线时，优先在 Actions 手动运行“安全迁移服务器运行配置”。测试服务器填写：

- `environment_name=test`
- `legacy_compose_project=delivery-platform-test`

该工作流只把一次性脚本上传给 `dmpdeploy`，从运行中的 MySQL、Redis、MinIO、backend 和 file-worker 容器读取有效配置，校验原凭据仍可认证，再原子创建 `600 dmpdeploy:dmpdeploy` 的 `runtime.env`。它不读取旧 `.env`、不输出任何配置值、不停止或修改旧容器，并在目标文件已存在时拒绝覆盖。新生成的两个 seed 密码不会重置既有账号，因为脚本固定写入 `SEED_RESET_EXISTING_USER_PASSWORDS=false`。

如果脚本报告旧值包含无法安全迁移的字符、缺少集成加密密钥、容器不唯一或认证失败，立即停止，不要把值发到聊天或 CI。由服务器管理员在本机密码管理器配合下按下面的手工方式处理。

新服务器或无法从旧容器迁移时，从仓库复制 `deploy/runtime-config.template` 到服务器临时路径，再安装：

```bash
sudo -u dmpdeploy install -m 0600 /path/to/runtime-config.template \
  /srv/delivery-platform/config/runtime.env
sudo -u dmpdeploy editor /srv/delivery-platform/config/runtime.env
```

配置规则：

- test 的项目、网络和卷前缀使用 `delivery-platform-test-*`；production 使用 `delivery-platform-production-*`。
- 生产旧栈接管必须把 MySQL、Redis、MinIO 的真实命名卷写入三个 `*_VOLUME_NAME`，不能换成空卷；全新生产服务器则先按空库流程建卷、migration 和正式基础 seed。
- `CORS_ORIGIN` 写公网 HTTPS origin；测试和生产的所有密码、JWT、MinIO、Redis、数据库凭据必须不同。
- `INTEGRATION_SECRET_ENCRYPTION_KEY` 使用 `openssl rand -base64 32` 生成并长期保存，不能随发布轮换。
- `SEED_RESET_EXISTING_USER_PASSWORDS=false` 保持不变。
- `SEED_ADMIN_PASSWORD` 和 `SEED_DEFAULT_PASSWORD` 必须来自密码管理器；既有账号默认不会被重置。
- 不得设置 `SEED_INCLUDE_DEMO_DATA=true`；测试服务器重建空数据卷后的正式 seed 只创建唯一 `admin`，演示账号与示例项目只允许存在于 CI 隔离数据库。

## 飞书首次启用

测试服务器 Release 健康检查通过后，管理员按 [飞书通讯录同步与 OAuth 登录](feishu-auth-and-org-sync.md) 在系统设置中录入 App ID、App Secret、根部门和 `https://1.117.73.165/api/v1/auth/feishu/callback`。先执行连接测试，再执行全量同步；只有 `failed=0` 且身份绑定唯一后才验收扫码登录。飞书凭据不得写入 GitHub Variable、教程命令、聊天或服务器日志。

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
2. `test` 不设置 Required reviewers，实现 main 验收通过后自动发布；当前已完成该设置。
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
6. `Settings → Secrets and variables → Actions → Variables` 创建仓库变量 `RELEASE_V2_ENABLED`；准备阶段为 `false`，接管完成后改为 `true`。测试服务器当前已启用。

不创建长期 GHCR PAT。每次部署使用该 job 的短期 `GITHUB_TOKEN`，经固定 host key 的 SSH 标准输入临时登录目标服务器；流程结束无论成功失败都执行 `docker logout ghcr.io`，退出凭据失败会使发布 job 失败。

完成变量和密钥后，在 Actions 手动运行“服务器接管预检”：

1. `environment_name` 先选 `test`，生产准备时再选 `production`。
2. `release_sha` 填已通过不可变 Release 验收的完整 40 位 main SHA。
3. 首次接管审批人批准预检。
4. 工作流验证 SSH、target-id、目录和文件权限、运行配置占位符、旧数据卷、Compose、Nginx sudo、内外网 `/ready`，并用短期凭据确认服务器能读取该 Release 的后端和迁移镜像。
5. 预检只上传临时检查文件并执行 `docker manifest inspect`、`docker compose config` 等检查；不会启动、停止、重建或删除容器和卷，结束后清理临时文件和 GHCR 凭据。

预检必须 PASS 后才能进入 Nginx 和维护窗口步骤。此时仍保持 `RELEASE_V2_ENABLED=false`。

## 8. 第七批：宿主 Nginx

先从 `deploy/nginx/delivery-platform-app.inc.template` 生成共享应用片段，替换 `__APP_ROOT__` 和 `__BACKEND_PORT__`。有域名时再从 `deploy/nginx/delivery-platform.conf.template` 生成入口配置，替换两个主机名；HTTPS server 在证书指令后包含同一个共享应用片段。共享片段保持：

- `root /srv/delivery-platform/current/frontend`
- `/api/` 代理到 `127.0.0.1:3000` 或实际 `BACKEND_HOST_PORT`
- `client_max_body_size 501m`
- `proxy_request_buffering off`
- `index.html` 和 `build-info.json` 禁止缓存

旧栈仍提供流量时只准备配置，不立即启用指向尚不存在的 `current/frontend`。维护窗口内切换后执行：

```bash
sudo /usr/local/sbin/dmp-nginx-control check
sudo /usr/local/sbin/dmp-nginx-control reload
```

### 8.1 无域名：公网 IP HTTPS

无域名时不允许把生产公网入口降级为 HTTP。每台服务器使用各自公网 IP 的 Let’s Encrypt `shortlived` 证书：

```text
PUBLIC_ORIGIN=https://<public-ip>
INTERNAL_ORIGIN=http://127.0.0.1:8081
CORS_ORIGIN=https://<public-ip>
```

IP 证书约 160 小时有效，必须使用 Certbot 5.4 或更高版本并自动续期。Debian 12 示例：

```bash
sudo apt-get update
sudo apt-get install -y python3-venv
sudo /usr/bin/python3 -m venv /opt/certbot
sudo /opt/certbot/bin/pip install --upgrade pip 'certbot>=5.4'
sudo ln -sfn /opt/certbot/bin/certbot /usr/local/sbin/certbot
/usr/local/sbin/certbot --version
```

创建 challenge 目录，把 `delivery-platform-ip-acme-bootstrap.conf.template` 中的 `__PUBLIC_IP__` 替换为本机公网 IP，安装到 Nginx 实际加载的 vhost 目录：

```bash
sudo install -d -m 0755 /var/www/certbot/.well-known/acme-challenge
sudo /usr/local/sbin/dmp-nginx-control check
sudo /usr/local/sbin/dmp-nginx-control reload
printf 'acme-ready\n' | sudo tee /var/www/certbot/.well-known/acme-challenge/probe >/dev/null
curl -fsS http://<public-ip>/.well-known/acme-challenge/probe
sudo rm -f /var/www/certbot/.well-known/acme-challenge/probe
```

先使用独立目录请求不受信任的 staging 证书，避免消耗生产限额：

```bash
sudo /usr/local/sbin/certbot certonly \
  --staging \
  --preferred-profile shortlived \
  --webroot \
  --webroot-path /var/www/certbot \
  --ip-address <public-ip> \
  --email <certificate-notice-email> \
  --agree-tos \
  --non-interactive \
  --config-dir /etc/letsencrypt-staging \
  --work-dir /var/lib/letsencrypt-staging \
  --logs-dir /var/log/letsencrypt-staging
```

staging PASS 后申请正式证书：

```bash
sudo /usr/local/sbin/certbot certonly \
  --preferred-profile shortlived \
  --webroot \
  --webroot-path /var/www/certbot \
  --ip-address <public-ip> \
  --email <certificate-notice-email> \
  --agree-tos \
  --non-interactive

sudo test -r /etc/letsencrypt/live/<public-ip>/fullchain.pem
sudo test -r /etc/letsencrypt/live/<public-ip>/privkey.pem
```

把 `delivery-platform-app.inc.template` 中的 `__APP_ROOT__` 替换为 `/srv/delivery-platform`、`__BACKEND_PORT__` 替换为 `3000`（若运行配置使用其他宿主端口则填真实值），安装为 `/etc/nginx/snippets/delivery-platform-app.inc`。把 `delivery-platform-ip.conf.template` 中的 `__PUBLIC_IP__` 替换为公网 IP 后，取代引导 vhost。证书存在前禁止启用 443 模板。

安装自动续期单元，把 `__CERTBOT_PATH__` 替换为 `/usr/local/sbin/certbot`。续期成功且证书实际更新时，deploy hook 通过同一个 `/usr/local/sbin/dmp-nginx-control reload` 适配器重载宿主 Nginx：

```bash
sudo install -m 0644 deploy/systemd/delivery-platform-certbot-renew.service.template \
  /etc/systemd/system/delivery-platform-certbot-renew.service
sudo install -m 0644 deploy/systemd/delivery-platform-certbot-renew.timer \
  /etc/systemd/system/delivery-platform-certbot-renew.timer
sudo editor /etc/systemd/system/delivery-platform-certbot-renew.service
sudo systemctl daemon-reload
sudo systemctl enable --now delivery-platform-certbot-renew.timer
sudo systemctl start delivery-platform-certbot-renew.service
sudo systemctl status delivery-platform-certbot-renew.timer --no-pager
sudo /usr/local/sbin/dmp-nginx-control check
```

最终必须真实 PASS：

```bash
curl -fsS http://127.0.0.1:8081/api/v1/ready
curl -fsS https://<public-ip>/api/v1/ready
curl -fsS https://<public-ip>/build-info.json
```

## 9. 第八批：测试服务器首次接管（已完成）

当前测试服务器已完成账号、目录、固定 host key、Nginx、IP HTTPS、证书续期、空数据层重建和自动发布。以下步骤保留为重建服务器时的标准操作；无需再迁移或备份现有测试历史数据。

1. 保持旧服务在线，确认目标 SHA 的 quality、build、integration 全部 PASS。
2. 如需人工观察首发，可临时给 `test` Environment 设置审批人；稳定后必须移除。
3. 把仓库 Variable `RELEASE_V2_ENABLED` 改为 `true`。
4. 在 Actions 手动运行“构建并发布不可变 Release”，`ref` 填完整 40 位 main SHA。
5. 等待“自动部署测试服务器”进入审批，不要提前停旧服务。
6. 可销毁测试环境无需 legacy 备份；运行“部署已存在 Release 到测试”，填写原 SHA 并设置 `reset_test_data=true`。
7. 工作流核对三个精确测试卷后停止应用、删除并重建数据层，执行 migration 和正式基础 seed。
8. 启用宿主 Nginx v2 配置；如设置了临时审批人，此时批准部署。
9. 部署启动 API/Worker、原子切换前端并检查内外网入口；通过后移除 test 审批人，恢复自动发布。

如果该 SHA 早已完成 Release 构建与真实集成，只是此前因开关为 `false` 跳过部署，则第 4～5 步改为运行“部署已存在 Release 到测试”并填写原 SHA。不得重新构建同一 SHA；该工作流直接验证并复用 GHCR 中原有 Manifest、镜像和前端包。

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
| 数据卷策略已确认 | 空库重建 |  |
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
