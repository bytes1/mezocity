import { NextRequest, NextResponse } from "next/server";
import {
  buildIslandAuthMessage,
  encryptIslandGeminiKey,
  verifyIslandOwnerSignature,
} from "@/lib/crypto-vault";
import {
  consumeSingleUseAuthNonce,
  getCustomIslandById,
  saveEncryptedGeminiKeyForIsland,
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
    const geminiApiKey = String(body.geminiApiKey || "").trim();
    const model = String(body.model || "gemini-2.5-flash").trim();
    const nonce = String(body.nonce || "").trim();
    const signature = String(body.signature || "").trim();

    if (ownerAddress.toLowerCase() !== island.ownerAddress.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "Only the Sub-Island owner wallet can connect a Gemini API key." },
        { status: 403 }
      );
    }

    if (!nonce || !signature.startsWith("0x")) {
      return NextResponse.json(
        { ok: false, error: "Wallet signature and single-use nonce are required." },
        { status: 401 }
      );
    }

    const expectedMsg = buildIslandAuthMessage({
      address: ownerAddress,
      islandId: id,
      action: "SAVE_GEMINI_KEY",
      nonce,
    });

    const sigValid = await verifyIslandOwnerSignature({
      expectedAddress: ownerAddress,
      message: expectedMsg,
      signature: signature as `0x${string}`,
    });
    if (!sigValid) {
      return NextResponse.json(
        { ok: false, error: "Invalid owner wallet signature." },
        { status: 401 }
      );
    }

    const nonceOk = await consumeSingleUseAuthNonce({
      nonce,
      walletAddress: ownerAddress,
      islandId: id,
      action: "SAVE_GEMINI_KEY",
    });
    if (!nonceOk) {
      return NextResponse.json(
        { ok: false, error: "Auth nonce expired or already consumed. Please sign again." },
        { status: 401 }
      );
    }

    // Ping Gemini Models API via x-goog-api-key header to verify key works before encrypting
    const pingRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: { "x-goog-api-key": geminiApiKey },
        signal: AbortSignal.timeout(7000),
        cache: "no-store",
      }
    );
    if (!pingRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Gemini API rejected this key (HTTP ${pingRes.status}). Check your key and try again.`,
        },
        { status: 400 }
      );
    }

    const encrypted = encryptIslandGeminiKey(geminiApiKey);
    await saveEncryptedGeminiKeyForIsland({
      islandId: id,
      ciphertextB64: encrypted.ciphertextB64,
      ivB64: encrypted.ivB64,
      authTagB64: encrypted.authTagB64,
      last4: encrypted.last4,
      model,
    });

    return NextResponse.json({
      ok: true,
      connected: true,
      last4: encrypted.last4,
      model,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
