import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Azure AI Foundry 配置 - 使用 OpenAI 兼容的 REST API
const AZURE_ENDPOINT = Deno.env.get('AZURE_AI_ENDPOINT') || 'https://conta-mcvprtb1-eastus2.openai.azure.com'
const AZURE_API_KEY = Deno.env.get('AZURE_AI_API_KEY')
const MODEL_NAME = Deno.env.get('MEMORY_EXTRACTOR_MODEL') || 'gpt-5.1-chat'
const EMBEDDING_MODEL = Deno.env.get('MEMORY_EMBEDDING_MODEL') || 'text-embedding-3-large'

// 记忆整合配置
const SIMILARITY_THRESHOLD = 0.85  // 相似度阈值，高于此值视为重复

// 记忆提取的系统提示词
const EXTRACTION_PROMPT = `You are an AI Coach behavioral pattern extractor. Your job is to identify PATTERNS, PREFERENCES, and SUCCESS RECORDS from user conversations.

## STRICT RULES - MUST FOLLOW

### NEVER EXTRACT (Auto-reject these):
- Time/date mentions ("it's 4pm", "today", "morning")
- Basic intentions ("wants to workout", "going to read")
- Greetings or small talk
- Single events without pattern significance
- What AI said (only extract USER patterns)

### ONLY EXTRACT (High-value insights):

**1. AI INTERACTION PREFERENCES** [Tag: PREF]
User feedback on how AI should communicate.
Examples:
- "User dislikes being rushed or pressured by AI"
- "User prefers gentle encouragement over strict commands"
- "User wants AI to be more direct and less chatty"

**2. PROCRASTINATION TRIGGERS** [Tag: PROC]
WHY user avoids or delays specific tasks.
Examples:
- "User avoids exercise because it feels overwhelming to start"
- "User procrastinates on reading due to fear of not understanding"

**3. PSYCHOSOMATIC PATTERNS** [Tag: SOMA]
Physical symptoms tied to specific activities (possible psychological resistance).
Examples:
- "User reports recurring headaches specifically before workout - possible avoidance pattern"
- "User feels tired only when it's time to study"

**4. EMOTIONAL TRIGGERS** [Tag: EMO]
Emotions consistently tied to specific tasks or situations.
Examples:
- "User feels anxious when facing deadlines"
- "User gets frustrated when interrupted during focus time"

**5. SELF-SABOTAGE PATTERNS** [Tag: SAB]
Recurring behaviors that undermine user's goals.
Examples:
- "User checks phone immediately before important tasks"
- "User makes excuses about time when avoiding exercise"

**6. SUCCESS RECORDS** [Tag: SUCCESS]
Completed tasks - ALWAYS extract when the conversation indicates task completion or the metadata shows task_completed=true.
Examples:
- "User completed 5-minute workout session successfully"
- "User finished brushing teeth task"
- "User overcame initial resistance and completed the full task"

IMPORTANT for SUCCESS:
- Extract when user completed the task (timer ended, user said "done", "finished", etc.)
- Note if user overcame difficulty during the task
- Note emotional state at completion if mentioned ("felt proud", "relieved")
- For SUCCESS tag, also include "metadata" field with: duration_minutes (if known), overcame_resistance (boolean)

## OUTPUT FORMAT

Return a JSON array of extracted memories. Each memory should have:
- "content": The memory text (be specific, include TASK and PATTERN)
- "tag": One of PREF, PROC, SOMA, EMO, SAB, SUCCESS
- "confidence": 0.0-1.0 how confident you are this is a real pattern
- "metadata": (optional, mainly for SUCCESS) { "duration_minutes": number, "overcame_resistance": boolean }

If there are NO meaningful patterns to extract, return an empty array: []

## EXAMPLES

Input conversation about workout with user saying "Every time when about workout, I feel headache"

Output:
[
  {
    "content": "User experiences recurring headaches specifically when thinking about working out - likely psychological resistance to exercise",
    "tag": "SOMA",
    "confidence": 0.85
  }
]

Input conversation where user completed a 5-minute workout task and said "I did it! That wasn't so bad"

Output:
[
  {
    "content": "User successfully completed workout task and expressed positive surprise at the experience",
    "tag": "SUCCESS",
    "confidence": 0.95,
    "metadata": { "overcame_resistance": false }
  }
]

Input conversation where user struggled but finished, saying "I wanted to quit at minute 2 but I pushed through"

Output:
[
  {
    "content": "User completed task despite wanting to quit at the 2-minute mark - showed strong persistence",
    "tag": "SUCCESS",
    "confidence": 0.95,
    "metadata": { "overcame_resistance": true }
  }
]

Input conversation with user just saying "It's 4pm and I need to work out"

Output:
[]

## IMPORTANT
- Quality over quantity: Only extract MEANINGFUL patterns
- Be specific: Include the TASK and the PATTERN
- Note frequency if mentioned: "always", "every time", "usually"
- Include psychological insight when the pattern suggests it
- For SUCCESS: Always extract when task is completed - this helps with positive reinforcement`

