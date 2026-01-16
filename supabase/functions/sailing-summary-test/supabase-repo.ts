import { createClient } from 'npm:@supabase/supabase-js@2'
import type { ConversationRecord, DriftEventRecord, Repo, SessionInfoRecord, TaskSnapshot } from './types.ts'

export function createRepo(): Repo {
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  async function fetchConversations(sessionId: string): Promise<ConversationRecord[]> {
    const { data, error } = await client
      .from('ai_conversations')
      .select('messages')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('Failed to load conversations for session', sessionId, error)
      return []
    }
    return data ?? []
  }

  async function fetchDriftEvents(sessionId: string): Promise<DriftEventRecord[]> {
    const { data, error } = await client
      .from('drift_events')
      .select('created_at, is_drifting, drift_reason, actual_task, user_mood')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('Failed to load drift events for session', sessionId, error)
      return []
    }
    return (data as DriftEventRecord[]) ?? []
  }

  async function fetchSessionInfo(sessionId: string): Promise<SessionInfoRecord | null> {
    const { data, error } = await client
      .from('sailing_sessions')
      .select(`
      id,
      user_id,
      sailing_session_tasks (
        tasks (
          id,
          title,
          description,
          priority,
          status
        )
      )
    `)
      .eq('id', sessionId)
      .maybeSingle()
    if (error) {
      console.error('Failed to load session info for session', sessionId, error)
      return null
    }
    return (data as SessionInfoRecord) ?? null
  }

  async function fetchUserIdForSession(sessionId: string): Promise<string | null> {
    const { data, error } = await client
      .from('sailing_sessions')
      .select('users!inner(id)')
      .eq('id', sessionId)
      .single()
    if (error) {
      console.error('Failed to load user id for session', sessionId, error)
      return null
    }
    return (data as { users?: { id?: string } }).users?.id ?? null
  }

  async function fetchUserGuidingStar(userId: string): Promise<string> {
    const { data } = await client
      .from('users')
      .select('guiding_star')
      .eq('id', userId)
      .single()
    return ((data as { guiding_star?: string } | null)?.guiding_star) || ''
  }

  async function updateSessionSummary(sessionId: string, summary: string, tasksSnapshot?: TaskSnapshot[]): Promise<boolean> {
    const updateData: { summary: string; tasks_snapshot?: TaskSnapshot[] } = { summary }

    // Include tasks_snapshot if provided
    if (tasksSnapshot && tasksSnapshot.length > 0) {
      updateData.tasks_snapshot = tasksSnapshot
    }

    const { error } = await client
      .from('sailing_sessions')
      .update(updateData)
      .eq('id', sessionId)

    if (error) {
      console.error('Failed to update session summary for session', sessionId, error)
      return false
    }

    console.log('✅ Successfully saved summary to database for session:', sessionId)
    if (tasksSnapshot && tasksSnapshot.length > 0) {
      console.log('✅ Saved tasks snapshot with', tasksSnapshot.length, 'tasks')
    }
    return true
  }

  return { fetchConversations, fetchDriftEvents, fetchSessionInfo, fetchUserIdForSession, fetchUserGuidingStar, updateSessionSummary }
}

