import { NextRequest, NextResponse } from "next/server";
import { formatEther } from "viem";
import {
  ISLAND_CREDIT_COUNCIL_ABI,
  ISLAND_ECOSYSTEM_ADDRESSES,
  ISLAND_VAULT_ABI,
} from "@/lib/island-contracts";
import { listLeaderboardSignalsFromNeon } from "@/lib/island-db";
import {
  MEZO_TOKEN_ADDRESS,
  resolveMezoCoordinationProfile,
  STARTER_STRATEGY_TEMPLATES,
  type IslandCloneTemplate,
  type MezoCoordinationProfile,
  type MezoCoordinationTier,
} from "@/lib/mezo-coordination";
import {
  readLiveMezoCoordinationProfiles,
  readVeBtcProtocolTelemetry,
} from "@/lib/mezo-coordination-server";
import { getMezoPublicClient } from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

export interface LeaderboardEntry {
  islandId: string;
  chainIslandId: number | null;
  name: string;
  description: string;
  biomeTheme: string;
  ownerAddress: string;
  vaultAddress: string;
  seedBtc: number;
  seedMusd: number;
  netEquityUsd: number;
  netProfitUsd: number;
  roiBps: number;
  creditScoreBps: number;
  totalCheckpoints: number;
  cycleCount: number;
  repaidLoanCount: number;
  latestLoanStatus: string | null;
  mezoBalance: number;
  veBtcVotingPower: number;
  veBtcLockedBtc: number;
  veBtcNftCount: number;
  mezoEffectiveScore: number;
  mezoBoostedByVeBtc: boolean;
  mezoTier: MezoCoordinationTier;
  vaultCount: number;
  agentCount: number;
  agentsPreview: Array<{
    name: string;
    role: string;
    specialty: string;
    primaryColor: string;
  }>;
  cloneTemplate: IslandCloneTemplate;
}

