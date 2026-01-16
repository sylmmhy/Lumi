import { generateSailingSummary } from './service.ts'
import type { SailingSummaryRequest } from './types.ts'
import { requireAuth } from '../_shared/jwt-verification.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, access_token, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

export async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  // Verify JWT token and get user ID
  const authResult = await requireAuth(req);
  if (!authResult.valid) {
    console.warn('[sailing-summary-test] auth_failed');
    return authResult.response!;
  }
  const authenticatedUserId = authResult.user_id!;
  console.log('[sailing-summary-test] auth_success', { userId: String(authenticatedUserId).slice(0, 8) });

  let body: SailingSummaryRequest
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON payload' })
  }
  const result = await generateSailingSummary(body)
  return json(200, result)
}