// 记忆合并的系统提示词
const MERGE_PROMPT = `You are a memory consolidation expert. Your task is to merge multiple similar memories into ONE concise, comprehensive memory.

## RULES
1. Preserve ALL unique details from each memory
2. Remove redundancy and repetition
3. Keep the merged memory concise but complete
4. Maintain the same tag type
5. Use the highest confidence among the memories being merged

## OUTPUT FORMAT
Return a JSON object:
{
  "content": "The merged memory text",
  "confidence": 0.0-1.0
}

## EXAMPLE

Input memories:
1. "User feels unable to sleep when tasks are unfinished"
2. "User feels strong anxiety about going to bed because tasks feel unfinished"
3. "User becomes anxious whenever thinking about sleep due to incomplete work"

Output:
{
  "content": "User experiences strong anxiety about going to bed when tasks feel unfinished, which prevents them from falling asleep. The thought of incomplete work triggers stress that interferes with winding down.",
  "confidence": 0.9
}`

interface ExtractMemoryRequest {
  action: 'extract'
  userId: string
  messages: Array<{ role: string; content: string }>
  taskDescription?: string
  metadata?: Record<string, unknown>
}

interface SearchMemoryRequest {
  action: 'search'
  userId: string
  query: string
  limit?: number
}

interface GetMemoriesRequest {
  action: 'get'
  userId: string
  limit?: number
}

interface DeleteMemoryRequest {
  action: 'delete'
  memoryId: string
}

interface ConsolidateMemoryRequest {
  action: 'consolidate'
  userId: string
  tag?: string  // 可选：只整合特定标签的记忆
}

type MemoryRequest = ExtractMemoryRequest | SearchMemoryRequest | GetMemoriesRequest | DeleteMemoryRequest | ConsolidateMemoryRequest

interface ExtractedMemory {
  content: string
  tag: 'PREF' | 'PROC' | 'SOMA' | 'EMO' | 'SAB' | 'SUCCESS'
  confidence: number
  /** SUCCESS 标签的额外元数据 */
  metadata?: {
    duration_minutes?: number
    overcame_resistance?: boolean
  }
}

/**
 * 从任务描述推断任务类型
 * 用于 SUCCESS 记忆的分类，方便后续按类型查询
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

interface ExistingMemory {
  id: string
  content: string
  tag: string
  confidence: number
  similarity: number
}

interface SaveResult {
  action: 'created' | 'merged' | 'skipped'
  memoryId: string
  content: string
  mergedFrom?: string[]
}

/**
 * 生成文本的 embedding 向量
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!AZURE_API_KEY) {
    throw new Error('AZURE_AI_API_KEY environment variable not set')
  }

  const apiUrl = `${AZURE_ENDPOINT}/openai/v1/embeddings`

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AZURE_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Embedding API error:', error)
    throw new Error(`Embedding request failed: ${response.status}`)
  }

  const result = await response.json()
  return result.data?.[0]?.embedding || []
}

/**
 * 查找相似的现有记忆
 */
