import { NextRequest, NextResponse } from "next/server";
import { executeAutonomousMythicCycle } from "@/lib/gemini-agents";
import { inngest } from "@/inngest/client";
import {
  checkInngestEndpointStatus,
  getInngestRunTelemetry,
} from "@/lib/neon-db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scenario =
      body.scenario === "INTENTIONAL_OVERFLOW"
        ? "INTENTIONAL_OVERFLOW"
        : "NORMAL_DCA";
    const scheduleId =
      body.scheduleId !== undefined ? Number(body.scheduleId) : undefined;
    const triggerSource = body.triggerSource || "AUTO_TIMER";
    const dispatchMode: "inngest-first" | "direct" =
      body.dispatchMode === "direct" ? "direct" : "inngest-first";
    const geminiApiKey = body.geminiApiKey || undefined;
    const databaseUrl = body.databaseUrl || undefined;
    const cycleUid =
      typeof body.cycleUid === "string" && body.cycleUid.startsWith("cycle-")
        ? body.cycleUid
        : `cycle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let inngestFallbackReason: string | undefined;

    if (dispatchMode === "inngest-first") {
      const endpointStatus = await checkInngestEndpointStatus();
      if (endpointStatus.mode !== "DEV_SERVER_OFFLINE") {
        try {
          const sendRes = await inngest.send({
            name: "mezo/cycle.requested",
            data: {
              scenario,
              scheduleId,
              cycleUid,
              triggerSource: "INNGEST_EVENT",
              geminiApiKey,
              databaseUrl,
            },
          });
          const telemetry = await getInngestRunTelemetry(databaseUrl);
          return NextResponse.json({
            ok: true,
            dispatchedVia: "INNGEST",
            inngestMode: endpointStatus.mode,
            inngestEventIds: sendRes?.ids || [],
            cycleUid,
            triggerSource: "INNGEST_EVENT",
            status: "DISPATCHED",
            telemetry,
          });
        } catch (sendErr) {
          inngestFallbackReason =
            sendErr instanceof Error ? sendErr.message : String(sendErr);
        }
      } else {
        inngestFallbackReason = `Inngest Dev Server unreachable at ${endpointStatus.endpoint} (no INNGEST_EVENT_KEY set)`;
      }
    }

    const result = await executeAutonomousMythicCycle({
      scenario,
      scheduleId,
      cycleUid,
      triggerSource,
      geminiApiKey,
      databaseUrl,
    });
    const telemetry = await getInngestRunTelemetry(databaseUrl);

    return NextResponse.json({
      ...result,
      dispatchedVia: "DIRECT_FALLBACK",
      inngestFallbackReason,
      telemetry,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
