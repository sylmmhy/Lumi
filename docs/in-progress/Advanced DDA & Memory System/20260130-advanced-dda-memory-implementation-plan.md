# Implementation Plan: Advanced DDA & Memory System

> **Created**: 2026-01-30
> **Author**: Leo
> **Status**: Planning
> **Related**: [记忆和动态难度Leo+gxm](./记忆和动态难度Leo+gxm%202f5670f56479808ba387e53f66d8d45c.md)

---

## Overview

Implement the remaining TODO items from 记忆和动态难度Leo+gxm with SOTA architecture, focusing on performance (<500ms edge functions) and incremental rollout.

**Core Philosophy**: Transform from **reactive binary system** to **proactive contextual system**.

---

## Team Notes (Do Not Forget)

1. **Feature Flags Location**
   - Local Edge Functions read from `Lumi-supabase/supabase/.env.local`.
   - Cloud/Prod flags are configured in Supabase Dashboard:
     Project Settings → Edge Functions → Environment Variables.
   - Flags used in this plan:
     `FF_COMFORT_ZONE`, `FF_DYNAMIC_ADJ`, `FF_MORNING_FORECAST`, `FF_DETECTIVE_MODE`, `FF_TWO_MINUTE`.

2. **Final Report**
   - A final implementation report must be written (pending).
   - Suggested location: `Lumi/docs/implementation-log/` with date prefix.

---

## Current State vs Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Targets | Fixed time (e.g., 23:00) | Range (e.g., 22:45-23:15) |
| Adjustment | Fixed ±15 min | Gap-based (30% of remaining gap) |
| Trigger | After success/failure | Proactive (morning forecast) |
| Evaluation | Binary pass/fail | Within comfort zone |
| Attribution | None | Detective mode + surprise score |
| Beginner Support | None | Two-minute rule |
| Session Data | Basic completion | Termination reason, stress, process |

---

## Phase 1: Session Analytics Foundation (Priority: CRITICAL)

### Goal
Capture termination reasons, stress indicators, and process data for all downstream features.

### Database Migration: `20260131100000_session_analytics.sql`

```sql
-- Session termination and process tracking
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS termination_reason TEXT,
  ADD COLUMN IF NOT EXISTS stress_indicators JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS process_metrics JSONB DEFAULT '{}';

-- Termination reason values:
-- completed | user_quit | timeout | user_frustrated | external_interruption | error

-- stress_indicators structure:
-- {
--   "initial_stress": 0.3,
--   "peak_stress": 0.7,
--   "final_stress": 0.2,
--   "resistance_count": 2,
--   "tone_switches": ["friendly", "direct"]
-- }

-- process_metrics structure:
-- {
--   "turn_count": 15,
--   "time_to_first_action": 45,
--   "breakthrough_moment": "02:30",
--   "engagement_score": 0.75
-- }
```

### Frontend Changes

**File**: `src/hooks/useAICoachSession.ts`

1. Add `sessionAnalyticsRef` to track metrics:
```typescript
interface SessionAnalytics {
  terminationReason: TerminationReason | null;
  stressLevel: number;  // 0-1, computed from toneManager
  resistanceCount: number;
  toneHistory: ToneStyle[];
  breakthroughMoment: number | null;
}

const sessionAnalyticsRef = useRef<SessionAnalytics>({
  terminationReason: null,
  stressLevel: 0,
  resistanceCount: 0,
  toneHistory: ['friendly'],
  breakthroughMoment: null,
});
```

2. Modify `endSession()` to accept reason and persist:
```typescript
type TerminationReason =
  | 'completed'
  | 'user_quit'
  | 'timeout'
  | 'user_frustrated'
  | 'external_interruption'
  | 'error';

const endSession = useCallback((reason: TerminationReason = 'completed') => {
  sessionAnalyticsRef.current.terminationReason = reason;

  // Fire-and-forget to session-analytics edge function
  void supabase.functions.invoke('session-analytics', {
    body: {
      sessionId: currentSessionIdRef.current,
      userId: currentUserIdRef.current,
      terminationReason: reason,
      stressIndicators: {
        resistance_count: sessionAnalyticsRef.current.resistanceCount,
        tone_switches: sessionAnalyticsRef.current.toneHistory,
        final_stress: sessionAnalyticsRef.current.stressLevel,
      },
      processMetrics: {
        turn_count: state.messages.length,
        breakthrough_moment: sessionAnalyticsRef.current.breakthroughMoment,
      },
    }
  });

  cleanup();
}, [cleanup, state.messages.length]);
```

