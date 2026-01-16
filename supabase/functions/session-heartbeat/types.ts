// Shared types for session-heartbeat edge function

export interface HeartbeatRequestBody {
  sessionId: string
  cameraImage?: string
  screenImage?: string
}

export interface UpdateEventRequestBody {
  eventId: string
  drift_reason?: string | null
  actual_task?: string | null
}

export interface UpdateEventResponseBody {
  success: boolean
  event_id: string
}

export interface TaskListItem {
  id: string
  title: string
}

export interface SessionContext {
  sessionId: string
  userId: string
  userGoal: string
  taskName: string
  tasksList: ReadonlyArray<TaskListItem>
  wasPreviouslyDrifting: boolean
}

export interface AnalysisResult {
  is_drifting: boolean
  drift_reason?: string
  reasons?: string
  actual_task?: string
  actual_current_task?: string
}

export interface DriftEventInsert {
  session_id: string
  user_id: string
  is_drifting: boolean
  drift_reason: string | null
  actual_task: string | null
  intervention_triggered: boolean
}

export interface DriftEventUpdate {
  drift_reason?: string | null
  actual_task?: string | null
  is_drifting?: boolean
}

export interface EnvConfig {
  supabaseUrl: string
  supabaseServiceKey: string
  difyApiUrl: string
  difyApiKey: string
}

export interface DifyRunInputs {
  goal_text: string
  task_list: string
  user_video_image?: { transfer_method: 'local_file'; upload_file_id: string; type: 'image' }
  screenshot_image?: { transfer_method: 'local_file'; upload_file_id: string; type: 'image' }
  false_detect?: string
}

export interface DifyRunResponse {
  data?: { outputs?: unknown; [key: string]: unknown }
  outputs?: unknown
  [key: string]: unknown
}

export interface HeartbeatResponseBody {
  success: boolean
  is_drifting: boolean
  drift_reason: string | null
  actual_task: string | null
  short_drift_reason: string | null
  encouragement: string | null
  detected_task_id: string | null
  detected_task_title: string | null
  trigger_reason: string | null
  message: string
  event_id: string
}

export interface FalseDetectException {
  id: string
  user_id: string
  actual_task: string
  created_at: string
}

