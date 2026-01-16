// Types for user-service edge function

export interface EnvConfig {
  supabaseUrl: string
  supabaseServiceKey: string
}

export interface FalseDetectException {
  id: string
  user_id: string
  actual_task: string
  created_at: string
}

export interface CreateExceptionRequest {
  actual_task?: string
}

export interface UpdateExceptionRequest {
  id?: string
  actual_task?: string
}

export interface DeleteExceptionRequest {
  id?: string
}

export interface ListExceptionsResponse {
  success: boolean
  data: FalseDetectException[]
}

export interface CreateExceptionResponse {
  success: boolean
  data: FalseDetectException
  message?: string
}

export interface UpdateExceptionResponse {
  success: boolean
  data: FalseDetectException
}

export interface DeleteExceptionResponse {
  success: boolean
  message: string
}
