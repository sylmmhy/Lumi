/*
# JWT Verification Middleware

This module provides JWT token verification for server-side function calls.
It validates JWT tokens and extracts user information for authenticated requests.

## Usage
```typescript
import { verifyJWTToken, getUserIdFromToken } from '../_shared/jwt-verification.ts'

// Verify token and get user info
const authResult = await verifyJWTToken(request.headers.get('authorization') || '')
if (!authResult.valid) {
  return new Response(JSON.stringify({error: authResult.error}), {status: 401})
}

// Get user ID for database operations
const userId = authResult.user_id
```

## Security Features
- JWT signature verification
- Token expiration checking
- User existence validation
- Error handling and logging
*/

import { createClient } from 'npm:@supabase/supabase-js@2'
import { jwtVerify } from 'https://deno.land/x/jose@v4.14.4/index.ts'

interface JWTVerificationResult {
  valid: boolean;
  user_id?: string;
  email?: string;
  name?: string;
  error?: string;
}

interface JWTPayload {
  user_id: string;
  email: string;
  iat: number;
  exp: number;
  iss: string;
}

// Initialize Supabase client for JWT verification
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseKey);
}

// Helper function to extract token from access_token header
function extractToken(authHeader: string): string | null {
  if (!authHeader) {
    return null;
  }
  // For access_token header, the token is passed directly (no Bearer prefix needed)
  return authHeader.trim();
}

// Helper function to verify JWT using jose
async function verifyJWTWithJose(token: string): Promise<JWTPayload | null> {
  try {
    // Get JWT secret from environment
    const jwtSecretString = Deno.env.get('JWT_SECRET');

    // Convert secret to Uint8Array for jose
    const secret = new TextEncoder().encode(jwtSecretString);

    // Verify JWT with proper signature checking using jose
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'mindboat-auth',
      audience: 'mindboat-app'
    });

    // Validate required fields
    if (!payload.user_id || !payload.email || !payload.exp || !payload.iat) {
      return null;
    }

    return payload as JWTPayload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

// Main JWT verification function
export async function verifyJWTToken(authHeader: string): Promise<JWTVerificationResult> {
  try {
    // Extract token
    const token = extractToken(authHeader);
    if (!token) {
      return {
        valid: false,
        error: 'Missing or invalid access_token header'
      };
    }

    // Verify JWT using jose (includes signature verification and expiration check)
    const payload = await verifyJWTWithJose(token);
    if (!payload) {
      return {
        valid: false,
        error: 'Invalid JWT token or signature verification failed'
      };
    }

    // Additional validation checks
    if (payload.iss !== 'mindboat-auth') {
      return {
        valid: false,
        error: 'Invalid token issuer'
      };
    }

    if (payload.aud !== 'mindboat-app') {
      return {
        valid: false,
        error: 'Invalid token audience'
      };
    }

    // Verify user exists in database
    const supabase = getSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, google_id')
      .eq('id', payload.user_id)
      .not('google_id', 'is', null) // Ensure it's a Google user
      .single();

    if (error || !user) {
      return {
        valid: false,
        error: 'User not found or not a Google user'
      };
    }

    // Return successful verification
    return {
      valid: true,
      user_id: user.id,
      email: user.email,
      name: user.name
    };

  } catch (error) {
    console.error('JWT verification error:', error);
    return {
      valid: false,
      error: 'Token verification failed'
    };
  }
}

// Helper function to get user ID from token (convenience function)
export async function getUserIdFromToken(authHeader: string): Promise<string | null> {
  const result = await verifyJWTToken(authHeader);
  return result.valid ? result.user_id : null;
}

// Helper function to get user email from token (convenience function)
export async function getUserEmailFromToken(authHeader: string): Promise<string | null> {
  const result = await verifyJWTToken(authHeader);
  return result.valid ? result.email : null;
}

// Helper function to check if user is authenticated (convenience function)
export async function isAuthenticated(authHeader: string): Promise<boolean> {
  const result = await verifyJWTToken(authHeader);
  return result.valid;
}

// Helper function to create authenticated response
export function createAuthErrorResponse(error: string): Response {
  return new Response(
    JSON.stringify({ error }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, access_token, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      }
    }
  );
}

// Helper function to create authenticated middleware
export async function requireAuth(request: Request): Promise<{valid: boolean, user_id?: string, response?: Response}> {
  const authHeader = request.headers.get('access_token') || '';
  const authResult = await verifyJWTToken(authHeader);

  if (!authResult.valid) {
    return {
      valid: false,
      response: createAuthErrorResponse(authResult.error || 'Authentication required')
    };
  }

  return {
    valid: true,
    user_id: authResult.user_id
  };
}