export async function GET(req: NextRequest) {
  try {
    const userAddress = (req.nextUrl.searchParams.get("user") || "").trim();
    const hasValidUser = /^0x[0-9a-fA-F]{40}$/.test(userAddress);

    const signals = await listLeaderboardSignalsFromNeon();
    const ownerAddrs = signals.map((s) => s.island.ownerAddress);
    if (hasValidUser) ownerAddrs.push(userAddress);

    const [mezoProfileMap, veBtcProtocol] = await Promise.all([
      readLiveMezoCoordinationProfiles(ownerAddrs),
      readVeBtcProtocolTelemetry(),
    ]);
    const userMezoProfile =
      (hasValidUser ? mezoProfileMap[userAddress.toLowerCase()] : undefined) ??
      resolveMezoCoordinationProfile(0);
    const userMezoBalance = userMezoProfile.mezoBalance;
    const userMezoTier = userMezoProfile.tier;

    const publicClient = getMezoPublicClient();
    const councilAddr = ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil;

    // Enrich top 16 live vaults in parallel for verified on-chain profit/equity/credit scores
    const enriched = await Promise.all(
      signals.map(async (sig, idx): Promise<LeaderboardEntry> => {
        const isl = sig.island;
        let netEquityUsd =
          sig.navUsd > 0 ? sig.navUsd : isl.seedMusd + isl.seedBtc * 90_000;
        let netProfitUsd = sig.netProfitUsd;
        let roiBps = sig.roiBps;
        let creditScoreBps = 6500;
        let totalCheckpoints = sig.checkpointId !== null ? sig.checkpointId + 1 : 0;

        if (idx < 16 && /^0x[0-9a-fA-F]{40}$/.test(isl.vaultAddress)) {
          try {
            const [eqW, profW, cpCountW] = await Promise.all([
              publicClient.readContract({
                address: isl.vaultAddress as `0x${string}`,
                abi: ISLAND_VAULT_ABI,
                functionName: "getNetEquityUsd",
              }),
              publicClient.readContract({
                address: isl.vaultAddress as `0x${string}`,
                abi: ISLAND_VAULT_ABI,
                functionName: "getNetProfitUsd",
              }),
              publicClient.readContract({
                address: isl.vaultAddress as `0x${string}`,
                abi: ISLAND_VAULT_ABI,
                functionName: "totalCheckpoints",
              }),
            ]);
            netEquityUsd = Number(formatEther(eqW as bigint));
            netProfitUsd = Number(formatEther(profW as bigint));
            totalCheckpoints = Number(cpCountW || 0n);
            const basis = Math.max(0, netEquityUsd - netProfitUsd);
            if (basis > 0) {
              roiBps = Math.round((netProfitUsd * 10_000) / basis);
            }
          } catch {
            // Retain Neon metrics fallback if individual RPC call fails
          }

          if (councilAddr && isl.chainIslandId) {
            try {
              const sc = await publicClient.readContract({
                address: councilAddr,
                abi: ISLAND_CREDIT_COUNCIL_ABI,
                functionName: "creditScoreBps",
                args: [BigInt(isl.chainIslandId)],
              });
              if (Number(sc) > 0) creditScoreBps = Number(sc);
            } catch {
              // Keep default credit score
            }
          }
        }

        const ownerProfile =
          mezoProfileMap[isl.ownerAddress.toLowerCase()] ??
          resolveMezoCoordinationProfile(0);
        const mezoBalance = ownerProfile.mezoBalance;
        const mezoTier = ownerProfile.tier;

        const cloneTemplate: IslandCloneTemplate = {
          templateId: `clone-${isl.islandId}`,
          sourceName: isl.name,
          sourceType: "LIVE_ISLAND",
          suggestedName: `${isl.name.slice(0, 32)} Fork`,
          description:
            isl.description ||
            `Cloned strategy from ${isl.name} on Mezo Testnet 31611.`,
          biomeTheme: isl.biomeTheme,
          suggestedSeedBtc:
            isl.seedBtc >= 0.0001
              ? String(Number(isl.seedBtc.toFixed(4)))
              : isl.seedMusd >= 10
              ? "0"
              : "0.0001",
          suggestedSeedMusd:
            isl.seedMusd >= 10 ? String(Math.round(isl.seedMusd)) : "0",
          vaultTemplates: sig.vaults.slice(0, 6).map((v) => ({
            plotIndex: v.plotIndex,
            assetType: v.assetType,
            vaultName: v.vaultName,
            maxSingleTradeBps: v.maxSingleTradeBps,
            maxDrawdownBps: v.maxDrawdownBps,
          })),
          agentTemplates: sig.agents.slice(0, 8).map((a) => ({
            spawnSlotIndex: a.spawnSlotIndex,
            name: a.name,
            role: a.role,
            specialty: a.specialty,
            systemPrompt: a.systemPrompt,
            allowedAssets: a.allowedAssets,
            chassis: a.chassis,
            primaryColor: a.primaryColor,
            secondaryColor: a.secondaryColor,
            headgear: a.headgear,
            scaleFactor: a.scaleFactor,
          })),
        };

        return {
          islandId: isl.islandId,
          chainIslandId: isl.chainIslandId,
          name: isl.name,
          description: isl.description,
          biomeTheme: isl.biomeTheme,
          ownerAddress: isl.ownerAddress,
          vaultAddress: isl.vaultAddress,
          seedBtc: isl.seedBtc,
          seedMusd: isl.seedMusd,
          netEquityUsd,
          netProfitUsd,
          roiBps,
          creditScoreBps,
          totalCheckpoints,
          cycleCount: sig.cycleCount,
          repaidLoanCount: sig.repaidLoanCount,
          latestLoanStatus: isl.latestLoanStatus ?? null,
          mezoBalance,
          veBtcVotingPower: ownerProfile.veBtcVotingPower,
          veBtcLockedBtc: ownerProfile.veBtcLockedBtc,
          veBtcNftCount: ownerProfile.veBtcNftCount,
          mezoEffectiveScore: ownerProfile.effectiveScore,
          mezoBoostedByVeBtc: ownerProfile.boostedByVeBtc,
          mezoTier,
          vaultCount: sig.vaults.length,
          agentCount: sig.agents.length,
          agentsPreview: sig.agents.slice(0, 4).map((a) => ({
            name: a.name,
            role: a.role,
            specialty: a.specialty,
            primaryColor: a.primaryColor,
          })),
          cloneTemplate,
        };
      })
    );

    const totalVerifiedProfitUsd = enriched.reduce(
      (sum, e) => sum + Math.max(0, e.netProfitUsd),
      0
    );
    const bestRoiBps = enriched.reduce(
      (best, e) => (e.roiBps > best ? e.roiBps : best),
      0
    );
    const mezoBoostedCount = enriched.filter(
      (e) => e.mezoTier.tierId !== "NONE"
    ).length;

    return NextResponse.json({
      ok: true,
      mezoTokenAddress: MEZO_TOKEN_ADDRESS,
      veBtcProtocol,
      userMezoBalance,
      userMezoTier,
      userMezoProfile,
      stats: {
        totalIslands: enriched.length,
        totalVerifiedProfitUsd,
        bestRoiBps,
        mezoBoostedCount,
      },
      entries: enriched,
      starterTemplates: STARTER_STRATEGY_TEMPLATES,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
