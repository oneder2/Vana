import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];
const windowsMsiVersion = process.argv[3];
if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)) {
  console.error("Usage: node scripts/sync-version.mjs <version> [windows-msi-version]");
  process.exit(1);
}
if (windowsMsiVersion && !/^\d+\.\d+\.\d+\.\d+$/.test(windowsMsiVersion)) {
  console.error("Invalid Windows MSI version; expected four numeric parts");
  process.exit(1);
}

// Read and validate every input before updating any source or lockfile.
const repoRoot = process.cwd();
const changes = new Map();
function updateJson(name, update) {
  const file = path.join(repoRoot, name);
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  update(value);
  changes.set(file, `${JSON.stringify(value, null, 2)}\n`);
}
updateJson("package.json", value => { value.version = version; });
if (fs.existsSync(path.join(repoRoot, "package-lock.json"))) {
  updateJson("package-lock.json", value => {
    value.version = version;
    if (value.packages?.[""]) value.packages[""].version = version;
  });
}
const cargoPath = path.join(repoRoot, "src-tauri/Cargo.toml");
const cargo = fs.readFileSync(cargoPath, "utf8").replace(/\r\n/g, "\n");
if (!/^version = "[^"]+"$/m.test(cargo)) throw new Error("Package version missing from Cargo.toml");
changes.set(cargoPath, cargo.replace(/^version = "[^"]+"$/m, `version = "${version}"`));
const cargoLockPath = path.join(repoRoot, "src-tauri/Cargo.lock");
if (fs.existsSync(cargoLockPath)) {
  const packageName = cargo.match(/^name = "([^"]+)"$/m)?.[1];
  const escapedName = packageName?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`(\\[\\[package\\]\\]\\nname = "${escapedName}"\\nversion = ")[^"]+("\\n)`);
  const cargoLock = fs.readFileSync(cargoLockPath, "utf8").replace(/\r\n/g, "\n");
  if (!packageName || !matcher.test(cargoLock)) throw new Error("Root package missing from Cargo.lock");
  changes.set(cargoLockPath, cargoLock.replace(matcher, (_, before, after) => before + version + after));
}
updateJson("src-tauri/tauri.conf.json", config => {
  config.version = version;
  if (windowsMsiVersion) {
    config.bundle ??= {};
    config.bundle.windows ??= {};
    config.bundle.windows.wix ??= {};
    config.bundle.windows.wix.version = windowsMsiVersion;
  } else if (config.bundle?.windows?.wix) {
    delete config.bundle.windows.wix.version;
  }
  // Tauri 2 rejects this field from older generated configurations.
  if (config.bundle?.windows) delete config.bundle.windows.version;
});
for (const [file, content] of changes) fs.writeFileSync(file, content);
console.log(`Synchronized version ${version}${windowsMsiVersion ? ` (MSI ${windowsMsiVersion})` : ""}`);