async function findSimilarMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  embedding: number[],
  tag: string
): Promise<ExistingMemory[]> {
  // 使用数据库函数进行向量相似度搜索
  const { data, error } = await supabase.rpc('search_similar_memories', {
    p_user_id: userId,
    p_embedding: JSON.stringify(embedding),
    p_tag: tag,
    p_threshold: SIMILARITY_THRESHOLD,
    p_limit: 5,
  })

  if (error) {
    console.error('Similar memory search error:', error)
    // 如果函数不存在（迁移未运行），返回空数组
    return []
  }

  return data || []
}

/**
 * 使用 LLM 合并多条相似记忆
 */
async function mergeMemoriesWithAI(
  memories: Array<{ content: string; confidence: number }>
): Promise<{ content: string; confidence: number }> {
  if (!AZURE_API_KEY) {
    throw new Error('AZURE_AI_API_KEY environment variable not set')
  }

  const memoriesText = memories
    .map((m, i) => `${i + 1}. "${m.content}"`)
    .join('\n')

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
        { role: 'system', content: MERGE_PROMPT },
        { role: 'user', content: `Merge these memories:\n${memoriesText}` }
      ],
      max_completion_tokens: 500,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Merge API error:', error)
    throw new Error(`Merge request failed: ${response.status}`)
  }

  const result = await response.json()
  const content = result.choices?.[0]?.message?.content

  try {
    const parsed = JSON.parse(content)
    return {
      content: parsed.content,
      confidence: Math.max(...memories.map(m => m.confidence), parsed.confidence || 0.8),
    }
  } catch (e) {
    console.error('Failed to parse merge response:', content, e)
    // 回退：保留置信度最高的那条
    const best = memories.reduce((a, b) => a.confidence > b.confidence ? a : b)
    return best
  }
}

/**
 * 调用 Azure AI 提取记忆
 */
async function extractMemoriesWithAI(
  messages: Array<{ role: string; content: string }>,
  taskDescription?: string
): Promise<ExtractedMemory[]> {
  if (!AZURE_API_KEY) {
    throw new Error('AZURE_AI_API_KEY environment variable not set')
  }

  // 过滤掉空消息或无效消息
  const validMessages = messages.filter(m => m && m.content && typeof m.content === 'string' && m.content.trim())

  console.log(`Received ${messages.length} messages, ${validMessages.length} valid`)

  if (validMessages.length === 0) {
    console.log('No valid messages to process')
    return []
  }

  // 合并连续的同角色消息（因为流式输出会把一句话分成多条消息）
  const mergedMessages: Array<{ role: string; content: string }> = []
  for (const msg of validMessages) {
    const lastMsg = mergedMessages[mergedMessages.length - 1]
    if (lastMsg && lastMsg.role === msg.role) {
      // 合并到上一条消息
      lastMsg.content += msg.content
    } else {
      // 新角色，创建新消息
      mergedMessages.push({ role: msg.role, content: msg.content })
    }
  }

  console.log(`Merged to ${mergedMessages.length} messages`)

  // 构建用户消息，包含对话内容
  const conversationText = mergedMessages
    .map(m => `${m.role?.toUpperCase() || 'UNKNOWN'}: ${m.content}`)
    .join('\n')

  console.log(`Conversation text length: ${conversationText.length} chars`)

  const userPrompt = taskDescription
    ? `Task context: "${taskDescription}"\n\nConversation:\n${conversationText}`
    : `Conversation:\n${conversationText}`

  // 调用 Azure AI Foundry - 使用 OpenAI 兼容的 REST API
  // URL: {endpoint}/openai/v1/chat/completions
  // 认证: Authorization: Bearer {api_key}
  const apiUrl = `${AZURE_ENDPOINT}/openai/v1/chat/completions`

  console.log(`Calling Azure AI: ${apiUrl} with model: ${MODEL_NAME}`)

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AZURE_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,  // 需要在 body 中指定 model
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 1000,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Azure AI error:', error)
    throw new Error(`Azure AI request failed: ${response.status} ${error}`)
  }

  const result = await response.json()
  const content = result.choices?.[0]?.message?.content

  if (!content) {
    console.log('No content in AI response')
    return []
  }

  try {
    const parsed = JSON.parse(content)
    // 处理可能的不同格式
    const memories = Array.isArray(parsed) ? parsed : (parsed.memories || parsed.results || [])
    return memories.filter((m: ExtractedMemory) => m.content && m.tag && m.confidence >= 0.5)
  } catch (e) {
    console.error('Failed to parse AI response:', content, e)
    return []
  }
}

