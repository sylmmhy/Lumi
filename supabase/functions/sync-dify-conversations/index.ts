/*
# Sync Dify Conversations Edge Function

This Edge Function retrieves conversation history from Dify for a sailing session
and stores it in the `ai_conversations` table so that other flows (like
`sailing-summary`) can continue using the legacy data shape.

## Usage
- URL: https://[your-project].supabase.co/functions/v1/sync-dify-conversations
- Method: POST
- Body: { sessionId: string, conversationId?: string, conversationType?: string, userId?: string }
- Returns: { status: 'synced' | 'skipped', syncedMessages?: number, error?: string }
*/

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface SyncConversationRequest {
  sessionId: string
  conversationId?: string | null
  conversationType?: ConversationType | null
  userId?: string | null
  limit?: number
}

interface DifyMessageRecord {
  id?: string
  query?: string | null
  answer?: string | null
  status?: string | null
  created_at?: number | string | null
  inputs?: Record<string, unknown> | null
  outputs?: Record<string, unknown> | null
}

type ConversationType = 'seagull-chat' | 'seagull-drift'

function normalizeTimestamp(value: number | string | null | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Dify returns seconds since epoch
    const epochMs = value > 10_000_000_000 ? value : value * 1000
    return new Date(epochMs).toISOString()
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return normalizeTimestamp(numeric)
    }

    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString()
    }
  }

  return undefined
}

function buildDifyMessagesUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '')

  if (trimmed.endsWith('/v1/messages')) {
    return trimmed
  }

  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/messages`
  }

  if (trimmed.includes('/v1/')) {
    return `${trimmed}/messages`
  }

  return `${trimmed}/v1/messages`
}

function getConversationApiKey(type: ConversationType): string | null {
  if (type === 'seagull-chat') {
    return Deno.env.get('FR23_DIFY_API_KEY') || null
  } else if (type === 'seagull-drift') {
    return Deno.env.get('FR24_DIFY_API_KEY') || null
  }
  return null
}

function getAllConversationApiKeys(): Array<{ key: string; type: ConversationType }> {
  const keys: Array<{ key: string; type: ConversationType }> = []

  const fr23Key = Deno.env.get('FR23_DIFY_API_KEY')
  if (fr23Key) {
    keys.push({ key: fr23Key, type: 'seagull-chat' })
  }

  const fr24Key = Deno.env.get('FR24_DIFY_API_KEY')
  if (fr24Key) {
    keys.push({ key: fr24Key, type: 'seagull-drift' })
  }

  return keys
}

function extractUserMessage(record: DifyMessageRecord): string | undefined {
  if (typeof record.query === 'string' && record.query.trim()) {
    return record.query.trim()
  }

  const inputCandidates = [
    record.inputs?.query,
    record.inputs?.text,
    record.inputs?.input_text,
    record.inputs?.user_query,
  ]

  for (const candidate of inputCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return undefined
}

function extractAssistantMessage(record: DifyMessageRecord): string | undefined {
  if (typeof record.answer === 'string' && record.answer.trim()) {
    return record.answer.trim()
  }

  const outputCandidates = [
    record.outputs?.text,
    record.outputs?.answer,
  ]

  for (const candidate of outputCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return undefined
}

function convertDifyRecordsToMessages(records: DifyMessageRecord[]) {
  const sorted = [...records].sort((a, b) => {
    const aTime = normalizeTimestamp(a.created_at) ?? ''
    const bTime = normalizeTimestamp(b.created_at) ?? ''
    return aTime.localeCompare(bTime)
  })

  const messages: Array<Record<string, unknown>> = []

  for (const record of sorted) {
    const timestamp = normalizeTimestamp(record.created_at) ?? new Date().toISOString()
    const difyMessageId = typeof record.id === 'string' ? record.id : undefined

    const userMessage = extractUserMessage(record)
    if (userMessage) {
      messages.push({
        role: 'user',
        content: userMessage,
        timestamp,
        dify_message_id: difyMessageId,
      })
    }

    const assistantMessage = extractAssistantMessage(record)
    if (assistantMessage) {
      messages.push({
        role: 'assistant',
        content: assistantMessage,
        timestamp,
        dify_message_id: difyMessageId,
      })
    }
  }

  return messages
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      })
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    let payload: SyncConversationRequest
    try {
      payload = await req.json()
    } catch (error) {
      console.error('Failed to parse JSON payload:', error)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const { sessionId, conversationId: bodyConversationId, conversationType: bodyConversationType, userId: bodyUserId, limit } =
      payload

    if (!sessionId || typeof sessionId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'sessionId is required' }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const resolvedConversationId =
      typeof bodyConversationId === 'string' && bodyConversationId.trim().length > 0
        ? bodyConversationId.trim()
        : null

    const resolvedUserId =
      typeof bodyUserId === 'string' && bodyUserId.trim().length > 0
        ? bodyUserId.trim()
        : null

    if (!resolvedConversationId) {
      return new Response(
        JSON.stringify({
          status: 'skipped',
          reason: 'No conversationId available for this session',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!resolvedUserId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required to fetch Dify conversations' }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const difyApiUrl = Deno.env.get('DIFY_API_URL')
    if (!difyApiUrl) {
      console.warn('DIFY_API_URL is not configured; skipping conversation sync')
      return new Response(
        JSON.stringify({
          status: 'skipped',
          reason: 'DIFY_API_URL not configured',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const resolvedConversationType =
      typeof bodyConversationType === 'string' &&
      (bodyConversationType === 'seagull-chat' || bodyConversationType === 'seagull-drift')
        ? bodyConversationType as ConversationType
        : null

    let conversationApiKeys: Array<{ key: string; type: ConversationType }> = []

    if (resolvedConversationType) {
      // Use specific conversation type
      const apiKey = getConversationApiKey(resolvedConversationType)
      if (apiKey) {
        conversationApiKeys.push({ key: apiKey, type: resolvedConversationType })
      }
    } else {
      // Fall back to trying all conversation types
      conversationApiKeys = getAllConversationApiKeys()
    }
    if (conversationApiKeys.length === 0) {
      const message = resolvedConversationType
        ? `No Dify API key configured for conversation type: ${resolvedConversationType}`
        : 'No Dify conversation API keys configured'
      console.warn(message)
      return new Response(
        JSON.stringify({
          status: 'skipped',
          reason: message,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const messagesUrl = buildDifyMessagesUrl(difyApiUrl)
    const searchParams = new URLSearchParams({
      user: resolvedUserId,
      conversation_id: resolvedConversationId,
      limit: String(limit && Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 100),
    })

    const allDifyRecords: DifyMessageRecord[] = []
    const conversationTypes: ConversationType[] = []
    let lastError: unknown = null

    // Fetch conversations from specified conversation type(s)
    for (const { key: apiKey, type: conversationType } of conversationApiKeys) {
      try {
        console.log(`Attempting to fetch conversations with ${conversationType} API key`)
        const response = await fetch(`${messagesUrl}?${searchParams.toString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
        })

        if (!response.ok) {
          console.warn(`Dify conversation fetch failed for ${conversationType}:`, response.status, response.statusText)
          continue
        }

        const payload = await response.json()
        const records = Array.isArray(payload?.data) ? (payload.data as DifyMessageRecord[]) : []

        if (records.length > 0) {
          console.log(`Found ${records.length} messages for ${conversationType}`)
          allDifyRecords.push(...records)
          conversationTypes.push(conversationType)
        } else {
          console.warn(`No conversation records found for ${conversationType}`)
        }
      } catch (error) {
        console.error(`Failed to fetch ${conversationType} conversations from Dify:`, error)
        lastError = error
      }
    }

    if (allDifyRecords.length === 0) {
      if (lastError) {
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch conversation from Dify',
          }),
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      return new Response(
        JSON.stringify({
          status: 'skipped',
          reason: 'No conversation data returned from any Dify conversation types',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const messages = convertDifyRecordsToMessages(allDifyRecords)

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({
          status: 'skipped',
          reason: 'Conversation data did not include any textual content',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const { data: existingConversation, error: existingError } = await supabase
      .from('ai_conversations')
      .select('id, context')
      .eq('session_id', sessionId)
      .eq('context->>conversation_id', resolvedConversationId)
      .maybeSingle()

    if (existingError) {
      console.error('Failed to query existing ai_conversations record:', existingError)
    }

    const baseContext: Record<string, unknown> = {
      conversation_id: resolvedConversationId,
      conversation_types: conversationTypes, // Array of all conversation types found
      dify_user_id: resolvedUserId,
      dify_message_count: allDifyRecords.length,
      dify_synced_at: new Date().toISOString(),
      dify_source: 'sync-dify-conversations',
      dify_status: allDifyRecords[allDifyRecords.length - 1]?.status ?? null,
    }

    const mergedContext = {
      ...(existingConversation?.context ?? {}),
      ...baseContext,
    }

    if (existingConversation) {
      const { error: updateError } = await supabase
        .from('ai_conversations')
        .update({
          messages,
          context: mergedContext,
          user_id: resolvedUserId,
        })
        .eq('id', existingConversation.id)

      if (updateError) {
        console.error('Failed to update ai_conversations record:', updateError)
        return new Response(
          JSON.stringify({ error: 'Failed to update conversation record' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }
    } else {
      const { error: insertError } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: resolvedUserId,
          session_id: sessionId,
          messages,
          context: mergedContext,
        })

      if (insertError) {
        console.error('Failed to insert ai_conversations record:', insertError)
        return new Response(
          JSON.stringify({ error: 'Failed to store conversation record' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }
    }

    return new Response(
      JSON.stringify({
        status: 'synced',
        syncedMessages: messages.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('Unexpected error in sync-dify-conversations function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
