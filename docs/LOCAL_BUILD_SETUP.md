# 本地构建环境清单

本文档给出当前项目在本地进行 Windows / Android 构建时的最低配置要求，以及当前开发机上的已验证状态。

## Windows 最小构建清单

适用场景：
- 本机生成 `.exe` / `.msi`
- 调试 Windows 打包、签名或安装器问题

最低要求：
- Windows 10/11
- Node.js 20+
- Rust stable
- Visual Studio Build Tools 或 Visual Studio 2022
- MSVC C++ 工具链
- WebView2 Runtime
- `npm ci`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm run tauri:build`

如果需要签名：
- `.pfx` 证书
- 证书密码
- 可选时间戳服务配置

当前项目额外注意点：
- Windows MSI 版本号由 CI 从 tag 派生，不建议再手动改 `tauri.conf.json`
- 发布工作流通过 `scripts/sync-version.mjs` 同步版本号

结论：
- 如果你当前不在本机打 Windows 包，不需要优先配置 Windows 环境
- 真正需要时再补 Visual Studio Build Tools 和签名证书即可

## Android 最小构建清单

适用场景：
- 本机生成 APK / AAB
- 验证移动端最低可运行状态
- 在模拟器或真机上检查窄屏布局与基础交互

最低要求：
- Node.js 20+
- Rust stable
- 可用的本机 JDK（JDK 17+；本机实测 Android Studio 自带 JBR 21 可用）
- Android SDK
- Android platform-tools
- Android cmdline-tools
- Android NDK
- Android build-tools
- 至少一个 Android platform
- `aarch64-linux-android` Rust target

推荐补齐：
- `armv7-linux-androideabi`
- `x86_64-linux-android`
- `i686-linux-android`
- Android Emulator
- 至少一个 AVD 或一台真机

项目级要求：
- `ANDROID_HOME`
- `ANDROID_SDK_ROOT`
- `NDK_HOME`
- `JAVA_HOME`
- `npx tauri android init`

补充说明：
- 如果系统自带的是纯 JRE 而不是完整 JDK，Gradle 会在 Android 构建阶段失败
- 本项目当前不要求你额外安装 Oracle/Temurin JDK，只要 `JAVA_HOME` 指向可用的完整 JDK 即可
- 对当前这台开发机，Android Studio 自带的 JBR 是已验证可用方案

Debug 构建：
- `npx tauri android build --debug --target aarch64`

Release 构建：
- 需要 keystore
- 需要 `keystore.properties`
- 需要运行 `scripts/configure-android-signing.py`

## 当前开发机状态

已确认可用：
- `JAVA_HOME=/home/gellar/opt/android-studio/jbr`
- `ANDROID_HOME=/home/gellar/Android/Sdk`
- `ANDROID_SDK_ROOT=/home/gellar/Android/Sdk`
- `NDK_HOME=/home/gellar/Android/Sdk/ndk/28.2.13676358`
- `sdkmanager` 已可直接使用
- `emulator` 已可直接使用
- `adb` 已可直接使用
- Rust Android targets 已安装：
  - `aarch64-linux-android`
  - `armv7-linux-androideabi`
  - `x86_64-linux-android`
  - `i686-linux-android`
- 本机已有 AVD：
  - `Medium_Phone_API_36.1`

已完成的本地配置：
- 已将 Android SDK / emulator / cmdline-tools 路径接入 shell 启动文件
- 已将 Android Studio JBR 接入 shell 启动文件作为 `JAVA_HOME`
- 已完成 `npx tauri android init --ci --skip-targets-install`
- 已补齐 Android Rust targets 所需的 NDK 工具链 `ar` / `ranlib` 兼容链接
- Linux 本地打包已补充 `scripts/pkgconfig/librsvg-2.0.pc` shim
  用于在缺少 `librsvg2-dev` 的机器上通过 AppImage 的 `linuxdeploy-plugin-gtk` 检查

本机实测结果：
- `npx tauri android build --debug --target aarch64` 已成功
- 生成 APK：
  `/home/gellar/Desktop/program/personal/Vana/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
- 生成 AAB：
  `/home/gellar/Desktop/program/personal/Vana/src-tauri/gen/android/app/build/outputs/bundle/universalDebug/app-universal-debug.aab`
- 构建过程中仍会看到部分上游 Kotlin / D8 / Gradle 警告，但当前不阻塞 debug 构建

## 建议使用顺序

1. 前端与桌面基础校验：
   `npm run check`

2. Android 工程初始化：
   `npx tauri android init --ci --skip-targets-install`

3. Android Debug 包验证：
   `npx tauri android build --debug --target aarch64`

   如果 shell 尚未重新加载，可临时显式指定：
   `JAVA_HOME=/home/gellar/opt/android-studio/jbr PATH=/home/gellar/opt/android-studio/jbr/bin:$PATH npx tauri android build --debug --target aarch64`

4. 需要真机/模拟器运行时：
   `emulator -avd Medium_Phone_API_36.1`
   或连接 Android 设备后使用 `adb devices`

5. 需要 Release 包时：
   配置 keystore，再执行签名构建

Linux AppImage 额外说明：
- 如果系统没有安装 `librsvg2-dev`，仓库内的 `scripts/pkgconfig/librsvg-2.0.pc` 会作为本地兜底
- 因此本项目推荐通过 `npm run tauri:build` 或 `npm run tauri -- build --bundles appimage` 触发打包
  不建议直接裸跑 `npx tauri build`，否则可能绕过这个 Linux 本地修复
- 在 Linux 本机也不要追加 `--target x86_64-unknown-linux-gnu`
  否则会额外生成 `src-tauri/target/x86_64-unknown-linux-gnu/`，容易与标准输出 `src-tauri/target/release/` 混淆

## 当前建议

- Windows：先不配本地原生构建环境，除非你马上要在 Windows 本机打包或排查签名问题
- Android：已经值得保留本地构建环境，因为它直接关系到“移动端最低限度运行”的验证
