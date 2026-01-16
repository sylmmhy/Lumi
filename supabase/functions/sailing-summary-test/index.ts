import { handleRequest, corsHeaders } from './http.ts'

const inTest = (globalThis as any)?.Deno?.env?.get('EDGE_TEST_MODE') === 'true'

if (!inTest && typeof (globalThis as any).Deno?.serve === 'function') {
  ;(globalThis as any).Deno.serve(async (req: Request) => {
    try {
      return await handleRequest(req)
    } catch (error) {
      console.error('=== ERROR IN SAILING SUMMARY ===')
      console.error('Error details:', error)
      return new Response(
        JSON.stringify({ error: 'Internal server error', message: (error as any)?.message ?? 'unknown', endpoint: 'sailing-summary' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  })
} else if (!inTest && typeof addEventListener === 'function') {
  addEventListener('fetch', (event: any) => {
    event.respondWith(handleRequest(event.request))
  })
}
