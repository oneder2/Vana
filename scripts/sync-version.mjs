import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];

if (!version) {
  console.error("Usage: node scripts/sync-version.mjs <version> [windows-msi-version]");
  process.exit(1);
}

const windowsMsiVersion = process.argv[3];
const repoRoot = process.cwd();

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
packageJson.version = version;
writeJson(packageJsonPath, packageJson);

const packageLockPath = path.join(repoRoot, "package-lock.json");
if (fs.existsSync(packageLockPath)) {
  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
  packageLock.version = version;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = version;
  }
  writeJson(packageLockPath, packageLock);
}

const cargoTomlPath = path.join(repoRoot, "src-tauri", "Cargo.toml");
const cargoToml = fs.readFileSync(cargoTomlPath, "utf8").replace(
  /^version = ".*"$/m,
  `version = "${version}"`
);
fs.writeFileSync(cargoTomlPath, cargoToml);

const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
tauriConfig.version = version;

if (windowsMsiVersion) {
  tauriConfig.bundle ??= {};
  tauriConfig.bundle.windows ??= {};
  tauriConfig.bundle.windows.version = windowsMsiVersion;
} else if (tauriConfig.bundle?.windows?.version) {
  delete tauriConfig.bundle.windows.version;
}

writeJson(tauriConfigPath, tauriConfig);

console.log(
  `Synchronized version ${version}${
    windowsMsiVersion ? ` (MSI ${windowsMsiVersion})` : ""
  }`
);
