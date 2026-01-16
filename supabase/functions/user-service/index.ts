import { handleCors, json, corsHeaders } from './http.ts'
import { requireAuth } from '../_shared/jwt-verification.ts'
import {
  processListExceptions,
  processCreateException,
  processUpdateException,
  processDeleteException,
} from './service.ts'

export async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    console.log('[user-service] request_received', { method: req.method })

    // Verify JWT token and get user ID
    const authResult = await requireAuth(req)
    if (!authResult.valid) {
      console.warn('[user-service] auth_failed')
      return authResult.response!
    }
    const userId = authResult.user_id!
    console.log('[user-service] auth_success', { userId: String(userId).slice(0, 8) })

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // Handle list action (GET or POST without body)
    if (action === 'list-false-detections') {
      const result = await processListExceptions(userId)
      return json(200, result)
    }

    // POST requests that need a body
    if (req.method === 'POST') {
      // Parse body only for actions that need it
      let body = {}
      try {
        const text = await req.text()
        if (text && text.trim().length > 0) {
          body = JSON.parse(text)
        }
      } catch (err) {
        console.warn('[user-service] body_parse_warning', { error: err instanceof Error ? err.message : String(err) })
      }

      if (action === 'create-false-detection') {
        const result = await processCreateException(userId, body)
        return json(result.message ? 200 : 201, result)
      }

      if (action === 'update-false-detection') {
        const result = await processUpdateException(userId, body)
        return json(200, result)
      }

      if (action === 'delete-false-detection') {
        const result = await processDeleteException(userId, body)
        return json(200, result)
      }

      return json(400, { success: false, error: 'Invalid action for POST request' })
    }

    // GET requests (for direct browser access)
    if (req.method === 'GET') {
      return json(400, { success: false, error: 'Invalid action for GET request. Use POST with action parameter.' })
    }

    return json(405, { success: false, error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[user-service] error', { message, raw: error as unknown })

    const errorResponse = {
      success: false,
      error: message,
      message: message.includes('required') ? message : 'Failed to process request'
    }

    return json(500, errorResponse)
  }
}

const inTest = globalThis.Deno?.env.get('EDGE_TEST_MODE') === 'true'

if (!inTest && typeof (globalThis as any).Deno?.serve === 'function') {
  (globalThis as any).Deno.serve(async (req: Request) => {
    try {
      // Handle CORS preflight request first
      if (req.method === 'OPTIONS') {
        return new Response('ok', { status: 200, headers: corsHeaders })
      }

      // Handle the actual request
      return await handleRequest(req)
    } catch (err) {
      console.error('[user-service] serve_error', {
        message: err instanceof Error ? err.message : String(err)
      })
      return json(500, { success: false, error: 'internal', message: 'Internal server error' })
    }
  })
}
