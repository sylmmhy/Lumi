// Types for sailing-summary-test edge function

export interface SailingSummaryRequest {
  sessionData: {
    sessionId?: string
    taskTitle?: string
    taskCategory?: string
    durationSeconds?: number
    focusSeconds?: number
    driftSeconds?: number
    driftCount?: number
  }
}

export interface SailingSummaryResponse {
  imageUrl: string
  summaryText: string
}

export interface TaskSnapshot {
  id: string
  title: string
  description?: string
  priority?: number
  status?: string
}

export interface TimelineEvent {
  time: string
  event: string
  category: string
}

export interface DifyWorkflowOutput {
  timeline_summary: TimelineEvent[]
  task_breakdown: string
  encourage_words: string
}

export interface ConversationRecord {
  messages?: Array<{
    role?: string
    content?: string
  }>
}

export interface DriftEventRecord {
  created_at: string
  is_drifting: boolean
  drift_reason?: string
  actual_task?: string
  user_mood?: string
}

export interface SessionInfoRecord {
  id: string
  user_id: string
  sailing_session_tasks?: Array<{
    tasks?: {
      id?: string
      title?: string
      description?: string
      priority?: number
      status?: string
    }
  }>
}

export interface TaskListItem {
  id: string
  title: string
  description?: string
  priority?: number
  status?: string
}

export interface SessionContext {
  goalText: string
  heartbeat: string
  tasksListJson: string
}

export interface SessionMetrics {
  sessionId?: string
  durationSeconds: number
  focusSeconds: number
  driftSeconds: number
  driftCount: number
}

export interface CategoryConfig {
  imageUrls: string[]
  summaryTemplates: string[]
}

export interface Repo {
  fetchConversations: (sessionId: string) => Promise<ConversationRecord[]>
  fetchDriftEvents: (sessionId: string) => Promise<DriftEventRecord[]>
  fetchSessionInfo: (sessionId: string) => Promise<SessionInfoRecord | null>
  fetchUserIdForSession: (sessionId: string) => Promise<string | null>
  fetchUserGuidingStar: (userId: string) => Promise<string>
  updateSessionSummary: (sessionId: string, summary: string, tasksSnapshot?: TaskSnapshot[]) => Promise<boolean>
}
