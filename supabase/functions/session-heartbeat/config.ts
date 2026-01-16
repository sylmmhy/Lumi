import type { EnvConfig } from './types.ts'

export function loadConfig(): EnvConfig {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const difyApiUrl = Deno.env.get('DIFY_API_URL')
  const difyApiKey = Deno.env.get('FR25_DIFY_API_KEY')

  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase configuration missing')
  if (!difyApiUrl || !difyApiKey) throw new Error('Dify API configuration missing')

  return { supabaseUrl, supabaseServiceKey, difyApiUrl, difyApiKey }
}