3. Add termination detection hooks:
   - User clicks "End" → `user_quit`
   - Timer reaches 0 → `completed`
   - High resistance (3+) + early exit → `user_frustrated`
   - Network error → `error`

### Edge Function: `session-analytics/index.ts` (NEW)

**Location**: `supabase/functions/session-analytics/index.ts`

```typescript
/**
 * Session Analytics - Async fire-and-forget
 * Persists session termination and process data
 *
 * Performance: <100ms acknowledgment (async processing)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const payload = await req.json();

  // Immediately acknowledge - don't make client wait
  const response = new Response(
    JSON.stringify({ acknowledged: true }),
    { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );

  // Process in background
  EdgeRuntime.waitUntil(processAnalytics(payload));

  return response;
});

async function processAnalytics(payload: SessionAnalyticsPayload): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  await supabase
    .from('chat_sessions')
    .update({
      termination_reason: payload.terminationReason,
      stress_indicators: payload.stressIndicators,
      process_metrics: payload.processMetrics,
    })
    .eq('id', payload.sessionId);
}
```

---

## Phase 2: Comfort Zone System (Priority: HIGH)

### Goal
Replace fixed time targets with elastic ranges to reduce "all-or-nothing" psychology.

### Database Migration: `20260131110000_comfort_zone.sql`

```sql
-- Transform fixed targets to ranges
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS target_time_earliest TIME,
  ADD COLUMN IF NOT EXISTS target_time_latest TIME,
  ADD COLUMN IF NOT EXISTS comfort_zone_minutes INTEGER DEFAULT 30;

-- comfort_zone_minutes defines the range width
-- Example: target 23:00 with zone 30 → range 22:45-23:15
-- As user improves, zone shrinks (more precision required)

-- Add dynamic adjustment tracking
ALTER TABLE public.goal_adjustment_history
  ADD COLUMN IF NOT EXISTS gap_percentage FLOAT,
  ADD COLUMN IF NOT EXISTS context_factors JSONB DEFAULT '{}';

-- context_factors structure:
-- {
--   "recent_success_rate": 0.7,
--   "streak_momentum": 0.8,
--   "mood_factor": 1.0
-- }
```

### Backend Changes

**File**: `supabase/functions/daily-goal-adjustment/index.ts`

1. Replace `calculateNewTime()` with gap-based algorithm:

```typescript
// BEFORE (line 72-85): Fixed 15-min adjustment
function calculateNewTime(currentTime, stepMinutes, direction, goalType) {
  // Fixed step...
}

// AFTER: Dynamic gap-based adjustment
interface AdjustmentContext {
  recentSuccessRate: number;  // 0-1
  currentStreak: number;
  lastMood?: string;
}

function calculateDynamicAdjustment(
  goal: Goal,
  direction: 'advance' | 'retreat',
  context: AdjustmentContext
): { newTime: string; actualStep: number } {
  // 1. Calculate gap to ultimate target
  const currentMinutes = timeToMinutes(goal.current_target_time);
  const ultimateMinutes = timeToMinutes(goal.ultimate_target_time);
  const gapMinutes = Math.abs(currentMinutes - ultimateMinutes);

  // 2. Base step = 30% of gap (never more than 30 min)
  let baseStep = Math.min(Math.round(gapMinutes * 0.3), 30);

  // 3. Apply context multipliers
  let multiplier = 1.0;
  if (context.recentSuccessRate > 0.7) multiplier *= 1.1;  // High performer
  if (context.currentStreak > 5) multiplier *= 1.1;       // Strong momentum
  if (context.lastMood === 'proud') multiplier *= 1.05;   // Positive reinforcement

  // 4. Retreat is more conservative (don't undo progress too fast)
  if (direction === 'retreat') {
    multiplier *= 0.7;  // Only retreat 70% of what we'd advance
  }

  const finalStep = Math.round(baseStep * multiplier);

  // 5. Respect comfort zone bounds
  const zoneBound = goal.comfort_zone_minutes || 30;
  const cappedStep = Math.min(finalStep, zoneBound);

  return {
    newTime: applyStep(goal.current_target_time, cappedStep, direction),
    actualStep: cappedStep,
  };
}
```

