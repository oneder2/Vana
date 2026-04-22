import fs from "node:fs";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const localPkgConfig = path.join(repoRoot, "scripts", "pkgconfig");
const isLinux = process.platform === "linux";
const nativeLinuxTarget = process.arch === "x64" ? "x86_64-unknown-linux-gnu" : null;
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const cargoConfigPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
const rawArgs = process.argv.slice(2);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const loaded = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    loaded[key] = value;
  }

  return loaded;
}

const env = { ...process.env };
const localEnv = {
  ...loadEnvFile(path.join(repoRoot, ".env")),
  ...loadEnvFile(path.join(repoRoot, ".env.local")),
};
for (const [key, value] of Object.entries(localEnv)) {
  if (!(key in env)) {
    env[key] = value;
  }
}
if (rawArgs.length >= 2 && rawArgs[0] === "android" && rawArgs[1] === "dev") {
  env.VANA_ANDROID_DEV = "1";
}
if (rawArgs.length >= 2 && rawArgs[0] === "android" && rawArgs[1] === "build" && !env.VANA_ANDROID_KEYSTORE_PATH) {
  env.VANA_ANDROID_USE_DEBUG_SIGNING = env.VANA_ANDROID_USE_DEBUG_SIGNING ?? "1";
}
if (isLinux) {
  env.PKG_CONFIG_PATH = env.PKG_CONFIG_PATH
    ? `${localPkgConfig}:${env.PKG_CONFIG_PATH}`
    : localPkgConfig;
}

function normalizeArgs(args) {
  if (!isLinux || !nativeLinuxTarget) {
    return args;
  }

  const normalized = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextArg = args[index + 1];

    if (arg === "--target" && nextArg === nativeLinuxTarget) {
      console.warn(
        `[run-tauri] 检测到本机 Linux 原生 target (${nativeLinuxTarget})，已移除冗余 --target，统一输出到 src-tauri/target/release`
      );
      index += 1;
      continue;
    }

    if (arg === `--target=${nativeLinuxTarget}`) {
      console.warn(
        `[run-tauri] 检测到本机 Linux 原生 target (${nativeLinuxTarget})，已移除冗余 --target，统一输出到 src-tauri/target/release`
      );
      continue;
    }

    normalized.push(arg);
  }

  return normalized;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readCargoPackageName() {
  const cargoToml = fs.readFileSync(cargoConfigPath, "utf8");
  const match = cargoToml.match(/^name\s*=\s*"([^"]+)"/m);
  return match ? match[1] : "vana";
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  ensureDir(dirPath);
}

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const queue = [rootDir];
  const files = [];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

function isLocalPortBusy(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function getTargetTriple(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target" && args[index + 1]) {
      return args[index + 1];
    }
    if (arg.startsWith("--target=")) {
      return arg.slice("--target=".length);
    }
  }
  return null;
}

function getDesktopContext(args) {
  const targetTriple = getTargetTriple(args);
  if (targetTriple?.includes("windows")) {
    return { platform: "windows", arch: "x64", targetTriple };
  }
  return { platform: "linux", arch: "x64", targetTriple: targetTriple ?? nativeLinuxTarget };
}

function buildDesktopTargetRoot(targetTriple) {
  if (targetTriple) {
    return path.join(repoRoot, "src-tauri", "target", targetTriple, "release");
  }
  return path.join(repoRoot, "src-tauri", "target", "release");
}

function collectAndroidArtifacts() {
  const tauriConfig = readJson(tauriConfigPath);
  const version = tauriConfig.version;
  const distDir = path.join(repoRoot, "dist", "android");
  const outputDir = path.join(repoRoot, "src-tauri", "gen", "android", "app", "build", "outputs");
  const releaseDir = path.join(outputDir, "apk", "universal", "release");
  const bundleDir = path.join(outputDir, "bundle", "universalRelease");
  const debugDir = path.join(outputDir, "apk", "arm64", "debug");

  cleanDir(distDir);

  const copied = [];
  const signedReleaseApk = path.join(releaseDir, "app-universal-release.apk");
  const unsignedReleaseApk = path.join(releaseDir, "app-universal-release-unsigned.apk");
  const releaseAab = path.join(bundleDir, "app-universal-release.aab");
  const arm64DebugApk = path.join(debugDir, "app-arm64-debug.apk");

  if (copyIfExists(signedReleaseApk, path.join(distDir, `vana-${version}-android-release.apk`))) {
    copied.push({ label: "Signed release APK", path: path.join(distDir, `vana-${version}-android-release.apk`) });
  } else if (copyIfExists(unsignedReleaseApk, path.join(distDir, `vana-${version}-android-release-unsigned.apk`))) {
    copied.push({ label: "Unsigned release APK", path: path.join(distDir, `vana-${version}-android-release-unsigned.apk`) });
  }

  if (copyIfExists(releaseAab, path.join(distDir, `vana-${version}-android-release.aab`))) {
    copied.push({ label: "Release AAB", path: path.join(distDir, `vana-${version}-android-release.aab`) });
  }

  if (copyIfExists(arm64DebugApk, path.join(distDir, `vana-${version}-android-debug-arm64.apk`))) {
    copied.push({ label: "Debug APK", path: path.join(distDir, `vana-${version}-android-debug-arm64.apk`) });
  }

  return copied;
}

