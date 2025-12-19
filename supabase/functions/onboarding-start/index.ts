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

    const { visitorId, taskName, taskDescription, deviceFingerprint } = await req.json()

    if (!visitorId) {
      return new Response(
        JSON.stringify({ error: 'visitorId is required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // 验证 visitorId 是否真实存在
    const { data: visitor, error: visitorError } = await supabaseClient
      .from('visitors')
      .select('id, has_completed_onboarding')
      .eq('id', visitorId)
      .maybeSingle()

    if (visitorError) {
      return new Response(
        JSON.stringify({ error: 'Failed to verify visitor' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    if (!visitor) {
      return new Response(
        JSON.stringify({ error: 'Invalid visitorId: visitor not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      )
    }

    // 检查访客是否已完成过体验（双重保险，entry-check 也会检查）
    if (visitor.has_completed_onboarding) {
      return new Response(
        JSON.stringify({ error: 'Visitor has already completed onboarding' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      )
    }

    // Update visitor metadata if needed
    if (deviceFingerprint) {
      await supabaseClient
        .from('visitors')
        .update({
          device_fingerprint: deviceFingerprint,
          updated_at: new Date().toISOString(),
        })
        .eq('id', visitorId)
    }

    // Create onboarding session
    const sessionId = `onboarding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const { data: session, error } = await supabaseClient
      .from('onboarding_session')
      .insert({
        visitor_id: visitorId,
        session_id: sessionId,
        status: 'started',
        started_at: new Date().toISOString(),
        task_description: taskDescription || taskName,
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
        device_id: deviceFingerprint,
      })
      .select()
      .single()

    if (error) throw error

    return new Response(
      JSON.stringify({
        sessionId: session.session_id,
        onboardingSessionId: session.id,
        visitorId: visitorId,
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
