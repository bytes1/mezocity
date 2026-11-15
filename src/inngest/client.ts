import { Inngest } from "inngest";
export { isInngestTriggerPaused } from "@/lib/inngest-control";

// Default INNGEST_DEV=1 when no production signing key is configured
if (!process.env.INNGEST_SIGNING_KEY && !process.env.INNGEST_DEV) {
  process.env.INNGEST_DEV = "1";
}

/**
 * Inngest Client for MezoTown x 4lpha Autonomous Cybertronian AI Crew
 * Powers the 1-hour autonomous news & DCA execution cron (`0 * * * *`)
 * and on-demand event triggers (`mezo/cycle.requested`).
 */
export const inngest = new Inngest({
  id: "mezotown-4lpha-mythic-crew",
  isDev: !process.env.INNGEST_SIGNING_KEY,
});
