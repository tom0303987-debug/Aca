# 运行环境与测试记录

日期：2026-10-14。范围：本地开发验证版，不是生产上线或应用商店验收。

## 当前执行结果

- Linux：Node.js 24.19.0 / npm 11.9.0；SQLite 可用。
- 安装 Capacitor core / CLI / Android / iOS 8.5.3，共 99 个 npm 包，使用 `--ignore-scripts`，已保存锁文件。
- 应用自动化测试 6 组全部通过；包括账号、数据持久化、小组、邀请、排行榜、权限、并发防重复计分、限流和静态数据隔离。
- V12 签到回归测试 1 组通过。
- 网页资源构建通过；Android 工程生成和资源同步通过。
- 提供 Windows x64 / ARM64 专用 Node.js 24.21.0 下载、SHA-256 校验、自动测试入口。校验值来源：<https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt>。
- 增加 GitHub Actions Windows/Linux 检查，仅在开发分支执行，不部署网站。远程实际结果以工作流记录为准。

## 如何重跑

Windows：双击 `INSTALL-AND-TEST-WINDOWS.cmd`。成功后双击 `START-WINDOWS.cmd`，打开控制台显示的本机地址。

已有 Node.js 24：在 mobile 目录运行 `node scripts/verify.mjs`。测试使用临时数据库／内存数据库，不会修改你的 `data/club.sqlite`。测试日志在 `test-results/latest.txt`；每次重跑覆盖上一次结果。

可选 Android 工程准备：`npm ci --ignore-scripts --no-audit --no-fund`，再运行 `npm run native:android`。再次同步用 `npx cap sync android`。已有 Android 目录时无需重复 add。

## 尚未验证

- 用户自己的 Windows 电脑安装和浏览器交互；没有远程控制该电脑的能力。
- 浏览器视觉、无障碍、移动端点击、原生导出／剪贴板。
- Android SDK／签名编译、模拟器、手机真机和 iOS Xcode 构建。
- 远程多人联网、应用商店。后端仍仅监听本机；原生工程不含可用的远程后端地址。

当前 Linux 只有 Java 17，未安装 Android SDK；iOS 构建需要 macOS/Xcode。工程生成成功不能代表 APK/IPA 编译或上架成功。
