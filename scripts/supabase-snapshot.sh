#!/bin/bash
# ==============================================================================
# Supabase 本地数据库快照脚本
# 用途：创建本地数据库的备份快照，类似 Git commit
# ==============================================================================

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 快照目录
SNAPSHOT_DIR="supabase/snapshots"
mkdir -p "$SNAPSHOT_DIR"

# 生成快照名称
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEFAULT_NAME="snapshot_$TIMESTAMP"

# 获取用户输入的描述（可选）
if [ -n "$1" ]; then
    # 用户提供了描述，清理特殊字符
    DESCRIPTION=$(echo "$1" | tr ' ' '_' | tr -cd '[:alnum:]_-')
    SNAPSHOT_NAME="${TIMESTAMP}_${DESCRIPTION}"
else
    SNAPSHOT_NAME="$DEFAULT_NAME"
fi

SNAPSHOT_FILE="$SNAPSHOT_DIR/${SNAPSHOT_NAME}.sql"

echo -e "${BLUE}📸 创建本地 Supabase 快照...${NC}"
echo -e "   快照名称: ${GREEN}$SNAPSHOT_NAME${NC}"

# 使用 pg_dump 导出数据库（本地 Supabase 默认端口 54322）
PGPASSWORD=postgres pg_dump \
    -h 127.0.0.1 \
    -p 54322 \
    -U postgres \
    -d postgres \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    > "$SNAPSHOT_FILE"

# 获取文件大小
FILE_SIZE=$(ls -lh "$SNAPSHOT_FILE" | awk '{print $5}')

echo -e "${GREEN}✅ 快照创建成功！${NC}"
echo -e "   文件: $SNAPSHOT_FILE"
echo -e "   大小: $FILE_SIZE"
echo ""
echo -e "${YELLOW}💡 提示: 使用 'npm run supabase:snapshots' 查看所有快照${NC}"
echo -e "${YELLOW}💡 提示: 使用 'npm run supabase:restore <快照名>' 恢复快照${NC}"
