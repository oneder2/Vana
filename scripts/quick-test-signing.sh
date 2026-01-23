#!/bin/bash
# 快速测试 Android 签名配置
# 简化版本，用于快速验证

echo "🧪 Android 签名快速测试"
echo "========================"
echo ""

# 不使用 set -e，避免意外退出
PASS=0
FAIL=0

echo "1. 检查环境变量文件..."
if [ -f "secrets/.env" ]; then
    echo "   ✅ secrets/.env 存在"
    ((PASS++))
    
    # 检查各个变量
    if grep -q "^ANDROID_KEYSTORE_BASE64=" secrets/.env 2>/dev/null; then
        echo "   ✅ ANDROID_KEYSTORE_BASE64 已设置"
        ((PASS++))
    else
        echo "   ❌ ANDROID_KEYSTORE_BASE64 未设置"
        ((FAIL++))
    fi
    
    if grep -q "^ANDROID_KEYSTORE_PASSWORD=" secrets/.env 2>/dev/null; then
        echo "   ✅ ANDROID_KEYSTORE_PASSWORD 已设置"
        ((PASS++))
    else
        echo "   ❌ ANDROID_KEYSTORE_PASSWORD 未设置"
        ((FAIL++))
    fi
    
    if grep -q "^ANDROID_KEY_ALIAS=" secrets/.env 2>/dev/null; then
        ALIAS=$(grep "^ANDROID_KEY_ALIAS=" secrets/.env 2>/dev/null | cut -d'=' -f2)
        echo "   ✅ ANDROID_KEY_ALIAS 已设置: $ALIAS"
        ((PASS++))
    else
        echo "   ❌ ANDROID_KEY_ALIAS 未设置"
        ((FAIL++))
    fi
    
    if grep -q "^ANDROID_KEY_PASSWORD=" secrets/.env 2>/dev/null; then
        echo "   ✅ ANDROID_KEY_PASSWORD 已设置"
        ((PASS++))
    else
        echo "   ❌ ANDROID_KEY_PASSWORD 未设置"
        ((FAIL++))
    fi
else
    echo "   ❌ secrets/.env 不存在"
    ((FAIL++))
fi

echo ""
echo "2. 检查配置脚本..."
if [ -f "scripts/configure-android-signing.py" ]; then
    echo "   ✅ configure-android-signing.py 存在"
    ((PASS++))
else
    echo "   ❌ configure-android-signing.py 不存在"
    ((FAIL++))
fi

if command -v python3 &> /dev/null; then
    echo "   ✅ Python 3 可用"
    ((PASS++))
else
    echo "   ❌ Python 3 不可用"
    ((FAIL++))
fi

echo ""
echo "3. 检查 Android 项目..."
if [ -d "src-tauri/gen/android" ]; then
    echo "   ✅ Android 项目已初始化"
    ((PASS++))
    
    if [ -f "src-tauri/gen/android/app/build.gradle.kts" ]; then
        echo "   ✅ build.gradle.kts 存在"
        ((PASS++))
        
        if grep -q "signingConfigs" src-tauri/gen/android/app/build.gradle.kts 2>/dev/null; then
            echo "   ✅ 签名配置已添加"
            ((PASS++))
        else
            echo "   ⚠️  签名配置未添加 (需要运行配置脚本)"
        fi
    else
        echo "   ❌ build.gradle.kts 不存在"
        ((FAIL++))
    fi
else
    echo "   ⚠️  Android 项目未初始化 (运行 'npx tauri android init')"
fi

echo ""
echo "========================"
echo "📊 测试结果"
echo "========================"
echo "通过: $PASS"
echo "失败: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "✅ 所有关键测试通过！"
    exit 0
else
    echo "❌ 有 $FAIL 个测试失败"
    exit 1
fi

