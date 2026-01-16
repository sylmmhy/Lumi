#!/bin/bash
# ==============================================================================
# 本地 Supabase 环境验证脚本
# 用途：快速检查本地 Supabase 是否正常工作
# ==============================================================================

# 不使用 set -e，因为我们需要处理检查失败的情况

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 计数器
PASS=0
FAIL=0
WARN=0

# 打印函数
print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  🔍 本地 Supabase 环境验证${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

check_pass() {
    echo -e "  ${GREEN}✅ $1${NC}"
    ((PASS++))
}

check_fail() {
    echo -e "  ${RED}❌ $1${NC}"
    ((FAIL++))
}

check_warn() {
    echo -e "  ${YELLOW}⚠️  $1${NC}"
    ((WARN++))
}

print_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  📊 验证结果${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}通过: $PASS${NC}  ${RED}失败: $FAIL${NC}  ${YELLOW}警告: $WARN${NC}"
    echo ""

    if [ $FAIL -eq 0 ]; then
        echo -e "  ${GREEN}🎉 本地 Supabase 环境正常！${NC}"
    else
        echo -e "  ${RED}💥 发现 $FAIL 个问题，请检查上方错误信息${NC}"
    fi
    echo ""
}

# ==============================================================================
# 开始验证
# ==============================================================================

print_header

# ------------------------------------------------------------------------------
# 1. 检查 Docker
# ------------------------------------------------------------------------------
echo -e "${BLUE}1. 检查 Docker${NC}"

if command -v docker &> /dev/null; then
    check_pass "Docker 已安装"
else
    check_fail "Docker 未安装 - 请安装 Docker Desktop"
fi

if timeout 5 docker info &> /dev/null; then
    check_pass "Docker 正在运行"
else
    check_fail "Docker 未运行 - 请启动 Docker Desktop"
fi

# ------------------------------------------------------------------------------
# 2. 检查 Supabase CLI
# ------------------------------------------------------------------------------
echo ""
echo -e "${BLUE}2. 检查 Supabase CLI${NC}"

if command -v supabase &> /dev/null; then
    VERSION=$(supabase --version 2>/dev/null | head -1)
    check_pass "Supabase CLI 已安装 ($VERSION)"
else
    check_fail "Supabase CLI 未安装 - 运行: brew install supabase/tap/supabase"
fi

# ------------------------------------------------------------------------------
# 3. 检查本地 Supabase 服务
# ------------------------------------------------------------------------------
echo ""
echo -e "${BLUE}3. 检查本地 Supabase 服务${NC}"

# 检查 API 端口
if nc -z 127.0.0.1 54321 2>/dev/null; then
    check_pass "API 服务 (54321) 正在运行"
else
    check_fail "API 服务 (54321) 未运行 - 运行: npm run supabase:start"
fi

# 检查数据库端口
if nc -z 127.0.0.1 54322 2>/dev/null; then
    check_pass "数据库 (54322) 正在运行"
else
    check_fail "数据库 (54322) 未运行"
fi

# 检查 Studio 端口
if nc -z 127.0.0.1 54323 2>/dev/null; then
    check_pass "Studio (54323) 正在运行"
else
    check_warn "Studio (54323) 未运行（可选服务）"
fi

# ------------------------------------------------------------------------------
# 4. 检查数据库连接
# ------------------------------------------------------------------------------
echo ""
echo -e "${BLUE}4. 检查数据库连接${NC}"

if command -v psql &> /dev/null; then
    if PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "SELECT 1" &> /dev/null; then
        check_pass "数据库连接成功"

        # 检查核心表
        TABLE_COUNT=$(PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d ' ')
        if [ "$TABLE_COUNT" -gt 0 ]; then
            check_pass "数据库已初始化 ($TABLE_COUNT 个表)"
        else
            check_warn "数据库表为空 - 运行: npm run supabase:reset"
        fi

        # 检查测试数据
        TEST_USER_COUNT=$(PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -t -c "SELECT COUNT(*) FROM public.users WHERE email LIKE '%@test.local'" 2>/dev/null | tr -d ' ')
        if [ "$TEST_USER_COUNT" -gt 0 ]; then
            check_pass "Seed 测试数据已填充 ($TEST_USER_COUNT 个测试用户)"
        else
            check_warn "无 Seed 测试数据 - 运行: npm run supabase:reset"
        fi
    else
        check_fail "数据库连接失败"
    fi
else
    check_warn "psql 未安装，跳过数据库详细检查"
fi

# ------------------------------------------------------------------------------
# 5. 检查 API 端点
# ------------------------------------------------------------------------------
echo ""
echo -e "${BLUE}5. 检查 API 端点${NC}"

# 测试 REST API（使用 -k 跳过 SSL 验证）
API_RESPONSE=$(curl -s -k -o /dev/null -w "%{http_code}" "https://127.0.0.1:54321/rest/v1/" 2>/dev/null || echo "000")
if [ "$API_RESPONSE" = "200" ] || [ "$API_RESPONSE" = "401" ]; then
    check_pass "REST API 响应正常 (HTTP $API_RESPONSE)"
else
    check_fail "REST API 无响应 (HTTP $API_RESPONSE)"
fi

# 测试 Auth API
AUTH_RESPONSE=$(curl -s -k -o /dev/null -w "%{http_code}" "https://127.0.0.1:54321/auth/v1/health" 2>/dev/null || echo "000")
if [ "$AUTH_RESPONSE" = "200" ]; then
    check_pass "Auth API 响应正常"
else
    check_warn "Auth API 状态未知 (HTTP $AUTH_RESPONSE)"
fi

# ------------------------------------------------------------------------------
# 6. 检查配置文件
# ------------------------------------------------------------------------------
echo ""
echo -e "${BLUE}6. 检查配置文件${NC}"

if [ -f "supabase/config.toml" ]; then
    check_pass "config.toml 存在"
else
    check_fail "config.toml 不存在"
fi

if [ -f "supabase/.env.local" ]; then
    check_pass "Edge Functions 密钥已配置 (.env.local)"
else
    check_warn "Edge Functions 密钥未配置 - 复制 .env.local.example 并填入密钥"
fi

if [ -f ".env.supabase-local" ]; then
    check_pass "本地环境变量配置存在"
else
    check_fail ".env.supabase-local 不存在"
fi

# ------------------------------------------------------------------------------
# 7. 检查 Edge Functions
# ------------------------------------------------------------------------------
echo ""
echo -e "${BLUE}7. 检查 Edge Functions${NC}"

if [ -d "supabase/functions" ]; then
    FUNC_COUNT=$(ls -d supabase/functions/*/ 2>/dev/null | wc -l | tr -d ' ')
    check_pass "Edge Functions 目录存在 ($FUNC_COUNT 个函数)"
else
    check_fail "Edge Functions 目录不存在"
fi

# ------------------------------------------------------------------------------
# 打印总结
# ------------------------------------------------------------------------------
print_summary

# ------------------------------------------------------------------------------
# 快速访问链接
# ------------------------------------------------------------------------------
if [ $FAIL -eq 0 ]; then
    echo -e "${BLUE}📍 快速访问:${NC}"
    echo "  • Studio 仪表盘: http://127.0.0.1:54323"
    echo "  • 邮件测试: http://127.0.0.1:54324"
    echo "  • API 端点: https://127.0.0.1:54321"
    echo ""
fi

# 退出码
exit $FAIL
