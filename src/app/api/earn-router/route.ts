import { NextRequest, NextResponse } from "next/server";
import { formatUnits, parseUnits } from "viem";
import { MEZO_EARN_ADDRESSES, TIGRIS_ROUTER_ABI, extractEvmRevertReason } from "@/lib/mezo-chain";
import {
  executeOperatorEarnInvestment,
  quoteTigrisSwapServer,
  readMezoEarnSnapshot,
  type AgentEarnTarget,
} from "@/lib/mezo-earn-server";
import { getMezoPublicClient } from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

const ALLOWED_AGENT_VENUES = new Set<AgentEarnTarget>([
  "smusd",
  "upmusd",
  "stability-pool",
  "pool-musd-mezo",
  "pool-musd-btc",
  "pool-musd-musdc",
]);

export async function GET(req: NextRequest) {
  try {
    const userAddress = (req.nextUrl.searchParams.get("user") || "").trim();
    const snapshot = await readMezoEarnSnapshot({ userAddress });
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: extractEvmRevertReason(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      userAddress?: string;
      venueId?: string;
      musdAmount?: number;
      fromToken?: `0x${string}`;
      toToken?: `0x${string}`;
      stable?: boolean;
      viaMusdHop?: boolean;
      amountIn?: string;
      decimalsIn?: number;
      decimalsOut?: number;
      tokenA?: `0x${string}`;
      tokenB?: `0x${string}`;
      amountADesiredWei?: string;
      amountBDesiredWei?: string;
    };

    if (body.action === "quote-swap") {
      if (!body.fromToken || !body.toToken || !body.amountIn) {
        return NextResponse.json(
          { ok: false, error: "fromToken, toToken, and amountIn are required" },
          { status: 400 }
        );
      }
      const decIn = Number(body.decimalsIn ?? 18);
      const decOut = Number(body.decimalsOut ?? 18);
      const amountInWei = parseUnits(String(body.amountIn), decIn);
      if (amountInWei <= 0n) {
        return NextResponse.json(
          { ok: false, error: "Enter a positive swap amount" },
          { status: 400 }
        );
      }
      const quote = await quoteTigrisSwapServer({
        fromToken: body.fromToken,
        toToken: body.toToken,
        stable: Boolean(body.stable),
        amountInWei,
        viaMusdHop: Boolean(body.viaMusdHop),
      });
      return NextResponse.json({
        ok: true,
        amountInWei: amountInWei.toString(),
        amountOutWei: quote.amountOutWei.toString(),
        amountOut: formatUnits(quote.amountOutWei, decOut),
        routes: quote.routes,
      });
    }

    if (body.action === "quote-lp") {
      if (
        !body.tokenA ||
        !body.tokenB ||
        !body.amountADesiredWei ||
        !body.amountBDesiredWei
      ) {
        return NextResponse.json(
          { ok: false, error: "Missing LP quote inputs" },
          { status: 400 }
        );
      }
      const publicClient = getMezoPublicClient();
      const [amountA, amountB, liquidity] = (await publicClient.readContract({
        address: MEZO_EARN_ADDRESSES.tigrisRouter,
        abi: TIGRIS_ROUTER_ABI,
        functionName: "quoteAddLiquidity",
        args: [
          body.tokenA,
          body.tokenB,
          Boolean(body.stable),
          MEZO_EARN_ADDRESSES.tigrisPoolFactory,
          BigInt(body.amountADesiredWei),
          BigInt(body.amountBDesiredWei),
        ],
      })) as [bigint, bigint, bigint];

      return NextResponse.json({
        ok: true,
        amountAWei: amountA.toString(),
        amountBWei: amountB.toString(),
        liquidityWei: liquidity.toString(),
      });
    }

    if (body.action === "execute-ai-rotation") {
      const preSnapshot = await readMezoEarnSnapshot({
        userAddress: body.userAddress,
      });
      const requestedVenue = body.venueId as AgentEarnTarget | undefined;
      const targetVenue: AgentEarnTarget =
        requestedVenue && ALLOWED_AGENT_VENUES.has(requestedVenue)
          ? requestedVenue
          : preSnapshot.recommendation.btcLowTriggerActive &&
              preSnapshot.recommendation.regime === "BTC_DIP_ACCUMULATE"
            ? "stability-pool"
            : preSnapshot.recommendation.primaryVaultId;

      const execution = await executeOperatorEarnInvestment({
        venueId: targetVenue,
        musdAmount: body.musdAmount,
      });
      const snapshot = await readMezoEarnSnapshot({
        userAddress: body.userAddress,
      });
      return NextResponse.json({
        ok: true,
        execution,
        snapshot,
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${String(body.action || "")}` },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: extractEvmRevertReason(err) },
      { status: 500 }
    );
  }
}
