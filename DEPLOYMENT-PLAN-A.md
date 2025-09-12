# 方案 A：本地打包 → 上传 → 云主机启动（免云端构建）部署指南

本文档给出一套可直接复制执行的命令清单，适用于云主机内存较小、无法在云端构建时的部署方式。

适用范围：本仓库的统一服务入口脚本 scripts/unified-server.js，负责在同一进程内提供静态前端与上传/下载 API。

---

## 0. 环境与前置检查

- Node.js：本地与云主机均建议 Node.js 18+（推荐 20）
- 云主机需有可写的上传目录，例如 /data/uploads

检查与准备：

```bash
# 检查云主机 Node.js 版本
ssh user@your_server 'node -v'

# 预创建上传目录（可按需更换路径）
ssh user@your_server 'sudo mkdir -p /data/uploads && sudo chown $USER:$USER /data/uploads'
```

> 说明：将 user@your_server 替换为你的云主机用户名与地址。

---

## 1. 本地打包（在项目根目录执行）

```bash
# 可选：清理并安装依赖
rm -rf dist node_modules
npm ci

# 构建前端产物
npm run build:web

# 打包最小运行集（仅上传运行需要的文件，体积更小）
# 注意：以项目根目录为当前目录
 tar czf drawnix-unified.tar.gz \
  package.json \
  package-lock.json \
  scripts/unified-server.js \
  dist/apps/web
```

---

## 2. 上传到云主机（二选一）

```bash
# 方式 A：scp
scp drawnix-unified.tar.gz user@your_server:~/

# 方式 B：rsync（增量更快）
rsync -av --progress drawnix-unified.tar.gz user@your_server:~/
```

---

## 3. 云主机解压并安装运行依赖（只装生产依赖）

```bash
# 登录云主机
ssh user@your_server

# 准备目录并解压
mkdir -p ~/apps/drawnix-unified
 tar xzf ~/drawnix-unified.tar.gz -C ~/apps/drawnix-unified

# 安装生产依赖（大幅降低内存占用）
cd ~/apps/drawnix-unified
npm ci --omit=dev

# 配置环境变量（按需修改）
export NODE_ENV=production
export PORT=8080
export UPLOAD_BASE_DIR=/data/uploads
export UPLOAD_TOKEN=your_token_here
export FORCE_BUILD=false
```

---

## 4. 启动服务

- 前台验证（便于观察日志）：

```bash
cd ~/apps/drawnix-unified
node scripts/unified-server.js
```

- 后台守护（任选其一）：

```bash
# 方式 A：nohup
cd ~/apps/drawnix-unified
nohup node scripts/unified-server.js > server.out 2>&1 & echo $! > drawnix.pid

# 方式 B：pm2（需先安装）
npm i -g pm2
pm2 start scripts/unified-server.js --name drawnix --update-env
pm2 save
```

---

## 5. 验证

```bash
# 浏览器访问（需放行云主机防火墙的 8080 端口）
# http://your_server_ip:8080/

# 命令行验证
curl -I http://127.0.0.1:8080/

# 查看日志
# - 如果使用 nohup：
tail -f ~/apps/drawnix-unified/server.out
# - 如果使用 pm2：
pm2 logs drawnix
```

---

## 6. 常见问题与排查

- 端口占用：

```bash
lsof -i :8080
```

- 上传目录权限：

```bash
ls -ld /data/uploads
```

- 启动时触发了构建：确认 `FORCE_BUILD=false` 且 `dist/apps/web/index.html` 存在：

```bash
test -f ~/apps/drawnix-unified/dist/apps/web/index.html && echo ok || echo missing
```

---

## 7. 升级发布（下次有新版本时）

```bash
# 本地重新构建与打包
npm run build:web
 tar czf drawnix-unified.tar.gz \
  package.json \
  package-lock.json \
  scripts/unified-server.js \
  dist/apps/web

# 传至云主机并覆盖
scp drawnix-unified.tar.gz user@your_server:~/
ssh user@your_server 'tar xzf ~/drawnix-unified.tar.gz -C ~/apps/drawnix-unified'

# 平滑重启（按启动方式选择）
## nohup：
ssh user@your_server 'kill "$(cat ~/apps/drawnix-unified/drawnix.pid)" && cd ~/apps/drawnix-unified && nohup node scripts/unified-server.js > server.out 2>&1 & echo $! > drawnix.pid'

## pm2：
ssh user@your_server 'pm2 reload drawnix'
```

---

## 8. 环境变量说明

- PORT：服务监听端口（默认 8080）
- UPLOAD_BASE_DIR：上传文件保存目录（需可写）
- UPLOAD_TOKEN：上传接口鉴权 token（自定义一个强随机值）
- FORCE_BUILD：是否在启动时强制构建前端（方案 A 必须为 false）

> 对应入口脚本：scripts/unified-server.js