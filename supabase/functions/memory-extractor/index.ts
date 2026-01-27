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

// Embedding 配置 - 可以使用独立的 endpoint 和 API key
// 如果未设置，则回退到主 Azure 配置
const EMBEDDING_ENDPOINT = Deno.env.get('AZURE_EMBEDDING_ENDPOINT') || AZURE_ENDPOINT
const EMBEDDING_API_KEY = Deno.env.get('AZURE_EMBEDDING_API_KEY') || AZURE_API_KEY
const EMBEDDING_MODEL = Deno.env.get('MEMORY_EMBEDDING_MODEL') || 'text-embedding-3-small'

// 记忆整合配置
const SIMILARITY_THRESHOLD = 0.85  // 相似度阈值，高于此值视为重复

/**
 * 计算记忆的初始重要性评分
 * 基于标签类型、置信度和内容特征
 *
 * 评分规则：
 * - PREF（偏好）: 基础 0.7，用户偏好通常很重要
 * - EFFECTIVE（有效激励）: 基础 0.8，成功的激励方式非常重要
 * - PROC/EMO/SAB: 基础 0.5，行为模式记忆
 * - SOMA: 基础 0.4，身心反应相对次要
 *
 * 调整因素：
 * - 置信度高于 0.8 → +0.1
 * - 内容包含具体细节（数字、名词）→ +0.1
 * - 内容较长（超过 100 字符）→ +0.05
 */
function calculateImportanceScore(memory: ExtractedMemory): number {
  // 基础分数（按标签类型）
  const baseScores: Record<string, number> = {
    'PREF': 0.7,       // AI 交互偏好
    'EFFECTIVE': 0.8,  // 有效激励方式（最重要）
    'PROC': 0.5,       // 拖延原因
    'EMO': 0.5,        // 情绪触发
    'SAB': 0.5,        // 自我妨碍
    'SOMA': 0.4,       // 身心反应
  }

  let score = baseScores[memory.tag] || 0.5

  // 置信度调整
  if (memory.confidence >= 0.8) {
    score += 0.1
  } else if (memory.confidence >= 0.7) {
    score += 0.05
  }

  // 内容具体性调整（包含数字或特定名词）
  const hasSpecificDetails = /\d+|specific|always|never|every time|每次|总是|从不/i.test(memory.content)
  if (hasSpecificDetails) {
    score += 0.1
  }

  // 内容长度调整
  if (memory.content.length > 100) {
    score += 0.05
  }

  // 确保在 0-1 范围内
  return Math.min(1, Math.max(0, score))
}

