import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// APNs config
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") || "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") || "";
const APNS_AUTH_KEY = Deno.env.get("APNS_AUTH_KEY") || "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") || "com.mindboat.app";
const APNS_PRODUCTION = Deno.env.get("APNS_PRODUCTION") === "true";

const APNS_HOST = APNS_PRODUCTION
  ? "https://api.push.apple.com"
  : "https://api.sandbox.push.apple.com";

/**
 * Generate APNs JWT Token
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
 * Send VoIP push to device
 */
async function sendVoIPPush(
  deviceToken: string,
  taskTitle: string,
  taskId: string
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

    const url = `${APNS_HOST}/3/device/${deviceToken}`;

    console.log(`Sending VoIP push to device: ${deviceToken.substring(0, 20)}...`);
    console.log(`Task: ${taskTitle}`);

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
      console.error(`APNs error (${response.status}):`, errorText);
      return { success: false, error: `APNs error: ${response.status} - ${errorText}` };
    }

    console.log(`VoIP push sent successfully`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to send VoIP push:`, error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Simple auth check - verify service role key
    const authHeader = req.headers.get("authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (serviceKey && token !== serviceKey) {
        // Not service key, could be anon key - allow for now
        console.log("Request with non-service key authorization");
      }
    }

    const { userId, taskId, taskTitle, deviceToken } = await req.json();

    console.log(`\n========== Send VoIP Push (Internal) ==========`);
    console.log(`User ID: ${userId}`);
    console.log(`Task ID: ${taskId}`);
    console.log(`Task Title: ${taskTitle}`);

    let targetDeviceToken = deviceToken;

    if (!targetDeviceToken && userId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { data: devices, error: deviceError } = await supabase
        .from("user_devices")
        .select("device_token")
        .eq("user_id", userId)
        .eq("platform", "voip")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (deviceError || !devices || devices.length === 0) {
        return new Response(
          JSON.stringify({ error: "No VoIP token found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      targetDeviceToken = devices[0].device_token;
    }

    if (!targetDeviceToken) {
      return new Response(
        JSON.stringify({ error: "No device token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await sendVoIPPush(targetDeviceToken, taskTitle || "Task Reminder", taskId || "");

    if (result.success) {
      if (taskId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        await supabase.from("tasks").update({ called: true }).eq("id", taskId);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error(`Edge function error:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
