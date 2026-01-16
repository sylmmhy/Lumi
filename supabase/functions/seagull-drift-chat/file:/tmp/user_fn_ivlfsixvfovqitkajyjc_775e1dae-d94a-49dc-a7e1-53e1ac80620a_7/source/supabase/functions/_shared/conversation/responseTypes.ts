import { createAudioDataURL } from "../elevenlabs.ts";
import { jsonResponse } from "../http.ts";
export function buildSeagullResponse(params) {
  const { execution, conversationId, turnNumber, audioReceived, metadata, transcription, conversationContext } = params;
  const { difyResult, ttsResult, aiMessage } = execution;
  const response = {
    success: true,
    messageId: difyResult.messageId ?? crypto.randomUUID(),
    conversationId: difyResult.conversationId ?? conversationId ?? null,
    turnNumber,
    timestamp: new Date().toISOString(),
    audioReceived,
    metadata,
    transcription,
    conversationContext,
    aiResponse: {
      text: aiMessage,
      confidence: 0.95,
      intent: "seagull_assistance",
      audioUrl: ttsResult.audioData ? createAudioDataURL(ttsResult.audioData) : null,
      ttsSuccess: ttsResult.success,
      ttsError: ttsResult.error ?? null,
      responseToTurn: turnNumber
    }
  };
  return jsonResponse(response);
}
export function buildDriftResponse(params) {
  const { execution, conversationId, turnNumber, audioReceived, metadata, transcription, conversationContext, driftContext } = params;
  const { difyResult, ttsResult, aiMessage } = execution;
  const response = {
    success: true,
    messageId: difyResult.messageId ?? crypto.randomUUID(),
    conversationId: difyResult.conversationId ?? conversationId ?? null,
    turnNumber,
    timestamp: new Date().toISOString(),
    audioReceived,
    metadata,
    transcription,
    conversationContext,
    drift: {
      consecutiveDrifts: driftContext.consecutiveDrifts,
      reason: driftContext.reason,
      summary: driftContext.summary
    },
    aiResponse: {
      text: aiMessage,
      confidence: 0.95,
      intent: "drift_intervention",
      audioUrl: ttsResult.audioData ? createAudioDataURL(ttsResult.audioData) : null,
      ttsSuccess: ttsResult.success,
      ttsError: ttsResult.error ?? null,
      responseToTurn: turnNumber
    }
  };
  return jsonResponse(response);
}
