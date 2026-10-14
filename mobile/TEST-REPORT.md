# 运行环境与测试记录

日期：2026-10-14。范围：本地开发验证版，不是生产上线或应用商店验收。

## 当前执行结果

- Linux：Node.js 24.19.0 初检通过；随后下载并校验官方 Node.js 24.21.0，使用新版本重跑通过，SQLite 3.53.4 可用。npm 11.9.0 已用于锁文件依赖安装。
- 安装 Capacitor core / CLI / Android / iOS 8.5.3，共 99 个 npm 包，使用 `--ignore-scripts`，已保存锁文件。
- 应用自动化测试 7 组全部通过（新增真实服务入口启动及临时目录隔离测试）；包括账号、数据持久化、小组、邀请、排行榜、权限、并发防重复计分、限流和静态数据隔离。
- V12 签到回归测试 1 组通过。
- 网页资源构建通过；Android 工程生成和资源同步通过。
- 提供 Windows x64 / ARM64 专用 Node.js 24.21.0 下载、SHA-256 校验、自动测试入口。校验值来源：<https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt>。
- GitHub Actions Windows Server 2025 x64 / Ubuntu 两个任务均成功；Node.js 24.21.0。Windows 实际执行了官方运行环境下载、哈希校验、安装、7 组应用测试、1 组 V12 回归、构建及 Android 工程生成。
- Windows 启动脚本已在含空格的临时目录中执行，成功启动服务并创建隔离数据库；测试结束后清理进程和测试目录。
- 可核对记录：<https://github.com/tom0303987-debug/Aca/actions/runs/38558191864>。被测试代码提交：`3218df44fb8e91ad5dfe8237efa6e13ca6c07726`。后续交付提交只补充说明文档。
- Windows ARM64 下载入口与官方哈希已准备，但未在 ARM64 设备执行。
- Windows x64 完整包附带官方 Node.js 原始运行环境和许可文件，可离线校验及运行本地测试；不包含数据库、测试账号或 native npm 依赖。

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
