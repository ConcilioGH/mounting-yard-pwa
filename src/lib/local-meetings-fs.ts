/** Repo `meetings/` filesystem access — localhost / `next dev` only, never on Vercel production. */
export function isLocalMeetingsFsEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