2. Evaluate success within zone (not exact time):

```typescript
// BEFORE: Binary check
const completedYesterday = entry?.completed === true;

// AFTER: Zone-aware check
function isWithinComfortZone(
  actualTime: string,
  targetEarliest: string,
  targetLatest: string
): boolean {
  const actual = timeToMinutes(actualTime);
  const earliest = timeToMinutes(targetEarliest);
  const latest = timeToMinutes(targetLatest);
  return actual >= earliest && actual <= latest;
}

const completedYesterday = entry?.completed === true ||
  (entry?.actual_time && isWithinComfortZone(
    entry.actual_time,
    goal.target_time_earliest || minutesToTime(timeToMinutes(goal.current_target_time) - 15),
    goal.target_time_latest || minutesToTime(timeToMinutes(goal.current_target_time) + 15)
  ));
```

### Frontend Hook: `src/hooks/useComfortZone.ts` (NEW)

```typescript
interface ComfortZoneState {
  targetRange: { earliest: string; latest: string };
  currentTarget: string;
  isWithinZone: boolean;
  progressToUltimate: number;  // 0-1
}

export function useComfortZone(goalId: string) {
  const [state, setState] = useState<ComfortZoneState | null>(null);

  useEffect(() => {
    // Fetch goal with comfort zone data
    async function fetchGoal() {
      const { data } = await supabase
        .from('goals')
        .select('current_target_time, target_time_earliest, target_time_latest, ultimate_target_time, baseline_time')
        .eq('id', goalId)
        .single();

      if (data) {
        const current = timeToMinutes(data.current_target_time);
        const ultimate = timeToMinutes(data.ultimate_target_time);
        const baseline = timeToMinutes(data.baseline_time);

        setState({
          targetRange: {
            earliest: data.target_time_earliest || data.current_target_time,
            latest: data.target_time_latest || data.current_target_time,
          },
          currentTarget: data.current_target_time,
          isWithinZone: false,  // Updated when actual time known
          progressToUltimate: (baseline - current) / (baseline - ultimate),
        });
      }
    }
    fetchGoal();
  }, [goalId]);

  const checkIfWithinZone = useCallback((actualTime: string) => {
    if (!state) return false;
    const actual = timeToMinutes(actualTime);
    const earliest = timeToMinutes(state.targetRange.earliest);
    const latest = timeToMinutes(state.targetRange.latest);
    return actual >= earliest && actual <= latest;
  }, [state]);

  return { state, checkIfWithinZone };
}
```

---

## Phase 3: Morning Forecast (Priority: HIGH)

### Goal
Proactively adjust targets based on context BEFORE the day starts.

### Edge Function: `morning-forecast/index.ts` (NEW)

**Location**: `supabase/functions/morning-forecast/index.ts`

**Trigger**: Cron at 6:00 AM (same schedule as daily-goal-adjustment)

