#!/bin/bash
# Android 签名配置脚本
# 用途：在 CI 构建时自动配置 Gradle 签名设置
# 
# 此脚本会修改 src-tauri/gen/android/app/build.gradle.kts 文件
# 添加必要的签名配置以使用 keystore.properties 中的密钥

set -e

BUILD_GRADLE_FILE="src-tauri/gen/android/app/build.gradle.kts"

echo "🔧 配置 Android 签名..."

# 检查 build.gradle.kts 是否存在
if [ ! -f "$BUILD_GRADLE_FILE" ]; then
    echo "❌ 错误: $BUILD_GRADLE_FILE 不存在"
    echo "请先运行 'npx tauri android init' 初始化 Android 项目"
    exit 1
fi

# 检查 keystore.properties 是否存在
KEYSTORE_PROPS="src-tauri/gen/android/app/keystore.properties"
if [ ! -f "$KEYSTORE_PROPS" ]; then
    echo "⚠️  警告: $KEYSTORE_PROPS 不存在"
    echo "签名配置将被添加，但需要在构建前创建 keystore.properties 文件"
fi

# 备份原始文件
cp "$BUILD_GRADLE_FILE" "$BUILD_GRADLE_FILE.backup"
echo "✅ 已备份原始文件到 $BUILD_GRADLE_FILE.backup"

# 检查是否已经配置过签名
if grep -q "signingConfigs" "$BUILD_GRADLE_FILE"; then
    echo "⚠️  检测到已存在 signingConfigs 配置，跳过修改"
    echo "如需重新配置，请先删除现有配置或恢复备份文件"
    exit 0
fi

# 创建临时文件用于构建新的配置
TEMP_FILE=$(mktemp)

# 标记是否已添加 import
IMPORT_ADDED=false
# 标记是否已添加 signingConfigs
SIGNING_ADDED=false

# 逐行读取并修改文件
while IFS= read -r line; do
    # 1. 在文件开头添加必要的 import（在第一个非注释、非空行之前）
    if [ "$IMPORT_ADDED" = false ] && [[ "$line" =~ ^[^/\*[:space:]] ]]; then
        cat >> "$TEMP_FILE" << 'EOF'
// Android 签名配置所需的 import
import java.io.FileInputStream
import java.util.Properties

EOF
        IMPORT_ADDED=true
    fi
    
    # 输出当前行
    echo "$line" >> "$TEMP_FILE"
    
    # 2. 在 android { 块内、buildTypes 之前添加 signingConfigs
    if [ "$SIGNING_ADDED" = false ] && echo "$line" | grep -q "buildTypes"; then
        # 在 buildTypes 之前插入 signingConfigs
        cat >> "$TEMP_FILE" << 'EOF'

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
                
                println("✅ 已加载签名配置: keyAlias=${keyAlias}, storeFile=${storeFile}")
            } else {
                println("⚠️  警告: keystore.properties 不存在，将使用 debug 签名")
            }
        }
    }

EOF
        SIGNING_ADDED=true
    fi
    
    # 3. 在 release buildType 中添加 signingConfig 引用
    if echo "$line" | grep -q 'getByName("release")'; then
        # 读取下一行（通常是 { ）
        IFS= read -r next_line
        echo "$next_line" >> "$TEMP_FILE"
        
        # 添加 signingConfig 配置
        cat >> "$TEMP_FILE" << 'EOF'
            // 使用 release 签名配置
            signingConfig = signingConfigs.getByName("release")
EOF
    fi
    
done < "$BUILD_GRADLE_FILE"

# 替换原文件
mv "$TEMP_FILE" "$BUILD_GRADLE_FILE"

echo ""
echo "✅ Android 签名配置完成！"
echo ""
echo "📋 配置摘要："
echo "  - 已添加 import: java.io.FileInputStream, java.util.Properties"
echo "  - 已添加 signingConfigs.release 配置块"
echo "  - 已在 buildTypes.release 中启用签名"
echo ""
echo "📝 下一步："
echo "  1. 确保 keystore.properties 文件存在于 src-tauri/gen/android/app/ 目录"
echo "  2. 运行 'npx tauri android build' 构建签名的 APK"
echo ""
echo "🔍 验证配置："
echo "  可以查看 $BUILD_GRADLE_FILE 确认修改"
echo "  备份文件位于 $BUILD_GRADLE_FILE.backup"

