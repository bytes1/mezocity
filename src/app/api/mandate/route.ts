import { NextRequest, NextResponse } from "next/server";
import {
  getMainStrategyMandateFromNeon,
  upsertMainStrategyMandateInNeon,
  type MainRiskMode,
} from "@/lib/neon-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const mandate = await getMainStrategyMandateFromNeon();
    return NextResponse.json({ ok: true, mandate });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      riskMode?: MainRiskMode | string;
      targetMusdYieldPct?: number;
      autoTuneGuardrails?: boolean;
      autoRescueTrove?: boolean;
      autoSweepDefaults?: boolean;
      autoAnchorDebates?: boolean;
      autoMusdYield?: boolean;
      customDirectiveText?: string;
    };

    const mandate = await upsertMainStrategyMandateInNeon({
      riskMode:
        body.riskMode === "CONSERVATIVE" ||
        body.riskMode === "BALANCED" ||
        body.riskMode === "GROWTH"
          ? body.riskMode
          : undefined,
      targetMusdYieldPct:
        typeof body.targetMusdYieldPct === "number" &&
        Number.isFinite(body.targetMusdYieldPct)
          ? body.targetMusdYieldPct
          : undefined,
      autoTuneGuardrails:
        typeof body.autoTuneGuardrails === "boolean"
          ? body.autoTuneGuardrails
          : undefined,
      autoRescueTrove:
        typeof body.autoRescueTrove === "boolean"
          ? body.autoRescueTrove
          : undefined,
      autoSweepDefaults:
        typeof body.autoSweepDefaults === "boolean"
          ? body.autoSweepDefaults
          : undefined,
      autoAnchorDebates:
        typeof body.autoAnchorDebates === "boolean"
          ? body.autoAnchorDebates
          : undefined,
      autoMusdYield:
        typeof body.autoMusdYield === "boolean" ? body.autoMusdYield : undefined,
      customDirectiveText:
        typeof body.customDirectiveText === "string"
          ? body.customDirectiveText
          : undefined,
    });

    return NextResponse.json({ ok: true, mandate });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
