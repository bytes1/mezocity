import { NextRequest, NextResponse } from "next/server";
import { executeAutonomousMythicCycle } from "@/lib/gemini-agents";
import { inngest } from "@/inngest/client";

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
    const geminiApiKey = body.geminiApiKey || undefined;
    const databaseUrl = body.databaseUrl || undefined;

    // Also emit an Inngest event in the background if Inngest event key or dev server is present
    if (body.emitInngestEvent) {
      inngest
        .send({
          name: "mezo/cycle.requested",
          data: { scenario, scheduleId },
        })
        .catch(() => undefined);
    }

    const result = await executeAutonomousMythicCycle({
      scenario,
      scheduleId,
      triggerSource,
      geminiApiKey,
      databaseUrl,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
