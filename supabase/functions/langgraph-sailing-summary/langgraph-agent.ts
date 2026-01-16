import type { DriftEvent, SummaryOutput, LangGraphInput, TimelineEvent } from './types.ts'

/**
 * LangGraph-inspired workflow for generating sailing summaries
 *
 * Workflow steps:
 * 1. Group drift events into activity periods
 * 2. Analyze each period with LLM (using Gemini)
 * 3. Generate timeline summary
 * 4. Generate task breakdown
 * 5. Generate encouragement message
 */

interface ActivityPeriod {
  startTime: string
  endTime: string
  events: DriftEvent[]
  isIdle: boolean
}

// Node 1: Group events into activity periods with smart idle handling
function groupIntoActivityPeriods(events: DriftEvent[]): ActivityPeriod[] {
  if (events.length === 0) return []

  const periods: ActivityPeriod[] = []
  let currentTask: string | null = null
  let currentPeriodStart: string | null = null
  let currentPeriodEvents: DriftEvent[] = []
  let consecutiveIdleCount = 0
  let pendingIdleEvents: DriftEvent[] = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const isIdle = event.is_idle === true
    const hasTask = event.actual_task && event.actual_task.trim().length > 0

    if (isIdle) {
      // Idle event - accumulate it
      consecutiveIdleCount++
      pendingIdleEvents.push(event)
    } else if (hasTask) {
      // Active event with a task

      // First, handle any pending idle events
      if (pendingIdleEvents.length > 0) {
        if (consecutiveIdleCount < 5) {
          // Short idle period (<5 min): merge into previous task
          if (currentPeriodEvents.length > 0) {
            currentPeriodEvents.push(...pendingIdleEvents)
          } else {
            // No previous task, create idle period
            periods.push({
              startTime: pendingIdleEvents[0].created_at,
              endTime: pendingIdleEvents[pendingIdleEvents.length - 1].created_at,
              events: pendingIdleEvents,
              isIdle: true
            })
          }
        } else {
          // Long idle period (>=5 min): create separate distraction period

          // Close current task period if exists
          if (currentPeriodEvents.length > 0) {
            periods.push({
              startTime: currentPeriodStart!,
              endTime: currentPeriodEvents[currentPeriodEvents.length - 1].created_at,
              events: currentPeriodEvents,
              isIdle: false
            })
            currentPeriodEvents = []
          }

          // Create idle/distraction period
          periods.push({
            startTime: pendingIdleEvents[0].created_at,
            endTime: pendingIdleEvents[pendingIdleEvents.length - 1].created_at,
            events: pendingIdleEvents,
            isIdle: true
          })
        }

        pendingIdleEvents = []
        consecutiveIdleCount = 0
      }

      // Check if we need to start a new task period
      if (currentTask !== event.actual_task) {
        // Task changed - close previous period
        if (currentPeriodEvents.length > 0) {
          periods.push({
            startTime: currentPeriodStart!,
            endTime: currentPeriodEvents[currentPeriodEvents.length - 1].created_at,
            events: currentPeriodEvents,
            isIdle: false
          })
        }

        // Start new task period
        currentTask = event.actual_task
        currentPeriodStart = event.created_at
        currentPeriodEvents = [event]
      } else {
        // Same task - continue current period
        currentPeriodEvents.push(event)
      }
    } else {
      // Event with is_idle: null or false but no actual_task
      // Treat as idle
      consecutiveIdleCount++
      pendingIdleEvents.push(event)
    }
  }

  // Handle remaining events at the end
  if (pendingIdleEvents.length > 0) {
    if (consecutiveIdleCount < 5 && currentPeriodEvents.length > 0) {
      // Merge short idle into current task
      currentPeriodEvents.push(...pendingIdleEvents)
    } else {
      // Close current task if exists
      if (currentPeriodEvents.length > 0) {
        periods.push({
          startTime: currentPeriodStart!,
          endTime: currentPeriodEvents[currentPeriodEvents.length - 1].created_at,
          events: currentPeriodEvents,
          isIdle: false
        })
        currentPeriodEvents = []
      }

      // Create final idle period
      periods.push({
        startTime: pendingIdleEvents[0].created_at,
        endTime: pendingIdleEvents[pendingIdleEvents.length - 1].created_at,
        events: pendingIdleEvents,
        isIdle: true
      })
    }
  } else if (currentPeriodEvents.length > 0) {
    // Close final task period
    periods.push({
      startTime: currentPeriodStart!,
      endTime: currentPeriodEvents[currentPeriodEvents.length - 1].created_at,
      events: currentPeriodEvents,
      isIdle: false
    })
  }

  return periods
}

