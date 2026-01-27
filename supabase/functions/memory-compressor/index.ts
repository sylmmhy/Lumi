/**
 * Memory Compressor Edge Function
 *
 * 夜间压缩任务：自动清理低价值记忆、解决矛盾记忆
 *
 * 功能：
 * 1. evaluateImportance - LLM 评估记忆重要性
 * 2. resolveContradictions - 检测并解决矛盾记忆
 * 3. compressLowValueMemories - 清理低价值记忆
 *
 * 调用方式：
 * - POST { action: 'compress_all' } - 压缩所有用户（cron 调用）
 * - POST { action: 'compress_user', userId: 'xxx' } - 压缩单个用户
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Azure AI 配置
const AZURE_ENDPOINT = Deno.env.get('AZURE_AI_ENDPOINT') || 'https://conta-mcvprtb1-eastus2.openai.azure.com'
const AZURE_API_KEY = Deno.env.get('AZURE_AI_API_KEY')
const MODEL_NAME = Deno.env.get('MEMORY_EXTRACTOR_MODEL') || 'gpt-5.1-chat'

// 压缩配置
const LOW_IMPORTANCE_THRESHOLD = 0.3  // 低于此值考虑删除
const MIN_AGE_DAYS = 7                // 至少 7 天前的记忆才考虑压缩
const BATCH_SIZE = 100                // 每批处理的记忆数
const MAX_USERS_PER_RUN = 50          // 每次运行最多处理的用户数

/**
 * 压缩候选记忆的结构
 */
interface CompressionCandidate {
  memory_id: string
  user_id: string
  content: string
  tag: string
  importance_score: number
  confidence: number
  access_count: number
  days_since_update: number
  days_since_access: number
}

/**
 * 矛盾记忆对的结构
 */
interface ContradictionPair {
  memory_id_1: string
  memory_id_2: string
  content_1: string
  content_2: string
  tag: string
  similarity: number
  created_at_1: string
  created_at_2: string
}

/**
 * 压缩结果统计
 */
interface CompressionStats {
  usersProcessed: number
  totalEvaluated: number
  totalDeleted: number
  totalCompressed: number
  contradictionsResolved: number
  errors: string[]
}

/**
 * 使用 LLM 评估记忆的重要性
 * 返回 0-1 的评分
 */
async function evaluateImportance(memories: CompressionCandidate[]): Promise<Map<string, number>> {
  const results = new Map<string, number>()

  if (!AZURE_API_KEY || memories.length === 0) {
    // 没有 API key 时，使用基于规则的评估
    for (const m of memories) {
      results.set(m.memory_id, m.importance_score)
    }
    return results
  }

  // 批量评估（一次最多 10 条）
  const batches = []
  for (let i = 0; i < memories.length; i += 10) {
    batches.push(memories.slice(i, i + 10))
  }

  for (const batch of batches) {
    const memoriesText = batch.map((m, i) => `${i + 1}. [${m.tag}] ${m.content}`).join('\n')

    const prompt = `Evaluate the importance of each memory for an AI coach app. Rate each 0.0-1.0:

- 0.0-0.2: Trivial/temporary (e.g., "user had coffee today") → DELETE
- 0.3-0.5: Some reference value but not critical → SOFT DELETE
- 0.6-0.8: Important behavioral patterns → KEEP
- 0.9-1.0: Core insights about user → PERMANENT

Memories:
${memoriesText}

Output ONLY a JSON object with memory numbers as keys and scores as values:
{"1": 0.7, "2": 0.2, "3": 0.9}`

    try {
      const apiUrl = `${AZURE_ENDPOINT}/openai/v1/chat/completions`

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AZURE_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            { role: 'system', content: 'You are a memory importance evaluator. Output only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          max_completion_tokens: 200,
          temperature: 0.1,
        }),
      })

      if (!response.ok) {
        console.error('Importance evaluation API error:', response.status)
        // 回退到原始分数
        for (const m of batch) {
          results.set(m.memory_id, m.importance_score)
        }
        continue
      }

      const result = await response.json()
      const content = result.choices?.[0]?.message?.content?.trim()

      if (content) {
        const scores = JSON.parse(content)
        for (let i = 0; i < batch.length; i++) {
          const score = scores[String(i + 1)]
          if (typeof score === 'number' && score >= 0 && score <= 1) {
            results.set(batch[i].memory_id, score)
          } else {
            results.set(batch[i].memory_id, batch[i].importance_score)
          }
        }
      }
    } catch (error) {
      console.error('Importance evaluation failed:', error)
      for (const m of batch) {
        results.set(m.memory_id, m.importance_score)
      }
    }
  }

  return results
}

