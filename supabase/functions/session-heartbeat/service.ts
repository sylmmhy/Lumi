import { loadConfig } from './config.ts'
import { createRepo } from './supabase-repo.ts'
import { uploadImages, buildWorkflowInputs, runWorkflow } from './dify-client.ts'
import { parseDifyResult } from './parser.ts'
import { HeartbeatRequestBody, AnalysisResult, HeartbeatResponseBody, UpdateEventRequestBody, UpdateEventResponseBody } from './types.ts'
// Repo 类型用于类型注解，暂时保留以备将来使用
// import type { Repo } from './supabase-repo.ts'

const HEARTBEAT_INTERVAL_SECONDS = 30

export async function processHeartbeat(reqBody: HeartbeatRequestBody): Promise<{ response: HeartbeatResponseBody }> {
  const { sessionId, cameraImage, screenImage } = reqBody
  if (!sessionId) throw new Error('Session ID is required')
  if (!cameraImage && !screenImage) throw new Error('At least one image (camera or screen) is required')

  const cfg = loadConfig()
  console.log('[session-heartbeat] config_loaded')
  const repo = createRepo({ supabaseUrl: cfg.supabaseUrl, supabaseServiceKey: cfg.supabaseServiceKey })

  console.log('[session-heartbeat] fetching_session_context', { sessionId: String(sessionId).slice(0, 8) })
  const ctx = await repo.getSessionContext(sessionId)
  console.log('[session-heartbeat] session_context_ready', { userId: String(ctx.userId).slice(0, 8), taskName: ctx.taskName })

  console.log('[session-heartbeat] uploading_images', { hasCamera: Boolean(cameraImage), hasScreen: Boolean(screenImage) })
  const { cameraFileId, screenFileId } = await uploadImages({ cameraImage, screenImage, userId: ctx.userId }, { difyApiUrl: cfg.difyApiUrl, difyApiKey: cfg.difyApiKey })
  console.log('[session-heartbeat] images_uploaded', { cameraFileId: cameraFileId ? 'yes' : 'no', screenFileId: screenFileId ? 'yes' : 'no' })

  if (!cameraFileId && !screenFileId) {
    const insertData = {
      session_id: sessionId,
      user_id: ctx.userId,
      is_drifting: false,
      drift_reason: 'No media available for analysis',
      actual_task: ctx.taskName,
      intervention_triggered: false
    }
    const eventId = await repo.insertDriftEvent(insertData)
    return {
      response: {
        success: true,
        is_drifting: false,
        drift_reason: 'No media available for analysis',
        actual_task: ctx.taskName,
        short_drift_reason: null,
        encouragement: null,
        detected_task_id: null,
        detected_task_title: null,
        trigger_reason: null,
        message: 'Heartbeat received but no media available - assuming focused',
        event_id: eventId
      }
    }
  }
  const falseExceptions = await repo.getFalseDetectExceptions(ctx.userId)
  const falseDetect = falseExceptions.length > 0
    ? falseExceptions.join(', ')
    : ''
  const inputs = buildWorkflowInputs({ goal_text: ctx.userGoal, task_list: JSON.stringify(ctx.tasksList || []), cameraFileId, screenFileId, falseDetect })
  console.log('[session-heartbeat] running_workflow')

  let analysis: AnalysisResult
  try {
    const res = await runWorkflow(inputs, ctx.userId, { difyApiUrl: cfg.difyApiUrl, difyApiKey: cfg.difyApiKey })
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.warn('[session-heartbeat] dify_error', { status: res.status, bodySnippet: bodyText.slice(0, 300) })
      throw new Error(`Dify API error: ${res.status}`)
    }
    const payload = await res.json()
    analysis = parseDifyResult(payload)
    console.log('[session-heartbeat] workflow_complete', { is_drifting: analysis.is_drifting })
  } catch (err) {
    console.warn('[session-heartbeat] workflow_failed', {
      reason: 'analysis service unavailable',
      error: err instanceof Error ? err.message : String(err)
    })
    const eventId = await repo.insertDriftEvent({
      session_id: sessionId,
      user_id: ctx.userId,
      is_drifting: false,
      drift_reason: 'Analysis service unavailable',
      actual_task: ctx.taskName,
      intervention_triggered: false
    })
    return {
      response: {
        success: true,
        is_drifting: false,
        drift_reason: 'Analysis service unavailable - assuming focused',
        actual_task: ctx.taskName,
        short_drift_reason: null,
        encouragement: null,
        detected_task_id: null,
        detected_task_title: null,
        trigger_reason: null,
        message: 'Heartbeat processed but analysis unavailable - assuming focused',
        event_id: eventId
      }
    }
  }

  const insertData = {
    session_id: sessionId,
    user_id: ctx.userId,
    is_drifting: analysis.is_drifting,
    drift_reason: (analysis.drift_reason || (analysis as any).reasons) ?? null,
    actual_task: (analysis.actual_task || (analysis as any).actual_current_task) ?? null,
    intervention_triggered: false
  }
  const eventId = await repo.insertDriftEvent(insertData)
  console.log('[session-heartbeat] drift_event_inserted', { is_drifting: insertData.is_drifting })

  const isCurrentlyDrifting = analysis.is_drifting
  const justStartedDrifting = !ctx.wasPreviouslyDrifting && isCurrentlyDrifting
  if (justStartedDrifting || isCurrentlyDrifting) {
    const current = await repo.getSessionDriftStats(sessionId)
    const update: any = {}
    if (justStartedDrifting) update.drift_count = (current?.drift_count || 0) + 1
    if (isCurrentlyDrifting) update.total_drift_seconds = (current?.total_drift_seconds || 0) + HEARTBEAT_INTERVAL_SECONDS
    if (Object.keys(update).length) await repo.updateSessionDriftStats(sessionId, update)
    if (Object.keys(update).length) console.log('[session-heartbeat] session_drift_stats_updated', update)
  }

  await repo.updateSessionState(sessionId, 'active')
  console.log('[session-heartbeat] session_state_updated', { state: 'active' })

  return {
    response: {
      success: true,
      is_drifting: analysis.is_drifting,
      drift_reason: analysis.drift_reason || (analysis as any).reasons || 'No reason provided',
      actual_task: analysis.actual_task || (analysis as any).actual_current_task || 'Unknown task',
      short_drift_reason: null,
      encouragement: null,
      detected_task_id: null,
      detected_task_title: null,
      trigger_reason: null,
      message: analysis.is_drifting ? 'Drift detected - monitoring continues' : 'User focused - good work!',
      event_id: eventId
    }
  }
}

export async function processUpdateEvent(reqBody: UpdateEventRequestBody): Promise<{ response: UpdateEventResponseBody }> {
  const { eventId, drift_reason, actual_task } = reqBody
  if (!eventId) throw new Error('eventId is required')

  const cfg = loadConfig()
  const repo = createRepo({ supabaseUrl: cfg.supabaseUrl, supabaseServiceKey: cfg.supabaseServiceKey })

  const updateData: any = {}
  if (drift_reason !== undefined) updateData.drift_reason = drift_reason
  if (actual_task !== undefined) updateData.actual_task = actual_task

  await repo.updateDriftEvent(eventId, updateData)

  return { response: { success: true, event_id: eventId } }
}

