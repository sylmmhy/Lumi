import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js'

// TODO: Generate proper database types with `npx supabase gen types typescript`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = SupabaseClient<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientConfig = SupabaseClientOptions<any> & { functions?: { url: string } }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Supabase JS types don't expose functions.url, so we extend the options
const hasEnv = Boolean(supabaseUrl && supabaseAnonKey)
const projectRef = hasEnv ? new URL(supabaseUrl!).host.split('.')[0] : null
const functionsUrl = projectRef ? `https://${projectRef}.functions.supabase.co` : null

let cachedClient: SupabaseClientType | null = null

/**
 * Lazy-create Supabase client. Returns null when env is missing so Storybook/preview不会崩溃。
 */
export function getSupabaseClient(): SupabaseClientType | null {
  if (!hasEnv) return null
  if (!cachedClient) {
    const options: SupabaseClientConfig = {
      auth: {
        storage: window.localStorage,
        storageKey: 'supabase.auth.token',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,  // 必须为 true 以支持 OAuth 回调处理（如 Apple 登录）
      },
      ...(functionsUrl ? { functions: { url: functionsUrl } } : {})
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cachedClient = createClient<any>(supabaseUrl!, supabaseAnonKey!, options)
  }
  return cachedClient
}

// Keep named export for existing imports; may be null when env is missing.
export const supabase = getSupabaseClient()
