import { NextRequest, NextResponse } from "next/server";
import {
  AgentChassisType,
  AgentHeadgearType,
  AgentSpecialty,
  getCustomIslandById,
  listCustomIslandAgents,
  upsertCustomIslandAgentInNeon,
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
        { ok: false, error: "Only the island owner can design or add agents." },
        { status: 403 }
      );
    }

    const existing = await listCustomIslandAgents(id);
    const usedSlots = new Set(existing.map((a) => a.spawnSlotIndex));

    let spawnSlotIndex = Number(body.spawnSlotIndex || 0);
    if (!body.agentId && (!spawnSlotIndex || usedSlots.has(spawnSlotIndex))) {
      for (let s = 1; s <= 8; s++) {
        if (!usedSlots.has(s)) {
          spawnSlotIndex = s;
          break;
        }
      }
    }

    if (spawnSlotIndex < 1 || spawnSlotIndex > 8) {
      return NextResponse.json(
        { ok: false, error: "Maximum 8 agents per Sub-Island (all spawn slots full)." },
        { status: 400 }
      );
    }

    const agentId =
      typeof body.agentId === "string" && body.agentId.trim()
        ? body.agentId.trim()
        : `${id}-ag-${Date.now().toString(36)}`;

    const saved = await upsertCustomIslandAgentInNeon({
      agentId,
      islandId: id,
      spawnSlotIndex,
      name: String(body.name || "Custom Agent").trim().slice(0, 48),
      role: String(body.role || "Strategy Specialist").trim().slice(0, 80),
      specialty: String(body.specialty || "BTC_TRADER") as AgentSpecialty,
      systemPrompt: String(
        body.systemPrompt ||
          "Analyze BTC/USD volatility and manage island vault allocations conservatively."
      )
        .trim()
        .slice(0, 600),
      allowedAssets: String(body.allowedAssets || "BTC,MUSD"),
      chassis: String(body.chassis || "bot") as AgentChassisType,
      primaryColor: String(body.primaryColor || "#6366f1"),
      secondaryColor: String(body.secondaryColor || "#f59e0b"),
      headgear: String(body.headgear || "antenna") as AgentHeadgearType,
      scaleFactor: Math.min(1.4, Math.max(0.75, Number(body.scaleFactor || 1))),
      active: body.active !== undefined ? Boolean(body.active) : true,
    });

    return NextResponse.json({
      ok: true,
      agent: saved,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
