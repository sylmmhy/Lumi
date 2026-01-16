import { handleCors, json, corsHeaders } from './http.ts'
import { processHeartbeat, processUpdateEvent } from './service.ts'
import { requireAuth } from '../_shared/jwt-verification.ts'

export async function handleRequest(req: Request) {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    // Basic request log for debugging
    console.log('[session-heartbeat] request_received')

    // Verify JWT token and get user ID
    const authResult = await requireAuth(req)
    if (!authResult.valid) {
      console.warn('[session-heartbeat] auth_failed')
      return authResult.response!
    }
    const authenticatedUserId = authResult.user_id!
    console.log('[session-heartbeat] auth_success', { userId: String(authenticatedUserId).slice(0, 8) })

    // Overall timeout guard to prevent hangs
    const overallTimeoutMs = 40000
    const timeoutPromise = new Promise<Response>((resolve) => {
      setTimeout(() => {
        console.warn('[session-heartbeat] overall timeout reached')
        resolve(json(504, { success: false, error: 'timeout', message: 'Heartbeat processing timed out' }))
      }, overallTimeoutMs)
    })

    const url = new URL(req.url)
    const path = url.pathname

    const body = await req.json()

    if (path.endsWith('/update')) {
      const { eventId, is_false_detection, drift_reason, actual_task, short_drift_reason, encouragement, trigger_reason } = body || {}
      if (!eventId) return json(400, { success: false, error: 'bad_request', message: 'eventId is required' })
      const workPromise = (async () => {
        const result = await processUpdateEvent({ eventId, is_false_detection, drift_reason, actual_task, short_drift_reason, encouragement, trigger_reason })
        console.log('[session-heartbeat] update_response_ready', { eventId: String(eventId).slice(0, 8) })
        return json(200, result.response)
      })()
      const response = await Promise.race([workPromise, timeoutPromise])
      if ((response as any)?.status === 504) console.warn('[session-heartbeat] responded_timeout')
      return response
    }

    const { sessionId, cameraImage, screenImage } = body || {}
    console.log('[session-heartbeat] payload_summary', {
      hasCameraImage: Boolean(cameraImage),
      hasScreenImage: Boolean(screenImage),
      cameraImageKB: typeof cameraImage === 'string' ? Math.round(cameraImage.length / 1024) : 0,
      screenImageKB: typeof screenImage === 'string' ? Math.round(screenImage.length / 1024) : 0,
      sessionId: String(sessionId || '').slice(0, 8)
    })
    if (!sessionId) throw new Error('Session ID is required')

    const workPromise = (async () => {
      const result = await processHeartbeat({ sessionId, cameraImage, screenImage })
      console.log('[session-heartbeat] response_ready', { sessionId: String(sessionId).slice(0, 8), is_drifting: result.response.is_drifting })
      return json(200, result.response)
    })()

    // Race the work against the timeout
    const response = await Promise.race([workPromise, timeoutPromise])
    if ((response as any)?.status === 504) console.warn('[session-heartbeat] responded_timeout')
    return response
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : (() => {
              try { return JSON.stringify(error) } catch { return 'Unknown error' }
            })()
    console.error('[session-heartbeat] error', { message, raw: error as unknown })
    const errorResponse = { success: false, error: message, message: 'Failed to process heartbeat' }
    return json(500, errorResponse)
  }
}

const inTest = globalThis.Deno?.env.get('EDGE_TEST_MODE') === 'true'

if (!inTest && typeof (globalThis as any).Deno?.serve === 'function') {
  (globalThis as any).Deno.serve(async (req: Request) => {
    try {
      if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
      if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      return await handleRequest(req)
    } catch (err) {
      console.error('[session-heartbeat] serve_error', { message: err instanceof Error ? err.message : String(err) })
      return json(500, { success: false, error: 'internal', message: 'Internal server error' })
    }
  })
} else if (!inTest && typeof addEventListener === 'function') {
  addEventListener('fetch', (event: any) => {
    event.respondWith(handleRequest(event.request))
  })
}
