/*
# Seagull Chat Edge Function - FR-2.3 Implementation

This Edge Function implements regular Seagull AI conversations using FR-2.3 Dify API.
It handles voice and text interactions for normal user-initiated conversations.
For drift interventions, use seagull-drift-init or seagull-drift-chat functions instead.

## Usage
- URL: https://[your-project].supabase.co/functions/v1/seagull-chat
- Method: POST
- Content-Type: multipart/form-data
- Body: FormData with audio file and metadata
- Returns: AI response with TTS audio

## Expected FormData fields:
- audio: Blob (audio file in webm format)
- timestamp: string (ISO timestamp)
- type: 'chunk' | 'final' (indicates if this is a streaming chunk or final audio)
- query: string (optional text query instead of audio)
*/ import { buildSeagullResponse } from "../_shared/conversation/responseTypes.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseVoiceInteractionRequest } from "../_shared/voice.ts";
import { corsHeaders, ensurePostMethod, errorResponse, handleAbortError, jsonResponse } from "../_shared/http.ts";
import { executeVoiceTurn } from "../_shared/conversation/difyVoiceTurn.ts";
// FR2.3 Dify API configuration for regular conversations
const DIFY_API_URL = Deno.env.get("DIFY_API_URL") ?? "";
const FR23_DIFY_API_KEY = Deno.env.get("FR23_DIFY_API_KEY") || Deno.env.get("DIFY_API_KEY") || "";
Deno.serve(async (req)=>{
  // Extract abort signal from request for cancellation support
  const abortSignal = req.signal;
  // Helper function to check if request was aborted
  const checkAborted = ()=>{
    if (abortSignal.aborted) {
      console.log("🚫 Request aborted by client - stopping processing");
      throw new Error("Request aborted by client");
    }
  };
  // Debug endpoint to check configuration
  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/debug")) {
    return new Response(JSON.stringify({
      env: {
        FR23_CONFIG: {
          DIFY_API_URL: Deno.env.get("DIFY_API_URL") || "NOT_SET",
          FR23_DIFY_API_KEY: Deno.env.get("FR23_DIFY_API_KEY") ? "SET" : "NOT_SET"
        },
        EXTERNAL_APIS: {
          hasOpenAI: !!Deno.env.get("OPENAI_API_KEY"),
          hasAzureOpenAI: !!Deno.env.get("AZURE_OPENAI_API_KEY"),
          hasElevenLabs: !!Deno.env.get("ELEVENLABS_API_KEY")
        }
      },
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  try {
    const methodResponse = ensurePostMethod(req, "seagull-chat");
    if (methodResponse) return methodResponse;
    console.log("=== VOICE INTERACTION REQUEST ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Content-Type:", req.headers.get("content-type"));
    let voiceContext;
    try {
      voiceContext = await parseVoiceInteractionRequest(req, {
        abortSignal,
        logPrefix: "FR2.3"
      });
    } catch (error) {
      const status = typeof error.status === "number" ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unknown error";
      const responseBody = {
        error: status === 400 ? message : "Internal server error",
        message,
        timestamp: new Date().toISOString(),
        endpoint: "seagull-chat"
      };
      if (error.requiresRetry) {
        responseBody.requiresRetry = true;
      }
      if (error.details) {
        responseBody.details = error.details;
      }
      return jsonResponse(responseBody, status);
    }
    const { formData, audioFile, metadata, userQuery, conversationId, turnNumber, parsedHistory, parsedInterventionContext, replaceTurn, currentTask, userGoal, userIdFromForm, sessionIdFromForm, type } = voiceContext;
    const taskDetails = currentTask;
    console.log("=== AUDIO DATA RECEIVED ===");
    console.log("Audio file size:", audioFile.size, "bytes");
    console.log("Audio file type:", audioFile.type);
    console.log("Audio file name:", audioFile.name);
    console.log("Timestamp:", metadata.timestamp);
    console.log("Type:", type);
    console.log("Audio buffer duration (approx):", metadata.duration);
    console.log("=== PROCESSING AUDIO ===");
    console.log("Metadata:", JSON.stringify(metadata, null, 2));
    // For audio chunks, just acknowledge receipt and return quickly
    if (type === "chunk") {
      console.log("📦 Audio chunk received, storing for later processing");
      return jsonResponse({
        success: true,
        type: "chunk_received",
        timestamp: metadata.timestamp,
        size: metadata.audioSize
      });
    }
    console.log("📝 Final user query for AI:", userQuery || "[empty speech - letting AI handle]");
    console.log("=== FR2.3 CONVERSATION CONTEXT ===");
    console.log("User query:", userQuery);
    console.log("Conversation ID:", conversationId || "new conversation");
    console.log("Turn number:", turnNumber);
    console.log("Replace turn:", replaceTurn);
    console.log("History turns:", parsedHistory.length);
    console.log("Current task:", taskDetails?.title ?? "None");
    console.log("User goal:", userGoal || "None");
    // Initialize Supabase client for conversation storage
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    // Step 2: Process with Dify AI chat for FR2.3 regular conversations
    checkAborted();
    console.log("🤖 Calling FR2.3 Dify AI for regular conversation...");
    // Check if FR2.3 Dify API is configured
    if (!DIFY_API_URL || !FR23_DIFY_API_KEY) {
      console.error("❌ FR2.3 Dify API not configured:", {
        hasUrl: !!DIFY_API_URL,
        hasKey: !!FR23_DIFY_API_KEY
      });
      throw new Error("FR2.3 Dify API configuration missing");
    }
    // Log the environment for debugging
    console.log("🔧 FR2.3 Dify configuration:", {
      apiUrl: DIFY_API_URL,
      hasApiKey: !!FR23_DIFY_API_KEY,
      apiKeyLength: FR23_DIFY_API_KEY.length,
      apiKeyPrefix: FR23_DIFY_API_KEY.substring(0, 10) + "..."
    });
    // Extract user_id for Dify payload
    const effectiveUserId = userIdFromForm || parsedInterventionContext?.userId || "anonymous";
    // Build FR2.3 payload for regular conversations
    console.log("🔄 Building FR2.3 payload for regular conversation");
    let userTasksContent = "";
    if (taskDetails || userGoal) {
      const taskInfo = taskDetails?.title ? `Current Task: ${taskDetails.title}${taskDetails.description ? ` - ${taskDetails.description}` : ""}` : "";
      const goalInfo = userGoal ? `User's Goal: ${userGoal}` : "";
      userTasksContent = [
        taskInfo,
        goalInfo
      ].filter(Boolean).join("\n");
    }
    const difyPayload = {
      inputs: {
        user_tasks: userTasksContent,
        Memory: parsedHistory.length > 0 ? parsedHistory.map((turn)=>`${turn.role}: ${turn.content}`).join("\n") : ""
      },
      query: userQuery || "",
      user: effectiveUserId,
      response_mode: "streaming"
    };
    // Only include conversation_id if this is a continuation of an existing conversation
    if (conversationId && conversationId.trim() !== "" && turnNumber > 0) {
      difyPayload.conversation_id = conversationId;
      console.log("📝 Using conversation ID for turn", turnNumber, ":", conversationId);
    } else if (turnNumber === 0) {
      console.log("🆕 First turn - letting Dify generate conversation ID");
    } else {
      console.log("⚠️ No conversation ID provided for turn", turnNumber, "- letting Dify create new conversation");
    }
    console.log("📤 FR2.3 Dify API payload:", JSON.stringify(difyPayload, null, 2));
    const execution = await executeVoiceTurn({
      payload: difyPayload,
      dify: {
        baseUrl: DIFY_API_URL,
        apiKey: FR23_DIFY_API_KEY,
        logLabel: "FR2.3 Seagull Chat"
      },
      abortSignal
    });
    const { aiMessage, difyResult, ttsResult } = execution;
    console.log("✅ Dify AI response:", aiMessage.substring(0, 100) + (aiMessage.length > 100 ? "..." : ""));
    if (!ttsResult.success || !ttsResult.audioData) {
      console.error("TTS conversion failed:", ttsResult.error);
      throw new Error(`TTS conversion failed: ${ttsResult.error ?? "Unknown error"}`);
    }
    console.log("✅ TTS conversion successful, now storing conversation to database");
    // Step 5: Store conversation in database ONLY after successful TTS
    // Check if request was aborted before database storage
    checkAborted();
    console.log("💾 Storing conversation to database...");
    // Extract user_id and session_id from intervention context or headers
    let userId = parsedInterventionContext?.userId || userIdFromForm || req.headers.get("x-user-id");
    let sessionId = parsedInterventionContext?.sessionId || sessionIdFromForm || req.headers.get("x-session-id");
    // If still no user ID, this is an error - we need proper user tracking
    if (!userId) {
      console.error("❌ No user ID provided - cannot store conversation");
      return errorResponse("User identification required", 400, "seagull-chat", {
        message: "Cannot store conversation without user ID"
      });
    }
    // Prepare full conversation history including current turn
    const fullConversationHistory = [
      ...parsedHistory
    ];
    // Add current user turn
    fullConversationHistory.push({
      role: "user",
      content: userQuery,
      timestamp: new Date().toISOString()
    });
    // Add current AI response
    fullConversationHistory.push({
      role: "assistant",
      content: aiMessage,
      timestamp: new Date().toISOString()
    });
    // Store/update conversation in database using UPSERT strategy
    // Use the conversation ID provided by frontend (or the one we generated in response)
    const effectiveConversationId = difyResult.conversationId || conversationId;
    try {
      // Handle replace_turn logic - delete existing turn if this is a replacement
      if (replaceTurn && effectiveConversationId) {
        console.log("🔄 Replacing existing turn", turnNumber, "for conversation", effectiveConversationId);
        // Check abort before database operations
        checkAborted();
        // Delete any existing record for this conversation ID and turn number
        const { error: deleteError } = await supabase.from("ai_conversations").delete().eq("user_id", userId).eq("context->>conversation_id", effectiveConversationId);
        if (deleteError) {
          console.error("❌ Failed to delete existing conversation for replacement:", deleteError);
        } else {
          console.log("✅ Successfully deleted existing conversation record for replacement");
        }
      }
      // If we have a conversation ID, try to update existing record first
      if (effectiveConversationId) {
        checkAborted();
        const { data: existingConversation } = await supabase.from("ai_conversations").select("id").eq("user_id", userId).eq("context->>conversation_id", effectiveConversationId).single();
        if (existingConversation) {
          // Update existing conversation
          const { error: updateError } = await supabase.from("ai_conversations").update({
            messages: fullConversationHistory,
            context: {
              conversation_id: effectiveConversationId,
              turn_number: turnNumber + 1,
              audio_duration: metadata.duration,
              audio_size: metadata.audioSize,
              intervention_context: parsedInterventionContext,
              whisper_transcription: userQuery !== formData.get("query"),
              last_updated: new Date().toISOString()
            }
          }).eq("id", existingConversation.id);
          if (updateError) {
            console.error("❌ Failed to update conversation:", updateError);
          } else {
            console.log("✅ Conversation updated successfully");
          }
        } else {
          // Create new conversation record
          const { error: insertError } = await supabase.from("ai_conversations").insert({
            user_id: userId,
            session_id: sessionId,
            messages: fullConversationHistory,
            context: {
              conversation_id: effectiveConversationId,
              turn_number: turnNumber + 1,
              audio_duration: metadata.duration,
              audio_size: metadata.audioSize,
              intervention_context: parsedInterventionContext,
              whisper_transcription: userQuery !== formData.get("query")
            }
          });
          if (insertError) {
            console.error("❌ Failed to insert conversation:", insertError);
          } else {
            console.log("✅ New conversation created successfully");
          }
        }
      } else {
        // No conversation ID, create new record
        const { error: insertError } = await supabase.from("ai_conversations").insert({
          user_id: userId,
          session_id: sessionId,
          messages: fullConversationHistory,
          context: {
            conversation_id: crypto.randomUUID(),
            turn_number: turnNumber + 1,
            audio_duration: metadata.duration,
            audio_size: metadata.audioSize,
            intervention_context: parsedInterventionContext,
            whisper_transcription: userQuery !== formData.get("query")
          }
        });
        if (insertError) {
          console.error("❌ Failed to insert new conversation:", insertError);
        } else {
          console.log("✅ New conversation created successfully");
        }
      }
    } catch (error) {
      console.error("❌ Database storage error:", error);
    }
    // Step 6: Prepare final response with conversation context
    // Final abort check before response
    checkAborted();
    console.log("=== VOICE INTERACTION RESPONSE ===");
    console.log("Response built successfully with shared response types");
    return buildSeagullResponse({
      execution: {
        aiMessage,
        difyResult,
        ttsResult
      },
      conversationId,
      turnNumber: turnNumber + 1,
      audioReceived: {
        size: audioFile.size,
        type: audioFile.type,
        duration: metadata.duration
      },
      metadata: metadata,
      transcription: userQuery,
      conversationContext: {
        totalTurns: turnNumber + 1,
        isNewConversation: !conversationId,
        hasHistory: parsedHistory.length > 0
      }
    });
  } catch (error) {
    const abortResponse = handleAbortError(error, "seagull-chat");
    if (abortResponse.status === 499) {
      console.log("🚫 Request was aborted by client - ending processing gracefully");
      return abortResponse;
    }
    if (error instanceof Error) {
      console.error("=== ERROR IN VOICE INTERACTION ===");
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    } else {
      console.error("Unexpected error in voice interaction:", error);
    }
    return abortResponse;
  }
});
