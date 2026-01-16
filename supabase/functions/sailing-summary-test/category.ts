import type { CategoryConfig } from './types.ts'

const mockSummaryData: Record<string, CategoryConfig> = {
  writing: {
    imageUrls: [
      'https://images.pexels.com/photos/1001682/pexels-photo-1001682.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/261763/pexels-photo-261763.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=800'
    ],
    summaryTemplates: [
      "Today, you sailed {duration} hours toward the continent of your thesis. Along the way, you were easily drawn to social media notifications, spending {distraction_time} minutes on it. If you'd like to dive deeper into your reflections, check out the Seagull's Human Observation Log. Keep it up—the journey itself is the reward!",
      "Your writing voyage lasted {duration} hours today. You navigated through {task_title} with determination, though email distractions pulled you off course for {distraction_time} minutes. The Seagull's Human Observation Log holds deeper insights into your creative process.",
      "A productive {duration}-hour journey through the seas of {task_title}. You showed great focus, with only brief detours to check your phone for {distraction_time} minutes. Your dedication to the writing craft is evident—explore more in the Seagull's Human Observation Log."
    ]
  },
  design: {
    imageUrls: [
      'https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/574071/pexels-photo-574071.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/265087/pexels-photo-265087.jpeg?auto=compress&cs=tinysrgb&w=800'
    ],
    summaryTemplates: [
      "Your design journey spanned {duration} hours today, crafting beautiful interfaces for {task_title}. Creative inspiration led you to browse design galleries for {distraction_time} minutes—sometimes wandering feeds the soul. Dive deeper into your creative process with the Seagull's Human Observation Log.",
      "A {duration}-hour voyage through the realm of {task_title} design. Your artistic vision remained strong, with only {distraction_time} minutes spent exploring color palettes online. The Seagull's Human Observation Log captures more about your creative flow.",
      "Today's {duration}-hour design expedition for {task_title} was filled with innovation. You stayed remarkably focused, with just {distraction_time} minutes of inspiration-seeking on design platforms. Check the Seagull's Human Observation Log for deeper creative insights."
    ]
  },
  learning: {
    imageUrls: [
      'https://images.pexels.com/photos/574071/pexels-photo-574071.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1181298/pexels-photo-1181298.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=800'
    ],
    summaryTemplates: [
      "Your learning voyage lasted {duration} hours, diving deep into {task_title}. Knowledge-seeking led you to explore related tutorials for {distraction_time} minutes—curiosity is a navigator's best friend. The Seagull's Human Observation Log holds more learning insights.",
      "A focused {duration}-hour journey through {task_title} concepts. Your dedication to understanding was impressive, with only {distraction_time} minutes spent on supplementary research. Explore your learning patterns in the Seagull's Human Observation Log.",
      "Today's {duration}-hour educational expedition through {task_title} showed great progress. You maintained excellent concentration, with brief {distraction_time}-minute detours to clarify concepts. The Seagull's Human Observation Log reveals more about your learning style."
    ]
  },
  personal: {
    imageUrls: [
      'https://images.pexels.com/photos/1051838/pexels-photo-1051838.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1029604/pexels-photo-1029604.jpeg?auto=compress&cs=tinysrgb&w=800',
      'https://images.pexels.com/photos/1051838/pexels-photo-1051838.jpeg?auto=compress&cs=tinysrgb&w=800'
    ],
    summaryTemplates: [
      "Your personal growth journey spanned {duration} hours today, focusing on {task_title}. Mindful moments included {distraction_time} minutes of gentle mind-wandering—sometimes the soul needs to breathe. The Seagull's Human Observation Log captures your inner voyage.",
      "A meaningful {duration}-hour journey of {task_title} practice. Your commitment to self-care was evident, with only {distraction_time} minutes of peaceful distraction. Discover more about your personal growth in the Seagull's Human Observation Log.",
      "Today's {duration}-hour personal development voyage through {task_title} was transformative. You showed remarkable presence, with just {distraction_time} minutes of gentle mental wandering. The Seagull's Human Observation Log holds deeper reflections."
    ]
  }
}

export function chooseCategoryConfig(taskCategory: string | undefined): CategoryConfig {
  const key = (taskCategory?.toLowerCase() ?? 'writing')
  return mockSummaryData[key] ?? mockSummaryData.writing
}

export function pickRandomImage(config: CategoryConfig): string {
  return config.imageUrls[Math.floor(Math.random() * config.imageUrls.length)]
}

export function pickTemplate(config: CategoryConfig): string {
  return config.summaryTemplates[Math.floor(Math.random() * config.summaryTemplates.length)]
}

