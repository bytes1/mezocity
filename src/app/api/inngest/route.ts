import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { hourlyAutonomousDcaCycle } from "@/inngest/functions";

if (!process.env.INNGEST_SIGNING_KEY && !process.env.INNGEST_DEV) {
  process.env.INNGEST_DEV = "1";
}

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [hourlyAutonomousDcaCycle],
});