```typescript
/**
 * Morning Forecast - Context-aware daily adjustments
 *
 * Runs at user wake time to set optimal daily targets
 * Based on: recent performance, mood patterns, streaks
 *
 * Performance target: <300ms
 */

interface ForecastContext {
  recentEntries: GoalEntry[];  // Last 7 days
  currentStreak: number;
  recentMoods: string[];       // From tasks.completion_mood
  comfortZone: { earliest: string; latest: string };
}

interface ForecastResult {
  adjustedTarget: string;
  adjustmentReason: string;
  confidenceScore: number;
  suggestedTinyStep: string;  // Two-minute rule micro-action
  motivationalMessage: string;
}

async function generateForecast(
  goal: Goal,
  context: ForecastContext
): Promise<ForecastResult> {
  // 1. Calculate base adjustment from gap
  const gapMinutes = Math.abs(
    timeToMinutes(goal.current_target_time) -
    timeToMinutes(goal.ultimate_target_time)
  );
  const baseStep = Math.round(gapMinutes * 0.3);

  // 2. Apply context multipliers
  const recentSuccessRate = context.recentEntries.filter(e => e.completed).length /
    context.recentEntries.length;

  let multiplier = 1.0;
  if (recentSuccessRate > 0.8) multiplier *= 1.15;      // Crushing it
  else if (recentSuccessRate < 0.4) multiplier *= 0.7;  // Struggling

  if (context.currentStreak > 5) multiplier *= 1.1;

  const proudCount = context.recentMoods.filter(m => m === 'proud').length;
  if (proudCount > 3) multiplier *= 1.05;

  // 3. Calculate adjusted target
  const adjustedStep = Math.round(baseStep * multiplier);
  const adjustedTarget = minutesToTime(
    timeToMinutes(goal.current_target_time) - adjustedStep
  );

  // 4. Ensure within comfort zone
  const finalTarget = enforceComfortZone(adjustedTarget, context.comfortZone);

  // 5. Generate tiny step (two-minute rule)
  const tinySteps: Record<string, string> = {
    sleep: '把手机放在床头柜上',
    exercise: '穿上运动鞋',
    study: '打开书本/笔记',
  };

  // 6. Generate motivational message based on context
  const message = generateContextualMessage(context, recentSuccessRate);

  return {
    adjustedTarget: finalTarget,
    adjustmentReason: `Based on ${Math.round(recentSuccessRate * 100)}% success rate`,
    confidenceScore: Math.min(0.9, recentSuccessRate + 0.1),
    suggestedTinyStep: tinySteps[goal.goal_type] || '开始第一步',
    motivationalMessage: message,
  };
}

function generateContextualMessage(context: ForecastContext, successRate: number): string {
  if (context.currentStreak > 7) {
    return `连续 ${context.currentStreak} 天了！今天继续保持～`;
  }
  if (successRate > 0.8) {
    return '最近状态很好，今天目标稍微进阶一点！';
  }
  if (successRate < 0.4) {
    return '最近有点难，今天目标放轻松，完成就是胜利';
  }
  return '新的一天，加油！';
}
```

### Integration with Daily Adjustment

Modify `daily-goal-adjustment/index.ts` to call morning-forecast first:

```typescript
// At the start of processGoalAdjustments()
const forecastResults = await Promise.all(
  goals.map(goal => generateForecast(goal, await getContext(goal.user_id, goal.id)))
);

// Use forecast results to inform adjustment decisions
```

---

## Phase 4: Detective Mode & Attribution (Priority: MEDIUM-HIGH)

### Goal
When outcomes are surprising, ask "why" instead of judging.

### Database Migration: `20260131120000_attribution.sql`

```sql
-- Attribution analysis table
CREATE TABLE IF NOT EXISTS public.behavior_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  entry_id UUID REFERENCES public.goal_entries(id) ON DELETE CASCADE,

  -- Outcome
  outcome_type TEXT NOT NULL,  -- 'success' | 'failure' | 'partial'

  -- Surprise score (how unexpected was this outcome?)
  surprise_score FLOAT,  -- 0 = expected, 1 = very surprising

  -- Attribution factors
  hypotheses JSONB DEFAULT '[]',
  -- Structure: [{ "factor": "sleep", "contribution": -0.3, "confidence": 0.7, "evidence": "..." }]

  -- User verification
  user_confirmed BOOLEAN,
  user_explanation TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_attributions_user_goal ON public.behavior_attributions(user_id, goal_id);
CREATE INDEX idx_attributions_surprise ON public.behavior_attributions(surprise_score DESC);

-- Add ATTRIBUTION memory tag support
-- (Already supported by memory system, just need extraction prompt update)
```

