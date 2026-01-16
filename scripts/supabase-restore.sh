#!/bin/bash
# ==============================================================================
# 从快照恢复 Supabase 本地数据库
# 用法: ./supabase-restore.sh <快照名称>
# ==============================================================================

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SNAPSHOT_DIR="supabase/snapshots"

# 检查参数
if [ -z "$1" ]; then
    echo -e "${YELLOW}用法: npm run supabase:restore <快照名称>${NC}"
    echo ""
    echo "可用的快照:"
    if [ -d "$SNAPSHOT_DIR" ]; then
        ls -1 "$SNAPSHOT_DIR"/*.sql 2>/dev/null | xargs -n1 basename | sed 's/.sql$//' | head -10
    else
        echo "  (暂无快照)"
    fi
    exit 1
fi

SNAPSHOT_NAME="$1"
SNAPSHOT_FILE="$SNAPSHOT_DIR/${SNAPSHOT_NAME}.sql"

# 检查快照文件是否存在
if [ ! -f "$SNAPSHOT_FILE" ]; then
    echo -e "${RED}❌ 快照不存在: $SNAPSHOT_NAME${NC}"
    echo ""
    echo "可用的快照:"
    ls -1 "$SNAPSHOT_DIR"/*.sql 2>/dev/null | xargs -n1 basename | sed 's/.sql$//'
    exit 1
fi

echo -e "${BLUE}🔄 准备从快照恢复...${NC}"
echo -e "   快照: ${GREEN}$SNAPSHOT_NAME${NC}"
echo ""

# 确认操作
echo -e "${YELLOW}⚠️  警告: 这将覆盖当前本地数据库的所有数据！${NC}"
read -p "确认恢复? (y/N): " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "已取消"
    exit 0
fi

echo ""
echo -e "${BLUE}正在恢复...${NC}"

# 使用 psql 恢复数据库
PGPASSWORD=postgres psql \
    -h 127.0.0.1 \
    -p 54322 \
    -U postgres \
    -d postgres \
    -f "$SNAPSHOT_FILE" \
    > /dev/null 2>&1

echo -e "${GREEN}✅ 恢复成功！${NC}"
echo -e "   已从快照 ${GREEN}$SNAPSHOT_NAME${NC} 恢复本地数据库"
