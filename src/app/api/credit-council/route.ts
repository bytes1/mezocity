import { NextRequest, NextResponse } from "next/server";
import { evaluateLoanWithMainCouncil } from "@/lib/credit-council-engine";
import { upsertLoanApplicationInNeon } from "@/lib/island-db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const islandId = String(body.islandId || "").trim();
    const chainAppId = Number(body.chainAppId || 0);
    const checkpointId = Number(body.checkpointId || 0);
    const requestedMusd = Number(body.requestedMusd || 0);
    const termDays = Math.min(365, Math.max(1, Number(body.termDays || 30)));
    const purposeSummary = String(body.purposeSummary || "Scale Sub-Island BTC/MUSD strategy").trim();
    const provedProfitUsd = Number(body.provedProfitUsd || 0);
    const provedRoiBps = Number(body.provedRoiBps || 0);
    const runCouncilImmediately = body.runCouncilImmediately !== false;

    if (!islandId || requestedMusd <= 0) {
      return NextResponse.json(
        { ok: false, error: "islandId and positive requestedMusd are required." },
        { status: 400 }
      );
    }

    const appId =
      typeof body.appId === "string" && body.appId.trim()
        ? body.appId.trim()
        : `loan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await upsertLoanApplicationInNeon({
      appId,
      chainAppId,
      islandId,
      checkpointId,
      provedProfitUsd,
      provedRoiBps,
      requestedMusd,
      approvedMusd: 0,
      aprBps: 0,
      termDays,
      purposeSummary,
      status: "PENDING_COUNCIL",
      verdict: "NONE",
      councilVerdictJson: {},
      disburseTxHash: String(body.submitTxHash || ""),
      repaidMusd: 0,
    });

    if (!runCouncilImmediately) {
      return NextResponse.json({ ok: true, appId, status: "PENDING_COUNCIL" });
    }

    const evalResult = await evaluateLoanWithMainCouncil({
      appId,
      chainAppId,
      islandId,
      checkpointId,
      requestedMusd,
      termDays,
      purposeSummary,
      provedProfitUsdFallback: provedProfitUsd,
      provedRoiBpsFallback: provedRoiBps,
    });

    return NextResponse.json(evalResult);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
