/*
# Onboarding Session Tracking Edge Function

This function handles creating and updating onboarding session records.
It tracks user progress through the onboarding flow and records timing data.

## Usage
- URL: https://[your-project].supabase.co/functions/v1/onboarding-session
- Method: POST
- Body: { action: 'create' | 'update', sessionId?: string, status?: string, taskDescription?: string }

## Actions
1. create: Creates a new session record (status: 'opened')
2. update: Updates an existing session with new status and timestamps

## Status Flow
- opened → started → task_initiated → task_completed/task_abandoned/failed_timeout
*/

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface OnboardingSessionRequest {
  action: 'create' | 'update';
  sessionId?: string;
  deviceId?: string;
  status?: 'opened' | 'started' | 'task_initiated' | 'task_completed' | 'task_abandoned' | 'failed_timeout';
  taskDescription?: string;
  userId?: string;
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

// Helper function to calculate duration in seconds
function calculateDuration(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  return Math.floor((endTime - startTime) / 1000);
}

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
    const body: OnboardingSessionRequest = await request.json();
    const { action, sessionId, deviceId, status, taskDescription, userId } = body;

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get client metadata
    const clientIp = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    if (action === 'create') {
      // Generate unique session ID
      const newSessionId = crypto.randomUUID();

      // Create new onboarding session
      const { data, error } = await supabase
        .from('onboarding_session')
        .insert({
          session_id: newSessionId,
          device_id: deviceId || null,
          user_id: userId || null,
          status: 'opened',
          ip_address: clientIp,
          user_agent: userAgent,
          opened_at: new Date().toISOString()
        })
        .select('id, session_id')
        .single();

      if (error) {
        console.error('Failed to create onboarding session:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to create session' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          sessionId: data.session_id,
          id: data.id
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } else if (action === 'update') {
      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: 'sessionId is required for update action' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Fetch existing session to calculate durations
      const { data: existingSession, error: fetchError } = await supabase
        .from('onboarding_session')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (fetchError || !existingSession) {
        return new Response(
          JSON.stringify({ error: 'Session not found' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Prepare update data
      const updateData: any = {
        status: status || existingSession.status,
        updated_at: new Date().toISOString()
      };

      // Add task description if provided
      if (taskDescription !== undefined) {
        updateData.task_description = taskDescription;
      }

      // Update timestamps and calculate durations based on status
      const now = new Date().toISOString();

      if (status === 'started') {
        updateData.started_at = now;
        updateData.pre_start_duration_seconds = calculateDuration(
          existingSession.opened_at,
          now
        );
      } else if (status === 'task_initiated') {
        updateData.task_initiated_at = now;
        updateData.chat_duration_seconds = calculateDuration(
          existingSession.started_at,
          now
        );
      } else if (status === 'task_completed' || status === 'task_abandoned' || status === 'failed_timeout') {
        updateData.task_ended_at = now;

        // Calculate work duration (only if task was initiated)
        if (existingSession.task_initiated_at) {
          updateData.work_duration_seconds = calculateDuration(
            existingSession.task_initiated_at,
            now
          );
        }

        // Calculate total duration
        updateData.total_duration_seconds = calculateDuration(
          existingSession.opened_at,
          now
        );
      }

      // Update session
      const { data, error: updateError } = await supabase
        .from('onboarding_session')
        .update(updateData)
        .eq('session_id', sessionId)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update onboarding session:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update session' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          session: data
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Must be "create" or "update"' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('Onboarding session tracking error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
