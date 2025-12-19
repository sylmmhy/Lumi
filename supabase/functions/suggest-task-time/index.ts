import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { GoogleGenAI } from 'https://esm.sh/@google/genai'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const apiKey = Deno.env.get('GEMINI_API_KEY')
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set')
        }

        const { taskDescription, existingTasks } = await req.json()

        if (!taskDescription) {
            return new Response(
                JSON.stringify({ error: 'taskDescription is required' }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                }
            )
        }

        const ai = new GoogleGenAI({ apiKey })
        const now = new Date()
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

        const scheduleContext = existingTasks && existingTasks.length > 0
            ? JSON.stringify(existingTasks)
            : 'No tasks scheduled yet.'

        const prompt = `
      Current Time: ${currentTime}
      Existing Schedule: ${scheduleContext}
      New Task to Schedule: "${taskDescription}"

      Your Goal: Suggest the BEST time (HH:MM 24h format) for this new task.

      Rules:
      1. **Semantic Logic**: Understand what the task is. 
         - "Sleep" should be late night (e.g., 22:00-23:30). 
         - "Wake up" should be morning (e.g., 06:00-09:00).
         - "Lunch" is around 12:00-13:30.
         - "Gym" is usually morning or evening.
      2. **Waking Hours**: Unless the task specifically implies night (like "sleep"), schedule between 07:00 and 22:00.
      3. **Avoid Conflicts**: Do not pick a time that is exactly the same as an existing task. Try to leave at least 30 minutes gap if possible.
      4. **Logic**: If the text implies a sequence (e.g., "brush teeth" after "wake up"), try to find the "wake up" task time and add 10 mins.
      5. Return ONLY a JSON object.
    `

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp', // Updated to match useGeminiLive.ts or use stable
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        time: { type: 'STRING', description: 'HH:MM 24-hour format' },
                        reason: { type: 'STRING', description: 'Short explanation why this time was picked' },
                    },
                    required: ['time', 'reason'],
                },
                systemInstruction: 'You are an expert personal scheduler. You are logical, avoid double-booking, and understand human daily rhythms.',
            },
        })

        const text = response.text()
        if (!text) throw new Error('No response from AI')

        const result = JSON.parse(text)

        return new Response(
            JSON.stringify(result),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        )
    } catch (error) {
        console.error('Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            }
        )
    }
})
