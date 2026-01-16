import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { FalseDetectException } from './types.ts'

export interface RepoDeps {
  supabaseUrl: string
  supabaseServiceKey: string
}

export interface Repo {
  listExceptions(userId: string): Promise<FalseDetectException[]>
  createException(userId: string, actualTask: string): Promise<FalseDetectException>
  updateException(id: string, userId: string, actualTask: string): Promise<FalseDetectException | null>
  deleteException(id: string, userId: string): Promise<boolean>
}

export function createRepo(deps: RepoDeps): Repo {
  const client = createClient(deps.supabaseUrl, deps.supabaseServiceKey)
  console.log('[user-service] supabase_client_created')

  function toError(e: unknown): Error {
    if (e instanceof Error) return e
    const message = (e && typeof e === 'object' && 'message' in (e as any))
      ? String((e as any).message)
      : String(e)
    const err = new Error(message)
    if (e && typeof e === 'object') Object.assign(err, e)
    return err
  }

  async function listExceptions(userId: string): Promise<FalseDetectException[]> {
    const { data, error } = await client
      .from('false_detect_exceptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw toError(error)
    return (data || []) as FalseDetectException[]
  }

  async function createException(userId: string, actualTask: string): Promise<FalseDetectException> {
    const normalizedTask = actualTask.trim()

    // Check for duplicate
    const { data: existing } = await client
      .from('false_detect_exceptions')
      .select('*')
      .eq('user_id', userId)
      .eq('actual_task', normalizedTask)
      .single()

    if (existing) {
      console.log('[user-service] exception_already_exists', { actualTask: normalizedTask })
      return existing as FalseDetectException
    }

    // Insert new exception
    const { data, error } = await client
      .from('false_detect_exceptions')
      .insert({ user_id: userId, actual_task: normalizedTask })
      .select()
      .single()

    if (error) throw toError(error)
    console.log('[user-service] exception_created', { actualTask: normalizedTask })
    return data as FalseDetectException
  }

  async function updateException(
    id: string,
    userId: string,
    actualTask: string
  ): Promise<FalseDetectException | null> {
    const { data, error } = await client
      .from('false_detect_exceptions')
      .update({ actual_task: actualTask.trim() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw toError(error)
    if (!data) return null

    console.log('[user-service] exception_updated', { id: String(id).slice(0, 8) })
    return data as FalseDetectException
  }

  async function deleteException(id: string, userId: string): Promise<boolean> {
    const { error } = await client
      .from('false_detect_exceptions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw toError(error)
    console.log('[user-service] exception_deleted', { id: String(id).slice(0, 8) })
    return true
  }

  return {
    listExceptions,
    createException,
    updateException,
    deleteException
  }
}

