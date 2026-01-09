/**
 * VoIP 推送通知 Edge Function
 *
 * 功能：
 * - 接收 userId, taskId, taskTitle, deviceToken, isSandbox 参数
 * - 通过 APNs 发送 VoIP 推送到 iOS 设备
 *
 * 调用方式：
 * - 由 pg_cron 通过 check_and_send_task_notifications SQL 函数调用
 * - 直接 HTTP POST 调用
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// APNs 配置
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") || "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") || "";
const APNS_AUTH_KEY = Deno.env.get("APNS_AUTH_KEY") || "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") || "com.mindboat.app";

const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const APNS_PRODUCTION_HOST = "https://api.push.apple.com";

/**
 * 生成 APNs JWT Token
 */
async function generateAPNsJWT(): Promise<string> {
  if (!APNS_AUTH_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) {
    throw new Error("Missing APNs configuration");
  }

  const pemKey = APNS_AUTH_KEY.replace(/\\n/g, "\n");
  const pemContents = pemKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const jwt = await create(
    { alg: "ES256", kid: APNS_KEY_ID },
    {
      iss: APNS_TEAM_ID,
      iat: getNumericDate(0),
    },
    key
  );

  return jwt;
}

/**
 * 发送 VoIP 推送
 */
async function sendVoIPPush(
  deviceToken: string,
  taskTitle: string,
  taskId: string,
  isSandbox: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`\n📤 ========== Sending VoIP Push ==========`);
    console.log(`   Device Token: ${deviceToken.substring(0, 30)}...`);
    console.log(`   Task Title: ${taskTitle}`);
    console.log(`   Task ID: ${taskId}`);
    console.log(`   Sandbox: ${isSandbox}`);

    const jwt = await generateAPNsJWT();

    const payload = {
      aps: {},
      task: taskTitle,
      taskId: taskId,
      caller: "MindBoat",
      type: "voip_call"
    };

    const apnsHost = isSandbox ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;
    const url = `${apnsHost}/3/device/${deviceToken}`;

    console.log(`   APNs Host: ${apnsHost}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": `bearer ${jwt}`,
        "apns-topic": `${APNS_BUNDLE_ID}.voip`,
        "apns-push-type": "voip",
        "apns-priority": "10",
        "apns-expiration": "0",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ APNs error (${response.status}):`, errorText);
      return { success: false, error: `APNs error: ${response.status} - ${errorText}` };
    }

    console.log(`✅ VoIP push sent successfully`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send VoIP push:`, error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, taskId, taskTitle, deviceToken, isSandbox } = await req.json();

    console.log(`\n🔔 ========== Send VoIP Push Request ==========`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Task ID: ${taskId}`);
    console.log(`   Task Title: ${taskTitle}`);
    console.log(`   Device Token provided: ${deviceToken ? 'Yes' : 'No'}`);
    console.log(`   Is Sandbox: ${isSandbox}`);

    let targetDeviceToken = deviceToken;
    let targetIsSandbox = isSandbox ?? false;

    // 如果没有提供 deviceToken，从数据库查询
    if (!targetDeviceToken && userId) {
      console.log(`   Fetching VoIP device info from database...`);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // 查询 VoIP 设备信息
      const { data: devices, error: deviceError } = await supabase
        .from("user_devices")
        .select("device_token, is_sandbox")
        .eq("user_id", userId)
        .eq("platform", "voip")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (deviceError) {
        console.error(`❌ Failed to fetch VoIP device token:`, deviceError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch VoIP device token", details: deviceError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!devices || devices.length === 0) {
        // 尝试从 users 表获取旧的 voip_token
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("voip_token")
          .eq("id", userId)
          .single();

        if (userError || !user?.voip_token) {
          console.log(`⚠️ No VoIP token found for user ${userId}`);
          return new Response(
            JSON.stringify({ error: "No VoIP token found for user" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        targetDeviceToken = user.voip_token;
        targetIsSandbox = false; // 旧表没有 sandbox 信息，默认生产
        console.log(`   📱 VoIP Token from users table: ${targetDeviceToken.substring(0, 30)}...`);
      } else {
        targetDeviceToken = devices[0].device_token;
        targetIsSandbox = devices[0].is_sandbox ?? false;
        console.log(`   📱 VoIP Token from user_devices: ${targetDeviceToken.substring(0, 30)}...`);
        console.log(`   📱 Is Sandbox: ${targetIsSandbox}`);
      }
    }

    if (!targetDeviceToken) {
      return new Response(
        JSON.stringify({ error: "No device token available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await sendVoIPPush(
      targetDeviceToken,
      taskTitle || "任务提醒",
      taskId || "",
      targetIsSandbox
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (result.success) {
      // 推送成功，标记任务为已调用
      if (taskId) {
        await supabase
          .from("tasks")
          .update({
            called: true,
            push_last_error: null  // 清除之前的错误
          })
          .eq("id", taskId);

        console.log(`✅ Task ${taskId} marked as called`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "VoIP push sent successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // 推送失败，记录错误信息（不设置 called = true，允许重试）
      if (taskId) {
        await supabase
          .from("tasks")
          .update({
            push_last_error: result.error?.substring(0, 500)  // 限制错误信息长度
          })
          .eq("id", taskId);

        console.log(`⚠️ Task ${taskId} push failed, error recorded for retry`);
      }

      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error(`❌ Edge function error:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
