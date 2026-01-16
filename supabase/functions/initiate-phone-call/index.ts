import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { RoomServiceClient } from "npm:livekit-server-sdk@2.6.1"

interface PhoneCallRequest {
  userId: string
  sessionId: string
  phoneNumber: string
  conversationId?: string
  context?: {
    currentTask?: {
      id?: string
      title?: string
      description?: string
    }
    userGoal?: string
    awayDurationMinutes?: number
    driftReason?: string
  }
}

interface PhoneCallResponse {
  success: boolean
  roomName?: string
  callId?: string
  error?: string
}

serve(async (req: Request): Promise<Response> => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    })
  }

  try {
    // Parse request
    const body: PhoneCallRequest = await req.json()
    const { userId, sessionId, phoneNumber, conversationId, context } = body

    console.log("📞 Initiating phone call:", {
      userId,
      sessionId,
      phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, "*"), // Mask phone number in logs
      hasConversationId: !!conversationId,
    })

    // Validate required fields
    if (!userId || !sessionId || !phoneNumber) {
      return Response.json(
        { success: false, error: "Missing required fields: userId, sessionId, phoneNumber" } as PhoneCallResponse,
        { status: 400 }
      )
    }

    // Validate phone number format (basic E.164 check)
    if (!phoneNumber.match(/^\+[1-9]\d{1,14}$/)) {
      return Response.json(
        { success: false, error: "Invalid phone number format. Use E.164 format (e.g., +19499811101)" } as PhoneCallResponse,
        { status: 400 }
      )
    }

    // Get environment variables
    const livekitUrl = Deno.env.get("LIVEKIT_URL")
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY")
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET")
    const sipTrunkId = Deno.env.get("LIVEKIT_SIP_TRUNK_ID")

    if (!livekitUrl || !livekitApiKey || !livekitApiSecret || !sipTrunkId) {
      console.error("❌ Missing LiveKit configuration")
      return Response.json(
        { success: false, error: "Server configuration error" } as PhoneCallResponse,
        { status: 500 }
      )
    }

    // Initialize Supabase client (for logging)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Generate room name in format: seagull-drift_user_{userId}-session_{sessionId}-{timestamp}
    const timestamp = Date.now().toString(36)
    const roomName = `seagull-drift_user_${userId}-session_${sessionId}-${timestamp}`

    console.log("🏠 Creating LiveKit room:", roomName)

    // Initialize LiveKit Room Service
    const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret)

    // Step 1: Create LiveKit room
    const room = await roomService.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 minutes - room closes if empty
      maxParticipants: 2, // Only agent + phone participant
    })

    console.log("✅ Room created:", room.name)

    // Step 2: Create SIP participant via direct API call (SDK doesn't support this yet)
    console.log("📞 Creating SIP participant for phone call...")

    // Generate authorization token for LiveKit API
    const authToken = Buffer.from(`${livekitApiKey}:${livekitApiSecret}`).toString('base64')

    const sipPayload = {
      sip_trunk_id: sipTrunkId,
      sip_call_to: phoneNumber,
      room_name: roomName,
      participant_identity: `sip-${userId}-${timestamp}`,
      participant_name: "Mindboat Seagull",
      krisp_enabled: true,
      wait_until_answered: true
    }

    const sipResponse = await fetch(`${livekitUrl.replace('wss://', 'https://')}/twirp/livekit.SIPService/CreateSIPParticipant`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sipPayload)
    })

    if (!sipResponse.ok) {
      const errorText = await sipResponse.text()
      console.error("❌ SIP participant creation failed:", errorText)
      throw new Error(`Failed to create SIP participant: ${sipResponse.status} ${errorText}`)
    }

    const sipParticipant = await sipResponse.json()
    console.log("✅ SIP participant created:", sipParticipant.sip_participant_id || sipParticipant.participantId)

    // Step 3: Dispatch agent with metadata
    console.log("🤖 Dispatching agent...")

    const agentMetadata = {
      conversationType: "seagull-drift-phone",
      conversationId: conversationId || undefined,
      userId,
      sessionId,
      shouldInitiateConversation: true, // Agent speaks first
      ...(context && {
        currentTask: context.currentTask,
        userGoal: context.userGoal,
        consecutiveDrifts: context.awayDurationMinutes,
        driftReason: context.driftReason,
      }),
    }

    await roomService.createRoomDispatch({
      room: roomName,
      agentName: Deno.env.get("LIVEKIT_AGENT_NAME") || "seagull-agent",
      metadata: JSON.stringify(agentMetadata),
    })

    console.log("✅ Agent dispatched with metadata")

    // Step 4: Log phone call to database
    console.log("💾 Logging call to database...")

    const { data: callRecord, error: dbError } = await supabase
      .rpc("log_phone_call", {
        p_user_id: userId,
        p_session_id: sessionId,
        p_phone_number: phoneNumber,
        p_room_name: roomName,
        p_conversation_id: conversationId || null,
        p_context: context || {},
      })

    if (dbError) {
      console.error("⚠️ Failed to log call to database:", dbError)
      // Don't fail the request if DB logging fails
    } else {
      console.log("✅ Call logged with ID:", callRecord)
    }

    // Step 5: Update call status with SIP details
    if (callRecord && !dbError) {
      await supabase.rpc("update_phone_call_status", {
        p_call_id: callRecord,
        p_status: "ringing",
        p_sip_call_id: sipParticipant.sip_call_id || sipParticipant.sipCallId || null,
        p_sip_participant_id: sipParticipant.sip_participant_id || sipParticipant.participantId || null,
      })
    }

    console.log("🎉 Phone call initiated successfully")

    return Response.json({
      success: true,
      roomName,
      callId: callRecord || `call-${timestamp}`,
    } as PhoneCallResponse)

  } catch (error) {
    console.error("❌ Phone call initiation failed:", error)

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as PhoneCallResponse,
      { status: 500 }
    )
  }
})

