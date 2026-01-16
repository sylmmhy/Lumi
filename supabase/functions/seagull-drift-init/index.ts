/*
# Seagull Drift Init Edge Function - FR-2.4 Implementation

This Edge Function handles JSON-based drift intervention initialization.
It processes drift escalation context and returns AI-powered drift intervention responses.

## Usage
- URL: https://[project].supabase.co/functions/v1/seagull-drift-init
- Method: POST
- Content-Type: application/json
- Body: drift escalation context (userId, sessionId, consecutiveDrifts, etc.)

## Response
- AI drift intervention response with optional base64 audio data
*/ import { ensurePostMethod, errorResponse, handleAbortError } from "../_shared/http.ts";
import { fallbackDriftMessage, formatTask } from "../_shared/context.ts";
import { executeVoiceTurn } from "../_shared/conversation/difyVoiceTurn.ts";
import { buildDriftResponseLegacy } from "../_shared/drift/response.ts";
import { validateDifyConfig } from "../_shared/difyConfig.ts";
const FR24_DIFY_API_KEY = Deno.env.get("FR24_DIFY_API_KEY");
const FR24_DIFY_API_URL = Deno.env.get("FR24_DIFY_API_URL");
Deno.serve(async (req)=>{
  const abortSignal = req.signal;
  try {
    const methodResponse = ensurePostMethod(req, "seagull-drift-init");
    if (methodResponse) return methodResponse;
    // Validate API configuration
    try {
      validateDifyConfig(FR24_DIFY_API_KEY, FR24_DIFY_API_URL);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "API configuration error", 500, "seagull-drift-init");
    }
    // Validate content type
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return errorResponse("Expected application/json content type", 400, "seagull-drift-init");
    }
    // Parse JSON body
    let body;
    try {
      body = await req.json();
    } catch (error) {
      console.error("⚠️ Unable to parse JSON body for drift intervention:", error);
      return errorResponse("Body must be valid JSON", 400, "seagull-drift-init");
    }
    const { userId, sessionId, consecutiveDrifts, driftReason, driftSummary, heartbeatLog, userGoal, currentTask, query, conversationId } = body;
    // Validate required fields
    if (!userId || !sessionId || !consecutiveDrifts || Number.isNaN(consecutiveDrifts)) {
      return errorResponse("Missing required fields: userId, sessionId, consecutiveDrifts", 400, "seagull-drift-init");
    }
    console.log("=== SEAGULL DRIFT INTERVENTION (JSON INIT) ===");
    console.log(JSON.stringify({
      userId,
      sessionId,
      consecutiveDrifts,
      driftReason,
      driftSummary,
      hasHeartbeatLog: !!heartbeatLog,
      currentTask,
      userGoal,
      conversationId,
      query
    }, null, 2));
    // Prepare drift query
    const driftQuery = (query ?? "").trim() || fallbackDriftMessage(consecutiveDrifts, driftReason);
    // Prepare Dify payload
    const difyPayload = {
      inputs: {
        consecutive_drift_minutes: consecutiveDrifts,
        drift_reason: driftReason ?? "",
        drift_summary: driftSummary ?? "",
        heartbeat_log: heartbeatLog ?? "",
        user_goal: userGoal ?? "No specific goal set",
        current_task: formatTask(currentTask)
      },
      query: driftQuery,
      user: userId,
      response_mode: "streaming"
    };
    // Add conversation ID if provided
    if (conversationId && conversationId.trim() !== "") {
      difyPayload.conversation_id = conversationId;
    }
    // Execute Dify chat and respond
    const execution = await executeVoiceTurn({
      payload: difyPayload,
      dify: {
        baseUrl: FR24_DIFY_API_URL,
        apiKey: FR24_DIFY_API_KEY,
        addVersionPrefix: false,
        logLabel: "FR2.4 Seagull Drift"
      },
      abortSignal,
      fallbackMessage: fallbackDriftMessage(consecutiveDrifts, driftReason)
    });
    return buildDriftResponseLegacy(execution, {
      consecutiveDrifts,
      driftReason,
      driftSummary,
      conversationId
    });
  } catch (error) {
    return handleAbortError(error, "seagull-drift-init");
  }
});