### Edge Function: `detective-mode/index.ts` (NEW)

**Location**: `supabase/functions/detective-mode/index.ts`

```typescript
/**
 * Detective Mode - Attribution analysis
 *
 * Calculates surprise score and generates hypotheses
 * for unexpected outcomes
 *
 * Performance target: <500ms
 */

interface DetectiveQuery {
  userId: string;
  goalId: string;
  entryId: string;
  outcome: 'success' | 'failure' | 'partial';
}

interface Hypothesis {
  factor: string;       // "sleep" | "schedule" | "motivation" | "weather" | etc.
  contribution: number; // -1 to 1 (negative = hurt, positive = helped)
  confidence: number;   // 0-1
  evidence: string;     // Supporting data
}

interface DetectiveReport {
  surpriseScore: number;
  hypotheses: Hypothesis[];
  whyQuestions: string[];
  suggestedAction: string;
}

function calculateSurpriseScore(
  predicted: boolean,
  actual: boolean,
  history: GoalEntry[]
): number {
  // Base surprise: 0 if expected, 0.5 if unexpected
  let surprise = predicted === actual ? 0 : 0.5;

  // Calculate recent success rate
  const recentSuccessRate = history.filter(e => e.completed).length / history.length;

  // Unexpected success when usually fails → surprising
  if (actual && recentSuccessRate < 0.3) surprise += 0.3;

  // Unexpected failure when usually succeeds → very surprising
  if (!actual && recentSuccessRate > 0.7) surprise += 0.3;

  // Streak broken → extra surprise
  if (wasOnStreak(history, 3) && !actual) surprise += 0.2;

  return Math.min(1, surprise);
}

function generateHypotheses(
  entry: GoalEntry,
  history: GoalEntry[],
  context: UserContext
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];

  // Time-based patterns
  const dayOfWeek = new Date(entry.entry_date).getDay();
  const daySuccessRate = calculateDaySuccessRate(history, dayOfWeek);
  if (daySuccessRate < 0.5) {
    hypotheses.push({
      factor: 'day_of_week',
      contribution: -0.3,
      confidence: 0.6,
      evidence: `${getDayName(dayOfWeek)}的完成率只有${Math.round(daySuccessRate * 100)}%`,
    });
  }

  // Prediction error analysis
  if (entry.prediction_error_minutes && Math.abs(entry.prediction_error_minutes) > 30) {
    hypotheses.push({
      factor: 'timing',
      contribution: entry.prediction_error_minutes > 0 ? -0.4 : 0.2,
      confidence: 0.8,
      evidence: entry.prediction_error_minutes > 0
        ? `比目标晚了${entry.prediction_error_minutes}分钟`
        : `比目标早了${Math.abs(entry.prediction_error_minutes)}分钟`,
    });
  }

  // Recent mood patterns
  if (context.recentMoods.includes('relieved') && !entry.completed) {
    hypotheses.push({
      factor: 'motivation',
      contribution: -0.2,
      confidence: 0.5,
      evidence: '最近完成任务时感到"松了口气"而非"自豪"',
    });
  }

  return hypotheses.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

function generateWhyQuestions(hypotheses: Hypothesis[]): string[] {
  const questions: string[] = [];

  for (const h of hypotheses.slice(0, 2)) {
    switch (h.factor) {
      case 'day_of_week':
        questions.push('这天通常有什么特别的安排吗？');
        break;
      case 'timing':
        questions.push('是什么让你比平时晚/早了这么多？');
        break;
      case 'motivation':
        questions.push('最近完成任务时的心情怎么样？');
        break;
      default:
        questions.push('你觉得是什么影响了今天的表现？');
    }
  }

  return questions;
}
```

### AI Prompt Integration

**File**: `supabase/functions/_shared/prompts/lumi-system.ts`

Add Co-Interpretation Mode section:

