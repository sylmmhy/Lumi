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

// 记忆提取的系统提示词
const EXTRACTION_PROMPT = `You are an AI Coach behavioral pattern extractor. Your job is to identify PATTERNS and PREFERENCES from user conversations, not facts.

## STRICT RULES - MUST FOLLOW

### NEVER EXTRACT (Auto-reject these):
- Time/date mentions ("it's 4pm", "today", "morning")
- Basic intentions ("wants to workout", "going to read")
- Task completion status ("finished task", "started working")
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

## OUTPUT FORMAT

Return a JSON array of extracted memories. Each memory should have:
- "content": The memory text (be specific, include TASK and PATTERN)
- "tag": One of PREF, PROC, SOMA, EMO, SAB
- "confidence": 0.0-1.0 how confident you are this is a real pattern

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

Input conversation with user just saying "It's 4pm and I need to work out"

Output:
[]

## IMPORTANT
- Quality over quantity: Only extract MEANINGFUL patterns
- Be specific: Include the TASK and the PATTERN
- Note frequency if mentioned: "always", "every time", "usually"
- Include psychological insight when the pattern suggests it`

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

type MemoryRequest = ExtractMemoryRequest | SearchMemoryRequest | GetMemoriesRequest | DeleteMemoryRequest

interface ExtractedMemory {
  content: string
  tag: 'PREF' | 'PROC' | 'SOMA' | 'EMO' | 'SAB'
  confidence: number
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
 * 保存记忆到 Supabase
 */
async function saveMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  memories: ExtractedMemory[],
  taskDescription?: string,
  metadata?: Record<string, unknown>
) {
  if (memories.length === 0) {
    return { saved: 0 }
  }

  const records = memories.map(m => ({
    user_id: userId,
    content: m.content,
    tag: m.tag,
    confidence: m.confidence,
    task_name: taskDescription || null, // 新增：保存任务名称
    metadata: metadata || {},
    created_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('user_memories')
    .insert(records)
    .select()

  if (error) {
    throw new Error(`Failed to save memories: ${error.message}`)
  }

  return { saved: data?.length || 0, memories: data }
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

        // 1. 用 AI 提取记忆
        const extractedMemories = await extractMemoriesWithAI(messages, taskDescription)
        console.log(`Extracted ${extractedMemories.length} memories`)

        // 2. 保存到 Supabase
        if (extractedMemories.length > 0) {
          const saveResult = await saveMemories(supabase, userId, extractedMemories, taskDescription, {
            ...metadata,
            taskDescription,
            extractedAt: new Date().toISOString(),
          })
          result = {
            extracted: extractedMemories.length,
            saved: saveResult.saved,
            memories: extractedMemories
          }
        } else {
          result = { extracted: 0, saved: 0, memories: [] }
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
