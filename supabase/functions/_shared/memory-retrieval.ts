/**
 * # 记忆检索共享模块 (Tolan 级别 Multi-Query RAG)
 *
 * 本模块提供记忆检索的核心功能，被以下 Edge Functions 使用：
 * - get-system-instruction: 启动时注入 system prompt
 * - retrieve-memories: 虚拟消息系统实时检索
 *
 * ## 核心功能
 * - Question Synthesis: LLM 生成检索问题
 * - Batch Embedding: 批量向量生成
 * - Tiered Search: 分层检索（热/温/冷）
 * - MRR Fusion: 多查询结果融合排序
 *
 * @see docs/architecture/tolan-memory-system-upgrade.md
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// =====================================================
// 配置常量
// =====================================================

/** 记忆向量相似度阈值 */
export const MEMORY_SIMILARITY_THRESHOLD = 0.6

/** 每个查询返回的最大记忆数 */
export const MEMORY_LIMIT_PER_QUERY = 5

/** 最终返回的最大记忆数 */
export const MAX_FINAL_MEMORIES = 10

/** 热层：最近 N 天访问过的记忆 */
export const HOT_TIER_DAYS = 7

/** 温层：N-M 天未访问的记忆 */
export const WARM_TIER_DAYS = 30

/** 热层至少需要多少条结果才算"够用" */
export const MIN_HOT_RESULTS = 3

/** 如果有一条相似度 >= 此值，也算"够用" */
export const MIN_SIMILARITY_FOR_ENOUGH = 0.7

/** 至少多少种不同标签才算"够用" */
export const MIN_TAG_DIVERSITY = 2

// =====================================================
// 类型定义
// =====================================================

/**
 * 分层检索结果
 */
export interface TieredSearchResult {
  memory_id: string
  content: string
  tag: string
  confidence: number
  importance_score: number
  similarity: number
  last_accessed_at: string | null
}

/**
 * Multi-Query RAG 搜索结果
 */
export interface MultiQueryResult {
  query_index: number
  memory_id: string
  content: string
  tag: string
  confidence: number
  importance_score: number
  similarity: number
  rank: number
}

/**
 * MRR 融合后的记忆结果
 */
export interface MergedMemoryResult {
  memory_id: string
  content: string
  tag: string
  mrrScore: number
  importance: number
}

/**
 * 记忆检索配置
 */
export interface MemoryRetrievalConfig {
  /** Azure AI Endpoint */
  azureEndpoint: string
  /** Azure AI API Key */
  azureApiKey: string
  /** Embedding Endpoint（可选，默认使用 azureEndpoint） */
  embeddingEndpoint?: string
  /** Embedding API Key（可选，默认使用 azureApiKey） */
  embeddingApiKey?: string
  /** Question Synthesis 模型名称 */
  modelName?: string
  /** Embedding 模型名称 */
  embeddingModel?: string
}

/**
 * 标签上下文映射（用于格式化输出）
 */
export const TAG_CONTEXT: Record<string, string> = {
  'PREF': '(AI 交互偏好)',
  'PROC': '(拖延模式)',
  'SOMA': '(身心反应)',
  'EMO': '(情绪模式)',
  'SAB': '(自我妨碍)',
  'EFFECTIVE': '(有效激励方式)',
  'CONTEXT': '(生活背景)',
}

// =====================================================
// 核心函数
// =====================================================

/**
 * Question Synthesis: 使用 LLM 为给定的上下文生成多个检索问题
 *
 * @param context - 任务描述或话题上下文
 * @param config - API 配置
 * @param seedQuestions - 可选的种子问题（如话题规则中预定义的问题）
 * @returns 生成的检索问题数组
 *
 * @example
 * const questions = await synthesizeQuestions('用户想去旅行', config, [
 *   '用户之前去过哪些地方旅行？',
 *   '用户喜欢什么类型的旅行活动？',
 * ])
 */
