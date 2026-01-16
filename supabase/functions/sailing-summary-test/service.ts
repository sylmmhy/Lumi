import { createRepo } from './supabase-repo.ts'
import { requestDifySummary } from './ai.ts'
import { chooseCategoryConfig, pickRandomImage, pickTemplate } from './category.ts'
import { collectSessionData, computeDriftMinutes, computeDurationHours, extractSessionMetrics, formatMetricsForLogging } from './utils.ts'
import type { SailingSummaryRequest, SailingSummaryResponse, TaskSnapshot, DifyWorkflowOutput } from './types.ts'

export async function generateSailingSummary(reqBody: SailingSummaryRequest): Promise<SailingSummaryResponse> {
  const { sessionData } = reqBody
  const metrics = extractSessionMetrics(sessionData)
  console.log('Session summary metrics:', formatMetricsForLogging(metrics))

  const categoryConfig = chooseCategoryConfig(sessionData.taskCategory)
  const selectedImageUrl = pickRandomImage(categoryConfig)

  const durationHours = computeDurationHours(metrics).toFixed(1)
  const driftMinutes = computeDriftMinutes(metrics)
  const safeTaskTitle = sessionData.taskTitle || 'your task'
  let summaryText = pickTemplate(categoryConfig)
    .replace('{duration}', durationHours)
    .replace('{task_title}', safeTaskTitle)
    .replace('{distraction_time}', String(driftMinutes))

  if (metrics.sessionId) {
    console.log('Generating LangGraph summary for session:', metrics.sessionId)
    try {
      const repo = createRepo()

      // Extract tasks snapshot from collected data
      const collectedData = await collectSessionData(repo, metrics.sessionId)
      const tasksSnapshot: TaskSnapshot[] = JSON.parse(collectedData.tasksListJson || '[]')

      // Call LangGraph summary service instead of Dify
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase credentials not configured')
      }

      const langgraphResponse = await fetch(`${supabaseUrl}/functions/v1/langgraph-sailing-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ sessionId: metrics.sessionId })
      })

      if (langgraphResponse.ok) {
        const aiSummary = await langgraphResponse.json()
        console.log('[LangGraph] Raw response:', JSON.stringify(aiSummary).substring(0, 300))

        // Format the LangGraph output into a readable summary
        summaryText = formatDifySummary(aiSummary)
        console.log('[LangGraph] ✅ Summary generated successfully (JSON format):', summaryText.substring(0, 200) + '...')
      } else {
        const errorText = await langgraphResponse.text()
        console.warn('[LangGraph] ❌ HTTP error:', langgraphResponse.status, errorText.substring(0, 200))
        console.warn('[LangGraph] Using fallback template due to HTTP error')
      }

      // Save summary and tasks snapshot
      await repo.updateSessionSummary(metrics.sessionId, summaryText, tasksSnapshot)
    } catch (err) {
      console.error('[LangGraph] ❌ Error during summary generation:', err)
      console.error('[LangGraph] Error details:', err instanceof Error ? err.message : String(err))
      console.warn('[LangGraph] Using fallback template due to error')
      // Save fallback summary even if AI generation failed
      await createRepo().updateSessionSummary(metrics.sessionId, summaryText)
    }
  } else {
    console.warn('No sessionId provided, using fallback summary')
  }

  return { imageUrl: selectedImageUrl, summaryText }
}

function formatDifySummary(output: DifyWorkflowOutput): string {
  // Ensure we have valid data before stringifying
  if (!output || typeof output !== 'object') {
    console.warn('[formatDifySummary] Invalid output received:', output)
    throw new Error('Invalid LangGraph output format')
  }

  // Validate required fields
  const hasValidTimeline = Array.isArray(output.timeline_summary) && output.timeline_summary.length > 0
  const hasTaskBreakdown = typeof output.task_breakdown === 'string' && output.task_breakdown.trim().length > 0
  const hasEncouragement = typeof output.encourage_words === 'string' && output.encourage_words.trim().length > 0

  if (!hasValidTimeline && !hasTaskBreakdown && !hasEncouragement) {
    console.warn('[formatDifySummary] No valid data in output:', output)
    throw new Error('LangGraph output contains no valid data')
  }

  console.log('[formatDifySummary] Formatting LangGraph output:', {
    timelineEvents: output.timeline_summary?.length || 0,
    hasTaskBreakdown,
    hasEncouragement
  })

  // Return JSON string for frontend parsing
  return JSON.stringify(output)
}

