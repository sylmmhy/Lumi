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

// FCM V1 API 配置
const FCM_PROJECT_ID = Deno.env.get("FCM_PROJECT_ID") || "";
const FCM_CLIENT_EMAIL = Deno.env.get("FCM_CLIENT_EMAIL") || "";
const FCM_PRIVATE_KEY = Deno.env.get("FCM_PRIVATE_KEY") || "";

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
 * 生成 FCM V1 API 的 JWT Token
 */
async function generateFcmJWT(): Promise<string> {
  if (!FCM_PRIVATE_KEY || !FCM_CLIENT_EMAIL) {
    throw new Error("Missing FCM configuration");
  }

  const pemKey = FCM_PRIVATE_KEY.replace(/\\n/g, "\n");
  const pemContents = pemKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

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
    throw new Error(`Failed to get FCM access token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * 发送 FCM 推送 (V1 API)
 */
async function sendFcmPush(
  deviceToken: string,
  taskTitle: string,
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!FCM_PROJECT_ID) {
      console.log(`⚠️ FCM not configured, skipping`);
      return { success: false, error: "FCM not configured" };
    }

    const accessToken = await getFcmAccessToken();

    const message = {
      message: {
        token: deviceToken,
        android: {
          priority: "high",
        },
        data: {
          type: "TASK_REMINDER",
          taskId: taskId,
          taskTitle: taskTitle,
          caller: "Lumi",
        },
      },
    };

    const url = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;

    console.log(`📤 Sending FCM push: ${taskTitle}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ FCM error (${response.status}):`, errorText);
      return { success: false, error: `FCM error: ${response.status} - ${errorText}` };
    }

    const result = await response.json();
    console.log(`✅ FCM push sent successfully:`, result.name);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send FCM push:`, error);
    return { success: false, error: error.message };
  }
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

    console.log(`📤 Sending VoIP push: ${taskTitle}`);
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

/**
 * 发送 Live Activity Push-to-Start
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
    const jwt = await generateAPNsJWT();

    const timestamp = Math.floor(Date.now() / 1000);

    const payload = {
      aps: {
        timestamp: timestamp,
        event: "start",
        "content-state": {
          remainingSeconds: remainingSeconds,
          totalSeconds: remainingSeconds,
          progress: 1.0,
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

    const apnsHost = isSandbox ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;
    const url = `${apnsHost}/3/device/${deviceToken}`;
    const apnsTopic = `${APNS_BUNDLE_ID}.push-type.liveactivity`;

    console.log(`🎯 Sending Live Activity push: ${taskTitle}`);
    console.log(`   APNs Host: ${apnsHost}`);
    console.log(`   Remaining seconds: ${remainingSeconds}`);

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ APNs error (${response.status}):`, errorText);
      return { success: false, error: `APNs error: ${response.status} - ${errorText}` };
    }

    console.log(`✅ Live Activity push sent successfully`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send Live Activity push:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * 计算任务时间与当前时间的差值（秒）
 */
