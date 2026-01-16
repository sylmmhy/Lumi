#!/bin/bash
# ==============================================================================
# 列出所有 Supabase 本地数据库快照
# ==============================================================================

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SNAPSHOT_DIR="supabase/snapshots"

echo -e "${BLUE}📋 本地 Supabase 快照列表${NC}"
echo "========================================"

if [ ! -d "$SNAPSHOT_DIR" ] || [ -z "$(ls -A $SNAPSHOT_DIR 2>/dev/null)" ]; then
    echo -e "${YELLOW}暂无快照${NC}"
    echo ""
    echo -e "使用 ${GREEN}npm run supabase:snapshot${NC} 创建第一个快照"
    exit 0
fi

# 列出所有快照，按时间倒序
echo ""
printf "%-40s %10s %s\n" "快照名称" "大小" "创建时间"
echo "---------------------------------------- ---------- -------------------"

for file in $(ls -t "$SNAPSHOT_DIR"/*.sql 2>/dev/null); do
    FILENAME=$(basename "$file" .sql)
    FILESIZE=$(ls -lh "$file" | awk '{print $5}')
    FILETIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d'.' -f1)
    printf "%-40s %10s %s\n" "$FILENAME" "$FILESIZE" "$FILETIME"
done

echo ""
echo -e "${YELLOW}💡 恢复快照: npm run supabase:restore <快照名称>${NC}"
echo -e "${YELLOW}💡 创建快照: npm run supabase:snapshot \"描述\"${NC}"
