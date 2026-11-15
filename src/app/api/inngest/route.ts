import { NextRequest } from "next/server";
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { hourlyAutonomousDcaCycle } from "@/inngest/functions";
import { isInngestTriggerPaused } from "@/lib/inngest-control";

export const dynamic = "force-dynamic";

if (!process.env.INNGEST_SIGNING_KEY && !process.env.INNGEST_DEV) {
  process.env.INNGEST_DEV = "1";
}

const activeHandler = serve({
  client: inngest,
  functions: [hourlyAutonomousDcaCycle],
});

const pausedHandler = serve({
  client: inngest,
  functions: [],
});

const pickHandler = () =>
  isInngestTriggerPaused() ? pausedHandler : activeHandler;

export async function GET(req: NextRequest, ctx: unknown) {
  return pickHandler().GET(req, ctx);
}

export async function POST(req: NextRequest, ctx: unknown) {
  return pickHandler().POST(req, ctx);
}

export async function PUT(req: NextRequest, ctx: unknown) {
  return pickHandler().PUT(req, ctx);
}
