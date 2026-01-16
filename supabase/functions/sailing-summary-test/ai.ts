import { tryParseDirectJson, extractSummaryFromStream } from './parsers.ts'
import type { SessionContext, DifyWorkflowOutput } from './types.ts'

export async function requestDifySummary(context: SessionContext, userId: string): Promise<DifyWorkflowOutput | null> {
  const difyApiUrl = (globalThis as any)?.Deno?.env?.get('DIFY_API_URL')
  const difyApiKey = (globalThis as any)?.Deno?.env?.get('FR32_DIFY_API_KEY')

  if (!difyApiUrl || !difyApiKey) {
    console.warn('[DIFY] API not configured, skipping AI summary')
    return null
  }

  try {
    const workflowUrl = `${difyApiUrl}/v1/workflows/run`
    const requestPayload = {
      inputs: {
        heartbeat: context.heartbeat,
        task_list: context.tasksListJson,
        goal_text: context.goalText
      },
      response_mode: 'blocking' as const,
      user: userId
    }

    const difyResponse = await fetch(workflowUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${difyApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    })

    if (!difyResponse.ok) {
      const errorText = await difyResponse.text()
      console.error('[DIFY] Workflow failed with status', difyResponse.status, errorText)
      return null
    }

    const responseText = await difyResponse.text()

    // Prefer blocking-mode outputs JSON when present
    try {
      const asJson = JSON.parse(responseText)
      const outputs = asJson?.data?.outputs

      if (outputs && typeof outputs === 'object') {
        if (Array.isArray(outputs.timeline_summary)
            && typeof outputs.task_breakdown === 'string'
            && typeof outputs.encourage_words === 'string') {
          return outputs as DifyWorkflowOutput
        }
      }
    } catch (e) {
      console.error('[DIFY] JSON parsing failed:', e)
      // not JSON, proceed with parsers
    }

    // Try fallback parsers
    const directSummary = tryParseDirectJson(responseText)
    if (directSummary) return directSummary

    const streamingSummary = extractSummaryFromStream(responseText)
    if (streamingSummary) return streamingSummary

    console.error('[DIFY] Response did not contain a recognizable summary payload')
    return null
  } catch (error) {
    console.error('[DIFY] Workflow error:', error)
    return null
  }
}

