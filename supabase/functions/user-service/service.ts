import { loadConfig } from './config.ts'
import { createRepo } from './supabase-repo.ts'
import type {
  CreateExceptionRequest,
  UpdateExceptionRequest,
  DeleteExceptionRequest,
  ListExceptionsResponse,
  CreateExceptionResponse,
  UpdateExceptionResponse,
  DeleteExceptionResponse,
} from './types.ts'

export async function processListExceptions(userId: string): Promise<ListExceptionsResponse> {
  const cfg = loadConfig()
  const repo = createRepo({ supabaseUrl: cfg.supabaseUrl, supabaseServiceKey: cfg.supabaseServiceKey })

  console.log('[user-service] list_exceptions_request', { userId: String(userId).slice(0, 8) })

  const data = await repo.listExceptions(userId)

  console.log('[user-service] list_exceptions_success', { count: data.length })
  return { success: true, data }
}

export async function processCreateException(
  userId: string,
  reqBody: CreateExceptionRequest
): Promise<CreateExceptionResponse> {
  const { actual_task } = reqBody

  if (!actual_task || typeof actual_task !== 'string' || actual_task.trim().length === 0) {
    throw new Error('actual_task is required and must be a non-empty string')
  }

  const cfg = loadConfig()
  const repo = createRepo({ supabaseUrl: cfg.supabaseUrl, supabaseServiceKey: cfg.supabaseServiceKey })

  console.log('[user-service] create_exception_request', {
    userId: String(userId).slice(0, 8),
    taskPreview: actual_task.slice(0, 50)
  })

  const data = await repo.createException(userId, actual_task)

  // Check if it was a duplicate
  const message = data.created_at ? undefined : 'Exception already exists'

  console.log('[user-service] create_exception_success', {
    exceptionId: String(data.id).slice(0, 8),
    wasDuplicate: Boolean(message)
  })

  return { success: true, data, message }
}

export async function processUpdateException(
  userId: string,
  reqBody: UpdateExceptionRequest
): Promise<UpdateExceptionResponse> {
  const { id, actual_task } = reqBody

  if (!id || typeof id !== 'string') {
    throw new Error('id is required and must be a string')
  }
  if (!actual_task || typeof actual_task !== 'string' || actual_task.trim().length === 0) {
    throw new Error('actual_task is required and must be a non-empty string')
  }

  const cfg = loadConfig()
  const repo = createRepo({ supabaseUrl: cfg.supabaseUrl, supabaseServiceKey: cfg.supabaseServiceKey })

  console.log('[user-service] update_exception_request', {
    userId: String(userId).slice(0, 8),
    exceptionId: String(id).slice(0, 8)
  })

  const data = await repo.updateException(id, userId, actual_task)

  if (!data) {
    throw new Error('Exception not found or access denied')
  }

  console.log('[user-service] update_exception_success', { exceptionId: String(data.id).slice(0, 8) })
  return { success: true, data }
}

export async function processDeleteException(
  userId: string,
  reqBody: DeleteExceptionRequest
): Promise<DeleteExceptionResponse> {
  const { id } = reqBody

  if (!id || typeof id !== 'string') {
    throw new Error('id is required and must be a string')
  }

  const cfg = loadConfig()
  const repo = createRepo({ supabaseUrl: cfg.supabaseUrl, supabaseServiceKey: cfg.supabaseServiceKey })

  console.log('[user-service] delete_exception_request', {
    userId: String(userId).slice(0, 8),
    exceptionId: String(id).slice(0, 8)
  })

  await repo.deleteException(id, userId)

  console.log('[user-service] delete_exception_success', { exceptionId: String(id).slice(0, 8) })
  return { success: true, message: 'Exception deleted successfully' }
}