// 记忆提取的系统提示词
// 注意：SUCCESS 记录已从 tasks 表获取，不再在此提取
const EXTRACTION_PROMPT = `You are an AI Coach behavioral pattern extractor. Your job is to identify PATTERNS, PREFERENCES, and INSIGHTS from user conversations.

## EXTRACTION GUIDELINES

### DO NOT EXTRACT:
- Pure time/date mentions without context ("it's 4pm")
- Simple greetings or small talk ("hello", "hi")
- What AI said (only extract USER insights)

### EXTRACT THESE (Be generous - if in doubt, extract it):

**1. AI INTERACTION PREFERENCES** [Tag: PREF]
How user prefers to be communicated with.
Examples:
- "User dislikes being rushed or pressured"
- "User prefers gentle encouragement"
- "User wants shorter responses"

**2. PROCRASTINATION TRIGGERS** [Tag: PROC]
Reasons or excuses user gives for delaying tasks.
Examples:
- "User delays exercise because other work isn't done"
- "User feels they can't enjoy leisure until tasks are complete"
- "User says there's never enough time for reading"

**3. PSYCHOSOMATIC PATTERNS** [Tag: SOMA]
Physical feelings tied to activities.
Examples:
- "User feels tired when it's time to exercise"
- "User gets headaches before studying"

**4. EMOTIONAL TRIGGERS** [Tag: EMO]
Emotions or feelings about tasks/situations.
Examples:
- "User feels guilty about relaxing when work is unfinished"
- "User feels overwhelmed by too many tasks"
- "User feels anxious about not completing things"

**5. SELF-SABOTAGE PATTERNS** [Tag: SAB]
Behaviors that undermine user's goals.
Examples:
- "User checks phone before starting important tasks"
- "User makes excuses about time"
- "User keeps delaying things they want to do"

**6. TASK CONTEXT** [Tag: PROC]
Context about why user is doing or avoiding a task.
Examples:
- "User needs to finish other work before exercising"
- "User is procrastinating on gym, wants to shower first"

**7. EFFECTIVE ENCOURAGEMENT TECHNIQUES** [Tag: EFFECTIVE] ⭐ IMPORTANT FOR SUCCESSFUL SESSIONS
When task_completed=true, identify what AI said or did that helped user take action.
Look for:
- What AI said RIGHT BEFORE user decided to act
- Techniques that got positive response from user
- Phrases or approaches that broke through resistance

Examples:
- "Countdown technique worked - AI said 'let's count 3,2,1 and just start' and user responded positively"
- "Empathy before push - AI acknowledged user's tiredness first, then encouraged, user started the task"
- "Breaking task into tiny step worked - AI suggested 'just put on your shoes first' and user agreed"
- "Playful challenge effective - AI said 'bet you can't do 10 seconds' and user took the challenge"
- "Validation helped - AI said 'it's normal to feel resistance' and user felt understood then acted"

ONLY extract EFFECTIVE when:
- task_completed metadata is TRUE
- You can identify a specific AI technique that preceded user action
- User showed positive response or agreement before/after taking action

## OUTPUT FORMAT

Return a JSON array. Each memory:
- "content": The insight (be specific about WHAT and WHY)
- "tag": One of PREF, PROC, SOMA, EMO, SAB, EFFECTIVE
- "confidence": 0.3-1.0 (use lower values like 0.5-0.7 for single mentions, use 0.7+ for EFFECTIVE techniques that clearly worked)

**IMPORTANT: Be generous with extraction. Even single mentions can be valuable insights. If user expresses ANY emotion, reason for delay, or preference - extract it.**

Return empty array [] ONLY if conversation is purely greetings or completely meaningless.

## EXAMPLES

Input: User says "I can't enjoy leisure because my work isn't done"
Output:
[
  {
    "content": "User feels unable to enjoy leisure activities when work tasks are incomplete - guilt-driven work pattern",
    "tag": "EMO",
    "confidence": 0.7
  }
]

Input: User says "I'm procrastinating going to gym, need to shower first"
Output:
[
  {
    "content": "User delays going to gym by creating prerequisite tasks (showering first) - possible avoidance behavior",
    "tag": "PROC",
    "confidence": 0.6
  }
]

Input: User says "There's never enough time for reading"
Output:
[
  {
    "content": "User perceives lack of time for reading - may indicate low priority or avoidance pattern",
    "tag": "PROC",
    "confidence": 0.6
  }
]

Input: User just says "Hello, good morning"
Output:
[]`

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
  tag: 'PREF' | 'PROC' | 'SOMA' | 'EMO' | 'SAB' | 'EFFECTIVE'
  confidence: number
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
 * 使用 OpenAI SDK 兼容的 API 格式
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!EMBEDDING_API_KEY) {
    throw new Error('AZURE_EMBEDDING_API_KEY (or AZURE_AI_API_KEY) environment variable not set')
  }

  // OpenAI SDK 兼容格式
  // EMBEDDING_ENDPOINT 应该是完整的 base URL，如：https://xxx.azure.com/openai/v1/
  // 去掉末尾的斜杠（如果有），然后加上 /embeddings
  const baseUrl = EMBEDDING_ENDPOINT.replace(/\/+$/, '')
  const apiUrl = `${baseUrl}/embeddings`

  console.log(`Calling embedding API: ${apiUrl}`)

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EMBEDDING_API_KEY}`,  // OpenAI 兼容格式
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,  // "text-embedding-3-small"
      input: text,
      dimensions: 1536,  // 降维到 1536，兼容 HNSW 索引（最大 2000 维）
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Embedding API error:', response.status, error)
    throw new Error(`Embedding request failed: ${response.status} - ${error}`)
  }

  const result = await response.json()
  const embedding = result.data?.[0]?.embedding || []
  console.log(`Embedding generated successfully, dimensions: ${embedding.length}`)
  return embedding
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
 * @param messages 对话消息
 * @param taskDescription 任务描述
 * @param taskCompleted 任务是否成功完成（用于提取 EFFECTIVE 激励方式）
 */
async function extractMemoriesWithAI(
  messages: Array<{ role: string; content: string }>,
  taskDescription?: string,
  taskCompleted?: boolean
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

  // 构建用户提示，包含任务完成状态
  let userPrompt = ''
  if (taskDescription) {
    userPrompt += `Task context: "${taskDescription}"\n`
  }
  if (taskCompleted !== undefined) {
    userPrompt += `task_completed: ${taskCompleted}\n`
    if (taskCompleted) {
      userPrompt += `⭐ This was a SUCCESSFUL session - user completed the task! Look for EFFECTIVE encouragement techniques that helped.\n`
    }
  }
  userPrompt += `\nConversation:\n${conversationText}`

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
    return memories.filter((m: ExtractedMemory) => m.content && m.tag && m.confidence >= 0.3)
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
      // 1. 生成 embedding
      console.log(`Generating embedding for: ${memory.content.substring(0, 50)}...`)
      const embedding = await generateEmbedding(memory.content)

      // 计算初始重要性评分
      const importanceScore = calculateImportanceScore(memory)
      console.log(`📊 Importance score for "${memory.tag}": ${importanceScore.toFixed(2)}`)

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
            importance_score: importanceScore,
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

        // 合并后重要性提升（多次出现说明更重要）
        const mergedImportance = Math.min(1, importanceScore + 0.1 * (similarMemories.length - 1))

        const { data: _data, error } = await supabase
          .from('user_memories')
          .update({
            content: merged.content,
            confidence: merged.confidence,
            importance_score: mergedImportance,
            embedding: JSON.stringify(mergedEmbedding),
            task_name: taskDescription || null,
            merged_from: mergedFromIds,
            version: (targetMemory as unknown as { version?: number }).version ? (targetMemory as unknown as { version: number }).version + 1 : 2,
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
            importance_score: importanceScore,
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

      // Fallback：即使 embedding 失败，也尝试保存记忆（不做去重）
      try {
        console.log('Attempting fallback save without embedding...')
        const fallbackImportance = calculateImportanceScore(memory)
        const { data, error } = await supabase
          .from('user_memories')
          .insert({
            user_id: userId,
            content: memory.content,
            tag: memory.tag,
            confidence: memory.confidence,
            importance_score: fallbackImportance,
            task_name: taskDescription || null,
            metadata: {
              ...metadata,
              embeddingFailed: true,
              embeddingError: String(err),
            },
          })
          .select()
          .single()

        if (data) {
          console.log(`Fallback save successful: ${data.id}`)
          results.push({ action: 'created', memoryId: data.id, content: memory.content })
          savedCount++
        } else if (error) {
          console.error('Fallback save failed:', error)
        }
      } catch (fallbackErr) {
        console.error('Fallback save exception:', fallbackErr)
      }
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
  // 整合行为模式记忆，包括 EFFECTIVE（有效激励方式）
  const tags = targetTag ? [targetTag] : ['PREF', 'PROC', 'SOMA', 'EMO', 'SAB', 'EFFECTIVE']

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
          } catch {
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
        const taskCompleted = (metadata as Record<string, unknown>)?.task_completed === true
        console.log(`Task completed: ${taskCompleted}, duration: ${(metadata as Record<string, unknown>)?.actual_duration_minutes} min`)

        // 1. 用 AI 提取记忆（传入任务完成状态，用于提取 EFFECTIVE 激励方式）
        const extractedMemories = await extractMemoriesWithAI(messages, taskDescription, taskCompleted)
        console.log(`Extracted ${extractedMemories.length} memories (task_completed=${taskCompleted})`)

        // 注意：SUCCESS 记录不再在此处理，任务完成状态已在 tasks 表中跟踪

        // 2. 保存或合并到 Supabase (Update Phase)
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