```typescript
const coInterpretationSection = `
------------------------------------------------------------
CO-INTERPRETATION MODE (Ask "Why" Questions)
------------------------------------------------------------
When discussing task outcomes, be a curious detective, not a judge.

GOOD PATTERNS:
- "I noticed yesterday was different from your usual pattern. What was going on?"
- "That's interesting - you usually do well on Tuesdays. What made yesterday different?"
- "Nice! What do you think made today click?"

BAD PATTERNS (AVOID):
- "You failed because you went to bed too late"
- "You need to try harder"
- "Great job! You're so disciplined!"

WHEN SURPRISE SCORE IS HIGH (user did unexpectedly well/poorly):
- Acknowledge the surprise: "Huh, that's not what I expected based on your recent pattern"
- Propose hypotheses gently: "Could it be related to [factor]?"
- Let them explain: "What do you think happened?"

You are helping them understand their own patterns, not judging their performance.
`;

// Add to system instruction builder
function buildSystemInstruction(...) {
  return `
    ${baseInstruction}
    ${memorySection}
    ${goalStatusSection}
    ${coInterpretationSection}  // NEW
    ...
  `;
}
```

### Memory System Integration

Add ATTRIBUTION tag to memory extractor:

**File**: `supabase/functions/memory-extractor/index.ts`

```typescript
// Add to EXTRACTION_PROMPT
const ATTRIBUTION_EXTRACTION = `
**7. ATTRIBUTION INSIGHT** [Tag: ATTRIBUTION]
When user explains why they succeeded or failed, extract the causal factor.
This is GOLD for predicting future success!

Examples:
- "User says they succeeded because they did it immediately after waking"
- "User attributes late sleep to binge-watching a show"
- "User noticed exercising helps them sleep better"
- "User identified phone checking as main distraction"

Format: "User [attributes/notices/identifies] [behavior] [caused by/leads to] [outcome]"
`;
```

---

## Phase 5: Two-Minute Rule (Priority: MEDIUM)

### Goal
For beginners or struggling users, start with trivially easy tasks to build momentum.

### Database Migration: `20260131130000_two_minute_rule.sql`

```sql
-- Add beginner mode fields to goals
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS two_minute_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_minute_duration INTEGER DEFAULT 120,  -- seconds
  ADD COLUMN IF NOT EXISTS graduate_after_streak INTEGER DEFAULT 7,
  ADD COLUMN IF NOT EXISTS difficulty_level INTEGER DEFAULT 1;  -- 1-5

-- Difficulty progression tracking
CREATE TABLE IF NOT EXISTS public.difficulty_progressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  reason TEXT,  -- 'streak_achieved' | 'user_request' | 'consecutive_failure'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_difficulty_goal ON public.difficulty_progressions(goal_id);
```

### Logic Flow

1. **Activation Triggers**:
   - New goal created → Start in two-minute mode
   - 5+ consecutive failures → Auto-activate two-minute mode
   - User requests → Manual activation

2. **Difficulty Levels**:
   - Level 1: 2 minutes (just start)
   - Level 2: 5 minutes
   - Level 3: 10 minutes
   - Level 4: 15 minutes
   - Level 5: Full goal (graduate out of two-minute mode)

3. **Graduation**:
   - After `graduate_after_streak` days (default 7) at current level → Level up
   - After reaching Level 5 with streak → Disable two-minute mode

### Frontend Hook: `src/hooks/useTwoMinuteRule.ts` (NEW)

