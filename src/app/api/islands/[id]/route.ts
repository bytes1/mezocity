import { NextRequest, NextResponse } from "next/server";
import { formatEther } from "viem";
import {
  ISLAND_CREDIT_COUNCIL_ABI,
  ISLAND_ECOSYSTEM_ADDRESSES,
  ISLAND_VAULT_ABI,
} from "@/lib/island-contracts";
import {
  getCustomIslandById,
  listCustomIslandAgents,
  listIslandCyclesFromNeon,
  listIslandVaultBuildings,
  listLoanApplicationsFromNeon,
} from "@/lib/island-db";
import { resolveMezoCoordinationProfile } from "@/lib/mezo-coordination";
import { readLiveMezoCoordinationProfiles } from "@/lib/mezo-coordination-server";
import { getMezoPublicClient } from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
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

    const [vaults, agents, cycles, loans, mezoProfiles] = await Promise.all([
      listIslandVaultBuildings(id),
      listCustomIslandAgents(id),
      listIslandCyclesFromNeon(id),
      listLoanApplicationsFromNeon(id),
      readLiveMezoCoordinationProfiles([island.ownerAddress]),
    ]);

    const ownerProfile =
      mezoProfiles[island.ownerAddress.toLowerCase()] ??
      resolveMezoCoordinationProfile(0);
    const ownerMezoBalance = ownerProfile.mezoBalance;
    const ownerMezoTier = ownerProfile.tier;

    let onChainMetrics = {
      syncedFromChain: false,
      trackedBtc: island.seedBtc,
      trackedMusd: island.seedMusd,
      costBasisUsd: island.seedMusd,
      grossNavUsd: island.seedMusd,
      netEquityUsd: island.seedMusd,
      netProfitUsd: 0,
      roiBps: 0,
      outstandingLoanMusd: 0,
      totalCheckpoints: 0,
      latestCheckpoint: null as null | {
        id: number;
        blockNumber: number;
        netEquityUsd: number;
        netProfitUsd: number;
        roiBps: number;
        tradeCount: number;
        transcriptHash: string;
      },
      creditScoreBps: 6500,
      mezoBalance: ownerMezoBalance,
      veBtcVotingPower: ownerProfile.veBtcVotingPower,
      veBtcLockedBtc: ownerProfile.veBtcLockedBtc,
      veBtcNftCount: ownerProfile.veBtcNftCount,
      effectiveCoordinationScore: ownerProfile.effectiveScore,
      boostedByVeBtc: ownerProfile.boostedByVeBtc,
      mezoTier: ownerMezoTier,
    };

    if (/^0x[0-9a-fA-F]{40}$/.test(island.vaultAddress)) {
      try {
        const publicClient = getMezoPublicClient();
        const [
          btcWei,
          musdWei,
          costWei,
          debtWei,
          grossWei,
          netEqWei,
          profitWei,
          cpCountRaw,
        ] = await Promise.all([
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "trackedBtcBalance",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "trackedMusdBalance",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "activeCostBasisUsd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "outstandingLoanPrincipalMusd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "getCurrentGrossNavUsd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "getNetEquityUsd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "getNetProfitUsd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "totalCheckpoints",
          }),
        ]);

        const cpCount = Number(cpCountRaw || 0n);
        let latestCheckpoint: typeof onChainMetrics.latestCheckpoint = null;
        if (cpCount > 0) {
          const cp = (await publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "getCheckpoint",
            args: [BigInt(cpCount - 1)],
          })) as unknown as [
              bigint,
              bigint,
              bigint,
              bigint,
              bigint,
              bigint,
              bigint,
              bigint,
              bigint,
              number,
              `0x${string}`
            ];
          latestCheckpoint = {
            id: Number(cp[0]),
            blockNumber: Number(cp[1]),
            netEquityUsd: Number(formatEther(cp[5])),
            netProfitUsd: Number(formatEther(cp[7])),
            roiBps: Number(cp[8]),
            tradeCount: Number(cp[9]),
            transcriptHash: cp[10],
          };
        }

        let creditScoreBps = 6500;
        if (
          ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil &&
          island.chainIslandId
        ) {
          try {
            const sc = await publicClient.readContract({
              address: ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil,
              abi: ISLAND_CREDIT_COUNCIL_ABI,
              functionName: "creditScoreBps",
              args: [BigInt(island.chainIslandId)],
            });
            if (Number(sc) > 0) creditScoreBps = Number(sc);
          } catch {
            // keep default 6500
          }
        }

        const costUsd = Number(formatEther(costWei as bigint));
        const profitUsd = Number(formatEther(profitWei as bigint));

        onChainMetrics = {
          syncedFromChain: true,
          trackedBtc: Number(formatEther(btcWei as bigint)),
          trackedMusd: Number(formatEther(musdWei as bigint)),
          costBasisUsd: costUsd,
          grossNavUsd: Number(formatEther(grossWei as bigint)),
          netEquityUsd: Number(formatEther(netEqWei as bigint)),
          netProfitUsd: profitUsd,
          roiBps: costUsd > 0 ? Math.round((profitUsd * 10_000) / costUsd) : 0,
          outstandingLoanMusd: Number(formatEther(debtWei as bigint)),
          totalCheckpoints: cpCount,
          latestCheckpoint,
          creditScoreBps,
          mezoBalance: ownerMezoBalance,
          veBtcVotingPower: ownerProfile.veBtcVotingPower,
          veBtcLockedBtc: ownerProfile.veBtcLockedBtc,
          veBtcNftCount: ownerProfile.veBtcNftCount,
          effectiveCoordinationScore: ownerProfile.effectiveScore,
          boostedByVeBtc: ownerProfile.boostedByVeBtc,
          mezoTier: ownerMezoTier,
        };
      } catch {
        // Vault not readable yet
      }
    }

    return NextResponse.json({
      ok: true,
      island,
      vaults,
      agents,
      cycles,
      loans,
      onChainMetrics,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
