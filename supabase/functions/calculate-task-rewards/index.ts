import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Calculate Task Completion Rewards
 *
 * Reward Formula:
 * - Base Reward: 200 coins (for completing any task)
 * - Time Bonus: 1 coin per second remaining
 * - Total = 200 + remainingTime
 *
 * Migrated from frontend (src/components/pages/OnboardingPage.tsx Line 346-349)
 * as part of Phase 2.3 security hardening.
 */

const BASE_COINS = 200
const MAX_REMAINING_TIME = 3600 // 60 minutes max (防止恶意篡改)

/**
 * Calculate reward coins based on task completion
 */
function calculateReward(remainingTime: number): number {
  // Validate remaining time is non-negative
  if (remainingTime < 0) {
    return BASE_COINS // Return base coins if invalid
  }

  // Cap at maximum to prevent cheating
  const cappedTime = Math.min(remainingTime, MAX_REMAINING_TIME)

  // Calculate total coins
  const bonusCoins = Math.floor(cappedTime) // Ensure integer
  const totalCoins = BASE_COINS + bonusCoins

  return totalCoins
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { remainingTime } = await req.json()

    // Validate input
    if (remainingTime === undefined || remainingTime === null) {
      return new Response(
        JSON.stringify({ error: 'Missing remainingTime parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate remainingTime is a number
    if (typeof remainingTime !== 'number' || isNaN(remainingTime)) {
      return new Response(
        JSON.stringify({ error: 'remainingTime must be a valid number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate coins
    const coins = calculateReward(remainingTime)

    return new Response(
      JSON.stringify({ coins }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
