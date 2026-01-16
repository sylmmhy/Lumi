/**
 * Gemini Token Edge Function
 * 为前端获取 Gemini Live API 的 ephemeral token
 *
 * 使用 @google/genai SDK 的 authTokens.create() 方法
 * 参考: https://ai.google.dev/gemini-api/docs/ephemeral-tokens
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI } from "npm:@google/genai@^1.0.0";

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
    // 从请求中获取 ttl（秒），默认 30 分钟
    const { ttl = 1800 } = await req.json();

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // 创建 GoogleGenAI 客户端
    const client = new GoogleGenAI({ apiKey });

    // 计算过期时间
    const expireTime = new Date(Date.now() + ttl * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString(); // 1 分钟内必须开始会话

    // 使用 SDK 创建 ephemeral token
    const tokenResponse = await client.authTokens.create({
      config: {
        uses: 1, // 限制为单次使用
        expireTime: expireTime,
        newSessionExpireTime: newSessionExpireTime,
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    // 返回 token 信息
    // token.name 是用于 WebSocket 连接的值
    return new Response(
      JSON.stringify({
        token: tokenResponse.name,
        expireTime: tokenResponse.expireTime,
        newSessionExpireTime: tokenResponse.newSessionExpireTime,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error creating ephemeral token:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
