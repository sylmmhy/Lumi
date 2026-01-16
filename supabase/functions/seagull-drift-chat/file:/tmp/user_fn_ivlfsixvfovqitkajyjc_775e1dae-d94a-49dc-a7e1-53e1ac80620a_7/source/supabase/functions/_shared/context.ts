export function formatTask(task) {
  if (!task || !task.title) {
    return "No specific task";
  }
  return task.description ? `${task.title} - ${task.description}` : task.title;
}
export function fallbackDriftMessage(consecutiveDrifts, driftReason) {
  const reasonFragment = driftReason ? ` because ${driftReason}` : "";
  return `I've been drifting for ${consecutiveDrifts} minutes${reasonFragment}. Please help me refocus on my goal.`;
}
export function parseConsecutiveFromContextData(contextData) {
  if (!contextData) return undefined;
  const match = contextData.match(/consecutive_drifts:(\d+)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}
