export type TimerState = {
  durationSeconds: number;
  remainingSeconds: number;
  endsAt: number | null;
};
export const createTimer = (seconds = 300): TimerState => ({
  durationSeconds: seconds,
  remainingSeconds: seconds,
  endsAt: null,
});
export function remainingAt(timer: TimerState, now: number): number {
  return timer.endsAt === null
    ? timer.remainingSeconds
    : Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}
export function startTimer(timer: TimerState, now: number): TimerState {
  const remainingSeconds = timer.remainingSeconds || timer.durationSeconds;
  return { ...timer, remainingSeconds, endsAt: now + remainingSeconds * 1000 };
}
export function pauseTimer(timer: TimerState, now: number): TimerState {
  return { ...timer, remainingSeconds: remainingAt(timer, now), endsAt: null };
}
export function malaProgress(count: number) {
  return { malas: Math.floor(count / 108), beads: count % 108 };
}
// Local presentation grouping only. Server will own bhaktiDay, timezone acceptance and streaks.
export function localPracticeDay(now = new Date()): string {
  const date = new Date(now);
  date.setHours(date.getHours() - 4);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
// Whole seconds only: media durations are measured fractionally (e.g. 25.1 s).
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
