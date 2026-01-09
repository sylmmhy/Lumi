import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// FCM V1 API 配置
const FCM_PROJECT_ID = Deno.env.get("FCM_PROJECT_ID") || "";
const FCM_CLIENT_EMAIL = Deno.env.get("FCM_CLIENT_EMAIL") || "";
const FCM_PRIVATE_KEY = Deno.env.get("FCM_PRIVATE_KEY") || "";

/**
 * 生成 FCM V1 API 的 JWT Token
 */
async function generateFcmJWT(): Promise<string> {
  console.log(`🔑 Generating FCM JWT...`);
  console.log(`   FCM_PROJECT_ID: ${FCM_PROJECT_ID ? FCM_PROJECT_ID : 'NOT SET'}`);
  console.log(`   FCM_CLIENT_EMAIL: ${FCM_CLIENT_EMAIL ? FCM_CLIENT_EMAIL.substring(0, 20) + '...' : 'NOT SET'}`);
  console.log(`   FCM_PRIVATE_KEY: ${FCM_PRIVATE_KEY ? 'SET (' + FCM_PRIVATE_KEY.length + ' chars)' : 'NOT SET'}`);

  if (!FCM_PRIVATE_KEY || !FCM_CLIENT_EMAIL || !FCM_PROJECT_ID) {
    throw new Error("Missing FCM configuration. Please set FCM_PROJECT_ID, FCM_CLIENT_EMAIL, and FCM_PRIVATE_KEY environment variables.");
  }

  const pemKey = FCM_PRIVATE_KEY.replace(/\\n/g, "\n");
  const pemContents = pemKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  console.log(`   PEM key parsed, length: ${pemContents.length}`);

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: FCM_CLIENT_EMAIL,
      sub: FCM_CLIENT_EMAIL,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/firebase.messaging"
    },
    key
  );

  console.log(`   ✅ JWT generated successfully`);
  return jwt;
}

/**
 * 获取 FCM Access Token
 */
async function getFcmAccessToken(): Promise<string> {
  const jwt = await generateFcmJWT();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Failed to get FCM access token:`, errorText);
    throw new Error(`Failed to get FCM access token: ${errorText}`);
  }

  const data = await response.json();
  console.log(`   ✅ Access token obtained`);
  return data.access_token;
}

/**
 * 发送 FCM 推送 (V1 API)
 * 重要：只使用 data 消息，不使用 notification
 * 这样 onMessageReceived() 在后台也会被调用，应用可以控制显示全屏来电界面
 */
async function sendFcmPush(
  deviceToken: string,
  taskTitle: string,
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`\n📤 ========== Sending FCM Push (Data Only) ==========`);
    console.log(`   Device Token: ${deviceToken.substring(0, 30)}...`);
    console.log(`   Task Title: ${taskTitle}`);
    console.log(`   Task ID: ${taskId}`);

    const accessToken = await getFcmAccessToken();

    // FCM V1 API payload
    // 重要：只使用 data 消息，不包含 notification
    // 这样即使 app 在后台，onMessageReceived() 也会被调用
    // Android 应用可以自己控制显示全屏来电界面
    const message = {
      message: {
        token: deviceToken,
        android: {
          priority: "high",
          // 设置 TTL 为 0，确保消息立即发送，不会延迟
          ttl: "0s",
          // 直接发送数据，让应用处理
          direct_boot_ok: true,
        },
        // 只使用 data 消息，让 Android 应用完全控制通知显示
        data: {
          type: "TASK_REMINDER",
          taskId: taskId,
          taskTitle: taskTitle,
          caller: "Lumi",
          click_action: "OPEN_TASK",
          // 添加时间戳，帮助调试
          timestamp: new Date().toISOString(),
        },
        // 不包含 notification 字段！
        // 这样系统不会自动显示通知，onMessageReceived() 会被调用
      },
    };

    const url = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;

    console.log(`   FCM URL: ${url}`);
    console.log(`   Message (data only, no notification):`, JSON.stringify(message, null, 2));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const responseText = await response.text();
    console.log(`   FCM Response Status: ${response.status}`);
    console.log(`   FCM Response: ${responseText}`);

    if (!response.ok) {
      console.error(`❌ FCM error (${response.status}):`, responseText);
      return { success: false, error: `FCM error: ${response.status} - ${responseText}` };
    }

    console.log(`✅ FCM data message sent successfully!`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send FCM push:`, error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, taskId, taskTitle, deviceToken } = await req.json();

    console.log(`\n🔔 ========== Send FCM Push Request ==========`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Task ID: ${taskId}`);
    console.log(`   Task Title: ${taskTitle}`);
    console.log(`   Device Token provided: ${deviceToken ? 'Yes' : 'No'}`);

    let targetDeviceToken = deviceToken;

    // 如果没有提供 deviceToken，从数据库查询
    if (!targetDeviceToken && userId) {
      console.log(`   Fetching FCM device info from database...`);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      // 查询 FCM 设备信息
      const { data: devices, error: deviceError } = await supabase
        .from("user_devices")
        .select("device_token")
        .eq("user_id", userId)
        .eq("platform", "fcm")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (deviceError) {
        console.error(`❌ Failed to fetch FCM device token:`, deviceError);
        return new Response(
          JSON.stringify({ error: "Failed to fetch FCM device token", details: deviceError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!devices || devices.length === 0) {
        console.log(`⚠️ No FCM token found for user ${userId}`);
        return new Response(
          JSON.stringify({ error: "No FCM token found for user" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      targetDeviceToken = devices[0].device_token;
      console.log(`   📱 FCM Token from database: ${targetDeviceToken.substring(0, 30)}...`);
    }

    if (!targetDeviceToken) {
      return new Response(
        JSON.stringify({ error: "No device token available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await sendFcmPush(targetDeviceToken, taskTitle || "任务提醒", taskId || "");

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
        JSON.stringify({ success: true, message: "FCM data message sent successfully" }),
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