export async function synthesizeQuestions(
  context: string,
  config: MemoryRetrievalConfig,
  seedQuestions?: string[]
): Promise<string[]> {
  if (!config.azureApiKey) {
    console.warn('⚠️ AZURE_API_KEY 未设置，跳过 Question Synthesis')
    return seedQuestions?.length ? seedQuestions : [context]
  }

  // 如果有种子问题且数量足够，直接使用
  if (seedQuestions && seedQuestions.length >= 3) {
    console.log(`🔍 使用预定义的 ${seedQuestions.length} 个检索问题`)
    return seedQuestions.slice(0, 5)
  }

  const modelName = config.modelName || 'gpt-5.1-chat'

  const prompt = `Based on the user's current context, generate 3-5 search queries to retrieve relevant memories from their history.

Current context: "${context}"
${seedQuestions?.length ? `\nExisting questions (expand on these):\n${seedQuestions.join('\n')}` : ''}

Generate queries that would help find:
1. Past experiences with similar situations
2. User's preferences and habits related to this context
3. Emotional patterns or triggers
4. What motivation techniques worked before
5. Any relevant life context or circumstances

Output ONLY a JSON array of strings, no explanation:
["query1", "query2", "query3"]`

  try {
    const apiUrl = `${config.azureEndpoint}/openai/v1/chat/completions`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.azureApiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: 'You are a search query generator. Output only valid JSON arrays.' },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 300,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      console.error('Question Synthesis API error:', response.status)
      return seedQuestions?.length ? seedQuestions : [context]
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return seedQuestions?.length ? seedQuestions : [context]
    }

    const queries = JSON.parse(content)
    if (Array.isArray(queries) && queries.length > 0) {
      // 如果有种子问题，合并去重
      const allQueries = seedQuestions?.length
        ? [...new Set([...seedQuestions, ...queries])]
        : queries
      console.log(`🔍 Question Synthesis 生成 ${allQueries.length} 个检索问题:`, allQueries.slice(0, 3))
      return allQueries.slice(0, 5)
    }

    return seedQuestions?.length ? seedQuestions : [context]
  } catch (error) {
    console.error('Question Synthesis 失败:', error)
    return seedQuestions?.length ? seedQuestions : [context]
  }
}

/**
 * 批量生成 Embeddings
 *
 * @param texts - 要生成 embedding 的文本数组
 * @param config - API 配置
 * @returns embedding 向量数组
 */
export async function generateEmbeddings(
  texts: string[],
  config: MemoryRetrievalConfig
): Promise<number[][]> {
  const apiKey = config.embeddingApiKey || config.azureApiKey
  if (!apiKey || texts.length === 0) {
    return []
  }

  const endpoint = config.embeddingEndpoint || config.azureEndpoint
  const model = config.embeddingModel || 'text-embedding-3-large'

  try {
    const baseUrl = endpoint.replace(/\/+$/, '')
    const apiUrl = `${baseUrl}/embeddings`

    console.log(`📊 正在为 ${texts.length} 个文本生成 embeddings...`)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
        dimensions: 1536,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Embedding API error:', response.status, error)
      return []
    }

    const result = await response.json()
    const embeddings = result.data?.map((d: { embedding: number[] }) => d.embedding) || []

    console.log(`📊 成功生成 ${embeddings.length} 个 embeddings`)
    return embeddings
  } catch (error) {
    console.error('generateEmbeddings 失败:', error)
    return []
  }
}

/**
 * Mean Reciprocal Rank (MRR) 融合算法
 *
 * 将多个查询的搜索结果合并，根据排名计算综合分数
 * MRR 公式: score = sum(1/rank) 对于每个出现的查询
 *
 * @example
 * Memory A 在 Query1 排第1, Query3 排第2
 * score = 1/1 + 1/2 = 1.5
 *
 * @param resultSets - 多个查询的搜索结果
 * @returns 融合并排序后的记忆列表
 */
export function mergeWithMRR(resultSets: MultiQueryResult[]): MergedMemoryResult[] {
  const scores = new Map<string, {
    mrrScore: number
    content: string
    tag: string
    importance: number
    queryHits: number
  }>()

  for (const result of resultSets) {
    const existing = scores.get(result.memory_id)
    const reciprocalRank = 1 / result.rank

    if (existing) {
      existing.mrrScore += reciprocalRank
      existing.queryHits += 1
      existing.importance = Math.max(existing.importance, result.importance_score)
    } else {
      scores.set(result.memory_id, {
        mrrScore: reciprocalRank,
        content: result.content,
        tag: result.tag,
        importance: result.importance_score,
        queryHits: 1,
      })
    }
  }

  const sorted = [...scores.entries()]
    .map(([memory_id, data]) => ({
      memory_id,
      content: data.content,
      tag: data.tag,
      mrrScore: data.mrrScore,
      importance: data.importance,
    }))
    .sort((a, b) => {
      const scoreDiff = b.mrrScore - a.mrrScore
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff
      return b.importance - a.importance
    })

  console.log(`🔀 MRR 融合: ${resultSets.length} 条结果 → ${sorted.length} 条去重结果`)
  if (sorted.length > 0) {
    console.log(`🔀 Top 3 MRR scores:`, sorted.slice(0, 3).map(m => ({ tag: m.tag, score: m.mrrScore.toFixed(2) })))
  }

  return sorted
}

/**
 * 在指定层级搜索记忆
 *
 * @param supabase - Supabase 客户端
 * @param userId - 用户 ID
 * @param embeddings - 查询向量数组
 * @param tier - 层级：'hot' | 'warm' | 'cold'
 * @returns 搜索结果
 */
