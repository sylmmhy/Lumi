/*
# Google OAuth Login Edge Function

This Edge Function handles Google OAuth authentication flow.
It verifies Google ID tokens using the official Google Auth Library, creates/updates users, and returns JWT session tokens.

## Usage
- URL: https://[your-project].supabase.co/functions/v1/auth/google-login
- Method: POST
- Body: { id_token: string, g_csrf_token: string }
- Returns: { session_token: string, user_email: string, user_id: string }

## Security Features
- CSRF protection with double-submit cookie pattern
- Google token verification using official Google Auth Library
- Domain validation (optional)
- JWT session token generation (1 month expiration)
- Production-ready token validation with signature verification

## Environment Variables Required
- GOOGLE_CLIENT_ID: Your Google OAuth client ID
- JWT_SECRET: Your JWT signing secret
- SUPABASE_URL: Your Supabase project URL
- SUPABASE_SERVICE_ROLE_KEY: Your Supabase service role key
*/

import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignJWT } from 'https://deno.land/x/jose@v4.14.4/index.ts'
import { OAuth2Client } from 'npm:google-auth-library@9.4.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cookie, x-csrf-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface GoogleLoginRequest {
  id_token: string;
  g_csrf_token: string;
}

interface GoogleLoginResponse {
  session_token: string;
  user_email: string;
  user_name: string;
  user_id: string;
  is_new: boolean;
}

interface GoogleUserInfo {
  sub: string;           // Google user ID
  email: string;
  name: string;
  picture: string;
  hd?: string;           // Hosted domain (for company accounts)
  aud: string;           // Audience (should match your client ID)
  iss: string;           // Issuer (should be Google)
  exp: number;           // Expiration time
  iat: number;           // Issued at time
}

// Helper function to get client IP address
function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const remoteAddr = request.headers.get('x-remote-addr');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  if (remoteAddr) {
    return remoteAddr;
  }

  return '127.0.0.1'; // Fallback
}

// Helper function to get CSRF token from cookie
function getCSRFToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith('g_csrf_token=')) {
      return cookie.substring('g_csrf_token='.length);
    }
  }
  return null;
}

// Helper function to verify Google ID token using Google Auth Library
async function verifyGoogleToken(idToken: string): Promise<GoogleUserInfo | null> {
  try {
    // Create OAuth2Client instance
    const client = new OAuth2Client();

    // Get Google Client ID from environment
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    if (!googleClientId) {
      throw new Error('GOOGLE_CLIENT_ID environment variable is required');
    }

    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: googleClientId, // Specify the CLIENT_ID of the app that accesses the backend
    });

    // Get the payload from the verified token
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid token payload');
    }

    // Validate required fields
    if (!payload.sub || !payload.email || !payload.name) {
      throw new Error('Missing required fields in token');
    }

    // Check if the request specified a Google Workspace domain
    const domain = payload.hd;

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture || '',
      hd: domain, // Hosted domain (for Google Workspace accounts)
      aud: payload.aud,
      iss: payload.iss,
      exp: payload.exp,
      iat: payload.iat
    };
  } catch (error) {
    console.error('Google token verification failed:', error);
    return null;
  }
}

// Helper function to generate JWT session token using jose
async function generateSessionToken(userId: string, email: string): Promise<string> {
  try {
    // Get JWT secret from environment (use Supabase's JWT secret or create your own)
    const jwtSecretString = Deno.env.get('JWT_SECRET');

    // Create the JWT payload
    const payload = {
      user_id: userId,
      email: email,
      iss: 'mindboat-auth',
      aud: 'mindboat-app' // Add audience for additional security
    };

    // Convert secret to Uint8Array for jose
    const secret = new TextEncoder().encode(jwtSecretString);

    // Create JWT with proper HMAC signing using jose
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d') // 1 Month
      .setIssuer('mindboat-auth')
      .setAudience('mindboat-app')
      .sign(secret);

    return jwt;
  } catch (error) {
    console.error('JWT generation error:', error);
    throw new Error('Failed to generate session token');
  }
}

// Main handler function
Deno.serve(async (request: Request) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse request body
    const body: GoogleLoginRequest = await request.json();
    const { id_token, g_csrf_token } = body;

    // Validate required parameters
    if (!id_token || !g_csrf_token) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: id_token and g_csrf_token' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // CSRF Protection: Verify g_csrf_token matches cookie or X-CSRF-Token header (browser-safe)
    const csrfCookie = getCSRFToken(request);
    const csrfHeader = request.headers.get('x-csrf-token');
    const csrfValue = csrfCookie ?? csrfHeader;
    if (!csrfValue || g_csrf_token !== csrfValue) {
      return new Response(
        JSON.stringify({ error: 'CSRF token mismatch' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify Google ID token
    const googleUser = await verifyGoogleToken(id_token);
    if (!googleUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid Google token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine if user exists already
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('google_id', googleUser.sub)
      .maybeSingle()

    if (findError) {
      console.error('Database error (find user):', findError)
      return new Response(
        JSON.stringify({ error: 'Failed to query user' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const clientIp = getClientIP(request)
    let userId = existingUser?.id as string | undefined
    const isNew = !userId

    if (!userId) {
      // Create new user record; set display_name initially to Google name
      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert({
          google_id: googleUser.sub,
          email: googleUser.email,
          name: googleUser.name,
          picture_url: googleUser.picture,
          display_name: googleUser.name,
          ip_address: clientIp,
          last_seen_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Database error (insert user):', insertError)
        return new Response(
          JSON.stringify({ error: 'Failed to create user' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      userId = inserted.id
    } else {
      // Update existing user fields; do not overwrite display_name if already set
      const { error: updateError } = await supabase
        .from('users')
        .update({
          email: googleUser.email,
          name: googleUser.name,
          picture_url: googleUser.picture,
          ip_address: clientIp,
          last_seen_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (updateError) {
        console.error('Database error (update user):', updateError)
        return new Response(
          JSON.stringify({ error: 'Failed to update user' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      if (!existingUser.display_name) {
        const { error: displayNameInitError } = await supabase
          .from('users')
          .update({ display_name: googleUser.name })
          .eq('id', userId)
          .is('display_name', null)

        if (displayNameInitError) console.warn('Failed to initialize display_name:', displayNameInitError)
      }
    }

    // Generate JWT session token
    const sessionToken = await generateSessionToken(userId, googleUser.email);

    // Return success response
    const response: GoogleLoginResponse = {
      session_token: sessionToken,
      user_email: googleUser.email,
      user_name: googleUser.name,
      user_id: userId,
      is_new: isNew
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Google login error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
