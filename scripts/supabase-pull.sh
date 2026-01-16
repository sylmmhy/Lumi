#!/bin/bash
# ==============================================================================
# 从远程 Supabase 拉取 Schema 到本地
# 用途：当本地改坏了，从远程生产环境恢复
# ==============================================================================

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 从远程 Supabase 拉取 Schema...${NC}"
echo ""

# 检查是否已链接远程项目
if ! supabase projects list > /dev/null 2>&1; then
    echo -e "${RED}❌ 未登录 Supabase CLI${NC}"
    echo "请先运行: supabase login"
    exit 1
fi

echo -e "${YELLOW}⚠️  警告: 这将重置本地数据库到远程的 Schema 状态！${NC}"
echo -e "${YELLOW}   本地的所有数据将被清除。${NC}"
echo ""
read -p "确认从远程拉取? (y/N): " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "已取消"
    exit 0
fi

echo ""
echo -e "${BLUE}步骤 1/2: 拉取远程 Schema...${NC}"

# 从远程拉取 schema
supabase db pull --linked

echo ""
echo -e "${BLUE}步骤 2/2: 重置本地数据库...${NC}"

# 重置本地数据库以应用拉取的 schema
supabase db reset

echo ""
echo -e "${GREEN}✅ 完成！本地数据库已与远程同步${NC}"
echo ""
echo -e "${YELLOW}💡 提示: 本地数据库现在是空的，只有 Schema 结构${NC}"
echo -e "${YELLOW}💡 提示: 如果有 seed.sql，测试数据已自动填充${NC}"
