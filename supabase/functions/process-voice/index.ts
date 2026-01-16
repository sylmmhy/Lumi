/*
# Process Voice Edge Function

This Edge Function processes voice transcripts for the "Wind of Thought" feature.
It extracts tasks using Dify API and stores them in the database.

## Usage
- URL: https://[your-project].supabase.co/functions/v1/process-voice
- Method: POST
- Content-Type: application/json
- Body: JSON with transcript and user information
- Returns: Extracted tasks array

## Expected JSON body:
- transcript: string (voice transcript text)
- user_id: string (user UUID)
- goal_text: string (user's guiding star goal)
*/

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Dify API configuration
const DIFY_API_URL = Deno.env.get('DIFY_API_URL') ?? ''
const DIFY_API_KEY = Deno.env.get('FR12_DIFY_API_KEY') ?? ''

// Ensure the API URL includes the workflow endpoint
const WORKFLOW_API_URL = DIFY_API_URL.endsWith('/v1/workflows/run')
    ? DIFY_API_URL
    : `${DIFY_API_URL}${DIFY_API_URL.endsWith('/') ? '' : '/'}v1/workflows/run`

interface ProcessVoiceRequest {
    transcript: string
    user_id: string
    goal_text: string
}

interface DifyTaskResponse {
    id: string
    task: string
    motivation: string
    priority: number
}

interface ProcessVoiceResponse {
    success: boolean
    tasks: DifyTaskResponse[]
    transcript: string
    voice_thought_id: string
    message: string
}

