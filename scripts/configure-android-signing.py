#!/usr/bin/env python3
"""
Android Gradle 签名配置脚本
用途：自动修改 build.gradle.kts 文件以添加签名配置

此脚本会：
1. 添加必要的 import 语句
2. 在 android {} 块中添加 signingConfigs
3. 在 buildTypes.release 中启用签名配置
"""

import sys
import re
from pathlib import Path

BUILD_GRADLE_FILE = Path("src-tauri/gen/android/app/build.gradle.kts")
KEYSTORE_PROPS_FILE = Path("src-tauri/gen/android/app/keystore.properties")

# 需要添加的 import 语句
REQUIRED_IMPORTS = [
    "import java.io.FileInputStream",
    "import java.util.Properties"
]

# signingConfigs 配置块
SIGNING_CONFIGS = '''
    // 签名配置：从 keystore.properties 读取签名信息
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            
            // 如果 keystore.properties 存在，则加载配置
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
                
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                
                println("✅ 已加载签名配置: keyAlias=$keyAlias, storeFile=$storeFile")
            } else {
                println("⚠️  警告: keystore.properties 不存在，将使用 debug 签名")
            }
        }
    }
'''

# 在 release buildType 中添加的签名配置
SIGNING_CONFIG_REF = '            signingConfig = signingConfigs.getByName("release")'


def check_files():
    """检查必要的文件是否存在"""
    if not BUILD_GRADLE_FILE.exists():
        print(f"❌ 错误: {BUILD_GRADLE_FILE} 不存在")
        print("请先运行 'npx tauri android init' 初始化 Android 项目")
        return False
    
    if not KEYSTORE_PROPS_FILE.exists():
        print(f"⚠️  警告: {KEYSTORE_PROPS_FILE} 不存在")
        print("签名配置将被添加，但需要在构建前创建 keystore.properties 文件")
    
    return True


def backup_file():
    """备份原始文件"""
    backup_path = BUILD_GRADLE_FILE.with_suffix('.kts.backup')
    backup_path.write_text(BUILD_GRADLE_FILE.read_text())
    print(f"✅ 已备份原始文件到 {backup_path}")


def add_imports(lines):
    """添加必要的 import 语句"""
    # 找到第一个非注释、非空行的位置
    insert_pos = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith('//') and not stripped.startswith('/*'):
            insert_pos = i
            break
    
    # 检查是否已经有这些 import
    existing_imports = set()
    for line in lines[:insert_pos + 20]:  # 只检查前面的行
        for imp in REQUIRED_IMPORTS:
            if imp in line:
                existing_imports.add(imp)
    
    # 添加缺失的 import
    imports_to_add = [imp for imp in REQUIRED_IMPORTS if imp not in existing_imports]
    
    if imports_to_add:
        import_lines = [f"{imp}\n" for imp in imports_to_add]
        import_lines.append("\n")  # 添加空行
        lines[insert_pos:insert_pos] = import_lines
        print(f"✅ 已添加 {len(imports_to_add)} 个 import 语句")
    else:
        print("ℹ️  Import 语句已存在，跳过")
    
    return lines


def add_signing_configs(lines):
    """添加 signingConfigs 配置块"""
    # 检查是否已经存在 signingConfigs
    if any('signingConfigs' in line for line in lines):
        print("⚠️  检测到已存在 signingConfigs 配置，跳过添加")
        return lines, False
    
    # 找到 buildTypes 的位置
    buildtypes_pos = -1
    for i, line in enumerate(lines):
        if 'buildTypes' in line and '{' in line:
            buildtypes_pos = i
            break
    
    if buildtypes_pos == -1:
        print("❌ 错误: 未找到 buildTypes 配置块")
        return lines, False
    
    # 在 buildTypes 之前插入 signingConfigs
    # 计算缩进
    indent = len(lines[buildtypes_pos]) - len(lines[buildtypes_pos].lstrip())
    
    # 插入 signingConfigs
    signing_lines = SIGNING_CONFIGS.split('\n')
    lines[buildtypes_pos:buildtypes_pos] = [line + '\n' for line in signing_lines]
    
    print("✅ 已添加 signingConfigs 配置块")
    return lines, True


def add_signing_to_release(lines):
    """在 release buildType 中添加签名配置引用"""
    # 找到 release buildType
    release_pos = -1
    for i, line in enumerate(lines):
        if 'getByName("release")' in line or "getByName('release')" in line:
            release_pos = i
            break
    
    if release_pos == -1:
        print("⚠️  警告: 未找到 release buildType，跳过添加签名引用")
        return lines, False
    
    # 检查是否已经有 signingConfig
    # 检查接下来的 10 行
    for i in range(release_pos, min(release_pos + 10, len(lines))):
        if 'signingConfig' in lines[i]:
            print("ℹ️  release buildType 中已存在 signingConfig，跳过")
            return lines, False
    
    # 找到 release 块的开始 {
    brace_pos = release_pos
    for i in range(release_pos, min(release_pos + 5, len(lines))):
        if '{' in lines[i]:
            brace_pos = i
            break
    
    # 在 { 后面插入 signingConfig
    insert_pos = brace_pos + 1
    lines.insert(insert_pos, SIGNING_CONFIG_REF + '\n')
    
    print("✅ 已在 release buildType 中添加签名配置引用")
    return lines, True


def main():
    """主函数"""
    print("🔧 配置 Android 签名...")
    print()
    
    # 检查文件
    if not check_files():
        return 1
    
    # 备份文件
    backup_file()
    
    # 读取文件
    lines = BUILD_GRADLE_FILE.read_text().splitlines(keepends=True)
    
    # 添加 imports
    lines = add_imports(lines)
    
    # 添加 signingConfigs
    lines, signing_added = add_signing_configs(lines)
    
    # 添加签名引用到 release buildType
    lines, ref_added = add_signing_to_release(lines)
    
    # 写回文件
    BUILD_GRADLE_FILE.write_text(''.join(lines))
    
    print()
    print("✅ Android 签名配置完成！")
    print()
    print("📋 配置摘要：")
    print("  - 已添加 import: java.io.FileInputStream, java.util.Properties")
    if signing_added:
        print("  - 已添加 signingConfigs.release 配置块")
    if ref_added:
        print("  - 已在 buildTypes.release 中启用签名")
    print()
    print("📝 下一步：")
    print("  1. 确保 keystore.properties 文件存在于 src-tauri/gen/android/app/ 目录")
    print("  2. 运行 'npx tauri android build' 构建签名的 APK")
    print()
    print("🔍 验证配置：")
    print(f"  可以查看 {BUILD_GRADLE_FILE} 确认修改")
    print(f"  备份文件位于 {BUILD_GRADLE_FILE.with_suffix('.kts.backup')}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

