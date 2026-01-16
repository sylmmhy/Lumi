import { getTranscriptionConfig, transcribeAudio } from "./transcription.ts";

export interface VoiceInteractionMetadata extends Record<string, unknown> {
  timestamp: string;
  type: "chunk" | "final" | null;
  audioSize: number;
  duration: number;
}

export interface ParsedConversationHistoryTurn {
  role: string;
  content: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface VoiceInteractionContext {
  formData: FormData;
  audioFile: File;
  metadata: VoiceInteractionMetadata;
  userQuery: string;
  conversationId: string | null;
  turnNumber: number;
  parsedHistory: ParsedConversationHistoryTurn[];
  conversationHistoryRaw: string | null;
  parsedInterventionContext: Record<string, unknown> | null;
  replaceTurn: boolean;
  currentTask: Record<string, unknown> | null;
  userGoal: string | null;
  contextType: string | null;
  contextData: string | null;
  userIdFromForm: string | null;
  sessionIdFromForm: string | null;
  type: "chunk" | "final" | null;
}

export interface ParseVoiceRequestOptions {
  abortSignal: AbortSignal;
  logPrefix?: string;
}

export async function parseVoiceInteractionRequest(
  req: Request,
  options: ParseVoiceRequestOptions,
): Promise<VoiceInteractionContext> {
  const { abortSignal, logPrefix = "VOICE" } = options;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (error) {
    console.error(`[${logPrefix}] Failed to parse FormData:`, error);
    throw Object.assign(new Error("Body can not be decoded as form data"), {
      status: 400,
    });
  }

  const audioFile = formData.get("audio") as File | null;
  const type = formData.get("type") as "chunk" | "final" | null;
  const timestamp = formData.get("timestamp") as string | null;

  if (!audioFile) {
    throw Object.assign(new Error("No audio file provided"), { status: 400 });
  }

  const audioBuffer = await audioFile.arrayBuffer();
  const metadata: VoiceInteractionMetadata = {
    timestamp: timestamp || new Date().toISOString(),
    type,
    audioSize: audioFile.size,
    duration: audioBuffer.byteLength / (16000 * 2),
  };

  let userQuery = formData.get("query") as string | null;
  if (type !== "chunk" && !userQuery && audioFile.size > 0) {
    try {
      const transcriptionConfig = getTranscriptionConfig();
      console.log(
        `[${logPrefix}] Using ${
          transcriptionConfig.provider ?? "transcription"
        } to convert audio`,
      );
      userQuery = await transcribeAudio(audioFile, abortSignal);
    } catch (error) {
      console.error(`[${logPrefix}] Transcription failed:`, error);
      throw Object.assign(new Error("Speech recognition failed"), {
        status: 500,
        details: error instanceof Error ? error.message : "Unknown error",
        requiresRetry: true,
      });
    }
  }

  if (typeof userQuery !== "string") {
    userQuery = "";
  } else {
    userQuery = userQuery.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
  }

  const conversationId = formData.get("conversation_id") as string | null;
  const turnNumber = parseInt(formData.get("turn_number") as string || "0");
  const conversationHistoryRaw = formData.get("conversation_history") as
    | string
    | null;
  const interventionContextRaw = formData.get("intervention_context") as
    | string
    | null;
  const replaceTurn = formData.get("replace_turn") === "true";
  const contextType = formData.get("context_type") as string | null;
  const contextData = formData.get("context_data") as string | null;
  const userGoal = formData.get("user_goal") as string | null;
  const currentTaskJson = formData.get("current_task") as string | null;
  const userIdFromForm = formData.get("user_id") as string | null;
  const sessionIdFromForm = formData.get("session_id") as string | null;

  let parsedHistory: ParsedConversationHistoryTurn[] = [];
  if (conversationHistoryRaw) {
    try {
      parsedHistory = JSON.parse(conversationHistoryRaw);
    } catch (error) {
      console.warn(
        `[${logPrefix}] Failed to parse conversation history:`,
        error,
      );
    }
  }

  let parsedInterventionContext: Record<string, unknown> | null = null;
  if (interventionContextRaw) {
    try {
      parsedInterventionContext = JSON.parse(interventionContextRaw);
    } catch (error) {
      console.warn(
        `[${logPrefix}] Failed to parse intervention context:`,
        error,
      );
    }
  }

  let currentTask: Record<string, unknown> | null = null;
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
    type,
  };
}
