// DIFY Client - Handles API communication with DIFY chatflow
// Manages request/response formatting and error handling

export interface DifyChatResponse {
  event: string
  task_id: string
  id: string
  message_id: string
  conversation_id: string
  mode: string
  answer: string // Plain text response from DIFY
  metadata: {
    usage: {
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
      total_price: number
      currency: string
      latency: number
    }
  }
  created_at: number
}

export interface DifyChatRequest {
  inputs: Record<string, unknown>
  query: string
  response_mode: 'blocking'
  conversation_id: string
  user: string
  files: unknown[]
}

export interface DifyUsage {
  total_tokens: number
  prompt_tokens: number
  completion_tokens: number
  total_price: number
  currency: string
  latency: number
}

/**
 * Calls the DIFY chat-messages API endpoint
 */
export async function callDifyChat(
  apiUrl: string,
  apiKey: string,
  payload: DifyChatRequest
): Promise<DifyChatResponse> {
  const response = await fetch(`${apiUrl}/v1/chat-messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DIFY API error (${response.status}): ${errorText.slice(0, 300)}`)
  }

  return await response.json()
}

/**
 * Parses the DIFY response answer field
 * Returns the plain text answer as-is
 */
export function parseDifyResponse(difyResult: DifyChatResponse): string {
  return difyResult.answer.trim()
}

/**
 * Extracts usage information from DIFY response
 */
export function extractUsage(difyResult: DifyChatResponse): DifyUsage {
  return {
    total_tokens: difyResult.metadata.usage.total_tokens,
    prompt_tokens: difyResult.metadata.usage.prompt_tokens,
    completion_tokens: difyResult.metadata.usage.completion_tokens,
    total_price: difyResult.metadata.usage.total_price,
    currency: difyResult.metadata.usage.currency,
    latency: difyResult.metadata.usage.latency
  }
}

