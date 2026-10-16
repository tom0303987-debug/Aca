# Upup有目标 · 手机内测 2.0.1

主题为 #DCE2F1（RGB 220,226,241）。目标、任务、成长维度、奖励、签到、小组榜单和私密账本复用整合版服务。手机端新增安全会话恢复、系统分享导出、原生剪贴板及安卓返回键处理。

## 当前使用范围

这是内测构建，不是商店正式版。APK 可以在支持安装 APK 的 Android 手机上测试；iOS 最低系统版本为 15.4；iOS Simulator 构建只能在 Mac 的模拟器中使用，不能直接安装到 iPhone。iPhone 分发需要持有者配置 Apple 开发者团队、证书与描述文件。

接口预设为 `https://app.okekxf.cn`。目前服务器内网服务已准备，域名 HTTPS 对外服务仍待完成；出现“服务暂未连接”时不能注册、登录或同步。域名启用以后，同一账号在电脑网页、Android 和 iOS 共用服务器记录。本版没有离线记账队列，断网时不要把未成功提交的数据当成已保存。

## 安卓安装

1. 把 `Upup-2.0.1-android-test.apk` 下载到手机，在系统文件管理器中打开。
2. 根据系统提示，仅允许这次用于安装的应用安装 APK；这是未上架的调试签名内测包。
3. 打开“Upup有目标”，确认启动背景及页面浅蓝色主题、登录框与隐私说明正常显示。
4. 待 HTTPS 服务开通后，用管理员提供的内部注册口令创建账号；此口令与加入朋友小组的一次性邀请码不同。

Android 测试包标识为 `cn.okekxf.growth.dev`，最低 Android 7。正式包名候选是 `cn.okekxf.growth`；正式发布与备案之前应确认包名和长期保存的签名证书，不能拿本次调试签名作为正式签名。CI 临时调试签名在重新构建后可能不同；若系统提示签名不一致，需先确认服务端记录可恢复，再卸载旧内测包后安装。

## 账号与备份

- 手机仅保存会话令牌，不保存明文密码。Android 使用 Keystore AES-GCM，iOS 使用设备限定的 Keychain。
- 会话有效期仍为 12 小时，自动恢复不等于永久登录。退出、改密或删号清除本机会话；断网退出时服务端撤销可能未完成，原会话最多存活至到期。
- “我的 → 导出”打开系统分享菜单，可保存 JSON 到自己选定的位置。缓存文件下次启动时清理；分享出去的文件需自行管理。
- Android 自动备份已禁用，不申请通讯录、定位、摄像头、麦克风或全盘文件权限。
- 小组只分享已经说明并同意的参榜统计；任务详情和账本属于个人空间。

## 开发与复现

依赖锁定在 package-lock.json，使用 Node 24。Android 需要 JDK 21 和 Android SDK 36；iOS 需兼容 Capacitor 8 的 macOS/Xcode。

```sh
npm ci
npm run verify
ACA_API_BASE=https://app.okekxf.cn npm run native:android
cd android
./gradlew assembleDebug lintDebug
```

iOS：在 mobile 目录执行 `ACA_API_BASE=https://app.okekxf.cn npm run native:ios`，再用 Xcode 打开 `ios/App/App.xcodeproj`。模拟器无须分发证书；真机在 Signing & Capabilities 中选择自己的团队。不要把私钥、证书密码或服务器注册口令提交到代码仓库。

原生平台目录由 Capacitor 生成并忽略跟踪，持久化适配在 `native/` 与 `scripts/prepare-native.mjs`；该脚本维护会话插件、启动主题、图标与版本。不要只修改生成目录中的同名文件，否则再次同步会覆盖对应模板。

GitHub Actions 工作流 `.github/workflows/mobile-build.yml` 构建 Android APK、执行 Android 模拟器原生会话检查，并编译启动 iOS 模拟器应用。编译、模拟器检查和真实手机验收是不同的验证范围。

## HTTPS 开通后的真机验收

在两台设备上验证：注册与登录、关闭重开、签到防重复、任务与账本同步、旧存档导入、小组邀请与退出排名、导出文件保存、退出后重开、改密撤销其他会话。验证键盘不遮挡提交按钮、刘海屏安全区、系统返回键及隐私页面返回。

公开发布前还需要确认运营主体与联系渠道、完善正式隐私说明和商店资料，并完成相应审核。现阶段不用为构建 APK 再买服务器。