/**
 * 保存或合并记忆到 Supabase（含 Update Phase 逻辑）
 *
 * 流程：
 * 1. 为每条新记忆生成 embedding
 * 2. 查找相似的现有记忆
 * 3. 如果找到相似记忆 → 合并并更新
 * 4. 如果没有相似记忆 → 创建新记忆
 */
async function saveOrMergeMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  memories: ExtractedMemory[],
  taskDescription?: string,
  metadata?: Record<string, unknown>
): Promise<{ saved: number; merged: number; results: SaveResult[] }> {
  if (memories.length === 0) {
    return { saved: 0, merged: 0, results: [] }
  }

  const results: SaveResult[] = []
  let savedCount = 0
  let mergedCount = 0

  for (const memory of memories) {
    try {
      // ============================================================
      // SUCCESS 类型特殊处理：不合并，每次都创建新记录
      // ============================================================
      if (memory.tag === 'SUCCESS') {
        console.log(`Processing SUCCESS memory for task: ${taskDescription}`)

        // 推断任务类型
        const taskType = inferTaskType(taskDescription || '')

        // 计算当前连胜（在新记录之前）
        let currentStreak = 0
        try {
          const { data: streakData } = await supabase.rpc('calculate_user_streak', {
            p_user_id: userId,
            p_task_type: taskType
          })
          currentStreak = streakData || 0
        } catch (e) {
          console.warn('Failed to calculate streak, defaulting to 0:', e)
        }

        // 从请求的 metadata 中获取实际时长
        const actualDuration = (metadata as Record<string, unknown>)?.actual_duration_minutes as number | undefined

        // 构建 SUCCESS 记忆的完整 metadata
        const successMetadata = {
          // 基础元数据
          task_type: taskType,
          completion_date: new Date().toISOString().split('T')[0],
          streak_count: currentStreak + 1, // 新的连胜数
          // AI 提取的元数据
          duration_minutes: memory.metadata?.duration_minutes || actualDuration || null,
          overcame_resistance: memory.metadata?.overcame_resistance || false,
          // 请求带来的其他元数据
          source: (metadata as Record<string, unknown>)?.source || 'ai_coach_session',
          extractedAt: new Date().toISOString(),
        }

        console.log(`SUCCESS metadata:`, successMetadata)

        // 生成 embedding（可选，SUCCESS 不需要去重但可用于语义检索）
        let embedding: number[] = []
        try {
          embedding = await generateEmbedding(memory.content)
        } catch (e) {
          console.warn('Failed to generate embedding for SUCCESS memory:', e)
        }

        // 直接插入，不做合并
        const insertData: Record<string, unknown> = {
          user_id: userId,
          content: memory.content,
          tag: 'SUCCESS',
          confidence: memory.confidence,
          task_name: taskDescription || null,
          metadata: successMetadata,
        }
        if (embedding.length > 0) {
          insertData.embedding = JSON.stringify(embedding)
        }

        const { data, error } = await supabase
          .from('user_memories')
          .insert(insertData)
          .select()
          .single()

        if (error) {
          console.error('Failed to save SUCCESS memory:', error)
          continue
        }

        console.log(`✅ SUCCESS memory saved! Streak: ${successMetadata.streak_count}`)
        results.push({ action: 'created', memoryId: data.id, content: memory.content })
        savedCount++
        continue
      }

      // ============================================================
      // 其他类型：正常的去重合并逻辑
      // ============================================================

      // 1. 生成 embedding
      console.log(`Generating embedding for: ${memory.content.substring(0, 50)}...`)
      const embedding = await generateEmbedding(memory.content)

      if (embedding.length === 0) {
        console.warn('Failed to generate embedding, saving without dedup')
        // 回退到简单插入
        const { data } = await supabase
          .from('user_memories')
          .insert({
            user_id: userId,
            content: memory.content,
            tag: memory.tag,
            confidence: memory.confidence,
            task_name: taskDescription || null,
            metadata: metadata || {},
          })
          .select()
          .single()

        if (data) {
          results.push({ action: 'created', memoryId: data.id, content: memory.content })
          savedCount++
        }
        continue
      }

      // 2. 查找相似记忆
      const similarMemories = await findSimilarMemories(supabase, userId, embedding, memory.tag)
      console.log(`Found ${similarMemories.length} similar memories for tag ${memory.tag}`)

      if (similarMemories.length > 0) {
        // 3. 有相似记忆 → 合并
        const allMemories = [
          { content: memory.content, confidence: memory.confidence },
          ...similarMemories.map(m => ({ content: m.content, confidence: m.confidence }))
        ]

        console.log(`Merging ${allMemories.length} memories...`)
        const merged = await mergeMemoriesWithAI(allMemories)

        // 生成合并后内容的新 embedding
        const mergedEmbedding = await generateEmbedding(merged.content)

        // 更新最相似的那条记忆（保留其 ID）
        const targetMemory = similarMemories[0]
        const mergedFromIds = similarMemories.map(m => m.id)

        const { data, error } = await supabase
          .from('user_memories')
          .update({
            content: merged.content,
            confidence: merged.confidence,
            embedding: JSON.stringify(mergedEmbedding),
            task_name: taskDescription || null,
            merged_from: mergedFromIds,
            metadata: {
              ...metadata,
              lastMergedAt: new Date().toISOString(),
              mergeCount: (similarMemories.length + 1),
            },
          })
          .eq('id', targetMemory.id)
          .select()
          .single()

        if (error) {
          console.error('Failed to update merged memory:', error)
          continue
        }

        // 删除其他被合并的记忆（除了目标记忆）
        if (similarMemories.length > 1) {
          const idsToDelete = similarMemories.slice(1).map(m => m.id)
          await supabase
            .from('user_memories')
            .delete()
            .in('id', idsToDelete)
          console.log(`Deleted ${idsToDelete.length} merged source memories`)
        }

        results.push({
          action: 'merged',
          memoryId: targetMemory.id,
          content: merged.content,
          mergedFrom: mergedFromIds,
        })
        mergedCount++

      } else {
        // 4. 没有相似记忆 → 创建新记忆
        const { data, error } = await supabase
          .from('user_memories')
          .insert({
            user_id: userId,
            content: memory.content,
            tag: memory.tag,
            confidence: memory.confidence,
            embedding: JSON.stringify(embedding),
            task_name: taskDescription || null,
            metadata: metadata || {},
          })
          .select()
          .single()

        if (error) {
          console.error('Failed to save new memory:', error)
          continue
        }

        results.push({ action: 'created', memoryId: data.id, content: memory.content })
        savedCount++
      }

    } catch (err) {
      console.error(`Error processing memory: ${memory.content.substring(0, 50)}...`, err)
    }
  }

  return { saved: savedCount, merged: mergedCount, results }
}

