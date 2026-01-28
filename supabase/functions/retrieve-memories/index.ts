/**
 * # retrieve-memories Edge Function
 *
 * 虚拟消息系统专用的记忆检索 API
 *
 * 与 get-system-instruction 的区别：
 * - get-system-instruction: 启动时调用，返回完整 system prompt
 * - retrieve-memories: 会话中实时调用，返回与当前话题相关的记忆
 *
 * ## 使用场景
 * 当虚拟消息系统检测到话题变化时，调用此 API 获取相关记忆，
 * 然后生成 [CONTEXT] 消息注入到 Gemini Live。
 *
 * ## 调用示例
 * ```typescript
 * const response = await supabase.functions.invoke('retrieve-memories', {
 *   body: {
 *     userId: 'user-123',
 *     currentTopic: '失恋',
 *     keywords: ['分手', '前任'],
 *     conversationSummary: '用户正在讨论感情问题',
 *     seedQuestions: ['用户之前如何处理失恋？'],
 *     limit: 5,
 *   },
 * })
 * ```
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 * @see docs/architecture/tolan-memory-system-upgrade.md
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  synthesizeQuestions,
  multiQueryRAG,
  getConfigFromEnv,
  TAG_CONTEXT,
  type MergedMemoryResult,
} from '../_shared/memory-retrieval.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =====================================================
// 请求/响应类型定义
// =====================================================

interface RetrieveMemoriesRequest {
  /** 用户 ID（必填） */
  userId: string
  /** 当前话题（用于 question synthesis） */
  currentTopic: string
  /** 额外关键词（可选） */
  keywords?: string[]
  /** 对话上下文摘要（可选，用于更精准的问题合成） */
  conversationSummary?: string
  /** 种子问题（可选，来自话题规则的预定义问题） */
  seedQuestions?: string[]
  /** 返回数量限制 */
  limit?: number
}

interface RetrieveMemoriesResponse {
  /** 检索到的记忆 */
  memories: Array<{
    content: string
    tag: string
    relevance: number  // MRR 融合得分
    tagLabel: string   // 标签的中文描述
  }>
  /** 生成的检索问题（调试用） */
  synthesizedQuestions?: string[]
  /** 耗时（毫秒） */
  durationMs: number
}

// =====================================================
// 主函数
// =====================================================

serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // 1. 解析请求
    const {
      userId,
      currentTopic,
      keywords: _keywords = [],
      conversationSummary,
      seedQuestions = [],
      limit = 5,
    } = await req.json() as RetrieveMemoriesRequest

    // 验证必填字段
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!currentTopic) {
      return new Response(
        JSON.stringify({ error: 'currentTopic is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`🧠 [retrieve-memories] 开始检索: topic="${currentTopic}", userId=${userId.substring(0, 8)}...`)

    // 2. 初始化 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 3. 获取 API 配置
    const config = getConfigFromEnv()

    if (!config.azureApiKey) {
      console.warn('⚠️ AZURE_API_KEY 未设置，无法进行 Question Synthesis')
    }

    // 4. 构建检索上下文
    const searchContext = conversationSummary
      ? `${currentTopic}. 对话上下文: ${conversationSummary}`
      : currentTopic

    // 5. Question Synthesis - 生成检索问题
    const questions = await synthesizeQuestions(searchContext, config, seedQuestions)

    console.log(`🔍 [retrieve-memories] 生成 ${questions.length} 个检索问题`)

    // 6. Multi-Query RAG - 执行多查询检索
    const rawMemories = await multiQueryRAG(supabase, userId, questions, config, limit)

    // 7. 格式化返回结果
    const memories = rawMemories.map((m: MergedMemoryResult) => ({
      content: m.content,
      tag: m.tag,
      relevance: m.mrrScore,
      tagLabel: TAG_CONTEXT[m.tag]?.replace(/[()]/g, '') || m.tag,
    }))

    const durationMs = Date.now() - startTime

    console.log(`✅ [retrieve-memories] 完成: ${memories.length} 条记忆, 耗时 ${durationMs}ms`)

    // 8. 返回结果
    const response: RetrieveMemoriesResponse = {
      memories,
      synthesizedQuestions: questions,
      durationMs,
    }

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[retrieve-memories] 错误:', error)

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