function classifyDesktopBundle(filePath, platform) {
  const lower = filePath.toLowerCase();
  if (platform === "linux") {
    if (lower.endsWith(".appimage")) return { kind: "AppImage", suffix: ".AppImage" };
    if (lower.endsWith(".deb")) return { kind: "Deb", suffix: ".deb" };
    if (lower.endsWith(".rpm")) return { kind: "RPM", suffix: ".rpm" };
  }
  if (platform === "windows") {
    if (lower.endsWith(".msi")) return { kind: "MSI", suffix: ".msi" };
    if (lower.endsWith(".exe")) return { kind: "Installer EXE", suffix: "-setup.exe" };
  }
  return null;
}

function collectDesktopArtifacts(args) {
  const tauriConfig = readJson(tauriConfigPath);
  const version = tauriConfig.version;
  const binaryName = readCargoPackageName();
  const context = getDesktopContext(args);
  const distDir = path.join(repoRoot, "dist", context.platform);
  const targetRoot = buildDesktopTargetRoot(context.targetTriple && context.targetTriple !== nativeLinuxTarget ? context.targetTriple : null);
  const bundleRoot = path.join(targetRoot, "bundle");

  cleanDir(distDir);

  const copied = [];
  const seenKinds = new Set();
  for (const filePath of walkFiles(bundleRoot)) {
    const classification = classifyDesktopBundle(filePath, context.platform);
    if (!classification || seenKinds.has(classification.kind)) {
      continue;
    }
    seenKinds.add(classification.kind);
    const targetPath = path.join(distDir, `vana-${version}-${context.platform}-${context.arch}${classification.suffix}`);
    if (copyIfExists(filePath, targetPath)) {
      copied.push({ label: classification.kind, path: targetPath });
    }
  }

  const binaryFileName = context.platform === "windows" ? `${binaryName}.exe` : binaryName;
  const binarySource = path.join(targetRoot, binaryFileName);
  const binaryTarget = path.join(
    distDir,
    context.platform === "windows"
      ? `vana-${version}-${context.platform}-${context.arch}-portable.exe`
      : `vana-${version}-${context.platform}-${context.arch}-portable`
  );

  if (!copied.some((artifact) => artifact.label === "Portable binary") && copyIfExists(binarySource, binaryTarget)) {
    copied.push({ label: "Portable binary", path: binaryTarget });
  }

  return { platform: context.platform, artifacts: copied };
}

const args = normalizeArgs(rawArgs);
const isAndroidDev = args.length >= 2 && args[0] === "android" && args[1] === "dev";
const isAndroidBuild = args.length >= 2 && args[0] === "android" && args[1] === "build";
const isDesktopDev = args.length > 0 && args[0] === "dev";
const isDesktopBuild = args.length > 0 && args[0] === "build" && !isAndroidBuild;
const appImageRequested = isLinux && args.includes("build") && args.includes("appimage");

if (isDesktopDev) {
  const devPort = Number.parseInt(process.env.PORT || "3000", 10);
  if (await isLocalPortBusy(devPort)) {
    console.error(`[run-tauri] 开发端口 ${devPort} 已被占用。`);
    console.error("[run-tauri] 请先结束旧的 Vite/Tauri 进程，再重新执行 npm run tauri:dev。");
    console.error("[run-tauri] 不要同时手动运行 npm run dev 和 npm run tauri:dev。");
    process.exit(1);
  }
}

function getExpectedAppImagePath() {
  const tauriConfig = readJson(tauriConfigPath);
  return path.join(
    repoRoot,
    "src-tauri",
    "target",
    "release",
    "bundle",
    "appimage",
    `${tauriConfig.productName}_${tauriConfig.version}_amd64.AppImage`
  );
}