export async function searchMemoriesInTier(
  supabase: SupabaseClient,
  userId: string,
  embeddings: number[][],
  tier: 'hot' | 'warm' | 'cold'
): Promise<TieredSearchResult[]> {
  console.log(`🔍 [Tiered] 搜索 ${tier} 层记忆...`)

  const embeddingStrings = embeddings.map(e => JSON.stringify(e))

  const { data, error } = await supabase.rpc('tiered_search_memories', {
    p_user_id: userId,
    p_embeddings: embeddingStrings,
    p_threshold: MEMORY_SIMILARITY_THRESHOLD,
    p_limit_per_query: MEMORY_LIMIT_PER_QUERY,
    p_tier: tier,
    p_hot_days: HOT_TIER_DAYS,
    p_warm_days: WARM_TIER_DAYS,
  })

  if (error) {
    console.error(`[Tiered] ${tier} 层搜索错误:`, error)
    return []
  }

  console.log(`🔍 [Tiered] ${tier} 层返回 ${data?.length || 0} 条结果`)
  return data || []
}

/**
 * 判断搜索结果是否"够用"
 *
 * 满足以下任一条件即为"够用"：
 * 1. 结果数量 >= MIN_HOT_RESULTS
 * 2. 有任意一条结果相似度 >= MIN_SIMILARITY_FOR_ENOUGH
 * 3. 结果覆盖 >= MIN_TAG_DIVERSITY 种不同标签
 *
 * @param results - 搜索结果
 * @returns 是否够用
 */
export function isResultsEnough(results: TieredSearchResult[]): boolean {
  if (results.length === 0) {
    return false
  }

  // 条件 1: 数量足够
  if (results.length >= MIN_HOT_RESULTS) {
    console.log(`✅ [Tiered] 够用：数量 ${results.length} >= ${MIN_HOT_RESULTS}`)
    return true
  }

  // 条件 2: 高相似度命中
  const highSimilarity = results.some(r => r.similarity >= MIN_SIMILARITY_FOR_ENOUGH)
  if (highSimilarity) {
    console.log(`✅ [Tiered] 够用：有高相似度结果 >= ${MIN_SIMILARITY_FOR_ENOUGH}`)
    return true
  }

  // 条件 3: 标签多样性
  const uniqueTags = new Set(results.map(r => r.tag))
  if (uniqueTags.size >= MIN_TAG_DIVERSITY) {
    console.log(`✅ [Tiered] 够用：标签多样性 ${uniqueTags.size} >= ${MIN_TAG_DIVERSITY}`)
    return true
  }

  console.log(`⚠️ [Tiered] 不够用：数量=${results.length}, 无高相似度, 标签种类=${uniqueTags.size}`)
  return false
}

/**
 * 更新记忆的访问时间和访问次数
 *
 * 在记忆被检索后调用，用于维护热/温/冷分层
 *
 * @param supabase - Supabase 客户端
 * @param memoryIds - 要更新的记忆 ID 数组
 */
export async function updateMemoryAccessTime(
  supabase: SupabaseClient,
  memoryIds: string[]
): Promise<void> {
  if (memoryIds.length === 0) return

  try {
    const { error } = await supabase.rpc('update_memory_access', {
      p_memory_ids: memoryIds,
    })

    if (error) {
      console.warn('[Tiered] 更新访问时间失败:', error)
    } else {
      console.log(`📝 [Tiered] 已更新 ${memoryIds.length} 条记忆的访问时间`)
    }
  } catch (e) {
    console.warn('[Tiered] 更新访问时间异常:', e)
  }
}

/**
 * Multi-Query RAG 执行（不含分层，使用 multi_query_search_memories RPC）
 *
 * @param supabase - Supabase 客户端
 * @param userId - 用户 ID
 * @param questions - 检索问题数组
 * @param config - API 配置
 * @param limit - 返回结果数量限制
 * @returns 融合后的记忆结果
 */
