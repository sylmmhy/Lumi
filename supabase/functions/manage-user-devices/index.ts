import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create Supabase client with service role for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body once and extract all fields
    const requestBody = await req.json()
    const { action, device_token, is_sandbox } = requestBody

    console.log(`📱 manage-user-devices: action=${action}, user=${user.id}, is_sandbox=${is_sandbox}`)

    switch (action) {
      case 'upsert_voip_device': {
        if (!device_token) {
          return new Response(
            JSON.stringify({ error: 'Missing device_token' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Upsert the VoIP device - matching the actual table structure
        const { data, error } = await supabase
          .from('user_devices')
          .upsert({
            user_id: user.id,
            platform: 'voip',
            device_token: device_token,
            device_type: 'ios',
            is_sandbox: is_sandbox ?? false,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,platform',
            ignoreDuplicates: false
          })
          .select()

        if (error) {
          console.error('Upsert device error:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`✅ Upserted VoIP device for user: ${user.id}, sandbox: ${is_sandbox}, token: ${device_token.substring(0, 20)}...`)

        return new Response(
          JSON.stringify({ success: true, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ==================== FCM (Android) 设备管理 ====================
      case 'upsert_fcm_device': {
        if (!device_token) {
          return new Response(
            JSON.stringify({ error: 'Missing device_token' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Upsert the FCM device for Android
        const { data, error } = await supabase
          .from('user_devices')
          .upsert({
            user_id: user.id,
            platform: 'fcm',
            device_token: device_token,
            device_type: 'android',
            is_sandbox: is_sandbox ?? false,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,platform',
            ignoreDuplicates: false
          })
          .select()

        if (error) {
          console.error('Upsert FCM device error:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`✅ Upserted FCM device for user: ${user.id}, sandbox: ${is_sandbox}, token: ${device_token.substring(0, 20)}...`)

        return new Response(
          JSON.stringify({ success: true, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'remove_fcm_device': {
        // Remove the user's FCM device record
        const { error } = await supabase
          .from('user_devices')
          .delete()
          .eq('user_id', user.id)
          .eq('platform', 'fcm')

        if (error) {
          console.error('Remove FCM device error:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`✅ Removed FCM device for user: ${user.id}`)

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'remove_voip_device': {
        // Remove the user's VoIP device record
        const { error } = await supabase
          .from('user_devices')
          .delete()
          .eq('user_id', user.id)
          .eq('platform', 'voip')

        if (error) {
          console.error('Remove device error:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`✅ Removed VoIP device for user: ${user.id}`)

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'list_devices': {
        // List all devices for the user
        const { data, error } = await supabase
          .from('user_devices')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ devices: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
