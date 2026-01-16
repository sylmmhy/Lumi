/**
 * Gemini Token Edge Function
 * 为前端获取 Gemini Live API 的 ephemeral token
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ttl = 1800 } = await req.json();

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // 调用 Google AI 的 token 端点获取 ephemeral token
    // 参考: https://ai.google.dev/gemini-api/docs/live
    const tokenResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateToken?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ttlSeconds: ttl,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Google API error:', errorText);
      throw new Error(`Failed to get token from Google: ${tokenResponse.status}`);
    }

    const data = await tokenResponse.json();

    return new Response(
      JSON.stringify({ token: data.ephemeralToken || data.token }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
