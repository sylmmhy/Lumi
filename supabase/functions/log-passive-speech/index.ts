/*
# Log Passive Speech Edge Function

This Edge Function logs passive speech during active sailing sessions for FR-2.2.
It stores speech transcripts in the SailingLog table for later processing.

## Usage
- URL: https://[your-project].supabase.co/functions/v1/log-passive-speech
- Method: POST
- Content-Type: application/json
- Body: JSON with session_id, transcript, and timestamp
- Returns: Success response with sailinglog_id

## Expected JSON body:
- session_id: string (UUID of active session)
- transcript: string (speech transcript text)
- timestamp: string (ISO timestamp when speech occurred)
- interim: boolean (whether this is interim or final transcript)

## Storage Location:
- Table: SailingLog
- Columns: user_id, session_id, transcribed_text, source, created_at
*/

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface LogPassiveSpeechRequest {
    session_id: string
    transcript: string
    timestamp: string
    interim?: boolean
}

interface LogPassiveSpeechResponse {
    success: boolean
    event_id?: string
    message: string
}

Deno.serve(async (req: Request) => {
    try {
        // Handle CORS preflight requests
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                status: 200,
                headers: corsHeaders,
            })
        }

        // Only allow POST requests
        if (req.method !== 'POST') {
            return new Response(
                JSON.stringify({ error: 'Method not allowed' }),
                {
                    status: 405,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        // Parse JSON body
        let body: LogPassiveSpeechRequest
        try {
            body = await req.json()
        } catch {
            return new Response(
                JSON.stringify({ error: 'Invalid JSON payload' }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        console.log('=== LOG PASSIVE SPEECH REQUEST ===')
        console.log('Request body:', {
            session_id: body.session_id,
            transcript: body.transcript?.substring(0, 100) + '...',
            timestamp: body.timestamp,
            interim: body.interim
        })

        const { session_id, transcript, timestamp, interim = false } = body

        // Validate input
        if (!session_id || !transcript || !timestamp) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: session_id, transcript, timestamp' }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        // Initialize Supabase client
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // First verify the session exists and is active
        const { data: sessionData, error: sessionError } = await supabase
            .from('sailing_sessions')
            .select('id, user_id, state')
            .eq('id', session_id)
            .eq('state', 'active')
            .single()

        if (sessionError || !sessionData) {
            console.error('Session validation failed:', sessionError)
            return new Response(
                JSON.stringify({ error: 'Session not found or not active' }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        // Skip logging interim results to avoid spam, only log final transcripts
        if (interim) {
            console.log('Skipping interim transcript logging')
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Interim transcript ignored'
                }),
                {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        // Ensure user exists in goal table (required due to foreign key constraint)
        const { error: goalError } = await supabase
            .from('goal')
            .upsert({
                user_id: sessionData.user_id,
                goal_text: 'Default goal for passive speech logging'
            }, {
                onConflict: 'user_id'
            })

        if (goalError) {
            console.warn('Could not create/update goal entry:', goalError)
            // Continue anyway - we'll handle the constraint violation below
        }

        // Log the speech to SailingLog table
        const { data: logData, error: logError } = await supabase
            .from('SailingLog')
            .insert({
                user_id: sessionData.user_id,
                session_id: session_id,
                transcribed_text: transcript,
                source: 'passive_listening',
                created_at: timestamp
            })
            .select()
            .single()

        if (logError) {
            console.error('Error logging speech to SailingLog:', logError)
            return new Response(
                JSON.stringify({ error: 'Failed to log speech to SailingLog', details: logError }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        console.log('✅ Passive speech logged to SailingLog successfully:', logData.sailinglog_id)

        const response: LogPassiveSpeechResponse = {
            success: true,
            event_id: logData.sailinglog_id.toString(),
            message: 'Speech logged to SailingLog successfully'
        }

        return new Response(
            JSON.stringify(response),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )

    } catch (error) {
        console.error('=== ERROR IN LOG PASSIVE SPEECH ===')
        console.error('Error details:', error)

        return new Response(
            JSON.stringify({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
                endpoint: 'log-passive-speech'
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }
})