/**
 * 使用 LLM 判断两条记忆是否矛盾
 * 返回: 'keep_newer' | 'keep_older' | 'merge' | 'keep_both'
 */
async function analyzeContradiction(
  content1: string,
  content2: string,
  tag: string
): Promise<{ action: 'keep_newer' | 'keep_older' | 'merge' | 'keep_both'; merged?: string }> {
  if (!AZURE_API_KEY) {
    // 没有 API key，默认保留较新的
    return { action: 'keep_newer' }
  }

  const prompt = `Analyze if these two memories about a user contradict each other:

Memory 1 (older): "${content1}"
Memory 2 (newer): "${content2}"
Category: ${tag}

Determine:
1. Are they contradictory? (e.g., "likes blue" vs "likes green")
2. Or complementary/additive? (e.g., "likes blue" and "also likes reading")
3. Or is one just an update of the other?

Output JSON:
{
  "action": "keep_newer" | "keep_older" | "merge" | "keep_both",
  "reason": "brief explanation",
  "merged": "merged content if action is merge"
}`

  try {
    const apiUrl = `${AZURE_ENDPOINT}/openai/v1/chat/completions`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AZURE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: 'You are analyzing user memories for contradictions. Output only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 300,
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      return { action: 'keep_newer' }
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content?.trim()

    if (content) {
      const parsed = JSON.parse(content)
      return {
        action: parsed.action || 'keep_newer',
        merged: parsed.merged,
      }
    }

    return { action: 'keep_newer' }
  } catch (error) {
    console.error('Contradiction analysis failed:', error)
    return { action: 'keep_newer' }
  }
}

/**
 * 解决用户的矛盾记忆
 */
async function resolveContradictions(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<number> {
  let resolved = 0

  // 获取潜在矛盾记忆对
  const { data: contradictions, error } = await supabase.rpc('find_potential_contradictions', {
    p_user_id: userId,
    p_similarity_threshold: 0.7,
    p_limit: 20,
  })

  if (error || !contradictions || contradictions.length === 0) {
    return 0
  }

  console.log(`🔍 发现 ${contradictions.length} 对潜在矛盾记忆`)

  for (const pair of contradictions as ContradictionPair[]) {
    const analysis = await analyzeContradiction(pair.content_1, pair.content_2, pair.tag)

    switch (analysis.action) {
      case 'keep_newer':
        // 标记旧记忆为被替代
        await supabase.rpc('supersede_memory', {
          p_old_memory_id: pair.memory_id_1,
          p_new_memory_id: pair.memory_id_2,
        })
        resolved++
        console.log(`✅ 保留较新记忆，旧记忆被替代`)
        break

      case 'keep_older':
        // 标记新记忆为被替代
        await supabase.rpc('supersede_memory', {
          p_old_memory_id: pair.memory_id_2,
          p_new_memory_id: pair.memory_id_1,
        })
        resolved++
        console.log(`✅ 保留较旧记忆，新记忆被替代`)
        break

      case 'merge':
        // 合并两条记忆
        if (analysis.merged) {
          // 更新较新的记忆为合并版本
          await supabase
            .from('user_memories')
            .update({
              content: analysis.merged,
              merged_from: [pair.memory_id_1],
              metadata: {
                mergedAt: new Date().toISOString(),
                originalContents: [pair.content_1, pair.content_2],
              },
            })
            .eq('id', pair.memory_id_2)

          // 标记旧记忆为压缩
          await supabase
            .from('user_memories')
            .update({
              compression_status: 'compressed',
              superseded_by: pair.memory_id_2,
            })
            .eq('id', pair.memory_id_1)

          resolved++
          console.log(`✅ 合并两条记忆`)
        }
        break

      case 'keep_both':
        // 不做处理
        console.log(`ℹ️ 保留两条记忆（非矛盾）`)
        break
    }
  }

  return resolved
}

/**
 * 压缩单个用户的低价值记忆
 */
async function compressUserMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ evaluated: number; deleted: number; compressed: number; contradictions: number }> {
  const stats = { evaluated: 0, deleted: 0, compressed: 0, contradictions: 0 }

  // 1. 解决矛盾记忆
  stats.contradictions = await resolveContradictions(supabase, userId)

  // 2. 获取压缩候选
  const { data: candidates, error } = await supabase.rpc('get_compression_candidates', {
    p_user_id: userId,
    p_min_age_days: MIN_AGE_DAYS,
    p_low_importance_threshold: LOW_IMPORTANCE_THRESHOLD,
    p_limit: BATCH_SIZE,
  })

  if (error) {
    console.error(`获取压缩候选失败 (user=${userId}):`, error)
    return stats
  }

  if (!candidates || candidates.length === 0) {
    console.log(`用户 ${userId} 没有需要压缩的记忆`)
    return stats
  }

  stats.evaluated = candidates.length
  console.log(`📋 评估 ${candidates.length} 条候选记忆`)

  // 3. LLM 评估重要性
  const importanceScores = await evaluateImportance(candidates as CompressionCandidate[])

  // 4. 根据评估结果分类处理
  const toDelete: string[] = []
  const toCompress: string[] = []

  for (const candidate of candidates as CompressionCandidate[]) {
    const newScore = importanceScores.get(candidate.memory_id) ?? candidate.importance_score

    if (newScore < 0.2) {
      // 极低价值 → 删除
      toDelete.push(candidate.memory_id)
    } else if (newScore < 0.4) {
      // 低价值 → 软删除（压缩）
      toCompress.push(candidate.memory_id)
    }
    // 否则保留

    // 更新 importance_score
    if (newScore !== candidate.importance_score) {
      await supabase
        .from('user_memories')
        .update({ importance_score: newScore })
        .eq('id', candidate.memory_id)
    }
  }

  // 5. 执行压缩操作
  if (toDelete.length > 0) {
    const { data: deletedCount } = await supabase.rpc('mark_memories_compressed', {
      p_memory_ids: toDelete,
      p_action: 'delete',
    })
    stats.deleted = deletedCount || toDelete.length
    console.log(`🗑️ 删除 ${stats.deleted} 条低价值记忆`)
  }

  if (toCompress.length > 0) {
    const { data: compressedCount } = await supabase.rpc('mark_memories_compressed', {
      p_memory_ids: toCompress,
      p_action: 'compress',
    })
    stats.compressed = compressedCount || toCompress.length
    console.log(`📦 压缩 ${stats.compressed} 条记忆`)
  }

  return stats
}

