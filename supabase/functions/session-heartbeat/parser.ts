import { AnalysisResult, DifyRunResponse } from './types.ts'

export function parseDifyResult(raw: DifyRunResponse): AnalysisResult {
  let analysisResult: AnalysisResult | undefined

  const outputs = (raw as any)?.data?.outputs ?? (raw as any)?.outputs

  if (outputs && typeof outputs === 'object') {
    // NEW: Check if this is an idle-only response (screen unchanged)
    // In this case, Dify only outputs { is_idle: true } without other fields
    if (typeof (outputs as any).is_idle === 'boolean' && !(outputs as any).is_drifting && !(outputs as any).text && !(outputs as any).json && !(outputs as any).result) {
      console.log('[session-heartbeat] detected_idle_only_response', { is_idle: (outputs as any).is_idle })
      // Create a minimal analysis result for idle state
      return {
        is_drifting: false, // Screen unchanged means user is not drifting (yet)
        is_idle: (outputs as any).is_idle,
        drift_reason: undefined,
        actual_task: undefined,
        short_drift_reason: undefined,
        encouragement: undefined
      }
    }

    // Standard parsing for normal response (screen changed)
    if ((outputs as any).text) {
      const textOutput = (outputs as any).text as string
      let jsonString = textOutput
      if (jsonString.includes('```json')) jsonString = jsonString.replace(/```json\s*\n?/, '')
      if (jsonString.includes('```')) jsonString = jsonString.replace(/\n?\s*```$/, '')
      analysisResult = JSON.parse(jsonString.trim()) as AnalysisResult
    } else if ((outputs as any).json) {
      const jsonStr = (outputs as any).json as string
      analysisResult = JSON.parse(jsonStr) as AnalysisResult
    } else if ((outputs as any).result !== undefined) {
      const result = (outputs as any).result
      analysisResult = typeof result === 'string' ? JSON.parse(result) as AnalysisResult : result as AnalysisResult
    } else if ((outputs as any).is_drifting !== undefined) {
      analysisResult = outputs as AnalysisResult
    }
  }

  if (!analysisResult) throw new Error('Invalid Dify response format - no recognized structure')

  // Normalize fields from Dify to ensure consistent types
  const normalized: AnalysisResult = {
    ...analysisResult,
    is_drifting: coerceToBoolean((analysisResult as any).is_drifting)
  }

  // Extract is_idle from outer level if present (for backwards compatibility)
  if (outputs && typeof outputs === 'object' && typeof (outputs as any).is_idle === 'boolean') {
    normalized.is_idle = (outputs as any).is_idle
  }

  // NEW: When screen has changed, Dify won't output is_idle, so we explicitly set it to false
  if (normalized.is_idle === undefined && normalized.is_drifting !== undefined) {
    normalized.is_idle = false
    console.log('[session-heartbeat] screen_changed_detected', { is_idle: false, is_drifting: normalized.is_drifting })
  }

  console.log('[session-heartbeat] analysis_parsed', { is_drifting: normalized.is_drifting, is_idle: normalized.is_idle })
  return normalized
}


function coerceToBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'true' || v === '1' || v === 'yes' || v === 'y' || v === 'drift' || v === 'drifting') return true
    if (v === 'false' || v === '0' || v === 'no' || v === 'n' || v === 'focus' || v === 'focused') return false
  }
  return Boolean(value)
}

