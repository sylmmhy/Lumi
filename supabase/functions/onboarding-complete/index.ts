import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const {
      visitorId,
      onboardingSessionId,
      workDurationSeconds,
      chatDurationSeconds,
    } = await req.json()

    if (!visitorId || !onboardingSessionId) {
      return new Response(
        JSON.stringify({ error: 'visitorId and onboardingSessionId are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    const now = new Date().toISOString()

    // Update onboarding session to completed
    const { error: sessionError } = await supabaseClient
      .from('onboarding_session')
      .update({
        status: 'task_completed',
        task_ended_at: now,
        work_duration_seconds: workDurationSeconds,
        chat_duration_seconds: chatDurationSeconds,
        total_duration_seconds: (workDurationSeconds || 0) + (chatDurationSeconds || 0),
        updated_at: now,
      })
      .eq('id', onboardingSessionId)
      .eq('visitor_id', visitorId) // Security: verify ownership

    if (sessionError) throw sessionError

    // Mark visitor as having completed onboarding
    const { error: visitorError } = await supabaseClient
      .from('visitors')
      .update({
        has_completed_onboarding: true,
        last_completed_onboarding_at: now,
        updated_at: now,
      })
      .eq('id', visitorId)

    if (visitorError) throw visitorError

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Onboarding completed successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
