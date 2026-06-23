/** Repo `meetings/` write access — localhost / `next dev` only (export/save APIs). */
export function isLocalMeetingsFsEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
