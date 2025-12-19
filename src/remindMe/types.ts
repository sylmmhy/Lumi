export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface Task {
  id: string
  text: string
  time: string // HH:mm format (24h)
  displayTime: string // Formatted 12h with am/pm
  date?: string // ISO date string (YYYY-MM-DD), defaults to today
  completed: boolean
  type: 'todo' | 'routine' | 'routine_instance'
  category?: 'morning' | 'afternoon' | 'evening'
  called: boolean // Has the reminder call been triggered?

  // Recurrence fields for routine tasks
  isRecurring?: boolean
  recurrencePattern?: RecurrencePattern
  recurrenceDays?: number[] // For weekly: [0,1,2,3,4,5,6] (0=Sunday, 6=Saturday)
  recurrenceEndDate?: string // ISO date string for when recurring task should end
  /**
   * 创建任务时记录的时区（IANA 字符串，例如 "Asia/Shanghai"），为空时后端或客户端可回退到设备时区。
   */
  timezone?: string | null
  /**
   * 对于 routine_instance，指向父 routine 模板的 ID
   */
  parentRoutineId?: string | null
}

export const TaskType = {
  TODO: 'todo',
  ROUTINE: 'routine',
  ROUTINE_INSTANCE: 'routine_instance',
} as const

export type TaskType = (typeof TaskType)[keyof typeof TaskType]

export interface AISuggestion {
  time: string
  reason: string
}
