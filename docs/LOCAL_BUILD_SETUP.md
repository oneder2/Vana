# 本地构建环境

使用 Node.js 22 LTS、Rust stable、Python 3.11+。依赖以 `npm ci` 和已提交的 Cargo lock 安装；协议回归需要 Docker，图标检查需要 Pillow（`python3 -m pip install 'Pillow>=10,<13'`）。

## Linux

安装 GTK 3、WebKit2GTK 4.1、AppIndicator、librsvg、patchelf 和 C/C++ 构建工具，包清单见 `.github/workflows/ci.yml`。通过 `npm run tauri:build` 使用项目构建入口；本机无需重复指定 Linux target。系统凭据测试使用独立 D-Bus 会话和临时 keyring，避免碰用户已有凭据。

## Android

需要完整 JDK 17+、Android SDK / platform-tools / NDK / build-tools，以及 `aarch64-linux-android` Rust target。已有 Android 工程已入库，不要重复初始化覆盖自定义 Insets、返回键、分享和签名配置。

配置 `JAVA_HOME`、`ANDROID_HOME`、`ANDROID_SDK_ROOT`、`NDK_HOME` 后运行：

```bash
npm ci
npm run tauri:dev:android
# 完整生产构建，默认只支持 64 位 ARM
npm run tauri:build:android
```

正式签名需要 `VANA_ANDROID_KEYSTORE_PATH`、`VANA_ANDROID_KEYSTORE_PASSWORD`、`VANA_ANDROID_KEY_ALIAS`、`VANA_ANDROID_KEY_PASSWORD`；在环境中注入，不生成 `keystore.properties`。体验包使用 `VANA_ANDROID_PREVIEW=1` 和明确的测试签名，与正式包共存；不能用它替代正式签名升级验收。

`adb devices -l` 显示已授权设备后才能安装。版本号、架构和签名验证后用 `adb install -r <APK>` 升级，不卸载、不清空数据。USB 调试授权需要用户在手机确认。

## Windows

需要 Windows 10/11、Visual Studio 2022 C++ Build Tools、MSVC Rust target 与 WebView2。Linux 不能代替 Windows 原生运行与安装验收。发布构建在 Windows CI 上进行，产物签名与实际 PFX 证书指纹比对；项目自签名证书不等于用户系统信任的商业发行者。

## 检查与产物

```bash
bash scripts/check-build-ready.sh
npm run tauri:build
```

构建入口把当前平台产物归档到 `dist/linux`、`dist/windows`、`dist/android`。官网独立生成静态文件，无 Node 常驻服务，见 [官网维护](../website/README.md)。正式分发与版本策略见 [部署指南](DEPLOYMENT.md) 和 [版本策略](VERSIONING.md)。

多个 worktree 构建 Android 时，优先使用各自默认的 Cargo target 目录。跨工作树共享 `CARGO_TARGET_DIR` 可能复用绑定旧目录的 Tauri Kotlin 生成缓存，导致缺少 `TauriActivity`；这时只清理相应目标的 Tauri 编译缓存后重建，不要重建或覆盖已提交的 Android 项目。
