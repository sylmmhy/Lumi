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

  // 规范化客户端 IP，取 x-forwarded-for 第一段，避免 inet 字段解析失败
  const getClientIp = () => {
    const xForwardedFor = req.headers.get('x-forwarded-for')
    if (xForwardedFor) {
      const first = xForwardedFor.split(',')[0]?.trim()
      if (first) return first
    }
    const xRealIp = req.headers.get('x-real-ip')
    if (xRealIp) {
      return xRealIp.split(',')[0]?.trim()
    }
    return null
  }
  const clientIp = getClientIp()

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

    const url = new URL(req.url)
    const visitorId = url.searchParams.get('visitorId')

    // Case 1: No visitorId provided → Create new visitor
    if (!visitorId) {
      const { data: newVisitor, error } = await supabaseClient
        .from('visitors')
        .insert({
          ip_address: clientIp,
          user_agent: req.headers.get('user-agent'),
        })
        .select()
        .single()

      if (error) throw error

      return new Response(
        JSON.stringify({
          canStartOnboarding: true,
          visitorId: newVisitor.id,
          reason: 'no_visitor',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Case 2: visitorId provided → Check if trial was used
    const { data: visitor, error } = await supabaseClient
      .from('visitors')
      .select('has_completed_onboarding')
      .eq('id', visitorId)
      .single()

    if (error || !visitor) {
      // Visitor not found, create new
      const { data: newVisitor, error: createError } = await supabaseClient
        .from('visitors')
        .insert({
          ip_address: clientIp,
          user_agent: req.headers.get('user-agent'),
        })
        .select()
        .single()

      if (createError) throw createError

      return new Response(
        JSON.stringify({
          canStartOnboarding: true,
          visitorId: newVisitor.id,
          reason: 'no_visitor',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Case 3: Visitor found
    if (visitor.has_completed_onboarding) {
      return new Response(
        JSON.stringify({
          canStartOnboarding: false,
          visitorId: visitorId,
          reason: 'trial_used',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    return new Response(
      JSON.stringify({
        canStartOnboarding: true,
        visitorId: visitorId,
        reason: 'trial_available',
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
