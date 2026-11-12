import { NextRequest, NextResponse } from "next/server";
import {
  createIslandVaultBuildingInNeon,
  getCustomIslandById,
  listIslandVaultBuildings,
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
    if (ownerAddress.toLowerCase() !== island.ownerAddress.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "Only the island owner can create vaults." },
        { status: 403 }
      );
    }

    const existing = await listIslandVaultBuildings(id);
    const usedPlots = new Set(existing.map((v) => v.plotIndex));

    let plotIndex = Number(body.plotIndex || 0);
    if (!plotIndex || usedPlots.has(plotIndex)) {
      for (let p = 1; p <= 6; p++) {
        if (!usedPlots.has(p)) {
          plotIndex = p;
          break;
        }
      }
    }

    if (plotIndex < 1 || plotIndex > 6 || usedPlots.has(plotIndex)) {
      return NextResponse.json(
        { ok: false, error: "All 6 vault construction plots are already occupied." },
        { status: 400 }
      );
    }

    const assetType =
      body.assetType === "BTC" || body.assetType === "MUSD"
        ? body.assetType
        : "MULTI_ASSET";

    const vault = await createIslandVaultBuildingInNeon({
      islandId: id,
      plotIndex,
      assetType,
      vaultName: String(body.vaultName || `${assetType} Strategy Vault`)
        .trim()
        .slice(0, 48),
      maxSingleTradeBps: Math.min(
        5000,
        Math.max(100, Number(body.maxSingleTradeBps || 2500))
      ),
      maxDrawdownBps: Math.min(
        5000,
        Math.max(100, Number(body.maxDrawdownBps || 1000))
      ),
      txHash: String(body.txHash || "").trim(),
    });

    return NextResponse.json({
      ok: true,
      vault,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
