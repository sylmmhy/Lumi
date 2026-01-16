import type { EnvConfig } from './types.ts'

export function loadConfig(): EnvConfig {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration missing')
  }

  return { supabaseUrl, supabaseServiceKey }
}

