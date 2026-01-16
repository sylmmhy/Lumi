import { parseVoiceInteractionRequest } from "../_shared/voice.ts";

Deno.serve(async (req) => {
  // CORS headers for preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    console.log("[TRANSCRIBE] Starting audio transcription request");

    // Parse audio file from FormData using existing utility
    const context = await parseVoiceInteractionRequest(req, {
      abortSignal: req.signal,
      logPrefix: "TRANSCRIBE",
    });

    console.log("[TRANSCRIBE] Transcription successful", {
      transcriptLength: context.userQuery.length,
      audioSize: context.metadata.audioSize,
      duration: context.metadata.duration,
    });

    // context.userQuery already contains the transcribed text
    // (parseVoiceInteractionRequest calls transcribeAudio internally)
    return new Response(
      JSON.stringify({
        success: true,
        transcript: context.userQuery,
        metadata: {
          audioSize: context.metadata.audioSize,
          duration: context.metadata.duration,
          timestamp: context.metadata.timestamp,
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        status: 200,
      },
    );
  } catch (error) {
    console.error("[TRANSCRIBE] Error:", error);

    const errorMessage = error instanceof Error
      ? error.message
      : "Transcription failed";
    const statusCode = (error as { status?: number }).status || 500;

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        status: statusCode,
      },
    );
  }
});
