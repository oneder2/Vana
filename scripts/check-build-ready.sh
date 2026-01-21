#!/bin/bash
# Beta 构建就绪检查脚本

set -e

echo "=== Beta 构建就绪检查 ==="
echo ""

# 1. 检查版本号一致性
echo "1. 检查版本号一致性..."
VERSION_TAURI=$(grep '"version"' src-tauri/tauri.conf.json | cut -d'"' -f4)
VERSION_CARGO=$(grep '^version' src-tauri/Cargo.toml | cut -d'"' -f2)
VERSION_NPM=$(grep '"version"' package.json | cut -d'"' -f4)

echo "  Tauri config: $VERSION_TAURI"
echo "  Cargo.toml:   $VERSION_CARGO"
echo "  package.json: $VERSION_NPM"

if [ "$VERSION_TAURI" = "$VERSION_CARGO" ] && [ "$VERSION_CARGO" = "$VERSION_NPM" ]; then
    echo "  ✓ 版本号一致"
else
    echo "  ✗ 版本号不一致！"
    exit 1
fi

echo ""

# 2. 检查图标文件
echo "2. 检查图标文件..."
ICON_FILES=(
    "src-tauri/icons/32x32.png"
    "src-tauri/icons/128x128.png"
    "src-tauri/icons/128x128@2x.png"
    "src-tauri/icons/icon.ico"
    "src-tauri/icons/icon.png"
)

ALL_ICONS_OK=true
for icon in "${ICON_FILES[@]}"; do
    if [ -f "$icon" ]; then
        SIZE=$(stat -c%s "$icon" 2>/dev/null || stat -f%z "$icon" 2>/dev/null)
        if [ "$SIZE" -gt 0 ]; then
            echo "  ✓ $icon ($SIZE bytes)"
        else
            echo "  ✗ $icon (空文件)"
            ALL_ICONS_OK=false
        fi
    else
        echo "  ✗ $icon (不存在)"
        ALL_ICONS_OK=false
    fi
done

if [ "$ALL_ICONS_OK" = false ]; then
    echo "  运行 ./src-tauri/icons/generate-icons.sh 生成图标"
    exit 1
fi

echo ""

# 3. 检查 Next.js 构建
echo "3. 检查 Next.js 构建..."
if npm run build > /dev/null 2>&1; then
    echo "  ✓ Next.js 构建成功"
else
    echo "  ✗ Next.js 构建失败"
    exit 1
fi

echo ""

# 4. 检查 Rust 编译
echo "4. 检查 Rust 编译..."
if cargo check --manifest-path src-tauri/Cargo.toml > /dev/null 2>&1; then
    echo "  ✓ Rust 编译成功"
else
    echo "  ✗ Rust 编译失败"
    exit 1
fi

echo ""

# 5. 检查敏感文件
echo "5. 检查敏感文件..."
if [ -f "secrets/.pat" ]; then
    echo "  ⚠ secrets/.pat 存在（确保已添加到 .gitignore）"
else
    echo "  ✓ 无敏感文件泄露风险"
fi

echo ""

# 6. 检查构建产物目录
echo "6. 检查构建配置..."
if [ -f "src-tauri/tauri.conf.json" ]; then
    echo "  ✓ tauri.conf.json 存在"
    if grep -q '"icon"' src-tauri/tauri.conf.json; then
        echo "  ✓ 图标配置存在"
    else
        echo "  ✗ 缺少图标配置"
        exit 1
    fi
else
    echo "  ✗ tauri.conf.json 不存在"
    exit 1
fi

echo ""
echo "=== 所有检查通过！可以运行 npm run tauri:build ==="
echo ""
echo "提示：如果构建时间过长，可以："
echo "  1. 使用 --target 参数只构建特定平台"
echo "  2. 检查网络连接（首次构建需要下载依赖）"
echo "  3. 确保有足够的磁盘空间"

