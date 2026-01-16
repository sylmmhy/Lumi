import type { ConversationRecord, DriftEventRecord, SailingSummaryRequest, SessionContext, SessionMetrics, TaskListItem } from './types.ts'
import type { Repo } from './types.ts'

export async function collectSessionData(repo: Repo, sessionId: string): Promise<SessionContext> {
  const [driftEvents, sessionInfo] = await Promise.all([
    repo.fetchDriftEvents(sessionId),
    repo.fetchSessionInfo(sessionId)
  ])
  const joined = Array.isArray(sessionInfo?.sailing_session_tasks) ? sessionInfo?.sailing_session_tasks ?? [] : []
  const tasksList: TaskListItem[] = joined
    .map((row) => row?.tasks)
    .filter(Boolean)
    .map((t): TaskListItem => ({
      id: String(t?.id || ''),
      title: String(t?.title || ''),
      description: t?.description ? String(t.description) : undefined,
      priority: t?.priority ?? undefined,
      status: t?.status ?? undefined
    }))
  const tasksListJson = JSON.stringify(tasksList)
  let goalText = ''
  const userId = sessionInfo?.user_id
  if (userId) goalText = await repo.fetchUserGuidingStar(userId)
  return {
    goalText,
    heartbeat: buildHeartbeatLog(driftEvents),
    tasksListJson
  }
}

export function buildConversationTranscript(records: ConversationRecord[]): string {
  const messages = records
    .filter((record) => Array.isArray(record?.messages) && record.messages?.length)
    .flatMap((record) => record.messages ?? [])
  if (!messages.length) return 'No conversations recorded'
  return messages
    .map((message) => {
      const role = message?.role?.trim() || 'assistant'
      const text = message?.content || ''
      return `${role}: ${text}`
    })
    .join('\n')
}

export function buildHeartbeatLog(events: DriftEventRecord[]): string {
  if (!events.length) return 'No drift events recorded'
  return events
    .map((event) => {
      const status = event.is_drifting ? 'DRIFT' : 'FOCUS'
      const reason = event.drift_reason || 'No reason provided'
      const task = event.actual_task ? ` | Task: ${event.actual_task}` : ''
      const mood = event.user_mood ? ` | Mood: ${event.user_mood}` : ''
      return `${new Date(event.created_at).toISOString()}: ${status} - ${reason}${task}${mood}`
    })
    .join('\n')
}

export function extractSessionMetrics(sessionData: SailingSummaryRequest['sessionData']): SessionMetrics {
  return {
    sessionId: sessionData.sessionId,
    durationSeconds: Number((sessionData as any).durationSeconds) || 0,
    focusSeconds: Number((sessionData as any).focusSeconds) || 0,
    driftSeconds: Number((sessionData as any).driftSeconds) || 0,
    driftCount: Number((sessionData as any).driftCount) || 0
  }
}

export function formatMetricsForLogging(metrics: SessionMetrics): Record<string, unknown> {
  const durationHours = metrics.durationSeconds / 3600
  return {
    sessionId: metrics.sessionId,
    durationSeconds: metrics.durationSeconds,
    durationHours,
    focusSeconds: metrics.focusSeconds,
    driftSeconds: metrics.driftSeconds,
    driftMinutes: Math.floor(metrics.driftSeconds / 60),
    driftCount: metrics.driftCount
  }
}

export function computeDriftMinutes(metrics: SessionMetrics): number {
  return Math.floor(metrics.driftSeconds / 60)
}

export function computeDurationHours(metrics: SessionMetrics): number {
  return metrics.durationSeconds / 3600
}

