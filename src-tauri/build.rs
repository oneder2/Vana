/**
 * No Visitors - Tauri Build Script
 *
 * 目标：
 * - 保持 Tauri v2 默认 build 流程（tauri_build::build）
 * - Tauri v2 会自动处理 Windows 版本资源和图标（通过 tauri.conf.json 配置）
 * - 移除 winres 以避免与 Tauri 的版本资源冲突
 */

fn main() {
    // Tauri v2 默认 build 逻辑（包含权限/能力清单、版本资源、图标等）
    // Windows 版本信息会从 tauri.conf.json 和 Cargo.toml 自动生成
    tauri_build::build();
}