function getSecondsUntilTask(reminderDate: string, time: string, timezone: string): number {
  const now = new Date();

  // 构建任务时间字符串
  const taskTimeStr = `${reminderDate}T${time.length === 5 ? time + ':00' : time}`;

  // 获取当前时间在任务时区的表示
  const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const taskTimeInTimezone = new Date(taskTimeStr);

  // 计算差值（秒）
  const diffMs = taskTimeInTimezone.getTime() - nowInTimezone.getTime();
  return Math.floor(diffMs / 1000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log(`\n🔔 ========== Check and Send Push ==========`);
    console.log(`   Time: ${new Date().toISOString()}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 查询需要触发的任务
    // 排除 display_time = "now" 的即时任务，它们不需要提醒
    const { data: tasks, error: taskError } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        user_id,
        reminder_date,
        time,
        display_time,
        timezone,
        called
      `)
      .eq("status", "pending")
      .not("reminder_date", "is", null)
      .not("time", "is", null)
      .neq("display_time", "now");

    if (taskError) {
      console.error(`❌ Failed to fetch tasks:`, taskError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tasks", details: taskError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`   Found ${tasks?.length || 0} pending tasks`);

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No tasks to process", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processedCount = 0;
    let voipSentCount = 0;
    let fcmSentCount = 0;
    let liveActivitySentCount = 0;

    for (const task of tasks) {
      processedCount++;

      const taskTimezone = task.timezone || "UTC";
      const secondsUntilTask = getSecondsUntilTask(task.reminder_date, task.time, taskTimezone);

      console.log(`\n   Task: ${task.title}`);
      console.log(`      Timezone: ${taskTimezone}`);
      console.log(`      Seconds until task: ${secondsUntilTask}`);
      console.log(`      Called: ${task.called}`);

      // 获取用户的所有设备信息 (iOS VoIP + Android FCM)
      const { data: allDevices, error: deviceError } = await supabase
        .from("user_devices")
        .select("device_token, is_sandbox, live_activity_token, live_activity_token_sandbox, platform, device_type")
        .eq("user_id", task.user_id)
        .in("platform", ["voip", "fcm"])
        .order("updated_at", { ascending: false });

      if (deviceError) {
        console.log(`      ⚠️ Error fetching devices: ${deviceError.message}`);
        continue;
      }

      if (!allDevices || allDevices.length === 0) {
        console.log(`      ⚠️ No devices found for user`);
        continue;
      }

      // 分离 iOS 和 Android 设备
      const iosDevice = allDevices.find(d => d.platform === "voip");
      const androidDevice = allDevices.find(d => d.platform === "fcm");

      console.log(`      iOS device: ${iosDevice ? '✅' : '❌'}`);
      console.log(`      Android device: ${androidDevice ? '✅' : '❌'}`);

      // 情况1: 任务时间在 60-0 秒之间 - 发送 Live Activity Push-to-Start (iOS only)
      if (secondsUntilTask > 0 && secondsUntilTask <= 60) {
        if (iosDevice && iosDevice.live_activity_token) {
          console.log(`      🎯 Sending Live Activity push (${secondsUntilTask}s before task)...`);

          const scheduledTime = task.display_time || task.time;
          const isSandbox = iosDevice.live_activity_token_sandbox ?? false;

          const result = await sendLiveActivityPush(
            iosDevice.live_activity_token,
            task.id,
            task.title,
            scheduledTime,
            task.user_id,
            secondsUntilTask,
            isSandbox
          );

          if (result.success) {
            liveActivitySentCount++;
            console.log(`      ✅ Live Activity push sent`);
          } else {
            console.log(`      ❌ Live Activity push failed: ${result.error}`);
          }
        } else {
          console.log(`      ⚠️ No Live Activity token for user`);
        }
      }

      // 情况2: 任务时间已到或已过 - 发送推送
      if (secondsUntilTask <= 0 && !task.called) {
        let pushSent = false;

        // 发送 iOS VoIP 推送
        if (iosDevice && iosDevice.device_token) {
          console.log(`      📞 Sending VoIP push (task time reached)...`);

          const isSandbox = iosDevice.is_sandbox ?? false;

          const result = await sendVoIPPush(
            iosDevice.device_token,
            task.title,
            task.id,
            isSandbox
          );

          if (result.success) {
            voipSentCount++;
            pushSent = true;
            console.log(`      ✅ VoIP push sent`);
          } else {
            console.log(`      ❌ VoIP push failed: ${result.error}`);
          }
        }

        // 发送 Android FCM 推送
        if (androidDevice && androidDevice.device_token) {
          console.log(`      🤖 Sending FCM push (task time reached)...`);

          const result = await sendFcmPush(
            androidDevice.device_token,
            task.title,
            task.id
          );

          if (result.success) {
            fcmSentCount++;
            pushSent = true;
            console.log(`      ✅ FCM push sent`);
          } else {
            console.log(`      ❌ FCM push failed: ${result.error}`);
          }
        }

        // 如果任何一个推送成功，标记任务为已调用
        if (pushSent) {
          const { error: updateError } = await supabase
            .from("tasks")
            .update({ called: true })
            .eq("id", task.id);

          if (updateError) {
            console.error(`      ❌ Failed to update task:`, updateError);
          } else {
            console.log(`      ✅ Task marked as called`);
          }
        }
      }
    }

    console.log(`\n   ==========================================`);
    console.log(`   Processed: ${processedCount}`);
    console.log(`   Live Activity sent: ${liveActivitySentCount}`);
    console.log(`   VoIP sent: ${voipSentCount}`);
    console.log(`   FCM sent: ${fcmSentCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processedCount} tasks`,
        processed: processedCount,
        liveActivitySent: liveActivitySentCount,
        voipSent: voipSentCount,
        fcmSent: fcmSentCount
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`❌ Edge function error:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