// Node 2: Analyze activity periods with LLM
async function analyzeActivityPeriods(
  periods: ActivityPeriod[],
  userGoal: string
): Promise<TimelineEvent[]> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

  if (!geminiApiKey) {
    console.warn('[langgraph] No Gemini API key, using fallback analysis')
    return periods.map(period => ({
      start_time: period.startTime,
      end_time: period.endTime,
      activity_description: generateFallbackDescription(period)
    }))
  }

  const timeline: TimelineEvent[] = []

  for (const period of periods) {
    const description = await analyzePeriodWithLLM(period, userGoal, geminiApiKey)
    timeline.push({
      start_time: period.startTime,
      end_time: period.endTime,
      activity_description: description
    })
  }

  return timeline
}

// Helper: Analyze a single period with LLM
async function analyzePeriodWithLLM(
  period: ActivityPeriod,
  userGoal: string,
  apiKey: string
): Promise<string> {
  if (period.isIdle) {
    // Calculate duration in minutes
    const start = new Date(period.startTime).getTime()
    const end = new Date(period.endTime).getTime()
    const durationMinutes = Math.round((end - start) / (1000 * 60))

    if (durationMinutes >= 5) {
      return `分心/离开 (${durationMinutes} 分钟无活动)`
    } else {
      return 'Idle period (no activity detected)'
    }
  }

  const tasks = period.events
    .map(e => e.actual_task)
    .filter(t => t && t.trim().length > 0)
    .filter((t, i, arr) => arr.indexOf(t) === i) // unique

  if (tasks.length === 0) {
    return 'Working session (details unavailable)'
  }

  // Use Gemini REST API to summarize the activity
  const prompt = `You are analyzing a user's work session. The user's goal is: "${userGoal}".

During this time period, the user worked on the following tasks:
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Provide a concise, single-line summary (max 100 characters) of what the user accomplished during this period. Focus on the main activity.

Example outputs:
- "Working on Heartbeat monitoring and user feedback prioritization"
- "Reading technical documentation on ChatGPT and structured output"
- "Debugging and testing session summary feature"

Summary:`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 100
          }
        })
      }
    )

    if (!response.ok) {
      console.error('[langgraph] Gemini API error:', await response.text())
      return tasks[0]
    }

    const data = await response.json()
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    return summary || tasks[0]
  } catch (error) {
    console.error('[langgraph] Error calling Gemini:', error)
    return tasks[0]
  }
}

// Helper: Generate fallback description without LLM
function generateFallbackDescription(period: ActivityPeriod): string {
  if (period.isIdle) {
    // Calculate duration in minutes
    const start = new Date(period.startTime).getTime()
    const end = new Date(period.endTime).getTime()
    const durationMinutes = Math.round((end - start) / (1000 * 60))

    if (durationMinutes >= 5) {
      return `分心/离开 (${durationMinutes} 分钟无活动)`
    } else {
      return 'Idle period (no activity detected)'
    }
  }

  const tasks = period.events
    .map(e => e.actual_task)
    .filter(t => t && t.trim().length > 0)
    .filter((t, i, arr) => arr.indexOf(t) === i)

  if (tasks.length === 0) {
    return 'Working session'
  }

  if (tasks.length === 1) {
    return tasks[0]
  }

  return tasks[0] // Return first task as summary
}

// Node 3: Generate task breakdown
async function generateTaskBreakdown(
  periods: ActivityPeriod[],
  geminiApiKey: string | undefined
): Promise<string> {
  const workPeriods = periods.filter(p => !p.isIdle)

  if (workPeriods.length === 0) {
    return 'No productive time recorded'
  }

  // Calculate time spent on each unique task
  const taskTimeMap = new Map<string, number>()

  for (const period of workPeriods) {
    const start = new Date(period.startTime).getTime()
    const end = new Date(period.endTime).getTime()
    const durationMinutes = (end - start) / (1000 * 60)

    // Get all unique tasks in this period
    const tasks = period.events
      .map(e => e.actual_task)
      .filter(t => t && t.trim().length > 0)
      .filter((t, i, arr) => arr.indexOf(t) === i)

    if (tasks.length > 0) {
      // If multiple tasks in one period, split time equally
      const timePerTask = durationMinutes / tasks.length

      for (const task of tasks) {
        const currentTime = taskTimeMap.get(task) || 0
        taskTimeMap.set(task, currentTime + timePerTask)
      }
    }
  }

  // Calculate total productive time
  const totalMinutes = Array.from(taskTimeMap.values()).reduce((a, b) => a + b, 0)

  if (taskTimeMap.size === 0) {
    return `⚡ Total productive time: ${Math.round(totalMinutes)} min`
  }

  // Format breakdown with proper line breaks
  const taskLines: string[] = []
  for (const [task, minutes] of taskTimeMap.entries()) {
    taskLines.push(`• ${task}: ${Math.round(minutes)} 分钟`)
  }

  return taskLines.join('\n') + `\n\n⚡ 总计生产时间: ${Math.round(totalMinutes)} 分钟`
}

