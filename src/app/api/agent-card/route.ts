import { NextResponse } from "next/server";
import { INITIAL_AGENTS, INITIAL_PREDICTION_MARKETS } from "@/lib/simulation-data";
import { DEFAULT_CONTRACT_ADDRESSES } from "@/lib/mezo-chain";

export async function GET() {
  return NextResponse.json({
    schemaVersion: "1.0.0",
    protocol: "4lpha-ERC8004-A2A",
    name: "MezoCity // 4LPHA Autonomous Clay Island",
    description:
      "Policy-fenced autonomous AI agent town on Mezo Testnet (Chain ID 31611). Combines Polly.town multi-agent dialectic consensus with 4lpha.tech Verify-Then-Trust smart contract Policy Vaults.",
    network: {
      name: "Mezo Testnet",
      chainId: 31611,
      hexChainId: "0x7b7b",
      nativeCurrency: {
        symbol: "BTC",
        decimals: 18,
      },
      rpcUrl: "https://rpc.test.mezo.org",
      wssUrl: "wss://rpc-ws.test.mezo.org",
      explorerUrl: "https://explorer.test.mezo.org",
    },
    contracts: DEFAULT_CONTRACT_ADDRESSES,
    endpoints: {
      mcp: "/api/mcp",
      agentCard: "/.well-known/agent-card.json",
      docs: "/#start",
    },
    policyModel: {
      paradigm: "Verify, Then Trust",
      defaultGuardrails: {
        maxSingleTradeBps: 1000,
        maxDailyDrawdownBps: 500,
        minConfidenceBps: 7000,
        cooldownSeconds: 15,
      },
    },
    agents: INITIAL_AGENTS.map((a) => ({
      id: a.id,
      erc8004Id: a.erc8004Id,
      name: a.name,
      role: a.role,
      operator: a.operatorAddress,
      strategySpecHash: a.strategySpecHash,
      reputationBps: a.reputationBps,
      winRate: a.winRate,
      skills: a.skills,
    })),
    activeMarkets: INITIAL_PREDICTION_MARKETS.length,
  });
}