```typescript
interface TwoMinuteRuleState {
  isActive: boolean;
  currentLevel: 1 | 2 | 3 | 4 | 5;
  suggestedDuration: number;  // seconds
  streakToGraduate: number;
  currentStreak: number;
  tinyStepSuggestion: string;
}

const LEVEL_DURATIONS: Record<number, number> = {
  1: 120,   // 2 min
  2: 300,   // 5 min
  3: 600,   // 10 min
  4: 900,   // 15 min
  5: 0,     // Full goal
};

const TINY_STEPS: Record<string, string[]> = {
  sleep: [
    '把手机放到卧室外',
    '换上睡衣',
    '刷牙洗脸',
    '躺到床上',
    '关灯'
  ],
  exercise: [
    '穿上运动鞋',
    '走出家门',
    '做10个开合跳',
    '走5分钟',
    '完整运动'
  ],
  study: [
    '打开书本',
    '读一段',
    '做一道题',
    '复习笔记',
    '完整学习'
  ],
};

export function useTwoMinuteRule(goalId: string) {
  const [state, setState] = useState<TwoMinuteRuleState | null>(null);

  const checkGraduation = useCallback(async () => {
    if (!state || state.currentStreak < state.streakToGraduate) return false;

    const nextLevel = Math.min(5, state.currentLevel + 1);

    // Update database
    await supabase.from('goals').update({
      difficulty_level: nextLevel,
      two_minute_mode: nextLevel < 5,
    }).eq('id', goalId);

    // Record progression
    await supabase.from('difficulty_progressions').insert({
      goal_id: goalId,
      user_id: currentUserId,
      from_level: state.currentLevel,
      to_level: nextLevel,
      reason: 'streak_achieved',
    });

    return true;
  }, [goalId, state]);

  const activate = useCallback(async () => {
    await supabase.from('goals').update({
      two_minute_mode: true,
      difficulty_level: 1,
    }).eq('id', goalId);
  }, [goalId]);

  return { state, checkGraduation, activate };
}
```

---

## Critical Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/daily-goal-adjustment/index.ts` | MODIFY | Gap-based adjustment + comfort zone |
| `supabase/functions/session-analytics/index.ts` | CREATE | Persist termination & stress data |
| `supabase/functions/morning-forecast/index.ts` | CREATE | Context-aware daily targets |
| `supabase/functions/detective-mode/index.ts` | CREATE | Surprise score + attribution |
| `supabase/functions/_shared/prompts/lumi-system.ts` | MODIFY | Add co-interpretation prompts |
| `supabase/functions/memory-extractor/index.ts` | MODIFY | Add ATTRIBUTION tag |
| `src/hooks/useAICoachSession.ts` | MODIFY | Track termination reason, stress |
| `src/hooks/useComfortZone.ts` | CREATE | Range-based goal UI |
| `src/hooks/useTwoMinuteRule.ts` | CREATE | Beginner mode UI |

---

## Performance Optimizations

### Database Level

1. **Parallel Queries**: Use `Promise.all()` for independent fetches
```typescript
const [context, recentEntries, moodData] = await Promise.all([
  getContext(userId),
  getRecentEntries(goalId, 7),
  getRecentMoods(userId, 7),
]);
```

2. **Composite Indexes**:
```sql
CREATE INDEX idx_goal_entries_analytics
  ON goal_entries(user_id, goal_id, entry_date DESC, completed);

CREATE INDEX idx_sessions_analytics
  ON chat_sessions(user_id, created_at DESC, termination_reason);
```

3. **Materialized View for Patterns**:
```sql
CREATE MATERIALIZED VIEW user_goal_patterns AS
SELECT
  user_id, goal_id,
  AVG(CASE WHEN completed THEN 1 ELSE 0 END) as success_rate,
  STDDEV(prediction_error_minutes) as consistency_score
FROM goal_entries
GROUP BY user_id, goal_id;

-- Refresh nightly with cron
```

### Edge Function Level

1. **Fire-and-Forget Analytics**: Return 202 immediately, process async
```typescript
EdgeRuntime.waitUntil(processAnalytics(payload));
return new Response(JSON.stringify({ acknowledged: true }), { status: 202 });
```

2. **Edge Caching**: Cache context data for 5 minutes
```typescript
const CACHE_TTL = 5 * 60 * 1000;
const contextCache = new Map<string, { data: any; expires: number }>();
```

3. **Response Streaming**: For morning forecast
```typescript
const stream = new TransformStream();
// Send greeting immediately
await writer.write(encode({ type: 'greeting', message: 'Good morning!' }));
// Then send full forecast
await writer.write(encode({ type: 'forecast', ...forecast }));
```

