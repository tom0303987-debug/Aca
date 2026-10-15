# 真实联机：需要你操作的项目

此目录提供单服务器、HTTPS、邀请注册的部署配置。代码和配置已准备，尚未在你的服务器上执行。

## 你需要提供

1. 一台可以安装 Docker Engine 与 Compose v2 的 Linux 服务器，并由你登录管理。初期小组可从 2 核、2 GB 内存、20 GB 持久磁盘开始验证；这是起步容量建议，不是性能承诺。先确认预算，不必立即购买。
2. 一个域名或子域名，例如 `growth.你的域名`，将 A 记录指向服务器公网 IP。没有可用 IPv6 时不要配置 AAAA 记录。
3. 防火墙开放 TCP 80、443；SSH 管理入口仅允许你需要的来源。应用8787端口不对公网发布。
4. 你自行设定的内部注册口令，至少12位。不要在聊天里发送服务器密码、SSH私钥、API密钥或口令。

用户位于中国大陆时，部署地区、运营主体、备案和商店资料需在正式提供服务前另行核对。本配置不替代这些手续。

## 部署

将本次交付包上传服务器并解压。进入 `mobile/deploy`：

```sh
cp .env.example .env
```

用文本编辑器修改 `.env` 中的 `APP_DOMAIN` 与 `REGISTRATION_CODE`。可用 `openssl rand -hex 16` 在服务器终端生成口令，自行妥善保存。AI三项留空即可免费验证手动功能。

```sh
docker compose up -d --build
docker compose logs --tail=60 app caddy
```

域名解析与80/443可达后，Caddy会申请HTTPS证书。浏览器打开 `https://你的域名`，使用注册口令创建两个账号：先建组、生成邀请码，另一个账号预览并加入，再测试签到、榜单和退出排名。

`REGISTRATION_CODE` 是注册账号口令；应用内生成的单次小组邀请码用于加入指定小组，两者不同。

应用数据保存在 Docker 命名卷 `app_data`，重建容器保留数据。不要运行 `docker compose down -v`，它会删除数据卷。容器仅通过 Caddy 暴露，`ACA_TRUST_PROXY=true` 仅适用于此配置，不能把应用端口另行公开。

## 备份与恢复

在线备份：

```sh
docker compose exec app node scripts/backup.mjs /app/backups
```

命令返回实际文件名。使用 `docker compose cp app:/app/backups/实际文件名.sqlite ./实际文件名.sqlite` 取出备份，并另存到可靠位置。备份含账号哈希和私人记录，不要放进公开目录或Git仓库。请自行设置每天备份任务和明确的保留期限；本交付不会自动创建付费存储。

恢复需要停止 app，将备份作为 `/app/data/club.sqlite` 替换到数据卷，确认旧数据库的 WAL/SHM 不再混用，并保持文件属于容器的 node 用户，再启动 app。恢复前必须再备份当前卷。建议由你提供服务器运行结果后逐步执行，避免误覆盖。

## 原生移动端下一步

服务器验证成功后，在 `mobile` 目录安装锁定依赖并构建（以下以 Linux/macOS shell 为例）：

```sh
npm ci --ignore-scripts --no-audit --no-fund
ACA_API_BASE=https://你的域名 npm run native:android
```

已存在 Android 工程时用 `ACA_API_BASE=https://你的域名 npm run native:sync`。Windows PowerShell先设置 `$env:ACA_API_BASE='https://你的域名'` 再运行相同 npm 命令。

之后需要 Android Studio/SDK、正式应用ID、签名和真机。iOS需要macOS/Xcode、Apple开发者账号和签名。当前 `dev.acagrowth.internal` 是内测占位ID；确定上架主体后应一次性确定正式ID。登录、导出下载、剪贴板、弱网和生命周期必须在真机验收，当前还不能宣称已可上架。

## 参考

- Caddy HTTPS：https://caddyserver.com/docs/quick-starts/https
- Caddy Docker运行：https://caddyserver.com/docs/running
- SQLite在线备份：https://sqlite.org/backup.html