export async function multiQueryRAG(
  supabase: SupabaseClient,
  userId: string,
  questions: string[],
  config: MemoryRetrievalConfig,
  limit: number = MAX_FINAL_MEMORIES
): Promise<MergedMemoryResult[]> {
  const startTime = Date.now()

  try {
    // 1. 生成 embeddings
    const embeddings = await generateEmbeddings(questions, config)

    if (embeddings.length === 0) {
      console.warn('⚠️ Embedding 生成失败')
      return []
    }

    // 2. 多查询向量搜索
    const embeddingStrings = embeddings.map(e => JSON.stringify(e))

    const { data: searchResults, error } = await supabase.rpc('multi_query_search_memories', {
      p_user_id: userId,
      p_embeddings: embeddingStrings,
      p_threshold: MEMORY_SIMILARITY_THRESHOLD,
      p_limit_per_query: MEMORY_LIMIT_PER_QUERY,
    })

    if (error) {
      console.error('multi_query_search_memories RPC 错误:', error)
      return []
    }

    if (!searchResults || searchResults.length === 0) {
      console.log('🔍 Multi-Query RAG 未找到相关记忆')
      return []
    }

    // 3. MRR 融合
    const fusedResults = mergeWithMRR(searchResults as MultiQueryResult[])

    // 4. 更新访问时间
    const memoryIds = fusedResults.slice(0, limit).map(m => m.memory_id)
    await updateMemoryAccessTime(supabase, memoryIds)

    const elapsedMs = Date.now() - startTime
    console.log(`✅ Multi-Query RAG 完成: ${fusedResults.length} 条记忆, 耗时 ${elapsedMs}ms`)

    return fusedResults.slice(0, limit)
  } catch (error) {
    console.error('Multi-Query RAG 执行失败:', error)
    return []
  }
}

/**
 * 分层 Multi-Query RAG 执行
 *
 * 分层策略：
 * 1. 先搜热层（PREF/EFFECTIVE + 最近7天访问）
 * 2. 如果热层不够用，扩展到温层（7-30天）
 * 3. 冷层暂不搜索，避免延迟
 *
 * @param supabase - Supabase 客户端
 * @param userId - 用户 ID
 * @param questions - 检索问题数组
 * @param config - API 配置
 * @param limit - 返回结果数量限制
 * @returns 格式化的记忆字符串数组
 */
export async function tieredMultiQueryRAG(
  supabase: SupabaseClient,
  userId: string,
  questions: string[],
  config: MemoryRetrievalConfig,
  limit: number = MAX_FINAL_MEMORIES
): Promise<string[]> {
  const startTime = Date.now()

  try {
    // 1. 生成 embeddings
    const embeddings = await generateEmbeddings(questions, config)

    if (embeddings.length === 0) {
      console.warn('⚠️ Embedding 生成失败，回退到传统检索')
      return []
    }

    // 2. 搜索热层
    let allResults: TieredSearchResult[] = await searchMemoriesInTier(
      supabase, userId, embeddings, 'hot'
    )

    // 3. 如果热层不够用，扩展到温层
    if (!isResultsEnough(allResults)) {
      console.log('🔍 [Tiered] 热层不够用，扩展到温层...')
      const warmResults = await searchMemoriesInTier(
        supabase, userId, embeddings, 'warm'
      )
      // 合并结果，热层优先
      allResults = [...allResults, ...warmResults]
    }

    if (allResults.length === 0) {
      console.log('🔍 [Tiered] 未找到相关记忆')
      return []
    }

    // 4. 转换为 MultiQueryResult 格式，进行 MRR 融合
    const multiQueryResults: MultiQueryResult[] = allResults.map((r, idx) => ({
      query_index: 0, // 分层搜索不区分查询索引
      memory_id: r.memory_id,
      content: r.content,
      tag: r.tag,
      confidence: r.confidence,
      importance_score: r.importance_score,
      similarity: r.similarity,
      rank: idx + 1, // 使用位置作为排名
    }))

    const fusedResults = mergeWithMRR(multiQueryResults)

    // 5. 更新访问时间
    const memoryIds = fusedResults.slice(0, limit).map(m => m.memory_id)
    await updateMemoryAccessTime(supabase, memoryIds)

    // 6. 格式化输出
    const formattedMemories = fusedResults
      .slice(0, limit)
      .map(m => {
        const context = TAG_CONTEXT[m.tag] || ''
        return `${m.content} ${context}`.trim()
      })

    const elapsedMs = Date.now() - startTime
    console.log(`✅ Tiered Multi-Query RAG 完成: ${formattedMemories.length} 条记忆, 耗时 ${elapsedMs}ms`)

    return formattedMemories
  } catch (error) {
    console.error('Tiered Multi-Query RAG 执行失败:', error)
    return []
  }
}

/**
 * 从环境变量构建配置对象
 *
 * @returns 记忆检索配置
 */
export function getConfigFromEnv(): MemoryRetrievalConfig {
  return {
    azureEndpoint: Deno.env.get('AZURE_AI_ENDPOINT') || 'https://conta-mcvprtb1-eastus2.openai.azure.com',
    azureApiKey: Deno.env.get('AZURE_AI_API_KEY') || '',
    embeddingEndpoint: Deno.env.get('AZURE_EMBEDDING_ENDPOINT'),
    embeddingApiKey: Deno.env.get('AZURE_EMBEDDING_API_KEY'),
    modelName: Deno.env.get('MEMORY_EXTRACTOR_MODEL') || 'gpt-5.1-chat',
    embeddingModel: Deno.env.get('MEMORY_EMBEDDING_MODEL') || 'text-embedding-3-large',
  }
}
