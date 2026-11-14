import { NextResponse } from "next/server";
import {
  executeLendingGuardAction,
  fetchLendingGuardLiveSnapshot,
} from "@/lib/mezo-lending-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const borrower = searchParams.get("borrower") || undefined;
    const snapshot = await fetchLendingGuardLiveSnapshot(
      "singleton-mezo-guard",
      borrower
    );
    return NextResponse.json({
      ok: true,
      snapshot,
    });
  } catch (err) {
    console.error("[GET /api/lending-guard] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch Mezo Guard state",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = (body.action || "poll_and_rescue") as
      | "borrow_musd"
      | "configure"
      | "fund_reserve"
      | "simulate_drop"
      | "poll_and_rescue"
      | "force_liquidatable_test"
      | "pause"
      | "retire"
      | "recover"
      | "save_eip712_permit"
      | "revoke_eip712_permit"
      | "execute_eip712_rescue_now";

    const result = await executeLendingGuardAction({
      action,
      monitoredBorrower: body.monitoredBorrower,
      borrowerAddress: body.borrowerAddress,
      collateralBtcInput:
        body.collateralBtcInput !== undefined
          ? Number(body.collateralBtcInput)
          : undefined,
      borrowMusdInput:
        body.borrowMusdInput !== undefined
          ? Number(body.borrowMusdInput)
          : undefined,
      triggerHf:
        body.triggerHf !== undefined ? Number(body.triggerHf) : undefined,
      targetHf: body.targetHf !== undefined ? Number(body.targetHf) : undefined,
      btcReserveSharePct:
        body.btcReserveSharePct !== undefined
          ? Number(body.btcReserveSharePct)
          : undefined,
      rescuesGasCount:
        body.rescuesGasCount !== undefined
          ? Number(body.rescuesGasCount)
          : undefined,
      dailyMusdCap:
        body.dailyMusdCap !== undefined ? Number(body.dailyMusdCap) : undefined,
      dailyBtcCap:
        body.dailyBtcCap !== undefined ? Number(body.dailyBtcCap) : undefined,
      fundAmountBtc:
        body.fundAmountBtc !== undefined
          ? Number(body.fundAmountBtc)
          : undefined,
      externalTxHash: body.externalTxHash,
      ownerAddress: body.ownerAddress,
      permitType:
        body.permitType === "ADD_COLL" || body.permitType === "REPAY_MUSD"
          ? body.permitType
          : undefined,
      amountWei:
        body.amountWei !== undefined ? String(body.amountWei) : undefined,
      nonce: body.nonce !== undefined ? Number(body.nonce) : undefined,
      deadline:
        body.deadline !== undefined ? Number(body.deadline) : undefined,
      signature:
        typeof body.signature === "string" ? body.signature : undefined,
      signerAddress:
        typeof body.signerAddress === "string"
          ? body.signerAddress
          : undefined,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error("[POST /api/lending-guard] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to execute Mezo Guard action",
      },
      { status: 500 }
    );
  }
}
