import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const localPkgConfig = path.join(repoRoot, "scripts", "pkgconfig");
const isLinux = process.platform === "linux";
const nativeLinuxTarget = process.arch === "x64" ? "x86_64-unknown-linux-gnu" : null;
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");

const env = { ...process.env };
if (isLinux) {
  env.PKG_CONFIG_PATH = env.PKG_CONFIG_PATH
    ? `${localPkgConfig}:${env.PKG_CONFIG_PATH}`
    : localPkgConfig;
}

const rawArgs = process.argv.slice(2);

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

const args = normalizeArgs(rawArgs);
const appImageRequested = isLinux && args.includes("build") && args.includes("appimage");

function getExpectedAppImagePath() {
  const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
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
  const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
  const fallbackName = `${tauriConfig.productName.replace(/\s+/g, "_")}-x86_64.AppImage`;
  const fallbackPath = path.join(bundleDir, fallbackName);

  const result = spawnSync(
    pluginPath,
    ["--appimage-extract-and-run", "--appdir", appDir],
    {
      cwd: bundleDir,
      env,
      stdio: "inherit",
    }
  );

  if (result.status !== 0) {
    return false;
  }

  if (!fs.existsSync(expectedPath) && fs.existsSync(fallbackPath)) {
    fs.renameSync(fallbackPath, expectedPath);
  }

  return fs.existsSync(expectedPath);
}

const child = spawn("npx", ["tauri", ...args], {
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

  if (appImageRequested && ((code ?? 1) !== 0 || !fs.existsSync(getExpectedAppImagePath()))) {
    const recovered = recoverAppImageBundle();
    if (recovered) {
      process.exit(0);
      return;
    }
  }

  process.exit(code ?? 1);
});
