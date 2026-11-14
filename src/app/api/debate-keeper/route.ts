import { NextRequest, NextResponse } from "next/server";
import { formatEther, keccak256, parseAbiItem, toBytes } from "viem";
import {
  ISLAND_CREDIT_COUNCIL_ABI,
  ISLAND_ECOSYSTEM_ADDRESSES,
  ISLAND_FACTORY_ABI,
  ISLAND_VAULT_ABI,
  MAIN_MUSD_VAULT_ABI,
} from "@/lib/island-contracts";
import {
  AGENT_REGISTRY_ABI,
  DCA_ENGINE_ABI,
  DEFAULT_CONTRACT_ADDRESSES,
  MEZO_TESTNET_LENDING_ADDRESSES,
  POLICY_VAULT_ABI,
  PRICE_FEED_ABI,
  TROVE_MANAGER_ABI,
} from "@/lib/mezo-chain";
import { getMezoPublicClient } from "@/lib/mezo-onchain-server";
import {
  callGeminiAgentModel,
  fetchLiveCryptoNewsAndMarket,
} from "@/lib/gemini-agents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface ArenaAgentProfile {
  agentId: number;
  name: string;
  role: string;
  operator: string;
  reputationBps: number;
  totalActions: number;
  successfulActions: number;
  active: boolean;
}

export interface AnchoredDebateRecord {
  debateId: number;
  marketTicker: string;
  thesis: string;
  bullAgentId: number;
  bullAgentName: string;
  bearAgentId: number;
  bearAgentName: string;
  factCheckerId: number;
  factCheckerName: string;
  councilYesBps: number;
  marketYesBps: number;
  divergenceBps: number;
  transcriptHash: string;
  timestampSec: number;
  timestampIso: string;
  txHash?: string;
}

export interface LoanKeeperOpportunity {
  appId: number;
  islandId: number;
  islandName: string;
  vaultAddress: string;
  borrower: string;
  remainingPrincipalMusd: number;
  interestOwedMusd: number;
  totalDebtMusd: number;
  grossNavUsd: number;
  trackedMusdBalance: number;
  trackedBtcBalance: number;
  coveragePct: number;
  dueDateSec: number;
  dueDateIso: string;
  secondsUntilDue: number;
  isPastDue: boolean;
  isUndercollateralized: boolean;
  keeperExecutable: boolean;
}

export interface DcaKeeperOpportunity {
  scheduleId: number;
  creator: string;
  strategyName: string;
  targetAsset: string;
  sliceAmountBtc: number;
  sliceAmountWei: string;
  maxAllowedBtc: number;
  rectifiedAmountWei: string;
  intervalSeconds: number;
  executedSlices: number;
  totalSlices: number;
  lastExecutionTimeSec: number;
  nextDueInSec: number;
  cooldownRemainingSec: number;
  needsRectify: boolean;
  keeperExecutable: boolean;
  blockerReason: string;
}

function extractFirstJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const userParam = (req.nextUrl.searchParams.get("user") || "").trim();
    const hasUser = /^0x[0-9a-fA-F]{40}$/.test(userParam);
    const publicClient = getMezoPublicClient();
    const nowSec = Math.floor(Date.now() / 1000);

    // 1. Fetch Market News + Core Contracts in parallel
    const [
      market,
      rawAgentsRes,
      totalDebatesRes,
      btcPriceRes,
      policyCfgRes,
      policyEquityRes,
      policyLastExecRes,
      schedulesRes,
      allAppsRes,
      allIslandsRes,
      mainTotalAssetsRes,
      mainLiquidRes,
      mainPrincipalRes,
    ] = await Promise.allSettled([
      fetchLiveCryptoNewsAndMarket(),
      publicClient.readContract({
        address: DEFAULT_CONTRACT_ADDRESSES.agentRegistry,
        abi: AGENT_REGISTRY_ABI,
        functionName: "getAllAgents",
      }),
      publicClient.readContract({
        address: DEFAULT_CONTRACT_ADDRESSES.agentRegistry,
        abi: AGENT_REGISTRY_ABI,
        functionName: "totalDebates",
      }),
      publicClient.readContract({
        address: MEZO_TESTNET_LENDING_ADDRESSES.priceFeed,
        abi: PRICE_FEED_ABI,
        functionName: "fetchPrice",
      }),
      publicClient.readContract({
        address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
        abi: POLICY_VAULT_ABI,
        functionName: "policy",
      }),
      publicClient.readContract({
        address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
        abi: POLICY_VAULT_ABI,
        functionName: "vaultTotalEquity",
      }),
      publicClient.readContract({
        address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
        abi: POLICY_VAULT_ABI,
        functionName: "lastExecutionTimestamp",
      }),
      publicClient.readContract({
        address: DEFAULT_CONTRACT_ADDRESSES.dcaEngine,
        abi: DCA_ENGINE_ABI,
        functionName: "getAllSchedules",
      }),
      ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil
        ? publicClient.readContract({
            address: ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil,
            abi: ISLAND_CREDIT_COUNCIL_ABI,
            functionName: "getAllApplications",
          })
        : Promise.resolve([] as const),
      ISLAND_ECOSYSTEM_ADDRESSES.islandFactory
        ? publicClient.readContract({
            address: ISLAND_ECOSYSTEM_ADDRESSES.islandFactory,
            abi: ISLAND_FACTORY_ABI,
            functionName: "getAllIslands",
          })
        : Promise.resolve([] as const),
      ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault
        ? publicClient.readContract({
            address: ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "totalAssets",
          })
        : Promise.resolve(0n),
      ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault
        ? publicClient.readContract({
            address: ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "trackedLiquidMusd",
          })
        : Promise.resolve(0n),
      ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault
        ? publicClient.readContract({
            address: ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "activePrincipalTotal",
          })
        : Promise.resolve(0n),
    ]);

    const marketSnap =
      market.status === "fulfilled"
        ? market.value
        : {
            btcPriceUsd: 90000,
            change24hPercent: 0,
            high24hUsd: 91000,
            low24hUsd: 89000,
            fearGreedIndex: 50,
            fearGreedLabel: "Neutral",
            volatilityRegime: "MODERATE" as const,
            trendDirection: "RANGE_BOUND" as const,
            newsHeadlines: [],
          };

    const priceWei =
      btcPriceRes.status === "fulfilled" && (btcPriceRes.value as bigint) > 0n
        ? (btcPriceRes.value as bigint)
        : 90_000n * 10n ** 18n;
    const btcPriceUsd = Number(formatEther(priceWei));

    // Read TCR & Recovery Mode from TroveManager
    let systemTcrPct = 0;
    let recoveryMode = false;
    try {
      const [tcrWei, rec] = await Promise.all([
        publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
          abi: TROVE_MANAGER_ABI,
          functionName: "getTCR",
          args: [priceWei],
        }),
        publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
          abi: TROVE_MANAGER_ABI,
          functionName: "checkRecoveryMode",
          args: [priceWei],
        }),
      ]);
      systemTcrPct = Number(formatEther(tcrWei as bigint)) * 100;
      recoveryMode = Boolean(rec);
    } catch {
      // ignore if RPC hiccup
    }

    // Parse ERC-8004 agents
    const rawAgents =
      rawAgentsRes.status === "fulfilled" ? rawAgentsRes.value : ([] as const);

    const agents: ArenaAgentProfile[] = rawAgents.map((a) => ({
      agentId: Number(a.agentId),
      name: a.name,
      role: a.role,
      operator: a.operator,
      reputationBps: Number(a.reputationScore),
      totalActions: Number(a.totalActions),
      successfulActions: Number(a.successfulActions),
      active: Boolean(a.active),
    }));

    const agentNameById = new Map<number, string>();
    for (const ag of agents) {
      agentNameById.set(ag.agentId, ag.name);
    }

    // Fetch latest anchored Council Debates (up to 25) + recent txHash logs
    const totalDebates =
      totalDebatesRes.status === "fulfilled"
        ? Number(totalDebatesRes.value as bigint)
        : 0;

    const debateIndices: number[] = [];
    for (
      let i = totalDebates - 1;
      i >= Math.max(0, totalDebates - 25);
      i--
    ) {
      debateIndices.push(i);
    }

    const txHashByDebateId = new Map<number, string>();
    try {
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > 30_000n ? latestBlock - 30_000n : 0n;
      const logs = await publicClient.getLogs({
        address: DEFAULT_CONTRACT_ADDRESSES.agentRegistry,
        event: parseAbiItem(
          "event CouncilDebateAnchored(uint256 indexed debateId, string marketTicker, uint16 councilYesBps, uint16 marketYesBps, bytes32 transcriptHash)"
        ),
        fromBlock,
        toBlock: latestBlock,
      });
      for (const lg of logs) {
        if (lg.args?.debateId !== undefined && lg.transactionHash) {
          txHashByDebateId.set(Number(lg.args.debateId), lg.transactionHash);
        }
      }
    } catch {
      // Skip log indexing if RPC rejects range; debates themselves still load cleanly
    }

    const debateReads = await Promise.allSettled(
      debateIndices.map((idx) =>
        publicClient.readContract({
          address: DEFAULT_CONTRACT_ADDRESSES.agentRegistry,
          abi: AGENT_REGISTRY_ABI,
          functionName: "debates",
          args: [BigInt(idx)],
        })
      )
    );

    const debates: AnchoredDebateRecord[] = [];
    for (const res of debateReads) {
      if (res.status !== "fulfilled") continue;
      const row = res.value as readonly [
        bigint,
        string,
        string,
        bigint,
        bigint,
        bigint,
        number,
        number,
        `0x${string}`,
        bigint,
      ];
      const idNum = Number(row[0]);
      const bullId = Number(row[3]);
      const bearId = Number(row[4]);
      const factId = Number(row[5]);
      const councilBps = Number(row[6]);
      const marketBps = Number(row[7]);
      const tsSec = Number(row[9]);

      debates.push({
        debateId: idNum,
        marketTicker: row[1],
        thesis: row[2],
        bullAgentId: bullId,
        bullAgentName: agentNameById.get(bullId) || `Agent #${bullId}`,
        bearAgentId: bearId,
        bearAgentName: agentNameById.get(bearId) || `Agent #${bearId}`,
        factCheckerId: factId,
        factCheckerName: agentNameById.get(factId) || `Agent #${factId}`,
        councilYesBps: councilBps,
        marketYesBps: marketBps,
        divergenceBps: councilBps - marketBps,
        transcriptHash: row[8],
        timestampSec: tsSec,
        timestampIso:
          tsSec > 0 ? new Date(tsSec * 1000).toISOString() : "",
        txHash: txHashByDebateId.get(idNum),
      });
    }

    // Parse PolicyVault + DCA Keeper Bounties
    const policyTuple =
      policyCfgRes.status === "fulfilled"
        ? (policyCfgRes.value as readonly [number, number, number, number, boolean])
        : ([1000, 500, 7000, 15, false] as const);

    const maxSingleTradeBps = Number(policyTuple[0]);
    const maxDailyDrawdownBps = Number(policyTuple[1]);
    const minConfidenceBps = Number(policyTuple[2]);
    const cooldownSeconds = Number(policyTuple[3]);
    const emergencyLock = Boolean(policyTuple[4]);

    const policyEquityWei =
      policyEquityRes.status === "fulfilled"
        ? (policyEquityRes.value as bigint)
        : 0n;
    const policyEquityBtc = Number(formatEther(policyEquityWei));
    const lastPolicyExecSec =
      policyLastExecRes.status === "fulfilled"
        ? Number(policyLastExecRes.value as bigint)
        : 0;
    const cooldownRemainingSec =
      lastPolicyExecSec > 0
        ? Math.max(0, lastPolicyExecSec + cooldownSeconds - nowSec)
        : 0;

    const maxAllowedWei = (policyEquityWei * BigInt(maxSingleTradeBps)) / 10_000n;
    const maxAllowedBtc = Number(formatEther(maxAllowedWei));

    const rawSchedules =
      schedulesRes.status === "fulfilled"
        ? (schedulesRes.value as Array<{
            scheduleId: bigint;
            creator: string;
            strategyName: string;
            targetAsset: string;
            sliceAmountWei: bigint;
            intervalSeconds: number;
            maxSlippageBps: number;
            totalSlices: number;
            executedSlices: number;
            lastExecutionTime: bigint;
            active: boolean;
          }>)
        : [];

    const dcaBounties: DcaKeeperOpportunity[] = [];
    for (const s of rawSchedules) {
      if (!s.active || s.executedSlices >= s.totalSlices) continue;
      const lastExecSec = Number(s.lastExecutionTime);
      const nextDueInSec =
        s.executedSlices === 0 || lastExecSec === 0
          ? 0
          : Math.max(0, lastExecSec + Number(s.intervalSeconds) - nowSec);
      const sliceWei = s.sliceAmountWei;
      const sliceBtc = Number(formatEther(sliceWei));
      const needsRectify = maxAllowedWei > 0n && sliceWei > maxAllowedWei;
      const rectifiedWei = needsRectify
        ? (maxAllowedWei * 95n) / 100n
        : sliceWei;

      let blockerReason = "";
      if (emergencyLock) {
        blockerReason = "PolicyVault emergencyLock is active.";
      } else if (policyEquityWei <= 0n) {
        blockerReason = "PolicyVault BTC equity is zero.";
      } else if (cooldownRemainingSec > 0) {
        blockerReason = `Global PolicyVault cooldown: ${cooldownRemainingSec}s left.`;
      } else if (nextDueInSec > 0) {
        blockerReason = `Schedule interval next due in ${nextDueInSec}s.`;
      }

      dcaBounties.push({
        scheduleId: Number(s.scheduleId),
        creator: s.creator,
        strategyName: s.strategyName,
        targetAsset: s.targetAsset,
        sliceAmountBtc: sliceBtc,
        sliceAmountWei: sliceWei.toString(),
        maxAllowedBtc,
        rectifiedAmountWei: rectifiedWei.toString(),
        intervalSeconds: Number(s.intervalSeconds),
        executedSlices: Number(s.executedSlices),
        totalSlices: Number(s.totalSlices),
        lastExecutionTimeSec: lastExecSec,
        nextDueInSec,
        cooldownRemainingSec,
        needsRectify,
        keeperExecutable: blockerReason === "" && rectifiedWei > 0n,
        blockerReason,
      });
    }

    // Parse Sub-Island Credit Loan Liquidations & Watchlist
    const rawIslands =
      allIslandsRes.status === "fulfilled" ? allIslandsRes.value : ([] as const);
    const islandNameMap = new Map<number, string>();
    for (const isl of rawIslands) {
      islandNameMap.set(Number(isl.islandId), isl.name);
    }

    const rawApps =
      allAppsRes.status === "fulfilled" ? allAppsRes.value : ([] as const);

    const activeDisbursed = rawApps.filter((a) => Number(a.status) === 3);
    const loanBounties: LoanKeeperOpportunity[] = [];

    const loanChecks = await Promise.allSettled(
      activeDisbursed.map(async (app) => {
        const councilAddr = ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil;
        const [interestWei, undercoll, grossNavWei, vaultMusdWei, vaultBtcWei] =
          await Promise.all([
            councilAddr
              ? publicClient.readContract({
                  address: councilAddr,
                  abi: ISLAND_CREDIT_COUNCIL_ABI,
                  functionName: "getTotalInterestOwed",
                  args: [app.appId],
                })
              : Promise.resolve(0n),
            publicClient.readContract({
              address: app.vault,
              abi: ISLAND_VAULT_ABI,
              functionName: "isLoanUndercollateralized",
            }),
            publicClient.readContract({
              address: app.vault,
              abi: ISLAND_VAULT_ABI,
              functionName: "getCurrentGrossNavUsd",
            }),
            publicClient.readContract({
              address: app.vault,
              abi: ISLAND_VAULT_ABI,
              functionName: "trackedMusdBalance",
            }),
            publicClient.readContract({
              address: app.vault,
              abi: ISLAND_VAULT_ABI,
              functionName: "trackedBtcBalance",
            }),
          ]);

        const remPrincipalWei =
          app.approvedMusd > app.principalRepaid
            ? app.approvedMusd - app.principalRepaid
            : 0n;
        const remPrincipal = Number(formatEther(remPrincipalWei));
        const interestOwed = Number(formatEther(interestWei as bigint));
        const grossNavUsd = Number(formatEther(grossNavWei as bigint));
        const totalDebtMusd = remPrincipal + interestOwed;
        const coveragePct =
          remPrincipal > 0 ? (grossNavUsd / remPrincipal) * 100 : 100;
        const dueDateSec = Number(app.dueDate);
        const isPastDue = dueDateSec > 0 && nowSec > dueDateSec;
        const isUndercollateralized = Boolean(undercoll);

        return {
          appId: Number(app.appId),
          islandId: Number(app.islandId),
          islandName:
            islandNameMap.get(Number(app.islandId)) ||
            `Sub-Island #${Number(app.islandId)}`,
          vaultAddress: app.vault,
          borrower: app.borrower,
          remainingPrincipalMusd: remPrincipal,
          interestOwedMusd: interestOwed,
          totalDebtMusd,
          grossNavUsd,
          trackedMusdBalance: Number(formatEther(vaultMusdWei as bigint)),
          trackedBtcBalance: Number(formatEther(vaultBtcWei as bigint)),
          coveragePct,
          dueDateSec,
          dueDateIso:
            dueDateSec > 0 ? new Date(dueDateSec * 1000).toISOString() : "",
          secondsUntilDue: Math.max(0, dueDateSec - nowSec),
          isPastDue,
          isUndercollateralized,
          keeperExecutable: isPastDue || isUndercollateralized,
        } satisfies LoanKeeperOpportunity;
      })
    );

    for (const item of loanChecks) {
      if (item.status === "fulfilled") {
        loanBounties.push(item.value);
      }
    }

    // Optional connected user Trove check
    let userTrove = {
      connected: hasUser,
      address: hasUser ? userParam : "",
      troveActive: false,
      icrPct: 0,
    };
    if (hasUser) {
      try {
        const status = await publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
          abi: TROVE_MANAGER_ABI,
          functionName: "getTroveStatus",
          args: [userParam as `0x${string}`],
        });
        if (Number(status) === 1) {
          const icrWei = await publicClient.readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
            abi: TROVE_MANAGER_ABI,
            functionName: "getCurrentICR",
            args: [userParam as `0x${string}`, priceWei],
          });
          userTrove = {
            connected: true,
            address: userParam,
            troveActive: true,
            icrPct: Number(formatEther(icrWei as bigint)) * 100,
          };
        }
      } catch {
        // ignore
      }
    }

    const mainTotalAssetsMusd =
      mainTotalAssetsRes.status === "fulfilled"
        ? Number(formatEther(mainTotalAssetsRes.value as bigint))
        : 0;
    const mainLiquidMusd =
      mainLiquidRes.status === "fulfilled"
        ? Number(formatEther(mainLiquidRes.value as bigint))
        : 0;
    const mainPrincipalMusd =
      mainPrincipalRes.status === "fulfilled"
        ? Number(formatEther(mainPrincipalRes.value as bigint))
        : 0;

    return NextResponse.json({
      ok: true,
      contracts: {
        ...DEFAULT_CONTRACT_ADDRESSES,
        ...ISLAND_ECOSYSTEM_ADDRESSES,
      },
      market: {
        btcPriceUsd,
        btc24hChangePct: marketSnap.change24hPercent,
        fearGreedIndex: marketSnap.fearGreedIndex,
        fearGreedLabel: marketSnap.fearGreedLabel,
        volatilityRegime: marketSnap.volatilityRegime,
        trendDirection: marketSnap.trendDirection,
        systemTcrPct,
        recoveryMode,
      },
      vaultSummary: {
        policyEquityBtc,
        maxSingleTradeBps,
        maxDailyDrawdownBps,
        minConfidenceBps,
        cooldownSeconds,
        cooldownRemainingSec,
        emergencyLock,
        mainTotalAssetsMusd,
        mainLiquidMusd,
        mainPrincipalMusd,
      },
      agents,
      debates,
      totalDebates,
      dcaBounties,
      loanBounties,
      userTrove,
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
    const body = await req.json().catch(() => ({}));
    const marketTicker = String(body.marketTicker || "BTC/USD")
      .trim()
      .slice(0, 32);
    const customPrompt = String(body.customPrompt || "")
      .trim()
      .slice(0, 280);
    const bullAgentId = Math.max(1, Number(body.bullAgentId || 2));
    const bearAgentId = Math.max(1, Number(body.bearAgentId || 4));
    const factCheckerId = Math.max(1, Number(body.factCheckerId || 5));

    const publicClient = getMezoPublicClient();
    const [market, priceWeiRes, totalAssetsRes, equityWeiRes] =
      await Promise.allSettled([
        fetchLiveCryptoNewsAndMarket(),
        publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.priceFeed,
          abi: PRICE_FEED_ABI,
          functionName: "fetchPrice",
        }),
        ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault
          ? publicClient.readContract({
              address: ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault,
              abi: MAIN_MUSD_VAULT_ABI,
              functionName: "totalAssets",
            })
          : Promise.resolve(0n),
        publicClient.readContract({
          address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "vaultTotalEquity",
        }),
      ]);

    const snap =
      market.status === "fulfilled"
        ? market.value
        : {
            btcPriceUsd: 90000,
            change24hPercent: 0,
            fearGreedIndex: 52,
            fearGreedLabel: "Neutral",
            volatilityRegime: "MODERATE" as const,
            trendDirection: "RANGE_BOUND" as const,
            newsHeadlines: [],
          };

    const btcUsd =
      priceWeiRes.status === "fulfilled" && (priceWeiRes.value as bigint) > 0n
        ? Number(formatEther(priceWeiRes.value as bigint))
        : snap.btcPriceUsd;
    const mainAssetsMusd =
      totalAssetsRes.status === "fulfilled"
        ? Number(formatEther(totalAssetsRes.value as bigint))
        : 0;
    const policyEquityBtc =
      equityWeiRes.status === "fulfilled"
        ? Number(formatEther(equityWeiRes.value as bigint))
        : 0;

    let systemTcrPct = 0;
    let recoveryMode = false;
    try {
      const pWei =
        priceWeiRes.status === "fulfilled" && (priceWeiRes.value as bigint) > 0n
          ? (priceWeiRes.value as bigint)
          : 90_000n * 10n ** 18n;
      const [tcrWei, rec] = await Promise.all([
        publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
          abi: TROVE_MANAGER_ABI,
          functionName: "getTCR",
          args: [pWei],
        }),
        publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
          abi: TROVE_MANAGER_ABI,
          functionName: "checkRecoveryMode",
          args: [pWei],
        }),
      ]);
      systemTcrPct = Number(formatEther(tcrWei as bigint)) * 100;
      recoveryMode = Boolean(rec);
    } catch {
      // ignore
    }

    const marketImpliedYesBps = Math.min(
      9500,
      Math.max(1000, Math.round(snap.fearGreedIndex * 100))
    );

    const baseCouncilBps = recoveryMode
      ? Math.max(2200, Math.min(4800, marketImpliedYesBps - 1400))
      : snap.change24hPercent >= 0
        ? Math.min(8900, Math.max(5800, marketImpliedYesBps + 900))
        : Math.min(7200, Math.max(4400, 5600 + Math.round(snap.change24hPercent * 120)));

    const deterministicSynthesis = JSON.stringify({
      thesis: `${marketTicker}: BTC $${Math.round(btcUsd).toLocaleString()}, TCR ${systemTcrPct.toFixed(1)}%, F&G ${snap.fearGreedIndex} (${snap.trendDirection})${customPrompt ? ` — ${customPrompt}` : ""}`.slice(
        0,
        150
      ),
      bullArgument: `Agent #${bullAgentId} (Bull): BTC holds $${Math.round(btcUsd).toLocaleString()} with ${snap.trendDirection} momentum, MainMUSDVault TVL ${mainAssetsMusd.toFixed(2)} MUSD, and PolicyVault ${policyEquityBtc.toFixed(5)} BTC ready to deploy safely within 10% single-trade caps.`,
      bearArgument: `Agent #${bearAgentId} (Bear): Volatility regime is ${snap.volatilityRegime} (${snap.change24hPercent.toFixed(2)}% 24h) and system TCR sits at ${systemTcrPct.toFixed(1)}%${recoveryMode ? " (RECOVERY MODE ACTIVE)" : ""}; oversized leverage or concentrated Sub-Island loans must stay strictly capped.`,
      factCheckVerdict: `Agent #${factCheckerId} (Fact-Checker): Verified Mezo PriceFeed ($${btcUsd.toFixed(2)}), TroveManager TCR (${systemTcrPct.toFixed(1)}%), and F&G (${snap.fearGreedIndex}/100). Council assigns ${(baseCouncilBps / 100).toFixed(1)}% conviction vs ${(marketImpliedYesBps / 100).toFixed(1)}% market implied.`,
      councilYesBps: baseCouncilBps,
      marketYesBps: marketImpliedYesBps,
    });

    const headlinesSummary = snap.newsHeadlines
      .slice(0, 4)
      .map((h) => `- ${h.title} (${h.sentiment})`)
      .join("\n");

    const aiRes = await callGeminiAgentModel({
      model: "gemini-3.8-flash",
      systemPrompt:
        "You are orchestrating an on-chain adversarial 3-agent debate for MezoCity (AgentRegistry.anchorCouncilDebate). Output STRICT JSON only with keys: thesis (max 140 chars), bullArgument (2 concise sentences), bearArgument (2 concise sentences), factCheckVerdict (2 concise sentences), councilYesBps (integer 500..9500), marketYesBps (integer 500..9500). Base numbers strictly on the provided live telemetry.",
      userPrompt: [
        `Target Market: ${marketTicker}`,
        customPrompt ? `User Topic Focus: ${customPrompt}` : "",
        `Live Mezo PriceFeed BTC/USD: $${btcUsd.toFixed(2)} (24h ${snap.change24hPercent.toFixed(2)}%)`,
        `Mezo System TCR: ${systemTcrPct.toFixed(2)}% | Recovery Mode: ${recoveryMode}`,
        `MainMUSDVault Total Assets: ${mainAssetsMusd.toFixed(2)} MUSD | PolicyVault BTC: ${policyEquityBtc.toFixed(5)} BTC`,
        `Fear & Greed Index: ${snap.fearGreedIndex}/100 (${snap.fearGreedLabel}) | Regime: ${snap.volatilityRegime}`,
        headlinesSummary ? `Headlines:\n${headlinesSummary}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      liveDataSynthesis: deterministicSynthesis,
      geminiApiKeyOverride:
        typeof body.geminiApiKeyOverride === "string"
          ? body.geminiApiKeyOverride
          : undefined,
    });

    const parsed =
      extractFirstJsonObject(aiRes.text) ||
      extractFirstJsonObject(deterministicSynthesis) ||
      {};

    const thesis = String(
      parsed.thesis || `${marketTicker} @ $${Math.round(btcUsd).toLocaleString()} Consensus`
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 155);

    const bullArgument = String(parsed.bullArgument || "");
    const bearArgument = String(parsed.bearArgument || "");
    const factCheckVerdict = String(parsed.factCheckVerdict || "");

    const councilYesBps = Math.min(
      9800,
      Math.max(200, Math.round(Number(parsed.councilYesBps || baseCouncilBps)))
    );
    const marketYesBps = Math.min(
      9800,
      Math.max(200, Math.round(Number(parsed.marketYesBps || marketImpliedYesBps)))
    );

    const canonicalTranscript = JSON.stringify({
      version: "mezocity-debate-v1",
      chainId: 31611,
      marketTicker,
      thesis,
      bullAgentId,
      bearAgentId,
      factCheckerId,
      councilYesBps,
      marketYesBps,
      bullArgument,
      bearArgument,
      factCheckVerdict,
      btcPriceUsd: Number(btcUsd.toFixed(2)),
      systemTcrPct: Number(systemTcrPct.toFixed(2)),
      synthesizedAt: new Date().toISOString(),
    });

    const transcriptHash = keccak256(toBytes(canonicalTranscript));

    return NextResponse.json({
      ok: true,
      draft: {
        marketTicker,
        thesis,
        bullAgentId,
        bearAgentId,
        factCheckerId,
        councilYesBps,
        marketYesBps,
        divergenceBps: councilYesBps - marketYesBps,
        bullArgument,
        bearArgument,
        factCheckVerdict,
        transcriptHash,
        provider: aiRes.provider,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
