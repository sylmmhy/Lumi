export interface DriftEvent {
  created_at: string
  is_idle: boolean | null
  is_drifting: boolean | null
  actual_task: string | null
  drift_reason: string | null
  trigger_reason: string | null
}

export interface SessionInfo {
  id: string
  user_id: string
  started_at: string | null
  ended_at: string | null
  task_name?: string
}

export interface TimelineEvent {
  start_time: string
  end_time: string
  activity_description: string
}

export interface SummaryOutput {
  timeline_summary: TimelineEvent[]
  task_breakdown: string
  encourage_words: string
}

export interface LangGraphInput {
  driftEvents: DriftEvent[]
  userGoal: string
  sessionId: string
}
