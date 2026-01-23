#!/bin/bash
# Android 签名配置测试脚本
# 用途：在本地测试 Android 签名配置是否正确
#
# 使用方法：
#   ./scripts/test-android-signing.sh

set -e

echo "🧪 Android 签名配置测试"
echo "========================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

# 测试函数
test_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((TESTS_PASSED++))
}

test_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((TESTS_FAILED++))
}

test_warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
}

echo "📋 测试 1: 检查环境变量"
echo "-----------------------------------"

if [ -f "secrets/.env" ]; then
    test_pass "secrets/.env 文件存在"

    # 检查必要的环境变量
    if grep -q "^ANDROID_KEYSTORE_BASE64=" secrets/.env 2>/dev/null; then
        test_pass "ANDROID_KEYSTORE_BASE64 已设置"
    else
        test_fail "ANDROID_KEYSTORE_BASE64 未设置"
    fi

    if grep -q "^ANDROID_KEYSTORE_PASSWORD=" secrets/.env 2>/dev/null; then
        test_pass "ANDROID_KEYSTORE_PASSWORD 已设置"
    else
        test_fail "ANDROID_KEYSTORE_PASSWORD 未设置"
    fi

    if grep -q "^ANDROID_KEY_ALIAS=" secrets/.env 2>/dev/null; then
        test_pass "ANDROID_KEY_ALIAS 已设置"
        ALIAS=$(grep "^ANDROID_KEY_ALIAS=" secrets/.env 2>/dev/null | cut -d'=' -f2)
        echo "  Alias: $ALIAS"
    else
        test_fail "ANDROID_KEY_ALIAS 未设置"
    fi

    if grep -q "^ANDROID_KEY_PASSWORD=" secrets/.env 2>/dev/null; then
        test_pass "ANDROID_KEY_PASSWORD 已设置"
    else
        test_fail "ANDROID_KEY_PASSWORD 未设置"
    fi
else
    test_fail "secrets/.env 文件不存在"
fi

echo ""
echo "📋 测试 2: 检查 Keystore 文件"
echo "-----------------------------------"

# 临时解码 keystore 进行验证
if [ -f "secrets/.env" ]; then
    KEYSTORE_BASE64=$(grep "^ANDROID_KEYSTORE_BASE64=" secrets/.env 2>/dev/null | cut -d'=' -f2)
    KEYSTORE_PASSWORD=$(grep "^ANDROID_KEYSTORE_PASSWORD=" secrets/.env 2>/dev/null | cut -d'=' -f2)
    KEY_ALIAS=$(grep "^ANDROID_KEY_ALIAS=" secrets/.env 2>/dev/null | cut -d'=' -f2)
    
    if [ -n "$KEYSTORE_BASE64" ]; then
        # 创建临时目录
        TEMP_DIR=$(mktemp -d)
        TEMP_KEYSTORE="$TEMP_DIR/test-keystore.jks"
        
        # 解码 keystore
        echo "$KEYSTORE_BASE64" | base64 -d > "$TEMP_KEYSTORE" 2>/dev/null
        
        if [ -f "$TEMP_KEYSTORE" ] && [ -s "$TEMP_KEYSTORE" ]; then
            test_pass "Keystore Base64 解码成功"
            
            # 检查 keystore 是否有效
            if command -v keytool &> /dev/null; then
                echo "  正在验证 keystore..."
                
                # 尝试列出 keystore 内容
                if keytool -list -keystore "$TEMP_KEYSTORE" -storepass "$KEYSTORE_PASSWORD" &> /dev/null; then
                    test_pass "Keystore 密码正确"
                    
                    # 检查 alias 是否存在
                    if keytool -list -keystore "$TEMP_KEYSTORE" -storepass "$KEYSTORE_PASSWORD" -alias "$KEY_ALIAS" &> /dev/null; then
                        test_pass "Key alias '$KEY_ALIAS' 存在"
                        
                        # 显示证书信息
                        echo ""
                        echo "  📜 证书信息:"
                        keytool -list -v -keystore "$TEMP_KEYSTORE" -storepass "$KEYSTORE_PASSWORD" -alias "$KEY_ALIAS" 2>/dev/null | grep -E "(Alias name|Creation date|Valid from|SHA256)" | sed 's/^/    /'
                    else
                        test_fail "Key alias '$KEY_ALIAS' 不存在"
                        echo "  可用的 aliases:"
                        keytool -list -keystore "$TEMP_KEYSTORE" -storepass "$KEYSTORE_PASSWORD" 2>/dev/null | grep "Alias name" | sed 's/^/    /'
                    fi
                else
                    test_fail "Keystore 密码错误或文件损坏"
                fi
            else
                test_warn "keytool 未安装，跳过 keystore 验证"
            fi
        else
            test_fail "Keystore Base64 解码失败或文件为空"
        fi
        
        # 清理临时文件
        rm -rf "$TEMP_DIR"
    else
        test_fail "ANDROID_KEYSTORE_BASE64 为空"
    fi
fi

echo ""
echo "📋 测试 3: 检查配置脚本"
echo "-----------------------------------"

if [ -f "scripts/configure-android-signing.py" ]; then
    test_pass "configure-android-signing.py 存在"
    
    if [ -x "scripts/configure-android-signing.py" ] || python3 -c "import sys; sys.exit(0)" 2>/dev/null; then
        test_pass "Python 3 可用"
    else
        test_fail "Python 3 不可用"
    fi
else
    test_fail "configure-android-signing.py 不存在"
fi

if [ -f "scripts/configure-android-signing.sh" ]; then
    test_pass "configure-android-signing.sh 存在 (备用)"
else
    test_warn "configure-android-signing.sh 不存在 (可选)"
fi

echo ""
echo "📋 测试 4: 检查 Android 项目"
echo "-----------------------------------"

if [ -d "src-tauri/gen/android" ]; then
    test_pass "Android 项目已初始化"
    
    if [ -f "src-tauri/gen/android/app/build.gradle.kts" ]; then
        test_pass "build.gradle.kts 存在"
        
        # 检查是否已配置签名
        if grep -q "signingConfigs" src-tauri/gen/android/app/build.gradle.kts; then
            test_pass "签名配置已添加到 build.gradle.kts"
        else
            test_warn "签名配置未添加到 build.gradle.kts (需要运行配置脚本)"
        fi
    else
        test_fail "build.gradle.kts 不存在"
    fi
else
    test_warn "Android 项目未初始化 (运行 'npx tauri android init')"
fi

echo ""
echo "📋 测试 5: 检查 GitHub Secrets 配置"
echo "-----------------------------------"

echo "  请手动验证以下 GitHub Secrets 是否已设置:"
echo "  - ANDROID_KEYSTORE_BASE64"
echo "  - ANDROID_KEYSTORE_PASSWORD"
echo "  - ANDROID_KEY_ALIAS"
echo "  - ANDROID_KEY_PASSWORD"
echo ""
echo "  访问: https://github.com/oneder2/Vana/settings/secrets/actions"

echo ""
echo "========================"
echo "📊 测试结果汇总"
echo "========================"
echo -e "${GREEN}通过: $TESTS_PASSED${NC}"
echo -e "${RED}失败: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ 所有测试通过！Android 签名配置正确。${NC}"
    echo ""
    echo "🚀 下一步:"
    echo "  1. 确保 GitHub Secrets 已正确设置"
    echo "  2. 推送代码触发 CI 构建"
    echo "  3. 检查构建日志确认签名成功"
    exit 0
else
    echo -e "${RED}❌ 有 $TESTS_FAILED 个测试失败，请修复后重试。${NC}"
    exit 1
fi