function ensureAppImageDesktopIcon() {
  const bundleDir = path.join(repoRoot, "src-tauri", "target", "release", "bundle", "appimage");
  if (!fs.existsSync(bundleDir)) {
    return null;
  }

  const appDirName = fs.readdirSync(bundleDir).find((entry) => entry.endsWith(".AppDir"));
  if (!appDirName) {
    return null;
  }

  const appDir = path.join(bundleDir, appDirName);
  const desktopName = fs.readdirSync(appDir).find((entry) => entry.endsWith(".desktop"));
  if (!desktopName) {
    return appDir;
  }

  const desktopPath = path.join(appDir, desktopName);
  const desktopContent = fs.readFileSync(desktopPath, "utf8");
  const iconMatch = desktopContent.match(/^Icon=(.+)$/m);
  if (!iconMatch) {
    return appDir;
  }

  const iconName = iconMatch[1].trim();
  const candidateExts = [".png", ".svg", ".xpm"];
  const iconExists = candidateExts.some((ext) => fs.existsSync(path.join(appDir, `${iconName}${ext}`)));
  if (iconExists) {
    return appDir;
  }

  const fallbackIcon = fs.readdirSync(appDir).find((entry) => /^.*\.(png|svg|xpm)$/i.test(entry));
  if (!fallbackIcon) {
    return appDir;
  }

  const sourcePath = path.join(appDir, fallbackIcon);
  const targetPath = path.join(appDir, `${iconName}${path.extname(fallbackIcon)}`);
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }

  return appDir;
}

function recoverAppImageBundle() {
  const appDir = ensureAppImageDesktopIcon();
  if (!appDir) {
    return false;
  }

  const pluginPath = path.join(process.env.HOME || "", ".cache", "tauri", "linuxdeploy-plugin-appimage.AppImage");
  if (!fs.existsSync(pluginPath)) {
    return false;
  }

  const bundleDir = path.dirname(appDir);
  const expectedPath = getExpectedAppImagePath();
  const tauriConfig = readJson(tauriConfigPath);
  const fallbackName = `${tauriConfig.productName.replace(/\s+/g, "_")}-x86_64.AppImage`;
  const fallbackPath = path.join(bundleDir, fallbackName);

  const result = spawnSync(pluginPath, ["--appimage-extract-and-run", "--appdir", appDir], {
    cwd: bundleDir,
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    return false;
  }

  if (!fs.existsSync(expectedPath) && fs.existsSync(fallbackPath)) {
    fs.renameSync(fallbackPath, expectedPath);
  }

  return fs.existsSync(expectedPath);
}

if (isAndroidDev) {
  const reverse = spawnSync("adb", ["reverse", "tcp:3000", "tcp:3000"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  if (reverse.status !== 0) {
    console.warn("[run-tauri] adb reverse tcp:3000 tcp:3000 失败，Android 真机可能无法访问本地 dev server");
  }

  if (!args.includes("--host")) {
    args.push("--host", "127.0.0.1");
  }
}

const child =
  process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", "npx", "tauri", ...args], {
        cwd: repoRoot,
        env,
        stdio: "inherit",
        shell: false,
      })
    : spawn("npx", ["tauri", ...args], {
        cwd: repoRoot,
        env,
        stdio: "inherit",
        shell: false,
      });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  let finalCode = code ?? 1;
  if (appImageRequested && (finalCode !== 0 || !fs.existsSync(getExpectedAppImagePath()))) {
    const recovered = recoverAppImageBundle();
    if (recovered) {
      finalCode = 0;
    }
  }

  if (finalCode === 0 && isAndroidBuild) {
    const copiedArtifacts = collectAndroidArtifacts();
    if (copiedArtifacts.length > 0) {
      console.log("\n[run-tauri] Android artifacts");
      for (const artifact of copiedArtifacts) {
        console.log(`- ${artifact.label}: ${artifact.path}`);
      }
    } else {
      console.warn("\n[run-tauri] Android 构建成功，但没有找到可归档的 APK/AAB 产物。");
    }
  }

  if (finalCode === 0 && isDesktopBuild) {
    const result = collectDesktopArtifacts(args);
    if (result.artifacts.length > 0) {
      console.log(`\n[run-tauri] ${result.platform} artifacts`);
      for (const artifact of result.artifacts) {
        console.log(`- ${artifact.label}: ${artifact.path}`);
      }
    } else {
      console.warn(`\n[run-tauri] ${result.platform} 构建成功，但没有找到可归档的桌面端产物。`);
    }
  }

  process.exit(finalCode);
});