/**
 * 压缩所有用户的记忆
 */
async function compressAllUsers(
  supabase: ReturnType<typeof createClient>
): Promise<CompressionStats> {
  const stats: CompressionStats = {
    usersProcessed: 0,
    totalEvaluated: 0,
    totalDeleted: 0,
    totalCompressed: 0,
    contradictionsResolved: 0,
    errors: [],
  }

  // 获取有记忆的活跃用户
  const { data: users, error } = await supabase
    .from('user_memories')
    .select('user_id')
    .eq('compression_status', 'active')
    .order('updated_at', { ascending: true })
    .limit(MAX_USERS_PER_RUN)

  if (error) {
    stats.errors.push(`获取用户列表失败: ${error.message}`)
    return stats
  }

  // 去重用户 ID
  const uniqueUserIds = [...new Set((users || []).map(u => u.user_id))]
  console.log(`📊 开始处理 ${uniqueUserIds.length} 个用户的记忆压缩`)

  for (const userId of uniqueUserIds) {
    try {
      console.log(`\n👤 处理用户: ${userId}`)
      const userStats = await compressUserMemories(supabase, userId)

      stats.usersProcessed++
      stats.totalEvaluated += userStats.evaluated
      stats.totalDeleted += userStats.deleted
      stats.totalCompressed += userStats.compressed
      stats.contradictionsResolved += userStats.contradictions
    } catch (error) {
      const errorMsg = `用户 ${userId} 处理失败: ${error instanceof Error ? error.message : String(error)}`
      console.error(errorMsg)
      stats.errors.push(errorMsg)
    }
  }

  return stats
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 初始化 Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const { action, userId } = body

    console.log(`🚀 Memory Compressor 启动: action=${action}`)

    let result: CompressionStats | { evaluated: number; deleted: number; compressed: number; contradictions: number }

    switch (action) {
      case 'compress_all':
        // 压缩所有用户（cron 调用）
        result = await compressAllUsers(supabase)
        break

      case 'compress_user': {
        // 压缩单个用户
        if (!userId) {
          throw new Error('Missing userId for compress_user action')
        }
        const userStats = await compressUserMemories(supabase, userId)
        result = userStats
        break
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    console.log(`✅ Memory Compressor 完成:`, result)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Memory Compressor error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
