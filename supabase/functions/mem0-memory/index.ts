import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MEM0_API_URL = 'https://api.mem0.ai/v1'

/**
 * Mem0 Memory Edge Function
 *
 * Provides memory management capabilities for AI sessions:
 * - add: Save new memories from conversations
 * - search: Search relevant memories by query
 * - get: Retrieve all memories for a user
 * - delete: Remove specific memories
 */

interface AddMemoryRequest {
  action: 'add'
  userId: string
  messages: Array<{ role: string; content: string }>
  metadata?: Record<string, unknown>
  customPrompt?: string  // 自定义提取指令
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

type MemoryRequest = AddMemoryRequest | SearchMemoryRequest | GetMemoriesRequest | DeleteMemoryRequest

// 默认的记忆提取指令 - 专注于用户行为模式和 AI 交互偏好
const DEFAULT_CUSTOM_PROMPT = `You are an AI Coach behavioral pattern extractor. Your job is to identify PATTERNS and PREFERENCES, not facts.

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
✓ "User dislikes being rushed or pressured by AI"
✓ "User prefers gentle encouragement over strict commands"
✓ "User wants AI to be more direct and less chatty"
✗ "User talked to AI" (too vague)

**2. PROCRASTINATION TRIGGERS** [Tag: PROC]
WHY user avoids or delays specific tasks.
✓ "User avoids exercise because it feels overwhelming to start"
✓ "User procrastinates on reading due to fear of not understanding"
✗ "User hasn't started yet" (no reason given)

**3. PSYCHOSOMATIC PATTERNS** [Tag: SOMA]
Physical symptoms tied to specific activities (possible psychological resistance).
✓ "User reports recurring headaches specifically before workout - possible avoidance pattern"
✓ "User feels tired only when it's time to study"
✗ "User has headache" (no activity connection)

**4. EMOTIONAL TRIGGERS** [Tag: EMO]
Emotions consistently tied to specific tasks or situations.
✓ "User feels anxious when facing deadlines"
✓ "User gets frustrated when interrupted during focus time"
✗ "User is happy" (no context)

**5. SELF-SABOTAGE PATTERNS** [Tag: SAB]
Recurring behaviors that undermine user's goals.
✓ "User checks phone immediately before important tasks"
✓ "User makes excuses about time when avoiding exercise"
✗ "User used phone" (no pattern context)

## OUTPUT FORMAT
- Be specific: Include the TASK and the PATTERN
- Note frequency if mentioned: "always", "every time", "usually"
- Include psychological insight when clear

## EXAMPLES

Input: "Every time when about workout, I feel headache"
✓ CORRECT: "User experiences recurring headaches specifically when thinking about working out - likely psychological resistance to exercise"
✗ WRONG: "User has headache"

Input: "Don't rush me, I hate when you push me"
✓ CORRECT: "User strongly dislikes being rushed or pressured - prefers patient, non-pushy communication style"
✗ WRONG: "User talked to AI about rushing"

Input: "It's 4pm and I need to work out"
✓ CORRECT: (Extract nothing - just time and intention, no pattern)
✗ WRONG: "User wants to workout at 4pm"

Input: "I always feel tired when I need to study but fine otherwise"
✓ CORRECT: "User reports selective fatigue only when studying - possible psychological avoidance pattern"
✗ WRONG: "User feels tired"`

async function addMemory(
  apiKey: string,
  userId: string,
  messages: Array<{ role: string; content: string }>,
  metadata?: Record<string, unknown>,
  customPrompt?: string
) {
  const response = await fetch(`${MEM0_API_URL}/memories/`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: userId,
      messages,
      metadata,
      infer: true,
      custom_prompt: customPrompt || DEFAULT_CUSTOM_PROMPT,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Mem0 add memory failed: ${error}`)
  }

  return response.json()
}

async function searchMemories(apiKey: string, userId: string, query: string, limit = 10) {
  const response = await fetch(`${MEM0_API_URL}/memories/search/`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      user_id: userId,
      limit,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Mem0 search memories failed: ${error}`)
  }

  return response.json()
}

async function getMemories(apiKey: string, userId: string, limit = 50) {
  const response = await fetch(`${MEM0_API_URL}/memories/?user_id=${encodeURIComponent(userId)}&limit=${limit}`, {
    method: 'GET',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Mem0 get memories failed: ${error}`)
  }

  return response.json()
}

async function deleteMemory(apiKey: string, memoryId: string) {
  const response = await fetch(`${MEM0_API_URL}/memories/${memoryId}/`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Mem0 delete memory failed: ${error}`)
  }

  return { success: true, memoryId }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Mem0 API key from environment
    const mem0ApiKey = Deno.env.get('MEM0_API_KEY')
    if (!mem0ApiKey) {
      throw new Error('MEM0_API_KEY environment variable not set')
    }

    // Verify JWT (optional - can make it required)
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      })

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        console.warn('Auth warning:', authError.message)
      }
      if (user) {
        console.log('Authenticated user:', user.id)
      }
    }

    const body: MemoryRequest = await req.json()

    let result: unknown

    switch (body.action) {
      case 'add': {
        const { userId, messages, metadata, customPrompt } = body as AddMemoryRequest
        if (!userId || !messages || messages.length === 0) {
          throw new Error('Missing required fields: userId, messages')
        }
        console.log(`Adding memory for user: ${userId}`)
        result = await addMemory(mem0ApiKey, userId, messages, metadata, customPrompt)
        break
      }

      case 'search': {
        const { userId, query, limit } = body as SearchMemoryRequest
        if (!userId || !query) {
          throw new Error('Missing required fields: userId, query')
        }
        console.log(`Searching memories for user: ${userId}, query: ${query}`)
        result = await searchMemories(mem0ApiKey, userId, query, limit)
        break
      }

      case 'get': {
        const { userId, limit } = body as GetMemoriesRequest
        if (!userId) {
          throw new Error('Missing required field: userId')
        }
        console.log(`Getting memories for user: ${userId}`)
        result = await getMemories(mem0ApiKey, userId, limit)
        break
      }

      case 'delete': {
        const { memoryId } = body as DeleteMemoryRequest
        if (!memoryId) {
          throw new Error('Missing required field: memoryId')
        }
        console.log(`Deleting memory: ${memoryId}`)
        result = await deleteMemory(mem0ApiKey, memoryId)
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
    console.error('Mem0 memory error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
