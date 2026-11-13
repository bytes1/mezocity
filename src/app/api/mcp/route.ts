import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";
import {
  DEFAULT_CONTRACT_ADDRESSES,
  POLICY_VAULT_ABI,
} from "@/lib/mezo-chain";
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
      "Reads live on-chain MezoCity 5-agent Transformers state (Optimus Prime, Bumblebee, Ratchet, Ironhide, Soundwave), active DCA schedules, and PolicyVault metrics directly from Mezo Testnet (Chain ID: 31611).",
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
    name: "check_policy_vault",
    description:
      "Calls PolicyVault.checkPolicyGuardrails() directly on Mezo Testnet (31611) for a proposed BTC DCA slice and computes Ratchet AI's rectified slice size.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "number",
          description: "ERC-8004 Agent ID on Mezo Testnet (1..5)",
        },
        amountBtc: {
          type: "number",
          description: "Proposed DCA slice in BTC",
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
    contracts: DEFAULT_CONTRACT_ADDRESSES,
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
        const agentId = BigInt(args.agentId ?? 2);
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
            patchAiRecommendation: allowed
              ? "Slice complies with PolicyVault.sol on-chain guardrails."
              : `Patch AI (ERC8004 #03) recommends calling MezoDCAEngine.rectifyAndExecuteDCASlice() with ${recommendedRectifiedBtc.toFixed(
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
