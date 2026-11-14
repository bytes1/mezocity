import { NextRequest, NextResponse } from "next/server";
import { formatEther } from "viem";
import {
  ISLAND_ECOSYSTEM_ADDRESSES,
  ISLAND_FACTORY_ABI,
  ISLAND_VAULT_ABI,
} from "@/lib/island-contracts";
import {
  IslandBiomeTheme,
  listCustomIslandsFromNeon,
  upsertCustomIslandInNeon,
} from "@/lib/island-db";
import { resolveMezoCoordinationProfile } from "@/lib/mezo-coordination";
import { readLiveMezoCoordinationProfiles } from "@/lib/mezo-coordination-server";
import { getMezoPublicClient } from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const owner = (req.nextUrl.searchParams.get("owner") || "").trim();
    const existing = await listCustomIslandsFromNeon(
      /^0x[0-9a-fA-F]{40}$/.test(owner) ? owner : undefined
    );

    // Resilient Chain-to-DB Reconciliation: backfill any funded on-chain Sub-Island missing in Neon
    if (ISLAND_ECOSYSTEM_ADDRESSES.islandFactory) {
      try {
        const publicClient = getMezoPublicClient();
        const chainIslands = (await publicClient.readContract({
          address: ISLAND_ECOSYSTEM_ADDRESSES.islandFactory,
          abi: ISLAND_FACTORY_ABI,
          functionName: /^0x[0-9a-fA-F]{40}$/.test(owner)
            ? "getIslandsByOwner"
            : "getAllIslands",
          args: /^0x[0-9a-fA-F]{40}$/.test(owner)
            ? [owner as `0x${string}`]
            : undefined,
        })) as Array<{
          islandId: bigint;
          owner: `0x${string}`;
          operator: `0x${string}`;
          vault: `0x${string}`;
          name: string;
          biomeTheme: string;
          createdAt: bigint;
          active: boolean;
        }>;

        const knownVaults = new Set(
          existing.map((i) => i.vaultAddress.toLowerCase())
        );

        for (const ci of chainIslands) {
          if (!knownVaults.has(ci.vault.toLowerCase())) {
            let seedBtc = 0;
            let seedMusd = 0;
            try {
              const [btcW, musdW] = await Promise.all([
                publicClient.readContract({
                  address: ci.vault,
                  abi: ISLAND_VAULT_ABI,
                  functionName: "trackedBtcBalance",
                }),
                publicClient.readContract({
                  address: ci.vault,
                  abi: ISLAND_VAULT_ABI,
                  functionName: "trackedMusdBalance",
                }),
              ]);
              seedBtc = Number(formatEther(btcW as bigint));
              seedMusd = Number(formatEther(musdW as bigint));
            } catch {
              // ignore individual vault read error
            }

            await upsertCustomIslandInNeon({
              islandId: `island-${ci.islandId.toString()}`,
              chainIslandId: Number(ci.islandId),
              ownerAddress: ci.owner,
              operatorAddress: ci.operator,
              vaultAddress: ci.vault,
              name: ci.name || `Sub-Island #${ci.islandId.toString()}`,
              biomeTheme: (ci.biomeTheme || "meadow") as IslandBiomeTheme,
              seedBtc,
              seedMusd,
            });
          }
        }
      } catch (err) {
        console.warn("Chain island reconciliation warning:", err);
      }
    }

    const rawIslands = await listCustomIslandsFromNeon(
      /^0x[0-9a-fA-F]{40}$/.test(owner) ? owner : undefined
    );

    const mezoProfiles = await readLiveMezoCoordinationProfiles(
      rawIslands.map((i) => i.ownerAddress)
    );
    const islands = rawIslands.map((i) => {
      const profile =
        mezoProfiles[i.ownerAddress.toLowerCase()] ??
        resolveMezoCoordinationProfile(0);
      return {
        ...i,
        mezoBalance: profile.mezoBalance,
        veBtcVotingPower: profile.veBtcVotingPower,
        veBtcLockedBtc: profile.veBtcLockedBtc,
        mezoEffectiveScore: profile.effectiveScore,
        mezoTierId: profile.tier.tierId,
      };
    });

    return NextResponse.json({
      ok: true,
      contractsConfigured: Boolean(ISLAND_ECOSYSTEM_ADDRESSES.islandFactory),
      contracts: ISLAND_ECOSYSTEM_ADDRESSES,
      islands,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ownerAddress = String(body.ownerAddress || "").trim();
    const operatorAddress = String(
      body.operatorAddress || ownerAddress
    ).trim();
    const vaultAddress = String(body.vaultAddress || "").trim();
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const biomeTheme = (String(body.biomeTheme || "meadow") as IslandBiomeTheme);
    const seedBtc = Math.max(0, Number(body.seedBtc || 0));
    const seedMusd = Math.max(0, Number(body.seedMusd || 0));
    const seedTxHash = String(body.seedTxHash || "").trim();
    const chainIslandId =
      body.chainIslandId !== undefined && body.chainIslandId !== null
        ? Number(body.chainIslandId)
        : null;

    if (!/^0x[0-9a-fA-F]{40}$/.test(ownerAddress)) {
      return NextResponse.json(
        { ok: false, error: "Valid ownerAddress is required." },
        { status: 400 }
      );
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(vaultAddress)) {
      return NextResponse.json(
        { ok: false, error: "Valid on-chain IslandVault address is required." },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "Island name is required." },
        { status: 400 }
      );
    }

    const islandId = chainIslandId
      ? `island-${chainIslandId}`
      : `island-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const saved = await upsertCustomIslandInNeon({
      islandId,
      chainIslandId,
      ownerAddress,
      operatorAddress,
      vaultAddress,
      name,
      description,
      biomeTheme,
      seedBtc,
      seedMusd,
      seedTxHash,
    });

    return NextResponse.json({
      ok: true,
      island: saved,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
