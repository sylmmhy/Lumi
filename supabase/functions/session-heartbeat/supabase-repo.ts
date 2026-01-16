import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { DriftEventInsert, DriftEventUpdate, SessionContext, TaskListItem } from './types.ts'

export interface RepoDeps {
  supabaseUrl: string
  supabaseServiceKey: string
}

export interface Repo {
  getPreviousDrift(sessionId: string): Promise<boolean>
  getSessionContext(sessionId: string): Promise<SessionContext>
  insertDriftEvent(row: DriftEventInsert): Promise<string>
  updateDriftEvent(id: string, data: DriftEventUpdate): Promise<void>
  getDriftEventById(id: string): Promise<{ id: string; user_id: string; actual_task: string | null } | null>
  getSessionDriftStats(sessionId: string): Promise<{ drift_count: number; total_drift_seconds: number; idle_count: number }>
  updateSessionDriftStats(sessionId: string, data: Partial<{ drift_count: number; total_drift_seconds: number; idle_count: number }>): Promise<void>
  updateSessionState(sessionId: string, state: string): Promise<void>
  getTaskById(id: string): Promise<{ id: string; title: string; category: string | null } | null>
  getLastScreenshotFileId(sessionId: string): Promise<string | null>
  getFalseDetectedEvents(sessionId: string, limit?: number): Promise<Array<{ actual_task: string; drift_reason: string }>>
  getFalseDetectExceptions(userId: string): Promise<string[]>
  insertFalseDetectException(userId: string, actualTask: string): Promise<void>
}

