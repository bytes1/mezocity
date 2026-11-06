import { NextResponse } from "next/server";
import { DEFAULT_CONTRACT_ADDRESSES } from "@/lib/mezo-chain";
import { fetchLiveOnChainState } from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await fetchLiveOnChainState(undefined, false);

    return NextResponse.json({
      schemaVersion: "2.0.0",
      protocol: "4lpha-ERC8004-A2A",
      name: "Mezo Town // 4LPHA Indian Mythology Autonomous DCA & News Agent Island",
      description:
        "Autonomous 5-Agent Indian Mythology AI crew on Mezo Testnet (Chain ID 31611) powered by Google Gemini (gemini-2.5-flash & gemini-2.5-flash-lite), Inngest hourly cron, and Neon Serverless Postgres: Indra (Head Orchestrator), Kubera (BTC DCA & Treasury), Dhanvantari (Self-Healing Error Rectifier), Sudarshana (PolicyVault Guardrail Auditor), and Narada (Live Crypto & Macro News Capturing Sage).",
      network: {
        name: "Mezo Testnet",
        chainId: 31611,
        hexChainId: "0x7b7b",
        blockNumber: state.blockNumber,
        nativeCurrency: {
          symbol: "BTC",
          decimals: 18,
        },
        rpcUrl: "https://rpc.test.mezo.org",
        wssUrl: "wss://rpc-ws.test.mezo.org",
        explorerUrl: "https://explorer.test.mezo.org",
      },
      contracts: DEFAULT_CONTRACT_ADDRESSES,
      vaultMetrics: {
        vaultTvlBtc: state.vaultTvlBtc,
        vaultTvlWei: state.vaultTvlWei,
        guardrails: state.guardrails,
        totalSlicesExecuted: state.totalSlicesExecuted,
        totalErrorsRectifiedOnChain: state.rectifiedCount,
      },
      endpoints: {
        onChainState: "/api/onchain-state",
        aiOrchestrator: "/api/ai-agents",
        mcp: "/api/mcp",
        agentCard: "/.well-known/agent-card.json",
      },
      agents: state.agents.map((a) => ({
        id: a.id,
        erc8004Id: a.erc8004Id,
        name: a.name,
        role: a.role,
        aiModel: a.aiModelName,
        operator: a.operatorAddress,
        strategySpecHash: a.strategySpecHash,
        reputationBps: a.reputationBps,
        totalActions: a.totalActions,
        successRate: a.successRate,
        skills: a.skills,
      })),
      activeDCASchedules: state.dcaSchedules.length,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
