# 手机内测 2.0.1 验证记录

日期：2026-10-16（北京时间）。

构建源码：`06dd80e7ff3b18eced6bed309da8a6859e4a4ec4`。

构建记录：https://github.com/tom0303987-debug/Aca/actions/runs/38832866987

| 检查 | 结果 |
| --- | --- |
| Node 24 应用测试 | 21 项通过 |
| V12 本地版回归 | 通过 |
| Android APK 编译与 lint | 通过；存在非阻断警告 |
| Android 15 模拟器启动及原生会话 | 1 项仪器测试通过，0 失败、0 错误 |
| Android 主题检查 | 页面计算背景色为 RGB(220,226,241) |
| iOS 模拟器构建 | Xcode 26.3，临时签名，成功 |
| iOS 原生 Keychain 会话 | 保存、读取、清除测试返回 pass |

APK：`Upup-2.0.1-android-test.apk`，4,190,577 字节。

SHA-256：`b2e71afc325be899108d50f66e30851c2f6099dcafed738ee4b575a64ed1bd70`。

包内接口地址经检查为 `https://app.okekxf.cn`；构建标记为 `backend-configured-unverified`。这是调试签名 APK，Android 包名为 `cn.okekxf.growth.dev`。iOS 构建面向模拟器，不是可以安装到 iPhone 的发行 IPA。

本轮修复了 Android 低版本导航栏资源兼容问题、iOS SceneDelegate 未注册自定义会话插件问题、模拟器 Keychain 签名配置问题，以及旧 WebView 的请求超时兼容性。对会话存储失败、写入与退出并发、私有缓存导出及浏览器回退增加了回归验证。

## 验证边界

- 未完成实体 Android 手机或 iPhone 验收；没有进行完整屏幕尺寸、键盘与系统分享目标矩阵测试。
- Android 自动截图发生在启动加载阶段，只显示背景色，不能据此声称安卓视觉验收通过；后续工作流延长截图等待时间。
- HTTPS 对外服务和真实多设备账号同步尚未联调；接口和账号隔离使用隔离的测试数据库验证。
- 没有发布到应用商店，没有正式分发签名；正式运营隐私说明、联系渠道及相关审核仍待完成。
- 源码中的调试会话检查使用固定的无效测试令牌，不包含真实账户或服务器密钥。

安装与下一步操作见 [MOBILE-TESTING.md](MOBILE-TESTING.md)。本文件补充此前 `TEST-REPORT.md` 中的 2.0 历史记录。
