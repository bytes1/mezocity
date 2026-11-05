import { NextRequest, NextResponse } from "next/server";
import {
  INITIAL_AGENTS,
  INITIAL_DEBATE_FEED,
  INITIAL_EXECUTION_LEDGER,
  INITIAL_PREDICTION_MARKETS,
} from "@/lib/simulation-data";
import { DEFAULT_CONTRACT_ADDRESSES } from "@/lib/mezo-chain";

const MCP_TOOLS = [
  {
    name: "get_island_state",
    description:
      "Returns the live MezoCity clay island state, active Council debate, and Mezo Testnet (31611) vault metrics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "check_policy_vault",
    description:
      "Simulates the 4lpha PolicyVault.checkPolicyGuardrails() verification on Mezo Testnet for a proposed BTC trade.",
    inputSchema: {
      type: "object",
      properties: {
        amountBtc: { type: "number", description: "Proposed trade size in BTC" },
        vaultEquityBtc: { type: "number", description: "Current vault TVL in BTC" },
        confidenceBps: { type: "number", description: "Council confidence in bps (0-10000)" },
        maxSingleTradeBps: { type: "number", description: "Max trade cap in bps" },
        minConfidenceBps: { type: "number", description: "Min confidence cap in bps" },
      },
      required: ["amountBtc", "confidenceBps"],
    },
  },
  {
    name: "get_erc8004_agents",
    description:
      "Lists all 7 ERC-8004 registered autonomous agents (Polly, Pip, Hoot, Brutus, Bramble, Sentinel, SatoshiQuant).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export async function GET() {
  return NextResponse.json({
    protocol: "Model Context Protocol (MCP) // 4lpha.tech",
    version: "2025-03-26",
    server: "mezocity-4lpha-mcp",
    chainId: 31611,
    network: "Mezo Testnet",
    contracts: DEFAULT_CONTRACT_ADDRESSES,
    tools: MCP_TOOLS,
    usage: "POST JSON-RPC 2.0 requests with method 'tools/list' or 'tools/call'",
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

      if (toolName === "get_erc8004_agents") {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            chainId: 31611,
            agents: INITIAL_AGENTS,
          },
        });
      }

      if (toolName === "check_policy_vault") {
        const amountBtc = Number(args.amountBtc ?? 0.85);
        const vaultEquityBtc = Number(args.vaultEquityBtc ?? 12.5);
        const confidenceBps = Number(args.confidenceBps ?? 7900);
        const maxSingleTradeBps = Number(args.maxSingleTradeBps ?? 1000);
        const minConfidenceBps = Number(args.minConfidenceBps ?? 7000);

        const shareBps = Math.round((amountBtc / vaultEquityBtc) * 10000);
        let allowed = true;
        let reason = "VERIFIED_OK";

        if (confidenceBps < minConfidenceBps) {
          allowed = false;
          reason = `LOW_CONFIDENCE: ${confidenceBps} bps < ${minConfidenceBps} bps guardrail`;
        } else if (shareBps > maxSingleTradeBps) {
          allowed = false;
          reason = `MAX_TRADE_EXCEEDED: ${shareBps} bps > ${maxSingleTradeBps} bps guardrail`;
        }

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            allowed,
            reason,
            shareBps,
            confidenceBps,
            verifiedOnChainId: 31611,
          },
        });
      }

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          network: "Mezo Testnet (31611)",
          vaultEquityBtc: 12.5,
          agents: INITIAL_AGENTS,
          markets: INITIAL_PREDICTION_MARKETS,
          recentDebate: INITIAL_DEBATE_FEED,
          recentExecutions: INITIAL_EXECUTION_LEDGER,
        },
      });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        message: "MezoCity 4lpha MCP Server Ready",
        availableMethods: ["tools/list", "tools/call"],
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Invalid JSON payload", details: String(err) },
      },
      { status: 400 }
    );
  }
}

