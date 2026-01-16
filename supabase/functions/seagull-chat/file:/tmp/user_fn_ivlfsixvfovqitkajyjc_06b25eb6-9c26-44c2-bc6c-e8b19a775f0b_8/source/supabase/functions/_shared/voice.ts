import { getTranscriptionConfig, transcribeAudio } from "./transcription.ts";
export async function parseVoiceInteractionRequest(req, options) {
  const { abortSignal, logPrefix = "VOICE" } = options;
  let formData;
  try {
    formData = await req.formData();
  } catch (error) {
    console.error(`[${logPrefix}] Failed to parse FormData:`, error);
    throw Object.assign(new Error("Body can not be decoded as form data"), {
      status: 400
    });
  }
  const audioFile = formData.get("audio");
  const type = formData.get("type");
  const timestamp = formData.get("timestamp");
  if (!audioFile) {
    throw Object.assign(new Error("No audio file provided"), {
      status: 400
    });
  }
  const audioBuffer = await audioFile.arrayBuffer();
  const metadata = {
    timestamp: timestamp || new Date().toISOString(),
    type,
    audioSize: audioFile.size,
    duration: audioBuffer.byteLength / (16000 * 2)
  };
  let userQuery = formData.get("query");
  if (type !== "chunk" && !userQuery && audioFile.size > 0) {
    try {
      const transcriptionConfig = getTranscriptionConfig();
      console.log(`[${logPrefix}] Using ${transcriptionConfig.provider ?? "transcription"} to convert audio`);
      userQuery = await transcribeAudio(audioFile, abortSignal);
    } catch (error) {
      console.error(`[${logPrefix}] Transcription failed:`, error);
      throw Object.assign(new Error("Speech recognition failed"), {
        status: 500,
        details: error instanceof Error ? error.message : "Unknown error",
        requiresRetry: true
      });
    }
  }
  if (typeof userQuery !== "string") {
    userQuery = "";
  } else {
    userQuery = userQuery.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
  }
  const conversationId = formData.get("conversation_id");
  const turnNumber = parseInt(formData.get("turn_number") || "0");
  const conversationHistoryRaw = formData.get("conversation_history");
  const interventionContextRaw = formData.get("intervention_context");
  const replaceTurn = formData.get("replace_turn") === "true";
  const contextType = formData.get("context_type");
  const contextData = formData.get("context_data");
  const userGoal = formData.get("user_goal");
  const currentTaskJson = formData.get("current_task");
  const userIdFromForm = formData.get("user_id");
  const sessionIdFromForm = formData.get("session_id");
  let parsedHistory = [];
  if (conversationHistoryRaw) {
    try {
      parsedHistory = JSON.parse(conversationHistoryRaw);
    } catch (error) {
      console.warn(`[${logPrefix}] Failed to parse conversation history:`, error);
    }
  }
  let parsedInterventionContext = null;
  if (interventionContextRaw) {
    try {
      parsedInterventionContext = JSON.parse(interventionContextRaw);
    } catch (error) {
      console.warn(`[${logPrefix}] Failed to parse intervention context:`, error);
    }
  }
  let currentTask = null;
  if (currentTaskJson) {
    try {
      currentTask = JSON.parse(currentTaskJson);
    } catch (error) {
      console.warn(`[${logPrefix}] Failed to parse current task:`, error);
    }
  }
  return {
    formData,
    audioFile,
    metadata,
    userQuery,
    conversationId,
    turnNumber,
    parsedHistory,
    conversationHistoryRaw,
    parsedInterventionContext,
    replaceTurn,
    currentTask,
    userGoal,
    contextType,
    contextData,
    userIdFromForm,
    sessionIdFromForm,
    type
  };
}
