import { supabase } from './supabase'

/**
 * Initiate Apple OAuth login flow via Supabase.
 * This will redirect the user to Apple's authentication page.
 *
 * @param redirectTo - Optional URL to redirect after successful login
 * @throws If Supabase client is not available or OAuth initiation fails
 */
export async function appleLogin(redirectTo?: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase client not initialized')
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: redirectTo || window.location.origin,
      // Apple requires these scopes for name and email
      scopes: 'name email',
    },
  })

  if (error) {
    console.error('Apple login error:', error)
    throw new Error(error.message || 'Apple login failed')
  }
}

/**
 * Apple Sign-In button component props
 */
export interface AppleSignInButtonProps {
  onClick: () => void
  isLoading?: boolean
  disabled?: boolean
  className?: string
  /** Button text variant */
  variant?: 'signin' | 'continue' | 'signup'
}

/**
 * Get button text based on variant
 */
export function getAppleButtonText(variant: AppleSignInButtonProps['variant'] = 'continue'): string {
  switch (variant) {
    case 'signin':
      return 'Sign in with Apple'
    case 'signup':
      return 'Sign up with Apple'
    case 'continue':
    default:
      return 'Continue with Apple'
  }
}
