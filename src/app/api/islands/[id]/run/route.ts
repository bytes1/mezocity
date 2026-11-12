import { NextRequest, NextResponse } from "next/server";
import {
  buildIslandAuthMessage,
  verifyIslandOwnerSignature,
} from "@/lib/crypto-vault";
import { runCustomIslandCycle } from "@/lib/island-agent-runner";
import {
  consumeSingleUseAuthNonce,
  getCustomIslandById,
} from "@/lib/island-db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const island = await getCustomIslandById(id);
    if (!island) {
      return NextResponse.json(
        { ok: false, error: `Island ${id} not found.` },
        { status: 404 }
      );
    }

    const body = await req.json();
    const ownerAddress = String(body.ownerAddress || "").trim();
    const sessionGeminiKey =
      typeof body.sessionGeminiKey === "string"
        ? body.sessionGeminiKey.trim()
        : undefined;
    const nonce = String(body.nonce || "").trim();
    const signature = String(body.signature || "").trim();

    if (ownerAddress.toLowerCase() !== island.ownerAddress.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "Only the island owner can run this Sub-Island's agents." },
        { status: 403 }
      );
    }

    // Require signed single-use challenge when decrypting owner's saved server Gemini key
    if (!sessionGeminiKey) {
      if (!nonce || !signature.startsWith("0x")) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Wallet authorization signature required to execute using stored island Gemini API key.",
          },
          { status: 401 }
        );
      }

      const expectedMsg = buildIslandAuthMessage({
        address: ownerAddress,
        islandId: id,
        action: "RUN_ISLAND_CYCLE",
        nonce,
      });

      const sigValid = await verifyIslandOwnerSignature({
        expectedAddress: ownerAddress,
        message: expectedMsg,
        signature: signature as `0x${string}`,
      });
      if (!sigValid) {
        return NextResponse.json(
          { ok: false, error: "Invalid signature for Sub-Island execution." },
          { status: 401 }
        );
      }

      const nonceOk = await consumeSingleUseAuthNonce({
        nonce,
        walletAddress: ownerAddress,
        islandId: id,
        action: "RUN_ISLAND_CYCLE",
      });
      if (!nonceOk) {
        return NextResponse.json(
          { ok: false, error: "Authorization nonce expired or already used." },
          { status: 401 }
        );
      }
    }

    const result = await runCustomIslandCycle({
      islandId: id,
      sessionGeminiKey,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