// Node 4: Generate encouragement message
async function generateEncouragement(
  timeline: TimelineEvent[],
  taskBreakdown: string,
  userGoal: string,
  geminiApiKey: string | undefined
): Promise<string> {
  if (!geminiApiKey) {
    return 'Great work on your session! Keep up the momentum.'
  }

  const prompt = `You are an encouraging AI coach. The user's goal is: "${userGoal}".

They just completed a work session with these activities:
${timeline.map(t => `- ${t.activity_description}`).join('\n')}

${taskBreakdown}

Write a brief, personalized encouragement message (max 2 sentences, ~50 words). Be specific about what they accomplished and encourage their progress towards their goal.

Message:`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 100
          }
        })
      }
    )

    if (!response.ok) {
      console.error('[langgraph] Gemini API error:', await response.text())
      return 'Great work on your session! Keep making progress towards your goals.'
    }

    const data = await response.json()
    const message = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    return message || 'Great work on your session! Keep making progress towards your goals.'
  } catch (error) {
    console.error('[langgraph] Error calling Gemini:', error)
    return 'Great work on your session! Keep making progress towards your goals.'
  }
}

// Main workflow orchestrator
export async function runLangGraphWorkflow(input: LangGraphInput): Promise<SummaryOutput> {
  const { driftEvents, userGoal } = input

  console.log('[langgraph] 🚀 Workflow starting', {
    eventCount: driftEvents.length,
    userGoalLength: userGoal?.length || 0
  })

  try {
    // Check Gemini API key
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    console.log('[langgraph] 🔑 API Key check', {
      hasGeminiKey: !!geminiApiKey,
      keyLength: geminiApiKey?.length || 0,
      keyPrefix: geminiApiKey ? geminiApiKey.substring(0, 10) + '...' : 'MISSING'
    })

    // Node 1: Group events
    console.log('[langgraph] 📦 Node 1: Grouping events into activity periods')
    let periods: ActivityPeriod[]
    try {
      periods = groupIntoActivityPeriods(driftEvents)
      console.log('[langgraph] ✅ Node 1 complete', {
        periodCount: periods.length,
        workPeriods: periods.filter(p => !p.isIdle).length,
        idlePeriods: periods.filter(p => p.isIdle).length
      })
    } catch (error) {
      console.error('[langgraph] ❌ Node 1 FAILED', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw new Error(`Failed to group events: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Node 2: Analyze periods
    console.log('[langgraph] 🤖 Node 2: Analyzing activity periods with LLM')
    let timeline: TimelineEvent[]
    try {
      timeline = await analyzeActivityPeriods(periods, userGoal)
      console.log('[langgraph] ✅ Node 2 complete', {
        timelineEvents: timeline.length,
        sampleEvent: timeline.length > 0 ? {
          start: timeline[0].start_time,
          description: timeline[0].activity_description.substring(0, 50) + '...'
        } : null
      })
    } catch (error) {
      console.error('[langgraph] ❌ Node 2 FAILED', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw new Error(`Failed to analyze periods: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Node 3: Generate task breakdown
    console.log('[langgraph] 📊 Node 3: Generating task breakdown')
    let taskBreakdown: string
    try {
      taskBreakdown = await generateTaskBreakdown(periods, geminiApiKey)
      console.log('[langgraph] ✅ Node 3 complete', {
        breakdownLength: taskBreakdown.length,
        breakdownPreview: taskBreakdown.substring(0, 100) + '...'
      })
    } catch (error) {
      console.error('[langgraph] ❌ Node 3 FAILED', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw new Error(`Failed to generate task breakdown: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Node 4: Generate encouragement
    console.log('[langgraph] 💪 Node 4: Generating encouragement message')
    let encourageWords: string
    try {
      encourageWords = await generateEncouragement(timeline, taskBreakdown, userGoal, geminiApiKey)
      console.log('[langgraph] ✅ Node 4 complete', {
        encouragementLength: encourageWords.length,
        encouragementPreview: encourageWords.substring(0, 100) + '...'
      })
    } catch (error) {
      console.error('[langgraph] ❌ Node 4 FAILED', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw new Error(`Failed to generate encouragement: ${error instanceof Error ? error.message : String(error)}`)
    }

    console.log('[langgraph] 🎉 Workflow complete successfully')

    const result = {
      timeline_summary: timeline,
      task_breakdown: taskBreakdown,
      encourage_words: encourageWords
    }

    console.log('[langgraph] 📤 Final result structure', {
      hasTimeline: Array.isArray(result.timeline_summary),
      timelineLength: result.timeline_summary.length,
      hasTaskBreakdown: !!result.task_breakdown,
      taskBreakdownLength: result.task_breakdown.length,
      hasEncouragement: !!result.encourage_words,
      encouragementLength: result.encourage_words.length
    })

    return result

  } catch (error) {
    console.error('[langgraph] 💥 FATAL ERROR in workflow', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
}
