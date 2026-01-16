export interface FetchWithTimeoutOptions {
  timeoutMs?: number
  init?: RequestInit
}

export async function fetchWithTimeout(url: string | URL, options: FetchWithTimeoutOptions = {}): Promise<Response> {
  const { timeoutMs = 15000, init } = options
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timeout)
  }
}


