/*
# Seagull Drift Chat Edge Function - FR-2.4 Implementation

Handles voice-based drift intervention turns using the FR-2.4 Dify workflow.
Accepts multipart/form-data audio payloads and returns AI guidance with TTS audio.
*/ import { ensurePostMethod, errorResponse, handleAbortError, jsonResponse } from "../_shared/http.ts";
import { fallbackDriftMessage, formatTask, parseConsecutiveFromContextData } from "../_shared/context.ts";
import { parseVoiceInteractionRequest } from "../_shared/voice.ts";
import { validateDifyConfig } from "../_shared/difyConfig.ts";
import { executeVoiceTurn } from "../_shared/conversation/difyVoiceTurn.ts";
import { buildDriftResponseLegacy } from "../_shared/drift/response.ts";
const FR24_DIFY_API_KEY = Deno.env.get("FR24_DIFY_API_KEY");
const FR24_DIFY_API_URL = Deno.env.get("FR24_DIFY_API_URL");
Deno.serve(async (req)=>{
  const abortSignal = req.signal;
  try {
    const methodResponse = ensurePostMethod(req, "seagull-drift-chat");
    if (methodResponse) return methodResponse;
    try {
      validateDifyConfig(FR24_DIFY_API_KEY, FR24_DIFY_API_URL);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "API configuration error", 500, "seagull-drift-chat");
    }
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return errorResponse("Expected multipart/form-data content type", 400, "seagull-drift-chat");
    }
    let voiceContext;
    try {
      voiceContext = await parseVoiceInteractionRequest(req, {
        abortSignal,
        logPrefix: "FR2.4 Drift Chat"
      });
    } catch (error) {
      const status = typeof error.status === "number" ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unknown error";
      const extras = {
        message,
        timestamp: new Date().toISOString(),
        endpoint: "seagull-drift-chat"
      };
      if (error.requiresRetry) {
        extras.requiresRetry = true;
      }
      if (error.details) {
        extras.details = error.details;
      }
      return errorResponse(status === 400 ? message : "Internal server error", status, "seagull-drift-chat", extras);
    }
    const { audioFile, metadata, userQuery, conversationId, parsedInterventionContext, currentTask, userGoal, userIdFromForm, sessionIdFromForm, contextData, formData, type } = voiceContext;
    if (type === "chunk") {
      return jsonResponse({
        success: true,
        type: "chunk_received",
        timestamp: metadata.timestamp,
        size: metadata.audioSize
      });
    }
    const typedTask = currentTask;
    const effectiveUserId = userIdFromForm || parsedInterventionContext?.userId || "anonymous";
    const effectiveSessionId = sessionIdFromForm || parsedInterventionContext?.sessionId || "";
    if (!effectiveSessionId) {
      return errorResponse("Session identification required - Cannot process drift conversation without session context", 400, "seagull-drift-chat");
    }
    const resolvedConsecutive = parsedInterventionContext?.consecutiveDrifts ?? parseConsecutiveFromContextData(contextData) ?? 1;
    const driftReason = formData.get("drift_reason") ?? parsedInterventionContext?.driftReason;
    const driftSummary = formData.get("drift_summary") ?? parsedInterventionContext?.driftSummary;
    const heartbeatLog = formData.get("heartbeat_log") ?? parsedInterventionContext?.heartbeatLog;
    const driftQuery = userQuery || fallbackDriftMessage(resolvedConsecutive, driftReason);
    const difyPayload = {
      inputs: {
        consecutive_drift_minutes: resolvedConsecutive,
        drift_reason: driftReason ?? "",
        drift_summary: driftSummary ?? "",
        heartbeat_log: heartbeatLog ?? "",
        user_goal: userGoal ?? "No specific goal set",
        current_task: formatTask(typedTask)
      },
      query: driftQuery,
      user: effectiveUserId,
      response_mode: "streaming"
    };
    if (conversationId && conversationId.trim() !== "") {
      difyPayload.conversation_id = conversationId;
    }
    const execution = await executeVoiceTurn({
      payload: difyPayload,
      dify: {
        baseUrl: FR24_DIFY_API_URL,
        apiKey: FR24_DIFY_API_KEY,
        addVersionPrefix: false,
        logLabel: "FR2.4 Seagull Drift"
      },
      abortSignal,
      fallbackMessage: fallbackDriftMessage(resolvedConsecutive, driftReason)
    });
    return buildDriftResponseLegacy(execution, {
      consecutiveDrifts: resolvedConsecutive,
      driftReason,
      driftSummary,
      conversationId,
      audioReceived: {
        size: audioFile.size,
        type: audioFile.type,
        duration: metadata.duration
      },
      metadata: {
        timestamp: metadata.timestamp
      },
      transcription: userQuery,
      conversationContext: {
        totalTurns: 1,
        isNewConversation: !conversationId || conversationId.trim() === "",
        hasHistory: !!conversationId && conversationId.trim() !== ""
      }
    });
  } catch (error) {
    return handleAbortError(error, "seagull-drift-chat");
  }
});
