import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const results: Record<string, any> = {};

  // 1. 检查环境变量是否存在
  const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") || "";
  const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") || "";
  const APNS_AUTH_KEY = Deno.env.get("APNS_AUTH_KEY") || "";
  const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") || "com.mindboat.app";
  const APNS_PRODUCTION = Deno.env.get("APNS_PRODUCTION") || "false";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  results.env_check = {
    APNS_KEY_ID: APNS_KEY_ID ? `✅ Set (${APNS_KEY_ID.length} chars, value: ${APNS_KEY_ID})` : "❌ Missing",
    APNS_TEAM_ID: APNS_TEAM_ID ? `✅ Set (${APNS_TEAM_ID.length} chars, value: ${APNS_TEAM_ID})` : "❌ Missing",
    APNS_AUTH_KEY: APNS_AUTH_KEY ? `✅ Set (${APNS_AUTH_KEY.length} chars)` : "❌ Missing",
    APNS_BUNDLE_ID: `✅ ${APNS_BUNDLE_ID}`,
    APNS_PRODUCTION: APNS_PRODUCTION,
    SUPABASE_URL: SUPABASE_URL ? `✅ Set (${SUPABASE_URL.substring(0, 30)}...)` : "❌ Missing",
    SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_ROLE_KEY ? `✅ Set (${SUPABASE_SERVICE_ROLE_KEY.length} chars)` : "❌ Missing",
  };

  // 2. 验证 APNS_AUTH_KEY 格式
  if (APNS_AUTH_KEY) {
    try {
      // 检查是否包含换行符或者需要转换
      const hasNewlines = APNS_AUTH_KEY.includes("\n");
      const hasEscapedNewlines = APNS_AUTH_KEY.includes("\\n");
      const hasHeader = APNS_AUTH_KEY.includes("-----BEGIN PRIVATE KEY-----");
      const hasFooter = APNS_AUTH_KEY.includes("-----END PRIVATE KEY-----");

      results.auth_key_format = {
        has_real_newlines: hasNewlines,
        has_escaped_newlines: hasEscapedNewlines,
        has_header: hasHeader,
        has_footer: hasFooter,
        first_50_chars: APNS_AUTH_KEY.substring(0, 50),
        last_50_chars: APNS_AUTH_KEY.substring(APNS_AUTH_KEY.length - 50),
      };

      // 尝试解析私钥
      let pemKey = APNS_AUTH_KEY.replace(/\\n/g, "\n");
      const pemContents = pemKey
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s/g, "");

      results.pem_parsing = {
        cleaned_length: pemContents.length,
        is_base64: /^[A-Za-z0-9+/=]+$/.test(pemContents),
      };

      // 尝试解码 base64
      const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
      results.pem_parsing.decoded_bytes = binaryKey.length;

      // 尝试导入密钥
      const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryKey,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
      );
      results.key_import = "✅ Success - Key imported successfully";

      // 尝试生成 JWT
      const jwt = await create(
        { alg: "ES256", kid: APNS_KEY_ID },
        {
          iss: APNS_TEAM_ID,
          iat: getNumericDate(0),
        },
        key
      );
      results.jwt_generation = {
        success: true,
        jwt_preview: jwt.substring(0, 50) + "...",
        jwt_length: jwt.length,
      };

    } catch (error) {
      results.error = {
        message: error.message,
        stack: error.stack,
      };
    }
  }

  // 3. 测试 APNs 连接 (不发送真实推送，只测试连接)
  if (APNS_KEY_ID && APNS_TEAM_ID && APNS_AUTH_KEY) {
    try {
      const APNS_HOST = APNS_PRODUCTION === "true"
        ? "https://api.push.apple.com"
        : "https://api.sandbox.push.apple.com";

      results.apns_host = APNS_HOST;

      // 用一个假的 device token 测试连接
      const fakeToken = "0000000000000000000000000000000000000000000000000000000000000000";

      // 生成 JWT
      let pemKey = APNS_AUTH_KEY.replace(/\\n/g, "\n");
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
        { iss: APNS_TEAM_ID, iat: getNumericDate(0) },
        key
      );

      // 测试连接
      const response = await fetch(`${APNS_HOST}/3/device/${fakeToken}`, {
        method: "POST",
        headers: {
          "authorization": `bearer ${jwt}`,
          "apns-topic": `${APNS_BUNDLE_ID}.voip`,
          "apns-push-type": "voip",
          "apns-priority": "10",
          "content-type": "application/json"
        },
        body: JSON.stringify({ aps: {} })
      });

      const responseText = await response.text();
      results.apns_test = {
        status: response.status,
        response: responseText,
        note: response.status === 400 && responseText.includes("BadDeviceToken")
          ? "✅ APNs 配置正确! (400 BadDeviceToken 是预期的，因为我们用的是假 token)"
          : response.status === 403
            ? "❌ 认证失败 - 检查 Key ID, Team ID, 或 Auth Key"
            : `⚠️ 意外响应: ${response.status}`
      };
    } catch (error) {
      results.apns_test_error = error.message;
    }
  }

  return new Response(
    JSON.stringify(results, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
