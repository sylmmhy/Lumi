import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get request body
    const { roomName, participantName, metadata } = await req.json()

    // Validate required fields
    if (!roomName || !participantName) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: roomName and participantName are required'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get LiveKit credentials from environment
    const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY')
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL')

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      console.error('Missing LiveKit environment variables')
      return new Response(
        JSON.stringify({
          error: 'Server configuration error: LiveKit credentials not configured'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create RoomService client to create/configure room
    const roomService = new RoomServiceClient(
      LIVEKIT_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET
    )

    // Create or update room with agent dispatch configuration
    try {
      const taskDescription = metadata?.taskDescription || 'complete a task'

      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 60 * 5, // 5 minutes (match iOS timer)
        metadata: JSON.stringify({
          taskDescription,
          createdAt: new Date().toISOString(),
        }),
      })

      console.log(`✅ Room created/updated: ${roomName} with task: ${taskDescription}`)
    } catch (error) {
      // Room might already exist - that's OK, continue
      console.log(`ℹ️ Room may already exist: ${roomName}`)
    }

    // Create LiveKit access token with agent dispatch configuration
    const token = new AccessToken(
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      {
        identity: participantName,
        // Pass metadata (e.g., taskDescription) to the agent
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      }
    )

    // Grant permissions to join room and publish/subscribe
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,      // Allow publishing camera + microphone
      canSubscribe: true,    // Allow receiving agent's audio (TTS)
      canPublishData: true,  // Allow sending data messages
    })

    // IMPORTANT: Configure automatic agent dispatch when participant connects
    // This tells LiveKit to dispatch an agent to the room as soon as the iOS participant joins
    // The agent will automatically join the room and start processing
    token.roomConfig = {
      agents: [
        {
          // Leave agentName empty to use any available agent worker
          // Metadata will be available to the agent in JobContext
          metadata: metadata ? JSON.stringify(metadata) : undefined,
        }
      ]
    }

    // Generate JWT token
    const jwt = await token.toJwt()

    console.log(`✅ Token generated for participant: ${participantName} in room: ${roomName}`)

    // Return token and server URL to client
    return new Response(
      JSON.stringify({
        token: jwt,
        serverUrl: LIVEKIT_URL,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error generating LiveKit token:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
