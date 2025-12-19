#!/bin/bash

# 部署 AI Prompt 到 Supabase
# 使用方法: bash deploy-ai-prompt.sh

echo "🚀 开始部署 AI 系统指令到 Supabase..."
echo ""

# 检查 Supabase CLI
if ! command -v supabase &> /dev/null
then
    echo "❌ 错误: Supabase CLI 未安装"
    echo "请先安装: https://supabase.com/docs/guides/cli"
    exit 1
fi

# 部署函数
echo "📦 正在部署 get-system-instruction 函数..."
supabase functions deploy get-system-instruction

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 部署成功！"
    echo ""
    echo "📋 函数信息:"
    echo "   名称: get-system-instruction"
    echo "   调用方式: supabase.functions.invoke('get-system-instruction', { body: { taskInput: '...' } })"
    echo ""
    echo "🔗 你可以在 Supabase Dashboard 查看函数日志"
else
    echo ""
    echo "❌ 部署失败"
    echo "请检查错误信息并重试"
    exit 1
fi