### Frontend Level

1. **Optimistic Updates**: Update UI before server confirms
2. **Lazy Loading**: Load detective mode components only when needed
3. **Debounced Analytics**: Batch stress indicator updates

---

## Feature Flags

Use gradual rollout for safety:

```typescript
const FEATURE_FLAGS = {
  FF_COMFORT_ZONE: Deno.env.get('FF_COMFORT_ZONE') === 'true',
  FF_DETECTIVE_MODE: Deno.env.get('FF_DETECTIVE_MODE') === 'true',
  FF_TWO_MINUTE_RULE: Deno.env.get('FF_TWO_MINUTE') === 'true',
  FF_DYNAMIC_ADJUSTMENT: Deno.env.get('FF_DYNAMIC_ADJ') === 'true',
  FF_MORNING_FORECAST: Deno.env.get('FF_MORNING_FORECAST') === 'true',
};

// Usage
if (FEATURE_FLAGS.FF_COMFORT_ZONE) {
  // New comfort zone logic
} else {
  // Existing fixed target logic
}
```

---

## Verification Strategy

### Phase 1 Verification
```bash
# 1. Start AI coach session
# 2. End session with different methods (complete, early exit, etc.)
# 3. Check database for termination data

SELECT
  termination_reason,
  stress_indicators->'resistance_count' as resistance,
  process_metrics->'turn_count' as turns
FROM chat_sessions
WHERE user_id = '...'
ORDER BY created_at DESC
LIMIT 5;
```

### Phase 2 Verification
```bash
# 1. Create goal with comfort_zone_minutes = 30
# 2. Record completion at target + 10 min (within zone)
# 3. Run daily adjustment
# 4. Verify counted as success

curl -X POST .../daily-goal-adjustment

# Check: consecutive_success should increment
SELECT consecutive_success, current_target_time FROM goals WHERE id = '...';
```

### Phase 3 Verification
```bash
# 1. Create user with 5-day success streak
# 2. Run morning forecast
# 3. Verify adjustment is larger than fixed 15-min

curl -X POST .../morning-forecast -d '{"userId": "...", "goalId": "..."}'

# Expected: adjustedTarget shows gap-based step, not fixed 15 min
```

### Phase 4 Verification
```bash
# 1. Create user with 80% success rate (7 days)
# 2. Record failure
# 3. Check surprise score and hypotheses

SELECT
  surprise_score,
  hypotheses,
  created_at
FROM behavior_attributions
WHERE entry_id = '...';

# Expected: surprise_score > 0.5, hypotheses array non-empty
```

### Phase 5 Verification
```bash
# 1. Create new goal (should start in two-minute mode)
# 2. Complete 7 days in a row
# 3. Verify level progression

SELECT
  two_minute_mode,
  difficulty_level,
  graduate_after_streak
FROM goals WHERE id = '...';

SELECT * FROM difficulty_progressions WHERE goal_id = '...' ORDER BY created_at;
```

---

## Implementation Order

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Phase 1: Session Analytics | Migration, Edge Function, Hook updates |
| 2 | Phase 2: Comfort Zone | Migration, DDA updates, useComfortZone hook |
| 2 | Phase 3: Morning Forecast | Edge Function, Cron integration |
| 3 | Phase 4: Detective Mode | Migration, Edge Function, AI prompts |
| 4 | Phase 5: Two-Minute Rule | Migration, useTwoMinuteRule hook |

---

## Risk Mitigation

1. **Feature Flags**: All new features behind flags, disabled by default
2. **Backward Compatible**: New columns are nullable, existing logic unchanged
3. **Rollback**: Set `FF_*=false` for instant disable
4. **Monitoring**: Log surprise scores and adjustment deltas for tuning
5. **Gradual Rollout**: Enable for 10% → 50% → 100% of users

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Goal completion rate | ~60% | 75% |
| User retention (7-day) | TBD | +15% |
| Session abandonment | TBD | -20% |
| Average streak length | TBD | +50% |
| User-reported frustration | TBD | -30% |