/**
 * 搜索相关记忆
 */
async function searchMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  query: string,
  limit = 10
) {
  // 简单的文本搜索，后续可以改成向量搜索
  const { data, error } = await supabase
    .from('user_memories')
    .select('*')
    .eq('user_id', userId)
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to search memories: ${error.message}`)
  }

  return data || []
}

/**
 * 获取用户所有记忆
 */
async function getMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  limit = 50
) {
  const { data, error } = await supabase
    .from('user_memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to get memories: ${error.message}`)
  }

  return data || []
}

/**
 * 删除记忆
 */
async function deleteMemory(
  supabase: ReturnType<typeof createClient>,
  memoryId: string
) {
  const { error } = await supabase
    .from('user_memories')
    .delete()
    .eq('id', memoryId)

  if (error) {
    throw new Error(`Failed to delete memory: ${error.message}`)
  }

  return { success: true, memoryId }
}

/**
 * 整合现有记忆（清理重复）
 * 对用户的每个标签类别，找出相似记忆并合并
 */
async function consolidateMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  targetTag?: string
): Promise<{ processed: number; merged: number; deleted: number }> {
  const tags = targetTag ? [targetTag] : ['PREF', 'PROC', 'SOMA', 'EMO', 'SAB']

  let totalProcessed = 0
  let totalMerged = 0
  let totalDeleted = 0

  // 文本相似度阈值（比 embedding 阈值低一些，因为准确性较低）
  const TEXT_SIMILARITY_THRESHOLD = 0.4

  for (const tag of tags) {
    // 获取该标签的所有记忆
    console.log(`Querying memories for user ${userId}, tag ${tag}...`)

    const { data: memories, error } = await supabase
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .eq('tag', tag)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(`Query error for tag ${tag}:`, error)
      continue
    }

    if (!memories || memories.length === 0) {
      console.log(`No memories found for tag ${tag}`)
      continue
    }

    if (memories.length < 2) {
      console.log(`Only ${memories.length} memory for tag ${tag}, skipping (need at least 2 to consolidate)`)
      totalProcessed += memories.length
      continue
    }

    console.log(`Processing ${memories.length} memories for tag ${tag}`)
    totalProcessed += memories.length

    // 尝试为没有 embedding 的记忆生成 embedding（但失败不阻塞流程）
    let embeddingAvailable = false
    for (const memory of memories) {
      if (!memory.embedding) {
        try {
          const embedding = await generateEmbedding(memory.content)
          if (embedding && embedding.length > 0) {
            await supabase
              .from('user_memories')
              .update({ embedding: JSON.stringify(embedding) })
              .eq('id', memory.id)
            memory.embedding = embedding
            embeddingAvailable = true
          }
        } catch (err) {
          console.warn(`Embedding generation failed for ${memory.id}, will use text similarity:`, err)
        }
      } else {
        embeddingAvailable = true
      }
    }

    console.log(`Embedding available: ${embeddingAvailable}, using ${embeddingAvailable ? 'vector' : 'text'} similarity`)

    // 找出相似组（使用简单的贪心聚类）
    const processed = new Set<string>()
    const groups: typeof memories[] = []

    for (const memory of memories) {
      if (processed.has(memory.id)) continue

      const group = [memory]
      processed.add(memory.id)

      // 找出与当前记忆相似的其他记忆
      for (const other of memories) {
        if (processed.has(other.id)) continue

        let similarity = 0

        // 优先使用 embedding 相似度
        if (memory.embedding && other.embedding) {
          try {
            similarity = cosineSimilarity(
              typeof memory.embedding === 'string' ? JSON.parse(memory.embedding) : memory.embedding,
              typeof other.embedding === 'string' ? JSON.parse(other.embedding) : other.embedding
            )
            if (similarity >= SIMILARITY_THRESHOLD) {
              group.push(other)
              processed.add(other.id)
              console.log(`  Embedding match: "${memory.content.substring(0, 30)}..." ~ "${other.content.substring(0, 30)}..." (${(similarity * 100).toFixed(1)}%)`)
            }
          } catch (err) {
            console.warn('Failed to parse embeddings, falling back to text similarity')
            similarity = textSimilarity(memory.content, other.content)
            if (similarity >= TEXT_SIMILARITY_THRESHOLD) {
              group.push(other)
              processed.add(other.id)
              console.log(`  Text match: "${memory.content.substring(0, 30)}..." ~ "${other.content.substring(0, 30)}..." (${(similarity * 100).toFixed(1)}%)`)
            }
          }
        } else {
          // 回退到文本相似度
          similarity = textSimilarity(memory.content, other.content)
          if (similarity >= TEXT_SIMILARITY_THRESHOLD) {
            group.push(other)
            processed.add(other.id)
            console.log(`  Text match: "${memory.content.substring(0, 30)}..." ~ "${other.content.substring(0, 30)}..." (${(similarity * 100).toFixed(1)}%)`)
          }
        }
      }

      if (group.length > 1) {
        groups.push(group)
      }
    }

    console.log(`Found ${groups.length} groups of similar memories for tag ${tag}`)

    // 合并每个相似组
    for (const group of groups) {
      try {
        // 用 LLM 合并
        const merged = await mergeMemoriesWithAI(
          group.map(m => ({ content: m.content, confidence: m.confidence }))
        )

        // 尝试生成新的 embedding（可选，失败不阻塞）
        let mergedEmbedding: number[] | null = null
        try {
          mergedEmbedding = await generateEmbedding(merged.content)
          if (!mergedEmbedding || mergedEmbedding.length === 0) {
            mergedEmbedding = null
          }
        } catch (embeddingErr) {
          console.warn('Failed to generate embedding for merged content, proceeding without:', embeddingErr)
        }

        // 更新第一条记忆
        const targetId = group[0].id
        const mergedFromIds = group.map(m => m.id)

        // 构建更新对象（embedding 可选）
        const updateData: Record<string, unknown> = {
          content: merged.content,
          confidence: merged.confidence,
          merged_from: mergedFromIds,
          metadata: {
            consolidatedAt: new Date().toISOString(),
            mergeCount: group.length,
          },
        }
        if (mergedEmbedding) {
          updateData.embedding = JSON.stringify(mergedEmbedding)
        }

        await supabase
          .from('user_memories')
          .update(updateData)
          .eq('id', targetId)

        // 删除其他记忆
        const idsToDelete = group.slice(1).map(m => m.id)
        if (idsToDelete.length > 0) {
          await supabase
            .from('user_memories')
            .delete()
            .in('id', idsToDelete)

          totalDeleted += idsToDelete.length
        }

        totalMerged++
        console.log(`Merged ${group.length} memories into one (tag: ${tag})`)

      } catch (err) {
        console.error(`Failed to merge group:`, err)
      }
    }
  }

  return { processed: totalProcessed, merged: totalMerged, deleted: totalDeleted }
}

