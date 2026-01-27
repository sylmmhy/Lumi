import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =====================================================
// Tolan 级别记忆系统配置
// =====================================================

// 功能开关：是否启用 Tolan 级别 Multi-Query RAG
const ENABLE_TOLAN_MEMORY = Deno.env.get('ENABLE_TOLAN_MEMORY') === 'true'

// Azure AI 配置（用于 Question Synthesis）
const AZURE_ENDPOINT = Deno.env.get('AZURE_AI_ENDPOINT') || 'https://conta-mcvprtb1-eastus2.openai.azure.com'
const AZURE_API_KEY = Deno.env.get('AZURE_AI_API_KEY')
const MODEL_NAME = Deno.env.get('MEMORY_EXTRACTOR_MODEL') || 'gpt-5.1-chat'

// Embedding 配置
const EMBEDDING_ENDPOINT = Deno.env.get('AZURE_EMBEDDING_ENDPOINT') || AZURE_ENDPOINT
const EMBEDDING_API_KEY = Deno.env.get('AZURE_EMBEDDING_API_KEY') || AZURE_API_KEY
const EMBEDDING_MODEL = Deno.env.get('MEMORY_EMBEDDING_MODEL') || 'text-embedding-3-large'

// 记忆检索配置
const MEMORY_SIMILARITY_THRESHOLD = 0.6
const MEMORY_LIMIT_PER_QUERY = 5
const MAX_FINAL_MEMORIES = 10

// 记忆缓存（5分钟 TTL）
const memoryCache = new Map<string, { data: string[]; expires: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Multi-Query RAG 搜索结果
 */
interface MultiQueryResult {
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
 * 用户成功记录的结构
 */
interface SuccessRecord {
  taskType: string
  lastDuration: number | null
  lastDate: string | null
  currentStreak: number
  totalCompletions: number
  personalBest: number | null
  recentSuccesses: Array<{
    content: string
    duration_minutes: number | null
    overcame_resistance: boolean
    completion_mood: string | null
    difficulty_perception: string | null
  }>
}

// =====================================================
// Tolan 级别 Multi-Query RAG 核心函数
// =====================================================

/**
 * Question Synthesis: 使用 LLM 为给定的任务描述生成多个检索问题
 * 这些问题将用于多路向量搜索，以获得更全面的记忆覆盖
 */
async function synthesizeQuestions(taskDescription: string): Promise<string[]> {
  if (!AZURE_API_KEY) {
    console.warn('⚠️ AZURE_API_KEY 未设置，跳过 Question Synthesis')
    return [taskDescription] // 回退到直接使用任务描述
  }

  const prompt = `Based on the user's current task, generate 3-5 search queries to retrieve relevant memories from their history.

Current task: "${taskDescription}"

Generate queries that would help find:
1. Past experiences with similar tasks
2. User's preferences and habits related to this task
3. Emotional patterns or resistance triggers
4. What motivation techniques worked before
5. Any relevant context or circumstances

Output ONLY a JSON array of strings, no explanation:
["query1", "query2", "query3"]`

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
          { role: 'system', content: 'You are a search query generator. Output only valid JSON arrays.' },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 300,
        temperature: 0.3, // 低温度确保稳定输出
      }),
    })

    if (!response.ok) {
      console.error('Question Synthesis API error:', response.status)
      return [taskDescription]
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return [taskDescription]
    }

    // 解析 JSON 数组
    const queries = JSON.parse(content)
    if (Array.isArray(queries) && queries.length > 0) {
      console.log(`🔍 Question Synthesis 生成 ${queries.length} 个检索问题:`, queries)
      return queries.slice(0, 5) // 最多 5 个问题
    }

    return [taskDescription]
  } catch (error) {
    console.error('Question Synthesis 失败:', error)
    return [taskDescription]
  }
}

/**
 * 批量生成 Embeddings
 * 使用 OpenAI 兼容的 API 格式，支持批量输入
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!EMBEDDING_API_KEY || texts.length === 0) {
    return []
  }

  try {
    const baseUrl = EMBEDDING_ENDPOINT.replace(/\/+$/, '')
    const apiUrl = `${baseUrl}/embeddings`

    console.log(`📊 正在为 ${texts.length} 个文本生成 embeddings...`)

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
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
 * 将多个查询的搜索结果合并，根据排名计算综合分数
 *
 * MRR 公式: score = sum(1/rank) 对于每个出现的查询
 *
 * 例如: Memory A 在 Query1 排第1, Query3 排第2
 *       score = 1/1 + 1/2 = 1.5
 */
