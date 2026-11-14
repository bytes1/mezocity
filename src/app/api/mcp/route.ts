import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";
import {
  DEFAULT_CONTRACT_ADDRESSES,
  MEZO_EARN_ADDRESSES,
  MEZO_TESTNET_LENDING_ADDRESSES,
  POLICY_VAULT_ABI,
} from "@/lib/mezo-chain";
import { ISLAND_ECOSYSTEM_ADDRESSES } from "@/lib/island-contracts";
import { listLeaderboardSignalsFromNeon } from "@/lib/island-db";
import { readMezoEarnSnapshot } from "@/lib/mezo-earn-server";
import {
  fetchLiveOnChainState,
  getMezoPublicClient,
} from "@/lib/mezo-onchain-server";
import {
  fetchEcosystemDecisionContext,
  fetchLiveCryptoNewsAndMarket,
} from "@/lib/gemini-agents";

export const dynamic = "force-dynamic";

const MCP_TOOLS = [
  {
    name: "get_island_state",
    description:
      "Reads live on-chain MezoCity 5-agent Transformers state (Optimus Prime, Bumblebee, Ratchet, Ironhide, Soundwave), active BTC Strategy Vault schedules, and PolicyVault metrics directly from Mezo Testnet (Chain ID: 31611).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_ecosystem_telemetry",
    description:
      "Reads cross-protocol Main Island + Archipelago state in one call: PolicyVault guardrails, MainMUSDVault utilization & operator MUSD balance, IslandCreditCouncil active & overdue loans, Mezo Trove Guard health factor, and active AI Strategy Mandate.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_mezo_earn_opportunities",
    description:
      "Reads live Mezo Testnet Earn Vaults (sMUSD, upMUSD, StabilityPool, upBTC, Morpho) and Tigris AMM Pools (MUSD/BTC, MUSD/MEZO, MUSD/mUSDC, MEZO/stMEZO, mcbBTC/BTC) plus the BTC-low MUSD & MEZO Earn Router recommendation.",
    inputSchema: {
      type: "object",
      properties: {
        userAddress: {
          type: "string",
          description: "Optional EVM address to include wallet-specific vault & LP balances.",
        },
      },
    },
  },
  {
    name: "get_sub_island_leaderboard",
    description:
      "Reads deployed EIP-1167 Sub-Islands sorted by verified profit/equity/ROI alongside Credit Council status and 1-click strategy clone blueprints.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "check_policy_vault",
    description:
      "Calls PolicyVault.checkPolicyGuardrails() directly on Mezo Testnet (31611) for a proposed BTC Strategy Vault slice and computes Ratchet AI's rectified slice size.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "number",
          description: "ERC-8004 Agent ID on Mezo Testnet (1..5)",
        },
        amountBtc: {
          type: "number",
          description: "Proposed BTC vault execution slice in BTC",
        },
        confidenceBps: {
          type: "number",
          description: "AI consensus score in bps (0-10000)",
        },
      },
      required: ["amountBtc"],
    },
  },
  {
    name: "get_erc8004_agents",
    description:
      "Reads all 5 ERC-8004 registered Transformers AI agents from AgentRegistry.sol (0x4e6a49b021f01fbbA71408de556aA41aC491A426) on Mezo Testnet (31611).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function GET() {
  return NextResponse.json({
    protocol: "Model Context Protocol (MCP) // MezoCity",
    version: "2025-03-26",
    server: "mezocity-mcp",
    chainId: 31611,
    network: "Mezo Testnet",
    contracts: {
      customMainIsland: DEFAULT_CONTRACT_ADDRESSES,
      customArchipelago: ISLAND_ECOSYSTEM_ADDRESSES,
      mezoLending: MEZO_TESTNET_LENDING_ADDRESSES,
      mezoEarnAndTigris: MEZO_EARN_ADDRESSES,
    },
    tools: MCP_TOOLS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id = 1, method, params = {} } = body;

    if (method === "tools/list") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { tools: MCP_TOOLS },
      });
    }

    if (method === "tools/call") {
      const toolName = params.name;
      const args = params.arguments || {};

      if (toolName === "get_ecosystem_telemetry") {
        const [state, market, eco] = await Promise.all([
          fetchLiveOnChainState(undefined, false),
          fetchLiveCryptoNewsAndMarket(),
          fetchEcosystemDecisionContext(),
        ]);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            chainId: 31611,
            blockNumber: state.blockNumber,
            mandate: eco.mandate,
            market: {
              btcPriceUsd: market.btcPriceUsd,
              change24hPercent: market.change24hPercent,
              trendDirection: market.trendDirection,
              volatilityRegime: market.volatilityRegime,
              fearGreedIndex: market.fearGreedIndex,
              sentimentLabel: market.sentimentLabel,
            },
            policyVault: {
              tvlBtc: state.vaultTvlBtc,
              guardrails: state.guardrails,
            },
            musdVault: {
              ...eco.musdVault,
              operatorVaultSharesWei: eco.musdVault.operatorVaultSharesWei.toString(),
            },
            creditCouncil: eco.credit,
            lendingGuard: eco.lendingGuard
              ? {
                  status: eco.lendingGuard.status,
                  currentHf: eco.lendingGuard.currentHf,
                  triggerHf: eco.lendingGuard.triggerHf,
                  targetHf: eco.lendingGuard.targetHf,
                  debtMusd: eco.lendingGuard.debtMusd,
                  collateralBtc: eco.lendingGuard.collateralBtc,
                }
              : null,
          },
        });
      }

      if (toolName === "get_mezo_earn_opportunities") {
        const userAddress =
          typeof args.userAddress === "string" ? args.userAddress.trim() : "";
        const earn = await readMezoEarnSnapshot({ userAddress });
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            chainId: earn.chainId,
            btcPriceUsd: earn.btcPriceUsd,
            btc24hChangePct: earn.btc24hChangePct,
            mezoSpotUsd: earn.mezoSpotUsd,
            fearGreedIndex: earn.fearGreedIndex,
            trendDirection: earn.trendDirection,
            recommendation: earn.recommendation,
            vaults: earn.vaults.map((v) => ({
              id: v.id,
              name: v.name,
              symbol: v.symbol,
              address: v.contractAddress,
              asset: v.assetSymbol,
              tvlUsd: v.tvlUsd,
              sharePrice: v.sharePrice,
              riskTier: v.riskTier,
            })),
            pools: earn.pools.map((p) => ({
              id: p.id,
              name: p.name,
              address: p.poolAddress,
              gaugeAddress: p.gaugeAddress || null,
              stable: p.stable,
              tvlUsd: p.tvlUsd,
              voterWeight: p.voterWeight,
              reserve0: p.reserve0,
              reserve1: p.reserve1,
            })),
          },
        });
      }

      if (toolName === "get_sub_island_leaderboard") {
        const signals = await listLeaderboardSignalsFromNeon();
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            chainId: 31611,
            totalSubIslands: signals.length,
            topSubIslands: signals.slice(0, 10).map((s) => ({
              islandId: s.island.islandId,
              chainIslandId: s.island.chainIslandId,
              name: s.island.name,
              biomeTheme: s.island.biomeTheme,
              vaultAddress: s.island.vaultAddress,
              navUsd: s.navUsd,
              netProfitUsd: s.netProfitUsd,
              roiBps: s.roiBps,
              cycleCount: s.cycleCount,
              repaidLoanCount: s.repaidLoanCount,
              latestLoanStatus: s.island.latestLoanStatus ?? null,
              vaultCount: s.vaults.length,
              agentCount: s.agents.length,
            })),
          },
        });
      }

      if (toolName === "get_erc8004_agents") {
        const state = await fetchLiveOnChainState(undefined, false);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            chainId: 31611,
            blockNumber: state.blockNumber,
            agentRegistry: DEFAULT_CONTRACT_ADDRESSES.agentRegistry,
            agents: state.agents,
          },
        });
      }

      if (toolName === "check_policy_vault") {
        const publicClient = getMezoPublicClient();
        const state = await fetchLiveOnChainState(undefined, false);
        const agentId = BigInt(args.agentId ?? 3);
        const confidenceBps = Number(args.confidenceBps ?? 9200);
        const defaultOversized =
          state.vaultTvlBtc > 0 ? state.vaultTvlBtc * 0.22 : 0.0001;
        const amountBtc = Number(args.amountBtc ?? defaultOversized);
        const amountWei = parseEther(amountBtc.toFixed(18));

        const [allowed, reason] = await publicClient.readContract({
          address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "checkPolicyGuardrails",
          args: [agentId, amountWei, confidenceBps],
        });

        const maxAllowedBtc =
          (state.vaultTvlBtc * state.guardrails.maxSingleTradeBps) / 10000;
        const recommendedRectifiedBtc = maxAllowedBtc * 0.75;

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            verifiedOnChainId: 31611,
            blockNumber: state.blockNumber,
            policyVaultAddress: DEFAULT_CONTRACT_ADDRESSES.policyVault,
            vaultTvlBtc: state.vaultTvlBtc,
            proposedAmountBtc: amountBtc,
            maxAllowedBtc,
            allowed,
            onChainReason: reason,
            ratchetAiRecommendation: allowed
              ? "Slice complies with PolicyVault.sol on-chain guardrails."
              : `Ratchet AI (ERC8004-MEZO #03) recommends calling MezoDCAEngine.rectifyAndExecuteDCASlice() with ${recommendedRectifiedBtc.toFixed(
                  8
                )} BTC.`,
          },
        });
      }

      const state = await fetchLiveOnChainState(undefined, false);
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          network: "Mezo Testnet (31611)",
          blockNumber: state.blockNumber,
          contracts: state.contracts,
          vaultEquityBtc: state.vaultTvlBtc,
          guardrails: state.guardrails,
          agents: state.agents,
          dcaSchedules: state.dcaSchedules,
          recentExecutions: state.executionLedger,
        },
      });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: { status: "ready", chainId: 31611 },
    });
  } catch (err) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32700, message: String(err) } },
      { status: 400 }
    );
  }
}
