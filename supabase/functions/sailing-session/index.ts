/*
# Sailing Session Edge Function

This Edge Function manages sailing sessions for the focus-feedback loop system.
It handles session creation, status updates, and real-time communication.

## Usage
- URL: https://[your-project].supabase.co/functions/v1/sailing-session
- Method: POST
- Body: { action: 'start', deviceId: string, taskId: string } | { action: 'update', sessionId: string, status: string }
- Returns: Session data with real-time channel setup
*/ import { createClient } from 'npm:@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
Deno.serve(async (req)=>{
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders
      });
    }
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        error: 'Method not allowed'
      }), {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse the request body
    let requestData;
    try {
      requestData = await req.json();
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Invalid JSON payload'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('=== SAILING SESSION REQUEST ===');
    console.log('Request data:', JSON.stringify(requestData, null, 2));
    // Initialize Supabase client with service role for database operations
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    if (requestData.action === 'start') {
      // Start new sailing session
      const { taskId, permissions, deviceId } = requestData;
      if (!taskId) {
        return new Response(JSON.stringify({
          error: 'taskId is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      if (!deviceId) {
        return new Response(JSON.stringify({
          error: 'deviceId is required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log('Starting session for device:', deviceId, 'task:', taskId);
      // Get or create user based on device fingerprint using the users table
      const { data: userId, error: userError } = await supabase.rpc('get_or_create_user', {
        fingerprint: deviceId,
        ip_addr: null,
        user_agent_str: req.headers.get('user-agent') || null
      });
      if (userError) {
        console.error('Error getting/creating user:', userError);
        return new Response(JSON.stringify({
          error: 'Failed to authenticate user',
          message: userError.message,
          details: userError
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log('User authenticated with ID:', userId);
      // End any existing active sessions for this user in sailing_sessions table
      const { error: endSessionError } = await supabase.from('sailing_sessions').update({
        state: 'ended',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('user_id', userId).eq('state', 'active');
      if (endSessionError) {
        console.error('Error ending previous sessions:', endSessionError);
      // Don't fail if this fails, just log it
      }
      // Create new session record in sailing_sessions table
      const { data: sessionData, error: sessionError } = await supabase.from('sailing_sessions').insert({
        user_id: userId,
        task_id: taskId,
        state: 'active',
        started_at: new Date().toISOString(),
        total_focus_seconds: 0,
        total_drift_seconds: 0,
        drift_count: 0,
        summary: {
          permissions: permissions || {},
          startedAt: new Date().toISOString()
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).select().single();
      if (sessionError) {
        console.error('Error creating session:', sessionError);
        return new Response(JSON.stringify({
          error: 'Failed to create session',
          message: sessionError.message,
          details: sessionError
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log('Session created successfully:', sessionData);
      // Log session start event in session_events table
      const { error: eventError } = await supabase.from('session_events').insert({
        session_id: sessionData.id,
        event_type: 'session_start',
        event_data: {
          task_id: taskId,
          permissions: permissions || {},
          device_id: deviceId
        },
        created_at: new Date().toISOString()
      });
      if (eventError) {
        console.error('Error logging session event:', eventError);
      // Don't fail if this fails, just log it
      }
      // Optional: Trigger Spline animation for start sailing
      try {
        console.log('Triggering Spline sailing animation...');
        const splineResponse = await fetch('https://hooks.spline.design/vS-vioZuERs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'QgxEuHaAD0fyTDdEAYvVH_ynObU2SUnWdip86Gb1RJE',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            numbaer2: 0
          })
        });
        if (splineResponse.ok) {
          console.log('Spline animation triggered successfully');
        } else {
          console.log('Spline animation failed:', splineResponse.status);
        }
      } catch (error) {
        console.error('Failed to trigger Spline animation:', error);
      // Don't fail the session creation if Spline fails
      }
      // Broadcast session start event
      const startEvent = {
        type: 'session_started',
        payload: {
          sessionId: sessionData.id,
          taskId: taskId,
          status: 'active',
          timestamp: new Date().toISOString()
        }
      };
      const channel = supabase.channel(`session-${sessionData.id}`);
      await channel.send({
        type: 'broadcast',
        event: 'session_update',
        payload: startEvent
      });
      // Return session data
      return new Response(JSON.stringify({
        success: true,
        sessionId: sessionData.id,
        status: sessionData.state,
        startTime: sessionData.started_at,
        channelName: `session-${sessionData.id}`,
        message: 'Sailing session started successfully',
        user: {
          id: userId
        }
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } else if (requestData.action === 'update') {
      // Update existing session
      const { sessionId, status, sessionData } = requestData;
      if (!sessionId || !status) {
        return new Response(JSON.stringify({
          error: 'sessionId and status are required'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log('Updating session:', sessionId, 'to status:', status);
      // Update session in sailing_sessions table
      const updateData = {
        state: status,
        updated_at: new Date().toISOString()
      };
      if (status === 'ended') {
        updateData.ended_at = new Date().toISOString();
      }
      if (sessionData) {
        // Merge with existing summary if it exists
        const { data: currentSession } = await supabase.from('sailing_sessions').select('summary').eq('id', sessionId).single();
        const existingSummary = currentSession?.summary || {};
        updateData.summary = {
          ...existingSummary,
          ...sessionData
        };
      }
      const { data: updatedSession, error: updateError } = await supabase.from('sailing_sessions').update(updateData).eq('id', sessionId).select().single();
      if (updateError) {
        console.error('Error updating session:', updateError);
        return new Response(JSON.stringify({
          error: 'Failed to update session',
          message: updateError.message,
          details: updateError
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log('Session updated successfully:', updatedSession);
      // Log session update event
      const { error: eventError } = await supabase.from('session_events').insert({
        session_id: sessionId,
        event_type: 'session_update',
        event_data: {
          status: status,
          session_data: sessionData
        },
        created_at: new Date().toISOString()
      });
      if (eventError) {
        console.error('Error logging session event:', eventError);
      // Don't fail if this fails, just log it
      }
      // Broadcast session update event
      const updateEvent = {
        type: 'session_updated',
        payload: {
          sessionId: sessionId,
          status: status,
          timestamp: new Date().toISOString(),
          sessionData: sessionData
        }
      };
      const channel = supabase.channel(`session-${sessionId}`);
      await channel.send({
        type: 'broadcast',
        event: 'session_update',
        payload: updateEvent
      });
      return new Response(JSON.stringify({
        success: true,
        sessionId: sessionId,
        status: updatedSession.state,
        endTime: updatedSession.ended_at,
        message: 'Session updated successfully'
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } else {
      return new Response(JSON.stringify({
        error: 'Invalid action. Must be "start" or "update"'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error) {
    console.error('=== ERROR IN SAILING SESSION ===');
    console.error('Error details:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString(),
      endpoint: 'sailing-session'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
