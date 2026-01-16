import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Virtual Messages for Onboarding
 *
 * These messages are sent to the AI to trigger "proactive" responses
 * but are not displayed in the UI, creating the illusion that the AI
 * is speaking spontaneously.
 *
 * Key principle: Include "what you see" prompts to ensure AI references
 * the current video context.
 *
 * Migrated from frontend (src/components/onboarding/virtualMessages.ts)
 * as part of Phase 2.2 security hardening.
 */

const VIRTUAL_MESSAGES = {
  // Timed encouragement (every 30s when focused)
  // CRITICAL: AI must observe ACTUAL environment, not guess based on task
  // Design: Trigger proactive check-ins that guide AI to give advice based on observation
  // WITHOUT asking "what do you see" (which makes AI say "I see you...")
  encouragement_focused: [
    "Check in on me and give me a nudge if I need it.",
    "Time's passing - help me stay on track based on how I'm doing.",
    "Give me some encouragement or a reality check, whatever I need right now.",
    "It's been a bit - check on my progress and help me out.",
    "Hey, give me some support based on how things are going.",
    "Time for a check-in - encourage or redirect me as needed.",
    "We've been at this for a while - give me a boost or a push.",
  ],

  // General check-in (for monitoring)
  // Enhanced: Honest observation first, then contextual response
  status_check: [
    "What do you honestly see me doing right now? Does it match the task we discussed?",
    "Check on me truthfully. Am I focused on the task, or did I get distracted?",
    "Observe my current state. Am I working on what I said I'd do, or did I pause?",
    "Look at me now. Am I doing the task, taking a break, or doing something else entirely?",
    "Honest observation: What's happening on my end right now? Am I on task or off task?",
    "Check in: Based on what you actually see (not assume), how am I doing with the task?",
  ],
};

/**
 * Get a random message from a category
 */
function getRandomVirtualMessage(
  category: keyof typeof VIRTUAL_MESSAGES
): string {
  const messages = VIRTUAL_MESSAGES[category];
  const randomIndex = Math.floor(Math.random() * messages.length);
  return messages[randomIndex];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { category } = await req.json()

    // Validate input
    if (!category || typeof category !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid category parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate category exists
    if (!(category in VIRTUAL_MESSAGES)) {
      return new Response(
        JSON.stringify({ error: `Invalid category: ${category}. Valid categories: ${Object.keys(VIRTUAL_MESSAGES).join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate virtual message
    const virtualMessage = getRandomVirtualMessage(category as keyof typeof VIRTUAL_MESSAGES)

    return new Response(
      JSON.stringify({ virtualMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
