import { NextRequest, NextResponse } from "next/server";
import {
  buildIslandAuthMessage,
  generateSingleUseNonce,
} from "@/lib/crypto-vault";
import { issueSingleUseAuthNonce } from "@/lib/island-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const wallet = (req.nextUrl.searchParams.get("wallet") || "").trim();
    const islandId = (req.nextUrl.searchParams.get("islandId") || "new").trim();
    const action = (
      req.nextUrl.searchParams.get("action") || "SAVE_GEMINI_KEY"
    ) as
      | "SAVE_GEMINI_KEY"
      | "RUN_ISLAND_CYCLE"
      | "CREATE_AGENT"
      | "CREATE_VAULT";

    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json(
        { ok: false, error: "Valid wallet address required." },
        { status: 400 }
      );
    }

    const nonce = generateSingleUseNonce();
    await issueSingleUseAuthNonce({
      nonce,
      walletAddress: wallet,
      islandId,
      action,
    });

    const message = buildIslandAuthMessage({
      address: wallet,
      islandId,
      action,
      nonce,
    });

    return NextResponse.json({
      ok: true,
      nonce,
      message,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
