import { createRepo } from './supabase-repo.ts'
import { runLangGraphWorkflow } from './langgraph-agent.ts'
import type { DriftEvent, SummaryOutput } from './types.ts'

export async function generateSummaryWithLangGraph(sessionId: string): Promise<SummaryOutput> {
  console.log('[service] 🚀 Starting summary generation', { sessionId: String(sessionId).slice(0, 8) })

  try {
    // Step 1: Create repo
    console.log('[service] Step 1: Creating repository')
    const repo = createRepo()
    console.log('[service] ✅ Repository created')

    // Step 2: Fetch drift events
    console.log('[service] Step 2: Fetching drift events')
    let driftEvents: DriftEvent[]
    try {
      driftEvents = await repo.fetchDriftEvents(sessionId)
      console.log('[service] ✅ Drift events fetched', {
        count: driftEvents.length,
        sessionId: String(sessionId).slice(0, 8),
        firstEvent: driftEvents.length > 0 ? {
          created_at: driftEvents[0].created_at,
          has_actual_task: !!driftEvents[0].actual_task,
          is_idle: driftEvents[0].is_idle
        } : null
      })
    } catch (error) {
      console.error('[service] ❌ FAILED: Fetching drift events', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw new Error(`Failed to fetch drift events: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Step 3: Fetch session info
    console.log('[service] Step 3: Fetching session info')
    let sessionInfo: any
    try {
      sessionInfo = await repo.fetchSessionInfo(sessionId)
      console.log('[service] ✅ Session info fetched', {
        userId: String(sessionInfo.user_id).slice(0, 8),
        taskName: sessionInfo.task_name
      })
    } catch (error) {
      console.error('[service] ❌ FAILED: Fetching session info', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw new Error(`Failed to fetch session info: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Step 4: Fetch user goal
    console.log('[service] Step 4: Fetching user goal')
    let userGoal: string
    try {
      userGoal = await repo.fetchUserGoal(sessionInfo.user_id)
      console.log('[service] ✅ User goal fetched', {
        goalLength: userGoal.length,
        goalPreview: userGoal.substring(0, 50) + '...'
      })
    } catch (error) {
      console.error('[service] ❌ FAILED: Fetching user goal', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw new Error(`Failed to fetch user goal: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Step 5: Check if we have events
    if (driftEvents.length === 0) {
      console.warn('[service] ⚠️ No drift events found', { sessionId })
      return {
        timeline_summary: [],
        task_breakdown: 'No activity data available for this session',
        encourage_words: 'Start your next voyage to track your progress!'
      }
    }

    // Step 6: Run LangGraph workflow
    console.log('[service] Step 6: Running LangGraph workflow', {
      eventCount: driftEvents.length,
      userGoalLength: userGoal.length
    })
    let summary: SummaryOutput
    try {
      summary = await runLangGraphWorkflow({
        driftEvents,
        userGoal,
        sessionId
      })
      console.log('[service] ✅ LangGraph workflow complete', {
        hasTimeline: Array.isArray(summary.timeline_summary),
        timelineLength: summary.timeline_summary?.length || 0,
        hasTaskBreakdown: !!summary.task_breakdown,
        hasEncouragement: !!summary.encourage_words
      })
    } catch (error) {
      console.error('[service] ❌ FAILED: Running LangGraph workflow', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw new Error(`LangGraph workflow failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    console.log('[service] 🎉 Summary generation complete')
    return summary

  } catch (error) {
    console.error('[service] 💥 FATAL ERROR in generateSummaryWithLangGraph', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      sessionId
    })
    throw error
  }
}
