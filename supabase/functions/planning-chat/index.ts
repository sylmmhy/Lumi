// Planning Chat Function - Main HTTP handler
// Orchestrates prompt preparation and DIFY API calls for task planning

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../_shared/jwt-verification.ts'
import { fetchLastSailingSummary, buildFirstCallQuery } from './prompt-builder.ts'
import { callDifyChat, parseDifyResponse, type DifyChatRequest } from './dify-client.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, access_token, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PlanningChatRequest {
  todo_task?: string
  user_message?: string // For follow-up conversations
  conversation_id?: string // For follow-up conversations
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const startTime = Date.now()

    // Verify JWT token and get user ID
    const authResult = await requireAuth(req)
    if (!authResult.valid) {
      console.warn('[planning-chat] auth_failed')
      return authResult.response!
    }
    const authenticatedUserId = authResult.user_id!
    console.log('[planning-chat] auth_success', { userId: String(authenticatedUserId).slice(0, 8) })

    const requestBody: PlanningChatRequest = await req.json()
    const { todo_task, user_message, conversation_id } = requestBody

    console.log('[planning-chat] request_payload', {
      hasTodoTask: !!todo_task,
      hasUserMessage: !!user_message,
      hasConversationId: !!conversation_id,
      isFirstCall: !conversation_id
    })

    // Get DIFY configuration
    const difyApiUrl = Deno.env.get('DIFY_API_URL')
    const difyApiKey = Deno.env.get('FR28_DIFY_API_KEY')

    if (!difyApiUrl) {
      console.error('[planning-chat] Missing DIFY API URL')
      return new Response(
        JSON.stringify({ error: 'DIFY API URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!difyApiKey) {
      console.error('[planning-chat] Missing DIFY API key')
      return new Response(
        JSON.stringify({ error: 'DIFY API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine if this is a first call or follow-up call
    const isFirstCall = !conversation_id

    // Prepare query based on call type
    let query: string
    if (isFirstCall) {
      // First call: validate todo_task and build formatted query
      if (!todo_task) {
        return new Response(
          JSON.stringify({ error: 'todo_task is required for first call' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Fetch user memory and build formatted query
      const userMemory = await fetchLastSailingSummary(authenticatedUserId)
      console.log('[planning-chat] Fetched user_memory from DB:', userMemory.substring(0, 150) + '...')

      query = buildFirstCallQuery(userMemory, todo_task)
    } else {
      // Follow-up call: validate user_message
      if (!user_message) {
        return new Response(
          JSON.stringify({ error: 'user_message is required for follow-up calls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      query = user_message
    }

    // Prepare DIFY request payload
    const difyPayload: DifyChatRequest = {
      inputs: {},
      query: query,
      response_mode: 'blocking',
      conversation_id: conversation_id || '',
      user: authenticatedUserId,
      files: []
    }

    // Call DIFY API
    let difyResult
    try {
      difyResult = await callDifyChat(difyApiUrl, difyApiKey, difyPayload)
    } catch (error) {
      console.error('[planning-chat] dify_error', { error: (error as Error).message })
      return new Response(
        JSON.stringify({ error: 'DIFY API error', details: (error as Error).message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse DIFY response
    let answer: string
    try {
      answer = parseDifyResponse(difyResult)
    } catch (error) {
      console.error('[planning-chat] parse_error', { error: (error as Error).message })
      return new Response(
        JSON.stringify({ error: 'Failed to parse DIFY response', details: (error as Error).message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log success
    const latency = Date.now() - startTime
    console.log('[planning-chat] success', {
      userId: String(authenticatedUserId).slice(0, 8),
      conversationId: difyResult.conversation_id,
      latency: `${latency}ms`,
      answerLength: answer.length
    })

    // Return response - only include fields used by frontend
    return new Response(
      JSON.stringify({
        success: true,
        answer: answer,
        conversation_id: difyResult.conversation_id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('[planning-chat] error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
