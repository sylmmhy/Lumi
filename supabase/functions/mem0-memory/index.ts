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

async function addMemory(apiKey: string, userId: string, messages: Array<{ role: string; content: string }>, metadata?: Record<string, unknown>) {
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
        const { userId, messages, metadata } = body as AddMemoryRequest
        if (!userId || !messages || messages.length === 0) {
          throw new Error('Missing required fields: userId, messages')
        }
        console.log(`Adding memory for user: ${userId}`)
        result = await addMemory(mem0ApiKey, userId, messages, metadata)
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