interface DifyResponse {
    data?: {
        outputs?: {
            tasks?: string | unknown[]
            [key: string]: unknown
        }
        [key: string]: unknown
    }
    [key: string]: unknown
}

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }

    try {
        console.log('=== PROCESS VOICE REQUEST ===')

        // Parse JSON body
        const body = await req.json() as ProcessVoiceRequest
        const { transcript, user_id, goal_text } = body

        console.log('Request body:', {
            transcript: transcript.substring(0, 100) + '...',
            user_id,
            goal_text
        })

        // Validate input
        if (!transcript || !user_id || !goal_text) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: transcript, user_id, goal_text' }),
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

        console.log('Transcript received:', transcript.substring(0, 100) + '...')

        // Step 1: Insert voice thought record
        const { data: voiceThoughtData, error: voiceThoughtError } = await supabase
            .from('voice_thoughts')
            .insert({
                user_id,
                audio_url: null, // No audio file since we're using Web Speech API
                transcript,
                duration_seconds: Math.floor(transcript.length / 20), // Rough estimate based on text length
                processed: false
            })
            .select()
            .single()

        if (voiceThoughtError) {
            console.error('Voice thought insert error:', voiceThoughtError)
            return new Response(
                JSON.stringify({ error: 'Failed to save voice thought', details: voiceThoughtError }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        const voiceThoughtId = voiceThoughtData.id
        console.log('Voice thought saved with ID:', voiceThoughtId)

        // Step 2: Call Dify API for task decomposition
        console.log('=== CALLING DIFY API ===')
        const difyPayload = {
            inputs: {
                transcription_text: transcript,
                goal_text: goal_text
            },
            response_mode: 'blocking',
            user: `user_${user_id.slice(0, 8)}`
        }

        console.log('Dify payload:', JSON.stringify(difyPayload, null, 2))

        console.log('Dify API URL:', WORKFLOW_API_URL)
        console.log('Dify API Key exists:', !!DIFY_API_KEY)

        const difyResponse = await fetch(WORKFLOW_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIFY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(difyPayload)
        })

        let difyResult: DifyResponse | null = null;

        if (!difyResponse.ok) {
            const errorText = await difyResponse.text()
            console.error('❌ DIFY API FAILED:', {
                status: difyResponse.status,
                statusText: difyResponse.statusText,
                body: errorText.substring(0, 500), // Limit log output
                url: WORKFLOW_API_URL
            })

            // Continue with fallback - difyResult stays null
            console.log('🔄 Using fallback task creation...')
        } else {
            // Check content type before parsing JSON
            const contentType = difyResponse.headers.get('content-type')
            console.log('Response content-type:', contentType)

            if (contentType && contentType.includes('application/json')) {
                difyResult = await difyResponse.json()
                console.log('✅ DIFY API SUCCESS:', JSON.stringify(difyResult, null, 2))
            } else {
                // Response is not JSON, likely HTML error page
                const responseText = await difyResponse.text()
                console.error('❌ DIFY API returned non-JSON response:', {
                    contentType,
                    body: responseText.substring(0, 500),
                    url: WORKFLOW_API_URL
                })
                console.log('🔄 Using fallback task creation...')
            }
        }

        // Step 3: Parse Dify response and extract tasks
        let tasks: DifyTaskResponse[] = []

        try {
            // Parse the streaming response format
            if (difyResult && difyResult.data && difyResult.data.outputs) {
                const outputs = difyResult.data.outputs
                console.log('Dify outputs:', outputs)

                // The tasks are in outputs.tasks as a JSON string or array
                if (outputs.tasks && typeof outputs.tasks === 'string') {
                    // Remove the markdown code block markers if present
                    const cleanTasksString = outputs.tasks.replace(/```json\n|\n```/g, '')
                    console.log('Cleaned tasks string:', cleanTasksString)

                    const parsedTasks = JSON.parse(cleanTasksString)
                    if (Array.isArray(parsedTasks)) {
                        tasks = parsedTasks
                        console.log('✅ Successfully parsed tasks from Dify API (string format)')
                    }
                } else if (outputs.tasks && Array.isArray(outputs.tasks)) {
                    // Tasks already in array format
                    tasks = outputs.tasks
                    console.log('✅ Successfully parsed tasks from Dify API (array format)')
                } else {
                    console.log('⚠️ No tasks field found in outputs')
                }
            } else {
                console.log('⚠️ Invalid Dify response structure')
            }

            console.log('Extracted tasks:', tasks)

            // Validate and normalize tasks
            if (tasks.length === 0) {
                console.log('⚠️ No tasks extracted, using fallback')
                throw new Error('No tasks extracted from Dify response')
            }

            // Validate and normalize tasks
            tasks = tasks.map((task: any, index: number) => ({
                id: task.id || `task_${index + 1}`,
                task: task.task || task.title || task.description || 'Task',
                motivation: task.motivation || task.reason || 'No motivation provided',
                priority: task.priority || 2 // Default to medium priority
            }))

        } catch (error) {
            console.error('❌ Error parsing Dify response:', error)
            console.log('Raw Dify response:', JSON.stringify(difyResult, null, 2))

            // Fallback: create a single task from the transcript
            console.log('🔄 Using fallback task creation...')
            tasks = [{
                id: 'task_1',
                task: transcript.substring(0, 100) + (transcript.length > 100 ? '...' : ''),
                motivation: 'Extracted from voice input',
                priority: 2
            }]
        }

        // Step 4: Insert tasks into database
        console.log('=== INSERTING TASKS INTO DATABASE ===')
        const tasksToInsert = tasks.map(task => ({
            user_id,
            title: task.task,
            description: task.motivation,
            priority: task.priority,
            status: 'pending' as const,
            source_thought_id: voiceThoughtId
        }))

        const { data: insertedTasks, error: tasksError } = await supabase
            .from('tasks')
            .insert(tasksToInsert)
            .select()

        if (tasksError) {
            console.error('Tasks insert error:', tasksError)
            return new Response(
                JSON.stringify({ error: 'Failed to save tasks', details: tasksError }),
                {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                }
            )
        }

        console.log('Tasks inserted successfully:', insertedTasks)
        console.log('Number of inserted tasks:', insertedTasks?.length)
        console.log('First task ID type:', typeof insertedTasks?.[0]?.id)
        console.log('First task ID value:', insertedTasks?.[0]?.id)

        // Step 5: Update voice thought as processed
        const { error: updateError } = await supabase
            .from('voice_thoughts')
            .update({ processed: true })
            .eq('id', voiceThoughtId)

        if (updateError) {
            console.error('Voice thought update error:', updateError)
            // Don't fail the entire operation for this
        }

        // Step 6: Map inserted tasks to response format with database IDs
        const responseTasks = (insertedTasks || []).map(dbTask => {
            console.log('Mapping task - DB ID:', dbTask.id, 'Title:', dbTask.title)
            return {
                id: dbTask.id, // Use database-generated UUID
                task: dbTask.title,
                motivation: dbTask.description || '',
                priority: dbTask.priority
            }
        })

        console.log('Response tasks with UUIDs:', responseTasks.map(t => ({ id: t.id, task: t.task })))

        // Step 7: Return success response
        const response: ProcessVoiceResponse = {
            success: true,
            tasks: responseTasks, // Return tasks with real database IDs
            transcript: transcript,
            voice_thought_id: voiceThoughtId,
            message: `Successfully processed voice input and created ${tasks.length} task(s)`
        }

        console.log('=== PROCESS VOICE SUCCESS ===')
        return new Response(
            JSON.stringify(response),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )

    } catch (error) {
        console.error('Process voice error:', error)
        return new Response(
            JSON.stringify({
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        )
    }
})
