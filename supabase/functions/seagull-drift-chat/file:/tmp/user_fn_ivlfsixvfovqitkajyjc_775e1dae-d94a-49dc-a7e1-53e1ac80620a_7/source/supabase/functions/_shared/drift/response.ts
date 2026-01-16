import { buildDriftResponse } from "../conversation/responseTypes.ts";
export function buildDriftResponseLegacy(execution, context) {
  const driftContext = {
    consecutiveDrifts: context.consecutiveDrifts,
    reason: context.driftReason,
    summary: context.driftSummary
  };
  return buildDriftResponse({
    execution,
    conversationId: context.conversationId,
    turnNumber: context.turnNumber,
    audioReceived: context.audioReceived,
    metadata: context.metadata,
    transcription: context.transcription,
    conversationContext: context.conversationContext,
    driftContext
  });
}
