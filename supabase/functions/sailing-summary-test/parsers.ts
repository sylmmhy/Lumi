import type { DifyWorkflowOutput } from './types.ts'

function isDifyOutputShape(value: unknown): value is DifyWorkflowOutput {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return typeof obj.timeline_summary === 'string'
    && typeof obj.task_breakdown === 'string'
    && typeof obj.encourage_words === 'string'
}

function stringifyIfObject(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return JSON.stringify(value)
  return null
}

function selectSummaryFromOutputs(outputs: any): DifyWorkflowOutput | null {
  if (!outputs || typeof outputs !== 'object') return null

  // Check if outputs directly has the new format
  if (isDifyOutputShape(outputs)) {
    return outputs as DifyWorkflowOutput
  }

  // Check common output field names
  const possibleFields = [
    'session_conclusion',
    'summary',
    'summary_json',
    'text',
    'result'
  ]

  for (const field of possibleFields) {
    const val = (outputs as any)[field]
    if (isDifyOutputShape(val)) {
      return val as DifyWorkflowOutput
    }
  }

  return null
}

export function tryParseDirectJson(responseText: string): DifyWorkflowOutput | null {
  try {
    const jsonData = JSON.parse(responseText)
    const directFromData = selectSummaryFromOutputs(jsonData.data?.outputs)
    if (directFromData) return directFromData
    return null
  } catch {
    return null
  }
}

export function extractSummaryFromStream(responseText: string): DifyWorkflowOutput | null {
  const lines = responseText.split('\n')
  let finalResult: DifyWorkflowOutput | null = null

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue
    try {
      const jsonData = JSON.parse(trimmedLine.substring(6))
      const event = jsonData.event as string | undefined

      if (event === 'workflow_finished') {
        const fromOutputs = selectSummaryFromOutputs(jsonData.data?.outputs)
        if (fromOutputs) finalResult = fromOutputs
        continue
      }
      if (event === 'node_finished') {
        const fromOutputs = selectSummaryFromOutputs(jsonData.data?.outputs)
        if (!finalResult && fromOutputs) finalResult = fromOutputs
        continue
      }
      if (jsonData.data?.outputs) {
        const fromOutputs = selectSummaryFromOutputs(jsonData.data.outputs)
        if (!finalResult && fromOutputs) finalResult = fromOutputs
      }
    } catch {
      continue
    }
  }

  return finalResult
}

