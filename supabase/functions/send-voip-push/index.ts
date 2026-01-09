/**
 * P0 修复：VoIP 推送通知 Edge Function
 *
 * 功能：
 * 1. 从 pending_push_notifications 表获取待发送的通知
 * 2. 通过 APNs 发送 VoIP 推送到 iOS 设备
 * 3. 标记发送结果
 *
 * 触发方式：
 * - pg_cron 每分钟调用（通过 HTTP trigger）
 * - 或由 Supabase Webhook 触发
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore - jose 库用于 JWT 签名
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PendingNotification {
  notification_id: string
  user_id: string
  task_id: string
  task_title: string
  task_time: string
  device_token: string
  scheduled_time: string
}

interface APNsConfig {
  teamId: string
  keyId: string
  privateKey: string
  bundleId: string
  production: boolean
}

/**
 * 生成 APNs JWT Token
 * 支持两种私钥格式：
 * 1. 完整 PEM 格式 (带 -----BEGIN PRIVATE KEY-----)
 * 2. 纯 base64 格式 (Supabase 环境变量中的格式)
 */
async function generateAPNsToken(config: APNsConfig): Promise<string> {
  let privateKeyPEM = config.privateKey.replace(/\\n/g, '\n')

  // 如果不是 PEM 格式，添加 header/footer
  if (!privateKeyPEM.includes('-----BEGIN PRIVATE KEY-----')) {
    // 移除可能的空白字符
    const cleanBase64 = privateKeyPEM.replace(/\s/g, '')
    privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${cleanBase64}\n-----END PRIVATE KEY-----`
  }

  const privateKey = await jose.importPKCS8(privateKeyPEM, 'ES256')

  const jwt = await new jose.SignJWT({})
    .setProtectedHeader({
      alg: 'ES256',
      kid: config.keyId,
    })
    .setIssuer(config.teamId)
    .setIssuedAt()
    .sign(privateKey)

  return jwt
}

/**
 * 发送 VoIP 推送到 iOS 设备
 */
async function sendVoIPPush(
  deviceToken: string,
  payload: object,
  config: APNsConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await generateAPNsToken(config)

    // APNs 服务器地址
    const apnsHost = config.production
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com'

    const url = `${apnsHost}/3/device/${deviceToken}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${token}`,
        'apns-topic': `${config.bundleId}.voip`,
        'apns-push-type': 'voip',
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      return { success: true }
    } else {
      const errorBody = await response.text()
      console.error('APNs error:', response.status, errorBody)
      return {
        success: false,
        error: `APNs ${response.status}: ${errorBody}`
      }
    }
  } catch (error) {
    console.error('VoIP push error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 获取环境变量
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // APNs 配置（从环境变量获取）
    const apnsConfig: APNsConfig = {
      teamId: Deno.env.get('APNS_TEAM_ID') || '',
      keyId: Deno.env.get('APNS_KEY_ID') || '',
      privateKey: Deno.env.get('APNS_AUTH_KEY') || Deno.env.get('APNS_PRIVATE_KEY') || '',
      bundleId: Deno.env.get('APNS_BUNDLE_ID') || '',
      production: Deno.env.get('APNS_PRODUCTION') === 'true',
    }

    // 验证 APNs 配置
    if (!apnsConfig.teamId || !apnsConfig.keyId || !apnsConfig.privateKey || !apnsConfig.bundleId) {
      console.error('Missing APNs configuration')
      return new Response(
        JSON.stringify({
          error: 'APNs not configured',
          missing: {
            teamId: !apnsConfig.teamId,
            keyId: !apnsConfig.keyId,
            privateKey: !apnsConfig.privateKey,
            bundleId: !apnsConfig.bundleId,
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 创建 Supabase 客户端（使用 service role）
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 获取待发送的通知
    const { data: notifications, error: fetchError } = await supabase
      .rpc('get_pending_notifications', { p_limit: 100 })

    if (fetchError) {
      console.error('Failed to fetch notifications:', fetchError)
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending notifications', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${notifications.length} notifications`)

    // 处理每个通知
    const results: Array<{ id: string; success: boolean; error?: string }> = []

    for (const notification of notifications as PendingNotification[]) {
      // 跳过没有 device_token 的
      if (!notification.device_token) {
        await supabase.rpc('mark_notification_sent', {
          p_notification_id: notification.notification_id,
          p_success: false,
          p_error: 'No device token'
        })
        results.push({ id: notification.notification_id, success: false, error: 'No device token' })
        continue
      }

      // 构建 VoIP 推送负载
      // 这个格式需要与 iOS 原生端期望的格式匹配
      const payload = {
        aps: {
          alert: {
            title: 'Time for your routine',
            body: notification.task_title,
          },
        },
        // 自定义数据，原生端用来识别任务
        mindboat: {
          type: 'routine_reminder',
          task_id: notification.task_id,
          task_title: notification.task_title,
          task_time: notification.task_time,
          action: 'start_ai_call',
        },
      }

      // 发送推送
      const result = await sendVoIPPush(notification.device_token, payload, apnsConfig)

      // 更新状态
      await supabase.rpc('mark_notification_sent', {
        p_notification_id: notification.notification_id,
        p_success: result.success,
        p_error: result.error || null
      })

      results.push({
        id: notification.notification_id,
        success: result.success,
        error: result.error
      })

      // 小延迟避免 APNs 限流
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    console.log(`Processed: ${successful} successful, ${failed} failed`)

    return new Response(
      JSON.stringify({
        processed: results.length,
        successful,
        failed,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
