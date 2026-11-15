/**
 * Environment toggle for pausing all autonomous Inngest triggers.
 * Accepts `true`, `1`, `yes`, or `on` (case-insensitive) via `INNGEST_PAUSED`
 * (or optional `INNGEST_TRIGGERS_PAUSED` / `NEXT_PUBLIC_INNGEST_PAUSED` aliases).
 */
export function isInngestTriggerPaused(): boolean {
  const raw = (
    process.env.INNGEST_PAUSED ??
    process.env.INNGEST_TRIGGERS_PAUSED ??
    process.env.NEXT_PUBLIC_INNGEST_PAUSED ??
    ""
  )
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