/**
 * 计算两个向量的余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 计算文本相似度 (Jaccard + 关键词重叠)
 * 用于在没有 embedding 时作为回退方案
 */
function textSimilarity(text1: string, text2: string): number {
  // 简单分词
  const tokenize = (text: string) => {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  }

  const tokens1 = new Set(tokenize(text1))
  const tokens2 = new Set(tokenize(text2))

  // Jaccard 相似度
  const intersection = [...tokens1].filter(t => tokens2.has(t)).length
  const union = new Set([...tokens1, ...tokens2]).size

  if (union === 0) return 0
  return intersection / union
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 初始化 Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body: MemoryRequest = await req.json()

    let result: unknown

    switch (body.action) {
      case 'extract': {
        const { userId, messages, taskDescription, metadata } = body as ExtractMemoryRequest
        if (!userId || !messages || messages.length === 0) {
          throw new Error('Missing required fields: userId, messages')
        }

        console.log(`Extracting memories for user: ${userId}, messages: ${messages.length}`)
        console.log(`Task completed: ${(metadata as Record<string, unknown>)?.task_completed}, duration: ${(metadata as Record<string, unknown>)?.actual_duration_minutes} min`)

        // 1. 用 AI 提取记忆
        const extractedMemories = await extractMemoriesWithAI(messages, taskDescription)
        console.log(`Extracted ${extractedMemories.length} memories`)

        // 2. 如果任务完成了，确保有一条 SUCCESS 记忆
        const taskCompleted = (metadata as Record<string, unknown>)?.task_completed === true
        const hasSuccessMemory = extractedMemories.some(m => m.tag === 'SUCCESS')

        if (taskCompleted && !hasSuccessMemory) {
          console.log('Task completed but no SUCCESS memory extracted, adding one automatically')
          const actualDuration = (metadata as Record<string, unknown>)?.actual_duration_minutes as number | undefined
          const taskType = inferTaskType(taskDescription || '')

          extractedMemories.push({
            content: `User successfully completed ${taskType} task: "${taskDescription}"${actualDuration ? ` (${actualDuration} minutes)` : ''}`,
            tag: 'SUCCESS',
            confidence: 0.95,
            metadata: {
              duration_minutes: actualDuration,
              overcame_resistance: false, // 默认，除非 AI 检测到
            }
          })
          console.log('Auto-added SUCCESS memory')
        }

        // 3. 保存或合并到 Supabase (Update Phase)
        if (extractedMemories.length > 0) {
          const saveResult = await saveOrMergeMemories(supabase, userId, extractedMemories, taskDescription, {
            ...metadata,
            taskDescription,
            extractedAt: new Date().toISOString(),
          })
          result = {
            extracted: extractedMemories.length,
            saved: saveResult.saved,
            merged: saveResult.merged,
            results: saveResult.results,
            memories: extractedMemories
          }
        } else {
          result = { extracted: 0, saved: 0, merged: 0, results: [], memories: [] }
        }
        break
      }

      case 'search': {
        const { userId, query, limit } = body as SearchMemoryRequest
        if (!userId || !query) {
          throw new Error('Missing required fields: userId, query')
        }
        console.log(`Searching memories for user: ${userId}, query: ${query}`)
        result = await searchMemories(supabase, userId, query, limit)
        break
      }

      case 'get': {
        const { userId, limit } = body as GetMemoriesRequest
        if (!userId) {
          throw new Error('Missing required field: userId')
        }
        console.log(`Getting memories for user: ${userId}`)
        result = await getMemories(supabase, userId, limit)
        break
      }

      case 'delete': {
        const { memoryId } = body as DeleteMemoryRequest
        if (!memoryId) {
          throw new Error('Missing required field: memoryId')
        }
        console.log(`Deleting memory: ${memoryId}`)
        result = await deleteMemory(supabase, memoryId)
        break
      }

      case 'consolidate': {
        const { userId, tag } = body as ConsolidateMemoryRequest
        if (!userId) {
          throw new Error('Missing required field: userId')
        }
        console.log(`=== CONSOLIDATE REQUEST ===`)
        console.log(`userId: ${userId}`)
        console.log(`userId type: ${typeof userId}`)
        console.log(`tag filter: ${tag || 'all'}`)

        // 先验证用户是否有记忆
        const { data: checkData, error: checkError } = await supabase
          .from('user_memories')
          .select('id, tag')
          .eq('user_id', userId)
          .limit(10)

        console.log(`Pre-check: found ${checkData?.length || 0} memories for this user`)
        if (checkError) {
          console.error('Pre-check error:', checkError)
        }
        if (checkData && checkData.length > 0) {
          console.log('Sample memories:', checkData.slice(0, 3))
        }

        result = await consolidateMemories(supabase, userId, tag)
        console.log(`Consolidate result:`, result)
        break
      }

      default:
        throw new Error(`Unknown action: ${(body as { action: string }).action}`)
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Memory extractor error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
