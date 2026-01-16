import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { DriftEvent, SessionInfo } from './types.ts'

export interface Repo {
  fetchDriftEvents: (sessionId: string) => Promise<DriftEvent[]>
  fetchSessionInfo: (sessionId: string) => Promise<SessionInfo>
  fetchUserGoal: (userId: string) => Promise<string>
}

export function createRepo(): Repo {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(supabaseUrl, supabaseKey)

  async function fetchDriftEvents(sessionId: string): Promise<DriftEvent[]> {
    const { data, error } = await supabase
      .from('drift_events')
      .select('created_at, is_idle, is_drifting, actual_task, drift_reason, trigger_reason')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[repo] fetchDriftEvents error:', error)
      throw new Error(`Failed to fetch drift events: ${error.message}`)
    }

    return data || []
  }

  async function fetchSessionInfo(sessionId: string): Promise<SessionInfo> {
    const { data, error } = await supabase
      .from('sailing_sessions')
      .select('id, user_id, started_at, ended_at')
      .eq('id', sessionId)
      .single()

    if (error) {
      console.error('[repo] fetchSessionInfo error:', error)
      throw new Error(`Failed to fetch session info: ${error.message}`)
    }

    if (!data) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    return data
  }

  async function fetchUserGoal(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('users')
      .select('guiding_star')
      .eq('id', userId)
      .single()

    if (error) {
      console.warn('[repo] fetchUserGoal error:', error)
      return ''
    }

    return data?.guiding_star || ''
  }

  return {
    fetchDriftEvents,
    fetchSessionInfo,
    fetchUserGoal
  }
}
