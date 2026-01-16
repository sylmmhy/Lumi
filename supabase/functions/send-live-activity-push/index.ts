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

// APNs 服务器地址
const APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com";
const APNS_PRODUCTION_HOST = "https://api.push.apple.com";

/**
 * 生成 APNs JWT Token
 */
async function generateAPNsJWT(): Promise<string> {
  console.log(`🔑 Generating APNs JWT...`);

  if (!APNS_AUTH_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) {
    throw new Error("Missing APNs configuration. Please set APNS_KEY_ID, APNS_TEAM_ID, and APNS_AUTH_KEY environment variables.");
  }

  // 解析 PEM 格式的私钥
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

  console.log(`   ✅ JWT generated successfully`);
  return jwt;
}

/**
 * 发送 Live Activity Push-to-Start 推送
 */
async function sendLiveActivityPush(
  deviceToken: string,
  taskId: string,
  taskTitle: string,
  scheduledTime: string,
  userId: string,
  remainingSeconds: number,
  isSandbox: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`\n🎯 ========== Sending Live Activity Push ==========`);
    console.log(`   Device Token: ${deviceToken.substring(0, 20)}...`);
    console.log(`   Task ID: ${taskId}`);
    console.log(`   Task Title: ${taskTitle}`);
    console.log(`   Scheduled Time: ${scheduledTime}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Remaining Seconds: ${remainingSeconds}`);
    console.log(`   is_sandbox: ${isSandbox}`);

    const jwt = await generateAPNsJWT();

    const timestamp = Math.floor(Date.now() / 1000);
    const totalSeconds = remainingSeconds;
    const progress = 1.0;  // 100% at start

    // Live Activity Push-to-Start payload
    const payload = {
      aps: {
        timestamp: timestamp,
        event: "start",
        "content-state": {
          remainingSeconds: remainingSeconds,
          totalSeconds: totalSeconds,
          progress: progress,
          status: "countdown"
        },
        "attributes-type": "TaskActivityAttributes",
        attributes: {
          taskId: taskId,
          taskTitle: taskTitle,
          scheduledTime: scheduledTime,
          userId: userId
        }
      }
    };

    // 根据 is_sandbox 选择正确的 APNs 服务器
    const apnsHost = isSandbox ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;
    const url = `${apnsHost}/3/device/${deviceToken}`;

    // Live Activity 的 topic 格式: {bundle_id}.push-type.liveactivity
    const apnsTopic = `${APNS_BUNDLE_ID}.push-type.liveactivity`;

    console.log(`   APNs Host: ${apnsHost}`);
    console.log(`   APNs Topic: ${apnsTopic}`);
    console.log(`   Payload: ${JSON.stringify(payload)}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": `bearer ${jwt}`,
        "apns-topic": apnsTopic,
        "apns-push-type": "liveactivity",
        "apns-priority": "10",
        "apns-expiration": "0",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    console.log(`   APNs Response Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ APNs error (${response.status}):`, errorText);
      return { success: false, error: `APNs error: ${response.status} - ${errorText}` };
    }

    console.log(`✅ Live Activity push sent successfully!`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send Live Activity push:`, error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      userId,
      taskId,
      taskTitle,
      scheduledTime,
      remainingSeconds = 60,
      deviceToken,
      isSandbox: requestIsSandbox
    } = await req.json();

    console.log(`\n📱 ========== Send Live Activity Push Request ==========`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Task ID: ${taskId}`);
    console.log(`   Task Title: ${taskTitle}`);
    console.log(`   Scheduled Time: ${scheduledTime}`);
    console.log(`   Remaining Seconds: ${remainingSeconds}`);

    if (!userId && !deviceToken) {
      return new Response(
        JSON.stringify({ error: "userId or deviceToken is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let targetDeviceToken = deviceToken;
    let isSandbox = requestIsSandbox ?? false;

    // 如果没有提供 deviceToken，从数据库查询
    if (!targetDeviceToken && userId) {
      console.log(`   Fetching Live Activity token from database...`);

      const { data: devices, error: deviceError } = await supabase
        .from("user_devices")
        .select("live_activity_token, live_activity_token_sandbox")
        .eq("user_id", userId)
        .eq("platform", "voip")
        .not("live_activity_token", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (deviceError) {
        console.error(`❌ Failed to fetch Live Activity token:`, deviceError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch Live Activity token", details: deviceError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!devices || devices.length === 0 || !devices[0].live_activity_token) {
        console.log(`⚠️ No Live Activity token found for user ${userId}`);
        return new Response(
          JSON.stringify({ error: "No Live Activity token found for user" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      targetDeviceToken = devices[0].live_activity_token;
      isSandbox = devices[0].live_activity_token_sandbox ?? false;

      console.log(`   📱 Live Activity token from database:`);
      console.log(`      Token: ${targetDeviceToken.substring(0, 20)}...`);
      console.log(`      is_sandbox: ${isSandbox}`);
    }

    if (!targetDeviceToken) {
      return new Response(
        JSON.stringify({ error: "No Live Activity token available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await sendLiveActivityPush(
      targetDeviceToken,
      taskId || "",
      taskTitle || "任务提醒",
      scheduledTime || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      userId || "",
      remainingSeconds,
      isSandbox
    );

    if (result.success) {
      return new Response(
        JSON.stringify({ success: true, message: "Live Activity push sent successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
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
