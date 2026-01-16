// Prompt Builder - Prepares user memory and query messages for DIFY
// Handles fetching session history and formatting prompts

import { createClient } from 'npm:@supabase/supabase-js@2'

export interface TaskSnapshot {
  id: string
  title: string
  description?: string
  priority?: number
  status?: string
}

/**
 * Fetches the last sailing session summary and tasks for a user
 * Returns summary text and tasks to use as user memory, or a default message if none exists
 */
export async function fetchLastSailingSummary(userId: string): Promise<string> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch the 10 most recent completed sailing sessions with summaries
    const { data, error } = await supabase
      .from('sailing_sessions')
      .select('summary, ended_at, total_focus_seconds, total_drift_seconds, drift_count, tasks_snapshot')
      .eq('user_id', userId)
      .eq('state', 'ended')
      .not('summary', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('[planning-chat] Error fetching last sailing summary:', error)
      return 'No previous session history available'
    }

    if (!data || data.length === 0) {
      console.log('[planning-chat] No previous sailing session with summary found')
      return 'No previous session history available'
    }

    // Build a combined summary from all sessions
    const sessionSummaries = data.map((session) => {
      const timestamp = new Date(session.ended_at).toLocaleString()
      const focusMinutes = Math.round((session.total_focus_seconds || 0) / 60)
      const driftMinutes = Math.round((session.total_drift_seconds || 0) / 60)

      // Extract tasks from snapshot (array of task objects)
      let tasksText = 'None'
      if (session.tasks_snapshot && Array.isArray(session.tasks_snapshot) && session.tasks_snapshot.length > 0) {
        const tasks = session.tasks_snapshot as TaskSnapshot[]
        tasksText = tasks
          .map((task) => {
            const title = task.title || 'Untitled task'
            const taskText = task.description ? `${title} (${task.description})` : title
            return `- ${taskText}`
          })
          .join('\n')
      }

      // Extract insights from summary
      let insightsText = 'No insights available'
      try {
        const summaryObj = typeof session.summary === 'string'
          ? JSON.parse(session.summary)
          : session.summary

        if (summaryObj?.insights && Array.isArray(summaryObj.insights)) {
          insightsText = summaryObj.insights
            .map((insight: { title?: string; message?: string }) =>
              `${insight.title || 'Insight'}: ${insight.message || ''}`
            )
            .join('; ')
        }
      } catch {
        // If parsing fails, use summary as-is
        insightsText = typeof session.summary === 'string'
          ? session.summary
          : JSON.stringify(session.summary)
      }

      return `## ${timestamp}

**Tasks**:
${tasksText}

**Finish Summary**:
${insightsText}

**Focus**:
${focusMinutes} minutes

**Drift**:
${driftMinutes} minutes

**Distractions**:
${session.drift_count || 0} events`
    }).join('\n\n')

    const memoryText = `Previous ${data.length} session(s):\n\n${sessionSummaries}`

    console.log('[planning-chat] Retrieved last', data.length, 'sailing summaries')
    return memoryText
  } catch (error) {
    console.error('[planning-chat] Exception fetching last sailing summary:', error)
    return 'No previous session history available'
  }
}

/**
 * Builds the formatted query message for the first call to DIFY
 * Includes user memory and todo task in a structured format
 */
export function buildFirstCallQuery(userMemory: string, todoTask: string): string {
  return `I'll give you a user memory and a todo task by following.

<user_memory>

${userMemory}

</user_memory>

<todo_task>

${todoTask}

</todo_task>

-----------

Please help me plan my day.`
}