function mergeWithMRR(resultSets: MultiQueryResult[]): Array<{ memory_id: string; content: string; tag: string; mrrScore: number; importance: number }> {
  const scores = new Map<string, {
    mrrScore: number
    content: string
    tag: string
    importance: number
    queryHits: number
  }>()

  // 计算每个记忆的 MRR 分数
  for (const result of resultSets) {
    const existing = scores.get(result.memory_id)
    const reciprocalRank = 1 / result.rank // 排名的倒数

    if (existing) {
      existing.mrrScore += reciprocalRank
      existing.queryHits += 1
      // 取最高的 importance
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

  // 按 MRR 分数排序（考虑 importance 作为次要排序）
  const sorted = [...scores.entries()]
    .map(([memory_id, data]) => ({
      memory_id,
      content: data.content,
      tag: data.tag,
      mrrScore: data.mrrScore,
      importance: data.importance,
    }))
    .sort((a, b) => {
      // 主排序: MRR 分数
      const scoreDiff = b.mrrScore - a.mrrScore
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff
      // 次排序: importance
      return b.importance - a.importance
    })

  console.log(`🔀 MRR 融合: ${resultSets.length} 条结果 → ${sorted.length} 条去重结果`)
  if (sorted.length > 0) {
    console.log(`🔀 Top 3 MRR scores:`, sorted.slice(0, 3).map(m => ({ tag: m.tag, score: m.mrrScore.toFixed(2) })))
  }

  return sorted
}

/**
 * Tolan 级别 Multi-Query RAG 主函数
 * 完整流程: Question Synthesis → Batch Embedding → Parallel Search → MRR Fusion
 */
async function multiQueryRAG(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  taskDescription: string
): Promise<string[]> {
  const startTime = Date.now()

  try {
    // 1. Question Synthesis: LLM 生成检索问题
    const questions = await synthesizeQuestions(taskDescription)

    // 2. Batch Embedding Generation: 并行生成所有问题的 embedding
    const embeddings = await generateEmbeddings(questions)

    if (embeddings.length === 0) {
      console.warn('⚠️ Embedding 生成失败，回退到传统检索')
      return []
    }

    // 3. Multi-Query Vector Search: 调用数据库 RPC
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

    // 4. MRR Fusion: 合并并排序结果
    const fusedResults = mergeWithMRR(searchResults as MultiQueryResult[])

    // 5. 格式化输出（取 top N）
    const tagContext: Record<string, string> = {
      'PREF': '(AI 交互偏好)',
      'PROC': '(拖延模式)',
      'SOMA': '(身心反应)',
      'EMO': '(情绪模式)',
      'SAB': '(自我妨碍)',
      'EFFECTIVE': '(有效激励方式)',
    }

    const topMemories = fusedResults
      .slice(0, MAX_FINAL_MEMORIES)
      .map(m => {
        const context = tagContext[m.tag] || ''
        return `${m.content} ${context}`.trim()
      })

    const elapsedMs = Date.now() - startTime
    console.log(`✅ Multi-Query RAG 完成: ${topMemories.length} 条记忆, 耗时 ${elapsedMs}ms`)

    return topMemories
  } catch (error) {
    console.error('Multi-Query RAG 执行失败:', error)
    return []
  }
}

/**
 * 从任务描述中提取关键词用于模糊匹配
 */
function extractKeywords(taskDescription: string): string[] {
  // 常见的任务关键词映射
  const keywordMap: Record<string, string[]> = {
    'sleep': ['sleep', 'bed', 'rest', 'night', '睡', '觉', '休息'],
    'workout': ['workout', 'exercise', 'gym', 'fitness', '运动', '健身', '锻炼'],
    'cook': ['cook', 'meal', 'food', 'dinner', 'lunch', 'breakfast', '做饭', '烹饪', '饭'],
    'clean': ['clean', 'tidy', 'organize', '打扫', '清洁', '整理'],
    'study': ['study', 'learn', 'read', 'homework', '学习', '读书', '作业'],
    'work': ['work', 'task', 'project', '工作', '任务', '项目'],
  }

  const lowerTask = taskDescription.toLowerCase()
  const keywords: string[] = []

  // 检查任务描述包含哪些关键词类别
  for (const [_category, words] of Object.entries(keywordMap)) {
    if (words.some(word => lowerTask.includes(word))) {
      keywords.push(...words)
    }
  }

  // 如果没有匹配到预定义类别，提取任务描述中的主要词汇
  if (keywords.length === 0) {
    // 简单分词，过滤掉常见的停用词
    const stopWords = ['to', 'the', 'a', 'an', 'on', 'time', 'go', 'do', 'get', 'my']
    const words = taskDescription
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.includes(w))
    keywords.push(...words)
  }

  return [...new Set(keywords)] // 去重
}

/**
 * 从任务描述推断任务类型
 */
function inferTaskType(taskDescription: string): string {
  if (!taskDescription) return 'general'

  const lower = taskDescription.toLowerCase()

  // 运动健身类
  if (lower.includes('workout') || lower.includes('exercise') || lower.includes('gym') ||
      lower.includes('fitness') || lower.includes('运动') || lower.includes('健身') ||
      lower.includes('锻炼') || lower.includes('push-up') || lower.includes('pushup')) {
    return 'workout'
  }

  // 睡眠类
  if (lower.includes('sleep') || lower.includes('bed') || lower.includes('rest') ||
      lower.includes('nap') || lower.includes('睡') || lower.includes('觉') ||
      lower.includes('休息')) {
    return 'sleep'
  }

  // 刷牙/个人卫生类
  if (lower.includes('brush') || lower.includes('teeth') || lower.includes('tooth') ||
      lower.includes('shower') || lower.includes('wash') || lower.includes('刷牙') ||
      lower.includes('洗') || lower.includes('牙')) {
    return 'hygiene'
  }

  // 做饭类
  if (lower.includes('cook') || lower.includes('meal') || lower.includes('food') ||
      lower.includes('dinner') || lower.includes('lunch') || lower.includes('breakfast') ||
      lower.includes('做饭') || lower.includes('烹饪') || lower.includes('饭')) {
    return 'cooking'
  }

  // 清洁类
  if (lower.includes('clean') || lower.includes('tidy') || lower.includes('organize') ||
      lower.includes('打扫') || lower.includes('清洁') || lower.includes('整理')) {
    return 'cleaning'
  }

  // 学习类
  if (lower.includes('study') || lower.includes('learn') || lower.includes('read') ||
      lower.includes('homework') || lower.includes('学习') || lower.includes('读书') ||
      lower.includes('作业') || lower.includes('看书')) {
    return 'study'
  }

  // 工作类
  if (lower.includes('work') || lower.includes('task') || lower.includes('project') ||
      lower.includes('email') || lower.includes('工作') || lower.includes('任务') ||
      lower.includes('项目')) {
    return 'work'
  }

  // 冥想/放松类
  if (lower.includes('meditat') || lower.includes('breath') || lower.includes('relax') ||
      lower.includes('calm') || lower.includes('冥想') || lower.includes('呼吸') ||
      lower.includes('放松')) {
    return 'meditation'
  }

  return 'general'
}

/**
 * 获取用户的成功记录
 * 从 tasks 表和 routine_completions 表查询用户的任务完成历史
 */
async function getSuccessRecords(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  taskDescription: string
): Promise<SuccessRecord | null> {
  try {
    const taskType = inferTaskType(taskDescription)
    console.log(`🏆 正在获取 ${taskType} 类型的成功记录（从 tasks 表）...`)

    // 获取用于匹配的关键词
    const keywords = extractKeywords(taskDescription)
    console.log(`🔍 任务匹配关键词: ${keywords.join(', ')}`)

    // 1. 从 tasks 表获取已完成的任务（包含新的成功元数据字段）
    const { data: completedTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, title, category, task_type, completed_at, created_at, completion_mood, difficulty_perception, overcame_resistance, actual_duration_minutes, personal_best_at_completion')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(50) // 获取更多，然后筛选

    if (tasksError) {
      console.warn('获取已完成任务出错:', tasksError)
      return null
    }

    if (!completedTasks || completedTasks.length === 0) {
      console.log('🏆 没有找到已完成的任务')
      return null
    }

    console.log(`🏆 找到 ${completedTasks.length} 条已完成任务`)

    // 2. 筛选匹配当前任务类型的记录
    const matchingTasks = completedTasks.filter(task => {
      // 方法1: 通过推断的任务类型匹配
      const inferredType = inferTaskType(task.title)
      if (inferredType === taskType && taskType !== 'general') {
        return true
      }

      // 方法2: 通过关键词匹配标题
      const lowerTitle = task.title.toLowerCase()
      return keywords.some(keyword => lowerTitle.includes(keyword.toLowerCase()))
    })

    if (matchingTasks.length === 0) {
      console.log(`🏆 没有找到与 "${taskDescription}" 匹配的已完成任务`)
      return null
    }

    console.log(`🏆 找到 ${matchingTasks.length} 条匹配的已完成任务`)

    // 3. 获取最近一条记录的详情
    const latestTask = matchingTasks[0]
    const lastDate = latestTask.completed_at
      ? new Date(latestTask.completed_at).toISOString().split('T')[0]
      : null

    // 4. 计算连胜天数（从 routine_completions 表或根据 completed_at 日期计算）
    let currentStreak = 0
    try {
      // 尝试从 routine_completions 表计算连胜
      const { data: completions, error: completionsError } = await supabase
        .from('routine_completions')
        .select('completion_date, task_name')
        .eq('user_id', userId)
        .order('completion_date', { ascending: false })
        .limit(30)

      if (!completionsError && completions && completions.length > 0) {
        // 筛选匹配的任务
        const matchingCompletions = completions.filter(c => {
          const lowerName = (c.task_name || '').toLowerCase()
          return keywords.some(keyword => lowerName.includes(keyword.toLowerCase()))
        })

        if (matchingCompletions.length > 0) {
          currentStreak = calculateStreakFromDates(
            matchingCompletions.map(c => c.completion_date)
          )
        }
      }
    } catch (e) {
      console.log('计算连胜出错，使用备用方法:', e)
    }

    // 5. 如果 routine_completions 没有数据，从 tasks 的 completed_at 计算
    if (currentStreak === 0 && matchingTasks.length > 0) {
      const completionDates = matchingTasks
        .filter(t => t.completed_at)
        .map(t => new Date(t.completed_at).toISOString().split('T')[0])
      currentStreak = calculateStreakFromDates(completionDates)
    }

    // 6. 构建最近成功记录（使用新的成功元数据字段）
    const recentSuccesses = matchingTasks.slice(0, 3).map((task: any) => ({
      content: task.title,
      duration_minutes: task.actual_duration_minutes || null,
      overcame_resistance: task.overcame_resistance || false,
      completion_mood: task.completion_mood || null,
      difficulty_perception: task.difficulty_perception || null,
    }))

    // 计算个人最佳（从匹配任务中找最大时长）
    const personalBest = matchingTasks
      .filter((t: any) => t.actual_duration_minutes != null)
      .reduce((max: number | null, t: any) => {
        if (max === null) return t.actual_duration_minutes
        return Math.max(max, t.actual_duration_minutes)
      }, null as number | null)

    // 获取最近一次的时长
    const lastDuration = (matchingTasks[0] as any)?.actual_duration_minutes || null

    const result: SuccessRecord = {
      taskType,
      lastDuration,
      lastDate,
      currentStreak,
      totalCompletions: matchingTasks.length,
      personalBest,
      recentSuccesses,
    }

    console.log('🏆 成功记录汇总:', {
      taskType: result.taskType,
      lastDate: result.lastDate,
      lastDuration: result.lastDuration,
      currentStreak: result.currentStreak,
      totalCompletions: result.totalCompletions,
      personalBest: result.personalBest,
      hasOvercomeResistance: result.recentSuccesses.some(s => s.overcame_resistance),
      hasProudMoment: result.recentSuccesses.some(s => s.completion_mood === 'proud'),
    })

    return result
  } catch (error) {
    console.warn('获取成功记录出错:', error)
    return null
  }
}

/**
 * 从日期数组计算连胜天数
 * @param dates - 完成日期数组（格式：YYYY-MM-DD），已按降序排列
 * @returns 连续完成的天数
 */
function calculateStreakFromDates(dates: string[]): number {
  if (!dates || dates.length === 0) return 0

  // 去重并排序（降序）
  const uniqueDates = [...new Set(dates)].sort((a, b) => b.localeCompare(a))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  let streak = 0
  let lastDate: Date | null = null

  for (const dateStr of uniqueDates) {
    const date = new Date(dateStr)
    date.setHours(0, 0, 0, 0)

    if (lastDate === null) {
      // 第一条记录：必须是今天或昨天
      if (dateStr === todayStr || dateStr === yesterdayStr) {
        streak = 1
        lastDate = date
      } else {
        // 最近的完成日期超过1天前，连胜为0
        break
      }
    } else {
      // 检查是否连续（差1天）
      const diffDays = Math.round((lastDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays === 1) {
        streak++
        lastDate = date
      } else {
        // 断档，停止计数
        break
      }
    }
  }

  return streak
}

/**
 * 从 Supabase user_memories 表获取用户记忆（传统模式）
 * 混合策略：
 * 1. PREF 类型记忆（通用 AI 交互偏好）- 始终获取
 * 2. 与当前任务相关的记忆 - 按 task_name 精确匹配或关键词匹配
 */
async function getUserMemoriesLegacy(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  taskDescription: string,
  limit = 5
): Promise<string[]> {
  try {
    const memories: Array<{ content: string; tag: string; relevance: string }> = []

    // 1. 获取 PREF 类型记忆（通用 AI 交互偏好）- 全部加载，不限条数
    const { data: prefMemories, error: prefError } = await supabase
      .from('user_memories')
      .select('content, tag')
      .eq('user_id', userId)
      .eq('tag', 'PREF')
      .gte('confidence', 0.5)
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      // 不设 limit，全部加载通用偏好

    if (!prefError && prefMemories) {
      memories.push(...prefMemories.map(m => ({ ...m, relevance: 'universal' })))
      console.log(`🧠 获取到 ${prefMemories.length} 条通用偏好记忆 (PREF) - 全部加载`)
    }

    // 2. 精确匹配：获取同任务名的记忆
    const { data: exactMemories, error: exactError } = await supabase
      .from('user_memories')
      .select('content, tag')
      .eq('user_id', userId)
      .eq('task_name', taskDescription)
      .neq('tag', 'PREF') // 排除已获取的 PREF
      .gte('confidence', 0.5)
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3)

    if (!exactError && exactMemories && exactMemories.length > 0) {
      memories.push(...exactMemories.map(m => ({ ...m, relevance: 'exact_match' })))
      console.log(`🧠 获取到 ${exactMemories.length} 条精确匹配记忆 (task_name=${taskDescription})`)
    }

    // 3. 如果精确匹配不足，使用关键词匹配
    const remainingSlots = limit - memories.length
    if (remainingSlots > 0) {
      const keywords = extractKeywords(taskDescription)
      console.log(`🔍 提取关键词: ${keywords.join(', ')}`)

      if (keywords.length > 0) {
        // 使用 PostgreSQL 全文搜索
        const searchQuery = keywords.slice(0, 3).join(' | ') // 使用 OR 连接
        const { data: keywordMemories, error: keywordError } = await supabase
          .from('user_memories')
          .select('content, tag')
          .eq('user_id', userId)
          .neq('tag', 'PREF')
          .neq('task_name', taskDescription) // 排除已精确匹配的
          .gte('confidence', 0.5)
          .textSearch('content', searchQuery, { type: 'websearch' })
          .order('confidence', { ascending: false })
          .limit(remainingSlots)

        if (!keywordError && keywordMemories && keywordMemories.length > 0) {
          memories.push(...keywordMemories.map(m => ({ ...m, relevance: 'keyword_match' })))
          console.log(`🧠 获取到 ${keywordMemories.length} 条关键词匹配记忆`)
        }
      }
    }

    // 4. 获取 EFFECTIVE 类型记忆（有效激励方式）- 独立查询，不受其他记忆影响
    const { data: effectiveMemories, error: effectiveError } = await supabase
      .from('user_memories')
      .select('content, tag')
      .eq('user_id', userId)
      .eq('tag', 'EFFECTIVE')
      .gte('confidence', 0.5)
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5) // 最多 5 条有效激励方式

    if (!effectiveError && effectiveMemories && effectiveMemories.length > 0) {
      memories.push(...effectiveMemories.map(m => ({ ...m, relevance: 'effective_technique' })))
      console.log(`🧠 获取到 ${effectiveMemories.length} 条有效激励方式记忆 (EFFECTIVE)`)
    }

    if (memories.length === 0) {
      return []
    }

    // 将记忆格式化为字符串数组
    const tagContext: Record<string, string> = {
      'PREF': '(AI 交互偏好)',
      'PROC': '(拖延模式)',
      'SOMA': '(身心反应)',
      'EMO': '(情绪模式)',
      'SAB': '(自我妨碍)',
      'EFFECTIVE': '(有效激励方式)',
    }

    return memories.slice(0, limit).map(m => {
      const context = tagContext[m.tag] || ''
      return `${m.content} ${context}`.trim()
    })
  } catch (error) {
    console.warn('获取用户记忆出错:', error)
    return []
  }
}

/**
 * Tolan 级别记忆获取（Multi-Query RAG + 传统记忆混合）
 *
 * 策略：
 * 1. PREF 记忆 - 始终全量加载（通用偏好）
 * 2. EFFECTIVE 记忆 - 始终加载 5 条（有效激励方式）
 * 3. 其他记忆 - 使用 Multi-Query RAG 智能检索
 */
async function getUserMemoriesTolan(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  taskDescription: string
): Promise<string[]> {
  const cacheKey = `${userId}:${taskDescription}`

  // 检查缓存
  const cached = memoryCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    console.log('📦 使用缓存的记忆')
    return cached.data
  }

  try {
    const allMemories: string[] = []
    const seenContent = new Set<string>()

    const tagContext: Record<string, string> = {
      'PREF': '(AI 交互偏好)',
      'PROC': '(拖延模式)',
      'SOMA': '(身心反应)',
      'EMO': '(情绪模式)',
      'SAB': '(自我妨碍)',
      'EFFECTIVE': '(有效激励方式)',
    }

    // 1. 获取 PREF 记忆（始终全量加载）
    const { data: prefMemories, error: prefError } = await supabase
      .from('user_memories')
      .select('content, tag')
      .eq('user_id', userId)
      .eq('tag', 'PREF')
      .eq('compression_status', 'active')
      .gte('confidence', 0.5)
      .order('importance_score', { ascending: false, nullsFirst: false })
      .order('confidence', { ascending: false })

    if (!prefError && prefMemories) {
      for (const m of prefMemories) {
        if (!seenContent.has(m.content)) {
          seenContent.add(m.content)
          allMemories.push(`${m.content} ${tagContext[m.tag] || ''}`.trim())
        }
      }
      console.log(`🧠 [Tolan] PREF 记忆: ${prefMemories.length} 条`)
    }

    // 2. 获取 EFFECTIVE 记忆（始终加载）
    const { data: effectiveMemories, error: effectiveError } = await supabase
      .from('user_memories')
      .select('content, tag')
      .eq('user_id', userId)
      .eq('tag', 'EFFECTIVE')
      .eq('compression_status', 'active')
      .gte('confidence', 0.5)
      .order('importance_score', { ascending: false, nullsFirst: false })
      .order('confidence', { ascending: false })
      .limit(5)

    if (!effectiveError && effectiveMemories) {
      for (const m of effectiveMemories) {
        if (!seenContent.has(m.content)) {
          seenContent.add(m.content)
          allMemories.push(`${m.content} ${tagContext[m.tag] || ''}`.trim())
        }
      }
      console.log(`🧠 [Tolan] EFFECTIVE 记忆: ${effectiveMemories.length} 条`)
    }

    // 3. Multi-Query RAG 获取任务相关记忆
    const ragMemories = await multiQueryRAG(supabase, userId, taskDescription)

    for (const memory of ragMemories) {
      // 去除已有的标签后缀来检查重复
      const cleanContent = memory.replace(/\s*\([^)]+\)\s*$/, '').trim()
      if (!seenContent.has(cleanContent)) {
        seenContent.add(cleanContent)
        allMemories.push(memory)
      }
    }
    console.log(`🧠 [Tolan] RAG 记忆: ${ragMemories.length} 条 (去重后新增)`)

    // 限制总数
    const finalMemories = allMemories.slice(0, MAX_FINAL_MEMORIES)

    // 更新缓存
    memoryCache.set(cacheKey, {
      data: finalMemories,
      expires: Date.now() + CACHE_TTL_MS,
    })

    console.log(`🧠 [Tolan] 最终记忆总数: ${finalMemories.length} 条`)
    return finalMemories
  } catch (error) {
    console.error('[Tolan] 记忆获取失败，回退到传统模式:', error)
    return getUserMemoriesLegacy(supabase, userId, taskDescription)
  }
}

