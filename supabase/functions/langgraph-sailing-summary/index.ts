import { handleCors, json, corsHeaders } from './http.ts'
import { requireAuth } from '../_shared/jwt-verification.ts'
import { generateSummaryWithLangGraph } from './service.ts'

export async function handleRequest(req: Request) {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    console.log('[langgraph-summary] request_received')

    // Check for service-to-service authentication (Supabase service role key or anon key)
    const authHeader = req.headers.get('authorization') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    const isServiceCall = authHeader === `Bearer ${serviceRoleKey}` ||
                          authHeader === `Bearer ${anonKey}`

    // For service-to-service calls, skip user JWT verification
    if (!isServiceCall) {
      // Verify user JWT token for direct user calls
      const authResult = await requireAuth(req)
      if (!authResult.valid) {
        console.warn('[langgraph-summary] auth_failed')
        return authResult.response!
      }
    } else {
      console.log('[langgraph-summary] service_to_service_call')
    }

    const body = await req.json()
    const { sessionId } = body

    if (!sessionId) {
      return json(400, {
        success: false,
        error: 'sessionId is required'
      })
    }

    console.log('[langgraph-summary] generating_summary', {
      sessionId: String(sessionId).slice(0, 8)
    })

    const result = await generateSummaryWithLangGraph(sessionId)

    console.log('[langgraph-summary] summary_generated')
    return json(200, result)

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[langgraph-summary] error', { message })
    return json(500, {
      success: false,
      error: message
    })
  }
}

const inTest = globalThis.Deno?.env.get('EDGE_TEST_MODE') === 'true'

if (!inTest && typeof (globalThis as any).Deno?.serve === 'function') {
  (globalThis as any).Deno.serve(async (req: Request) => {
    try {
      if (req.method === 'OPTIONS') {
        return new Response('ok', { status: 200, headers: corsHeaders })
      }
      if (req.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
      return await handleRequest(req)
    } catch (err) {
      console.error('[langgraph-summary] serve_error', {
        message: err instanceof Error ? err.message : String(err)
      })
      return json(500, {
        success: false,
        error: 'Internal server error'
      })
    }
  })
}