export function createRepo(deps: RepoDeps): Repo {
  const client = createClient(deps.supabaseUrl, deps.supabaseServiceKey)
  console.log('[session-heartbeat] supabase_client_created')

  function toError(e: unknown): Error {
    if (e instanceof Error) return e
    const message = (e && typeof e === 'object' && 'message' in (e as any)) ? String((e as any).message) : String(e)
    const err = new Error(message)
    if (e && typeof e === 'object') Object.assign(err, e)
    return err
  }

  async function getPreviousDrift(sessionId: string): Promise<boolean> {
    const { data } = await client
      .from('drift_events')
      .select('is_drifting')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    console.log('[session-heartbeat] previous_drift_fetched', { hasPreviousDrift: Boolean((data as any)?.is_drifting) })
    return Boolean((data as any)?.is_drifting)
  }

  async function getSessionContext(sessionId: string): Promise<SessionContext> {
    const { data, error } = await client
      .from('sailing_sessions')
      .select(`
        id,
        user_id,
        state,
        users ( id, guiding_star ),
        sailing_session_tasks ( tasks ( id, title, description ) )
      `)
      .eq('id', sessionId)
      .single()
    if (error || !data) throw new Error(`Session not found: ${error?.message}`)
    const userGoal = (data as any)?.users?.guiding_star || 'No specific goal set'
    const joinedTasks = Array.isArray((data as any)?.sailing_session_tasks) ? (data as any).sailing_session_tasks : []
    const firstTask = joinedTasks.find((row: any) => row && row.tasks)?.tasks
    const taskName = firstTask?.title || 'No specific task'
    const tasksList: Array<TaskListItem> = joinedTasks
      .map((row: any) => row && row.tasks)
      .filter((t: any) => !!t)
      .map((t: any) => ({ id: t.id, title: t.title }))
    const wasPreviouslyDrifting = await getPreviousDrift(sessionId)
    return {
      sessionId,
      userId: (data as any).user_id,
      userGoal,
      taskName,
      tasksList,
      wasPreviouslyDrifting
    }
  }

  async function insertDriftEvent(row: DriftEventInsert): Promise<string> {
    const { data, error } = await client
      .from('drift_events')
      .insert(row)
      .select('id')
      .single()
    if (error) throw toError(error)
    return (data as any).id as string
  }

  async function updateDriftEvent(id: string, data: DriftEventUpdate): Promise<void> {
    const { error } = await client
      .from('drift_events')
      .update(data)
      .eq('id', id)
    if (error) throw toError(error)
  }

  async function getSessionDriftStats(sessionId: string): Promise<{ drift_count: number; total_drift_seconds: number; idle_count: number }> {
    const { data } = await client
      .from('sailing_sessions')
      .select('drift_count, total_drift_seconds, idle_count')
      .eq('id', sessionId)
      .single()
    return {
      drift_count: (data as any)?.drift_count || 0,
      total_drift_seconds: (data as any)?.total_drift_seconds || 0,
      idle_count: (data as any)?.idle_count || 0
    }
  }

  async function updateSessionDriftStats(sessionId: string, data: Partial<{ drift_count: number; total_drift_seconds: number; idle_count: number }>): Promise<void> {
    const { error } = await client
      .from('sailing_sessions')
      .update(data)
      .eq('id', sessionId)
    if (error) throw toError(error)
  }

  async function updateSessionState(sessionId: string, state: string): Promise<void> {
    await updateSessionDriftStats(sessionId, { } )
    const { error } = await client
      .from('sailing_sessions')
      .update({ state })
      .eq('id', sessionId)
    if (error) throw toError(error)
  }

  async function getTaskById(id: string): Promise<{ id: string; title: string; category: string | null } | null> {
    const { data, error } = await client
      .from('tasks')
      .select('id, title, category')
      .eq('id', id)
      .limit(1)
    if (error) return null
    const row = Array.isArray(data) ? (data[0] as any) : (data as any)
    if (!row) return null
    return row as any
  }

  async function getLastScreenshotFileId(sessionId: string): Promise<string | null> {
    const { data } = await client
      .from('drift_events')
      .select('screen_file_id, created_at')
      .eq('session_id', sessionId)
      .not('screen_file_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    const row = Array.isArray(data) ? (data[0] as any) : (data as any)
    return row?.screen_file_id ?? null
  }

  async function getFalseDetectedEvents(sessionId: string, limit = 10): Promise<Array<{ actual_task: string; drift_reason: string }>> {
    const { data } = await client
      .from('drift_events')
      .select('actual_task, drift_reason, created_at')
      .eq('session_id', sessionId)
      .eq('is_false_detection', true)
      .not('actual_task', 'is', null)
      .not('drift_reason', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    const rows = Array.isArray(data) ? (data as Array<any>) : ([] as any[])
    return rows
      .filter(r => typeof r.actual_task === 'string' && r.actual_task.length > 0 && typeof r.drift_reason === 'string' && r.drift_reason.length > 0)
      .map(r => ({ actual_task: r.actual_task as string, drift_reason: r.drift_reason as string }))
  }

  async function getDriftEventById(id: string): Promise<{ id: string; user_id: string; actual_task: string | null } | null> {
    const { data, error } = await client
      .from('drift_events')
      .select('id, user_id, actual_task')
      .eq('id', id)
      .single()
    if (error || !data) return null
    return data as any
  }

  async function getFalseDetectExceptions(userId: string): Promise<string[]> {
    const { data } = await client
      .from('false_detect_exceptions')
      .select('actual_task')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    const rows = Array.isArray(data) ? (data as Array<any>) : []
    return rows
      .filter(r => typeof r.actual_task === 'string' && r.actual_task.length > 0)
      .map(r => r.actual_task as string)
  }

  async function insertFalseDetectException(userId: string, actualTask: string): Promise<void> {
    if (!actualTask || actualTask.trim().length === 0) return
    const normalizedTask = actualTask.trim()
    const existing = await client
      .from('false_detect_exceptions')
      .select('id')
      .eq('user_id', userId)
      .eq('actual_task', normalizedTask)
      .single()
    if (existing.data) {
      console.log('[session-heartbeat] false_detect_exception_already_exists', { actualTask: normalizedTask })
      return
    }
    const { error } = await client
      .from('false_detect_exceptions')
      .insert({ user_id: userId, actual_task: normalizedTask })
    if (error) throw toError(error)
    console.log('[session-heartbeat] false_detect_exception_inserted', { actualTask: normalizedTask })
  }

  return { getPreviousDrift, getSessionContext, insertDriftEvent, updateDriftEvent, getDriftEventById, getSessionDriftStats, updateSessionDriftStats, updateSessionState, getTaskById, getLastScreenshotFileId, getFalseDetectedEvents, getFalseDetectExceptions, insertFalseDetectException }
}