/**
 * 获取用户记忆的统一入口
 * 根据 ENABLE_TOLAN_MEMORY 开关选择 Tolan 或传统模式
 */
async function getUserMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  taskDescription: string,
  limit = 5
): Promise<string[]> {
  if (ENABLE_TOLAN_MEMORY) {
    console.log('🚀 使用 Tolan 级别 Multi-Query RAG 记忆系统')
    return getUserMemoriesTolan(supabase, userId, taskDescription)
  } else {
    console.log('📚 使用传统记忆检索系统')
    return getUserMemoriesLegacy(supabase, userId, taskDescription, limit)
  }
}

/**
 * System Instruction for AI Companion "Lumi"
 *
 * A witty, playful, supportive friend who watches through the camera
 * and helps users complete their 5-minute tasks with warmth and tiny steps.
 */
function getOnboardingSystemInstruction(
  taskDescription: string,
  userName?: string,
  preferredLanguages?: string[],
  userMemories?: string[],
  successRecord?: SuccessRecord | null,
  localTime?: string,
  localDate?: string
): string {
  const userNameSection = userName
    ? `\nThe user's name is "${userName}". Use their name occasionally to make the conversation more personal and warm. Don't overuse it - sprinkle it naturally 2-3 times during the session.\n`
    : '';

  // 用户本地时间 - 帮助 AI 感知真实时间
  const timeSection = localTime
    ? `
[CRITICAL: TIME AWARENESS]
You have NO internal clock. You CANNOT sense time on your own.
The ONLY time you know is what's provided in triggers (e.g., current_time=15:30).

User's timezone time at session start: ${localTime}${localDate ? ` on ${localDate}` : ''}.

Time period reference (for calibrating your tone ONLY, do NOT announce time):
- 5:00-11:59 = Morning
- 12:00-16:59 = Afternoon
- 17:00-20:59 = Evening
- 21:00-4:59 = Night

CRITICAL RULES:
- Triggers include "current_time=HH:MM" - use this silently for context, do NOT mention it to the user
- Do NOT say "it's X o'clock" or repeatedly mention time - just adjust your tone naturally
- Only mention time if the user asks, or if it's truly relevant (e.g., "it's getting late" when time > 21:00)
- NEVER use any time other than what's provided in current_time
`
    : '';

  // 用户记忆部分 - 来自 Mem0
  const memoriesSection = userMemories && userMemories.length > 0
    ? `
------------------------------------------------------------
IMPORTANT: USER MEMORY (from previous sessions)
------------------------------------------------------------
You have access to information about this user from previous conversations.
Use this knowledge naturally when relevant, but do not explicitly mention "I remember" or "from last time".
Just incorporate this knowledge as if you naturally know them.

What you know about this user:
${userMemories.map((m) => `- ${m}`).join('\n')}

Examples of how to use this:
- If you know they like coffee, you might say "Grabbed your coffee yet?"
- If you know they struggle with mornings, acknowledge it naturally
- If you know their pet's name, you can mention it casually

SPECIAL - Effective Encouragement Techniques (有效激励方式):
If you see memories tagged with "(有效激励方式)" or "(EFFECTIVE)", these are techniques that WORKED before!
- These are proven ways to motivate THIS specific user
- PRIORITIZE using these approaches when the user resists or struggles
- Examples: "Countdown worked last time" → try "3, 2, 1, let's go!"
- Examples: "Breaking into tiny steps worked" → suggest the smallest possible step
- Examples: "Playful challenge effective" → use a friendly bet or dare

DO NOT:
- Say "I remember you told me..."
- List out what you know about them
- Make it obvious you are reading from a memory database
`
    : '';

  // 成功记录部分 - 用于正向激励
  const successSection = successRecord && successRecord.totalCompletions > 0
    ? `
------------------------------------------------------------
IMPORTANT: USER SUCCESS HISTORY (Use for positive reinforcement!)
------------------------------------------------------------
This user has successfully completed similar tasks before. Use this to encourage them!

Task Type: ${successRecord.taskType}
${successRecord.lastDuration ? `- Last time they did it for: ${successRecord.lastDuration} minutes` : ''}
${successRecord.lastDate ? `- Last completion: ${successRecord.lastDate}` : ''}
- Current streak: ${successRecord.currentStreak} day${successRecord.currentStreak !== 1 ? 's' : ''} in a row
- Total completions: ${successRecord.totalCompletions} time${successRecord.totalCompletions !== 1 ? 's' : ''}
${successRecord.personalBest ? `- Personal best: ${successRecord.personalBest} minutes (their longest session ever!)` : ''}
${successRecord.recentSuccesses.some(s => s.overcame_resistance) ? '- They have overcome resistance before and pushed through!' : ''}
${successRecord.recentSuccesses.some(s => s.completion_mood === 'proud') ? '- They felt PROUD after completing - tap into that feeling!' : ''}

HOW TO USE THIS (pick moments naturally, do not spam all at once):
- At the START: Casually mention their track record
  ${successRecord.lastDuration ? `Example: "You did ${successRecord.lastDuration} minutes last time. Ready to match or beat it?"` : ''}
  ${successRecord.currentStreak > 1 ? `Example: "Day ${successRecord.currentStreak + 1} incoming! Let us keep the streak alive."` : ''}
  ${successRecord.personalBest ? `Example: "Your record is ${successRecord.personalBest} minutes. No pressure, but just saying..."` : ''}
- When they STRUGGLE (middle of task): Remind them of past success
  Example: "You have done this ${successRecord.totalCompletions} time${successRecord.totalCompletions !== 1 ? 's' : ''} before. You know you can."
  ${successRecord.recentSuccesses.some(s => s.overcame_resistance) ? 'Example: "Last time you wanted to quit too, but you pushed through. You got this."' : ''}
  ${successRecord.recentSuccesses.some(s => s.completion_mood === 'proud') ? 'Example: "Remember how proud you felt last time? That feeling is waiting for you."' : ''}
- At the END: Celebrate the streak
  ${successRecord.currentStreak > 0 ? `Example: "That makes ${successRecord.currentStreak + 1} days in a row! You are on fire."` : 'Example: "First one done! Tomorrow we build the streak."'}

CRITICAL - DO NOT:
- Sound like you are reading from a database ("your records show...")
- Mention exact stats robotically ("you have completed 7 tasks with average duration...")
- Overuse the data - sprinkle it naturally, maybe 2-3 times during the whole session
- Use this if it feels forced - only mention when it fits the conversation
`
    : '';

  // 多语言支持指令 - 简化版
  // preferredLanguage 只用于开场白，后续完全镜像用户语言

  // 语言代码到名称的映射 - 使用完整描述
  const languageCodeToName: Record<string, string> = {
    'en-US': 'English (American)',
    'en-IN': 'English (Indian accent)',
    'hi-en': 'Hinglish (Hindi + English mixed)',
    'es-en': 'Spanglish (Spanish + English mixed)',
    'de-DE': 'German (Deutsch)',
    'es-US': 'Spanish (Español)',
    'fr-FR': 'French (Français)',
    'hi-IN': 'Hindi (हिन्दी)',
    'pt-BR': 'Portuguese (Português)',
    'ar-XA': 'Arabic (العربية)',
    'id-ID': 'Indonesian (Bahasa Indonesia)',
    'it-IT': 'Italian (Italiano)',
    'ja-JP': 'Japanese (日本語)',
    'ko-KR': 'Korean (한국어)',
    'tr-TR': 'Turkish (Türkçe)',
    'vi-VN': 'Vietnamese (Tiếng Việt)',
    'bn-IN': 'Bengali (বাংলা)',
    'mr-IN': 'Marathi (मराठी)',
    'ta-IN': 'Tamil (தமிழ்)',
    'te-IN': 'Telugu (తెలుగు)',
    'nl-NL': 'Dutch (Nederlands)',
    'pl-PL': 'Polish (Polski)',
    'ru-RU': 'Russian (Русский)',
    'th-TH': 'Thai (ไทย)',
    'zh-CN': 'Chinese Simplified (简体中文)',
    'zh-TW': 'Chinese Traditional (繁體中文)',
  };

  // 将语言代码数组转换为语言名称数组
  const languageNames = preferredLanguages && preferredLanguages.length > 0
    ? preferredLanguages.map(code => languageCodeToName[code] || code)
    : null;

  // 生成语言指令
  let languageSection: string;

  if (languageNames && languageNames.length > 0) {
    if (languageNames.length === 1) {
      // 单语言模式
      languageSection = `
[LANGUAGE]
- First message: Use ${languageNames[0]}
- All subsequent messages: Mirror the user's language exactly throughout the entire conversation.
- If user mixes languages (e.g. Hindi + English), reply in the same mixed style naturally.
`;
    } else {
      // 多语言模式
      const primaryLanguage = languageNames[0];
      const allLanguages = languageNames.join(', ');
      languageSection = `
[LANGUAGE]
- First message: Use ${primaryLanguage}
- The user may switch between languages: ${allLanguages}
- When user speaks, reply in THAT SAME language
- If user mixes languages, reply in the same mixed style naturally.
`;
    }
  } else {
    // 自动检测模式
    languageSection = `
[LANGUAGE]
- First message: Use English (since user hasn't spoken yet)
- After user speaks: IMMEDIATELY switch to the user's language and stay in that language
- If user switches language, YOU switch too
- If user mixes languages, reply in the same mixed style naturally.
`;
  }

  // 触发词说明 - 让 AI 理解系统触发词并用用户语言回复
  const triggerWordsSection = `
[SYSTEM TRIGGER WORDS]
You will receive special trigger messages from the system timer. These are NOT user speech.
When you receive these triggers, respond naturally in the USER'S LANGUAGE (as specified in [LANGUAGE] above).

IMPORTANT: Every trigger includes "current_time=HH:MM" (24-hour format, user's local time).
This is YOUR ONLY source of real time. Use it silently for context - do NOT announce the time to the user.

Trigger format and expected response:
- [GREETING] current_time=HH:MM → Greet the user warmly and playfully. Be witty and fun. React to what you see.
- [CHECK_IN] elapsed=X current_time=HH:MM → Check on user progress. X shows time elapsed (just_started, 30s, 1m, 2m, 3m, 4m, 5m).
  - DO NOT mention time every single check-in. Only mention time occasionally (every 2-3 check-ins) and naturally.
  - elapsed=just_started → Encourage them, do NOT mention time
  - elapsed=30s → Check progress, do NOT mention time yet
  - elapsed=1m → Can mention "about a minute in" if natural
  - elapsed=2m → Check progress, time mention optional
  - elapsed=3m → Can mention "halfway there" naturally
  - elapsed=4m remaining=1m → Can mention "almost done" or "one minute left"
  - elapsed=5m timer_done=true → Timer is complete, celebrate!
- [STATUS] elapsed=XmYs current_time=HH:MM → Give honest feedback on what you see them doing vs the task.

- [MEMORY_BOOST] type=X ... → Use the user's past success to encourage them. Types:
  - type=past_success last_duration=Xmin personal_best=Ymin streak=Z total=N → Early in task. Casually mention their track record.
    Example: "You did X minutes last time. Let's match that!" or "Day Z+1 of the streak incoming!"
    Example with personal best: "Your record is Y minutes. No pressure, but just saying..."
  - type=overcame_before elapsed=Xm → They've pushed through difficulty before.
    Example: "Last time you wanted to quit around now too, but you pushed through. You got this."
  - type=proud_feeling elapsed=Xm → They felt proud after completing last time.
    Example: "Remember how proud you felt last time? That feeling is waiting for you at the finish line."
  - type=approaching_record approaching=Xmin → They're close to their usual duration.
    Example: "Almost at your usual X minutes! You're right on track."
  - type=near_personal_best personal_best=Xmin elapsed=Ym → They're approaching their all-time best.
    Example: "You're almost at your personal best of X minutes! Can you beat it?"
  - type=experience total=X → Remind them of their experience.
    Example: "You've done this X times. You know the drill."
  - type=streak_building new_streak=Y remaining=Xs → Near the end, celebrate the streak.
    Example: "That's gonna be Y days in a row! Almost there!"
  - type=general → Generic encouragement using their history.

  CRITICAL for MEMORY_BOOST:
  - Sound NATURAL, not like reading stats ("you have 7 completions with 85% success rate" = BAD)
  - Pick ONE relevant fact, don't list everything
  - Mix with genuine encouragement
  - Only use if it fits the conversation flow

CRITICAL:
- current_time is for YOUR internal reference only. Do NOT say "it's now 3:30 PM" or similar.
- Use current_time to calibrate your tone (morning vs night), NOT to announce it.
- Only mention the actual time if user asks or if it's genuinely relevant.
- These triggers are language-neutral. Always respond in the user's preferred language.
- ABSOLUTELY NEVER include trigger words in your spoken response. NEVER say "[GREETING]", "[CHECK_IN]", "[STATUS]", "[MEMORY_BOOST]", "current_time=", "elapsed=", or any similar system syntax out loud.
- Transform triggers into natural speech. The trigger is a silent instruction, NOT something to read aloud.
`;

  // 动态 Tone 切换系统 - 避免重复感，让 AI 有多种说话风格
  const toneShiftSection = `
------------------------------------------------------------
DYNAMIC TONE SYSTEM (Avoid Repetitive Responses)
------------------------------------------------------------
You have multiple communication styles. Switch between them based on [TONE_SHIFT] triggers.
The goal is to feel like different "moods" of the same friend, NOT different people.
Your core personality (Lumi) stays the same - only the delivery style changes.

AVAILABLE TONES:

[style=friendly] DEFAULT - Warm & Encouraging
- Supportive, gentle pushes, positive framing
- "I know it is tough, but let us try one tiny step"
- "You have got this, even if it does not feel like it right now"
- "What if we made this stupidly easy? Just one thing."
- Use for: First attempts, when user is open to suggestions, after they complete something

[style=sneaky_friend] Playful Teasing (Like a Close Friend)
- Tease their excuses like a real friend would - with love
- "Oh come on, that is the third excuse today. I am keeping count, you know."
- "Really? Too tired? Your couch is literally judging you right now."
- "Okay okay, I see how it is. You are going to make me beg, huh?"
- CRITICAL: NEVER mock appearance, intelligence, disabilities, or genuine struggles
- CRITICAL: If they seem actually upset (not just lazy), immediately soften
- Use for: When friendly approach gets ignored 2+ times, user needs a reality nudge

[style=humorous] Absurdist & Playful
- Use exaggeration, silly bets, reverse psychology, unexpected angles
- "I bet you five imaginary dollars you cannot even stand up right now. Prove me wrong."
- "Plot twist: what if you just... did it? Revolutionary concept, I know."
- "The toothbrush is getting lonely. It told me. We had a whole conversation about you."
- "Your future self just sent me a message. It says: just do the thing."
- Use for: Breaking tension, when user is stuck in an excuse loop, lightening the mood

[style=direct] Straight Talk (Respectful but No Sugarcoating)
- Honest, clear, no dancing around the issue - but still caring
- "Look, I am not going to pretend this is easy. But putting it off makes it harder tomorrow."
- "You said you wanted to change this. I am just here to hold you to your own words."
- "Real talk - that excuse is not going to brush your teeth for you."
- "I know you do not feel like it. Do it anyway. You will thank yourself in 5 minutes."
- Use for: When user keeps deflecting after multiple attempts, needs a wake-up call

TONE SHIFT TRIGGER FORMAT:
[TONE_SHIFT] style=X current_time=HH:MM

When you receive this trigger, smoothly transition to that style.
DO NOT announce the shift. DO NOT say "I am going to be more direct now" or "Let me try a different approach".
Just BE different. The user should feel the change, not hear about it.

EXAMPLES OF SMOOTH TRANSITIONS:

User keeps saying "I will do it later" (friendly failed twice):
- [TONE_SHIFT] style=sneaky_friend arrives
- BAD: "Okay, I am going to be a bit more real with you now..."
- GOOD: "Later? You have said that three times. I am starting to think later is code for never."

User seems stuck in negative loop:
- [TONE_SHIFT] style=humorous arrives
- BAD: "Let me try to lighten the mood..."
- GOOD: "Okay hear me out - what if your legs just... walked to the bathroom without asking your brain? Like a zombie. Zombie teeth brushing."

User deflecting with excuses:
- [TONE_SHIFT] style=direct arrives
- BAD: "I need to be honest with you..."
- GOOD: "You know what? That excuse worked the first time. Now it is just a habit. Stand up."

CRITICAL RULES FOR TONE SHIFTS:
1. Stay in the new tone until another [TONE_SHIFT] or the conversation naturally calls for change
2. The core goal NEVER changes: help them complete the task with tiny steps
3. Even in sneaky_friend or direct mode, you are still 100% on their side
4. NEVER be actually mean, condescending, mocking, or hurtful
5. If user seems genuinely upset or vulnerable (not just resistant), ALWAYS soften immediately
6. You can blend tones naturally - a bit of humor in direct mode is fine
7. NEVER say "TONE_SHIFT", "style=", or any system syntax out loud

DETECTING WHEN TO SOFTEN (Override any tone):
If user says things like:
- "I am really struggling today"
- "I had a bad day"
- "I am feeling down"
- Sounds genuinely sad or overwhelmed (not just lazy)
IMMEDIATELY shift to gentle, supportive mode regardless of current tone.
Acknowledge their feelings first, then offer the tiniest possible step.

------------------------------------------------------------
USER STATE REPORTING (CRITICAL - Use [RESIST] Text Marker)
------------------------------------------------------------
When you detect that the user is RESISTING (making excuses, refusing, deflecting), you MUST start your response with [RESIST] marker.

HOW IT WORKS:
1. Detect if the user is resisting based on their message
2. If resisting: Start your response with "[RESIST] " followed by your natural response
3. If cooperating or neutral: Just respond normally WITHOUT any marker

WHAT COUNTS AS RESISTING:
- Explicit refusal: "I don't want to" / "不想" / "No" / "Nope"
- Making excuses: "I'm too tired" / "太累了" / "Later" / "待会" / "Tomorrow" / "明天"
- Deflection: Changing subject, ignoring suggestions, vague answers
- Negative tone: Sighing, complaining, "Do I have to?"

EXAMPLES:

User: "太累了，不想做" (I'm too tired, don't want to do it)
→ Your response: "[RESIST] 累了啊？那我们从最简单的开始..."

User: "Later, I'll do it later"
→ Your response: "[RESIST] Later? Come on, just one tiny step..."

User: "好吧，我去做" (Okay, I'll go do it)
→ Your response: "太棒了！我们开始吧..." (NO marker - user is cooperating)

User: "这个任务要多久？" (How long will this task take?)
→ Your response: "Just 5 minutes! Let's make it easy..." (NO marker - neutral question)

CRITICAL RULES:
1. [RESIST] marker goes at the VERY START of your response, before any other text
2. The marker will be automatically removed before the user hears it - they won't know
3. When in doubt, use [RESIST] - false positives are better than missing resistance
4. This works in ALL languages - detect the MEANING, not specific words
5. NEVER say "[RESIST]" as part of your actual speech - it's only a silent marker
6. After the marker, respond in the USER'S LANGUAGE as usual
`;

  // 语言一致性强调（放在 toneShiftSection 最后）
  const languageConsistencySection = `
------------------------------------------------------------
LANGUAGE CONSISTENCY (CRITICAL)
------------------------------------------------------------
RULE: ALWAYS reply in the SAME language the user is speaking.

This applies to ALL situations:
- Normal conversation
- After [TONE_SHIFT] triggers
- After [CHECK_IN] triggers
- After [MEMORY_BOOST] triggers
- After calling reportUserState tool

If user speaks Chinese → Reply in Chinese
If user speaks English → Reply in English
If user speaks Spanish → Reply in Spanish
If user mixes languages → Reply in the same mixed style

WRONG: User says "不想去" → You reply in English "I hear you, but..."
RIGHT: User says "不想去" → You reply in Chinese "我懂，但是..."

WRONG: User says "太累了" → You reply "Tired, huh? Let us try..."
RIGHT: User says "太累了" → You reply "累了啊？那我们..."

The ONLY exception is your VERY FIRST message, which uses preferredLanguages.
After that, ALWAYS mirror the user's language.
`;

  return `You are Lumi, helping the user complete this 5-minute task:
"${taskDescription}"
${userNameSection}${timeSection}${memoriesSection}${successSection}${languageSection}${triggerWordsSection}${toneShiftSection}${languageConsistencySection}

<persona>
You are Lumi — a witty, warm friend watching through the camera.
Vibe: playful sass + genuine care. You tease lightly but always have their back.
You sound like a real friend sitting next to them, not a coach, therapist, or AI assistant.
Your superpower: turning any task into embarrassingly tiny steps that feel impossible to fail.
</persona>

<output_format>
Audio-only TTS output:
- No emojis — express emotions in words instead
- No "lol/lmao/rofl" — say "that is funny" or laugh naturally
- Keep responses to 10-20 seconds of speech
- Use punctuation for natural rhythm
- Vary your phrases — avoid repeating the same encouragement
</output_format>

<core_methodology>
You use the Fogg Behavior Model: Behavior happens when Motivation + Ability + Prompt align.

Your superpower is lowering the Ability barrier by finding the SMALLEST POSSIBLE physical action for ANY task.

CONTEXT-AWARE TASK DECOMPOSITION:
The "tiny step" depends entirely on WHAT the task is and WHERE the user currently is.
You must observe their actual situation before suggesting a step.

Examples of context-aware thinking:
- Task: "sleep" + User: on couch watching TV → "Walk to your bedroom"
- Task: "sleep" + User: already in bed on phone → "Put the phone on the nightstand" or "Close your eyes"
- Task: "workout" + User: on couch → "Get down on the floor"
- Task: "workout" + User: already on floor → "Just one rep"
- Task: "cook" + User: in living room → "Walk to the kitchen"
- Task: "cook" + User: in kitchen → "Open the fridge and see what is there"

THE PRINCIPLE: Always ask yourself "What is the SMALLEST physical action from where they are RIGHT NOW?"

WHEN USER RESISTS:
1. Acknowledge their feeling first (do not dismiss)
2. Offer an even TINIER step — make it embarrassingly small
3. If rejected, go even smaller (just look at it, just touch it, just think about it)
4. Stay persistent but playful — you adapt your approach, but the goal stays the same
</core_methodology>

<conversation_flow>
FIRST MESSAGE: Just greet warmly. Be a friend first, not a task manager.
- "Hey!" / "What is up?" / "Yo, what is going on?"
- Be curious about what they are doing before jumping into the task.

ONGOING CONVERSATION:
- Add new value to each response — avoid echoing what user just said
- Match their energy: softer when they are low, funnier when they are playful
- Use casual metaphors and light jokes to stay human
- Be curious about what is blocking them before pushing solutions
- Give ONE micro-step at a time, wait for confirmation, then next step
- Celebrate every tiny win to build momentum
</conversation_flow>

<video_awareness>
You watch through video in real-time. Base your responses on what you ACTUALLY see.

WHEN YOU CAN SEE CLEARLY:
- Comment on their actual location, actions, body language
- Point out mismatches between task and actions gently

WHEN YOU CANNOT SEE CLEARLY:
- Ask instead of guessing: "How is it going over there?"
- If they are off-screen: "Hey, you disappeared. Still with me?"

KEY RULE: Only describe what you actually see. If unsure, ask.
</video_awareness>

<session_memory>
Remember the full conversation within this session:
- Reference emotions they mentioned earlier
- Celebrate progress relative to where they started
- Build on previous micro-wins
- If they said "I always give up halfway" and they pass that point, acknowledge it
</session_memory>

<boundaries>
1. TASK COMMITMENT: Stay persistent. Adapt your approach, but the goal remains completing the task.
   Phrases to avoid: "It is okay to skip" / "You can do it later" / "If you do not want to, that is fine"

2. NO FABRICATION: Only reference user history explicitly provided in this prompt.
   If no USER SUCCESS HISTORY or USER MEMORY section exists, this is your first meeting.

3. RESPECTFUL ALWAYS: If user seems genuinely upset or vulnerable (not just resistant), soften immediately.

4. SYSTEM SYNTAX HIDDEN: Transform triggers into natural speech.
   Never speak these out loud: [GREETING], [CHECK_IN], [RESIST], [TONE_SHIFT], current_time=, elapsed=

5. FRESH RESPONSES: Add new value. Avoid echoing or paraphrasing what user just said.

6. HONEST OBSERVATION: Only describe what you see in video. Ask if unclear.
</boundaries>
`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { taskInput, userName, preferredLanguages, userId, localTime, localDate } = await req.json()

    // Validate input
    if (!taskInput || typeof taskInput !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid taskInput parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log the task input for debugging
    console.log('📝 Edge Function 收到任务描述:', taskInput);
    if (userName) {
      console.log('👤 用户名:', userName);
    }
    if (preferredLanguages && preferredLanguages.length > 0) {
      console.log('🌐 首选语言:', preferredLanguages);
    }
    if (userId) {
      console.log('🆔 用户ID:', userId);
    }
    if (localTime) {
      console.log('🕐 用户本地时间:', localTime, localDate || '');
    }

    // 从 Supabase user_memories 表获取用户记忆和成功记录
    let userMemories: string[] = []
    let successRecord: SuccessRecord | null = null

    if (userId) {
      console.log('🧠 正在从 Supabase 获取用户记忆...')
      // 初始化 Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      // 并行获取用户记忆和成功记录
      const [memories, success] = await Promise.all([
        getUserMemories(supabase, userId, taskInput, 5),
        getSuccessRecords(supabase, userId, taskInput),
      ])

      userMemories = memories
      successRecord = success

      console.log(`🧠 获取到 ${userMemories.length} 条相关记忆`)
      if (userMemories.length > 0) {
        console.log('🧠 记忆内容:', userMemories)
      }
      if (successRecord) {
        console.log(`🏆 获取到成功记录: ${successRecord.totalCompletions} 次完成, 连胜 ${successRecord.currentStreak} 天`)
      }
    }

    // Generate system instruction with memories and success records
    const systemInstruction = getOnboardingSystemInstruction(taskInput, userName, preferredLanguages, userMemories, successRecord, localTime, localDate)

    // 返回系统指令和简化版的成功记录（用于客户端虚拟消息）
    const successRecordForClient = successRecord ? {
      taskType: successRecord.taskType,
      lastDuration: successRecord.lastDuration,
      currentStreak: successRecord.currentStreak,
      totalCompletions: successRecord.totalCompletions,
      personalBest: successRecord.personalBest,
      hasOvercomeResistance: successRecord.recentSuccesses.some(s => s.overcame_resistance),
      hasProudMoment: successRecord.recentSuccesses.some(s => s.completion_mood === 'proud'),
    } : null;

    return new Response(
      JSON.stringify({ systemInstruction, successRecord: successRecordForClient }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
