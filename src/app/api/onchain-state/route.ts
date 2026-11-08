import { NextRequest, NextResponse } from "next/server";
import {
  DCA_ENGINE_ABI,
  DEFAULT_CONTRACT_ADDRESSES,
  POLICY_VAULT_ABI,
} from "@/lib/mezo-chain";
import {
  fetchLiveOnChainState,
  getMezoOperatorWallet,
  getMezoPublicClient,
  toSafeEtherWei,
  withOperatorLock,
} from "@/lib/mezo-onchain-server";
import {
  getInngestRunTelemetry,
  getLatestCyclesFromNeon,
} from "@/lib/neon-db";
import { fetchLiveCryptoNewsAndMarket } from "@/lib/gemini-agents";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userAddress = req.nextUrl.searchParams.get("user") || undefined;
    const [state, neonStatus, inngestTelemetry, liveNews] = await Promise.all([
      fetchLiveOnChainState(userAddress, true),
      getLatestCyclesFromNeon(8),
      getInngestRunTelemetry(),
      fetchLiveCryptoNewsAndMarket(),
    ]);

    // Bind each agent's speechBubble to their real latest message stored in Neon Serverless Postgres
    const latestMessages = neonStatus.latestCycle?.messages || [];
    state.agents = state.agents.map((ag) => {
      const latestTurn = latestMessages.find((m) => m.speaker === ag.name);
      return {
        ...ag,
        speechBubble: latestTurn
          ? latestTurn.text.slice(0, 120)
          : `Registered on AgentRegistry.sol (${ag.erc8004Id}) • Reputation ${(
              ag.reputationBps / 100
            ).toFixed(2)}% • Actions: ${ag.totalActions}`,
      };
    });

    // Merge any Google Search Grounded headlines from the latest Neon cycle into liveNews
    const latestNeonHeadlines = neonStatus.latestCycle?.newsHeadlines || [];
    const groundedFromNeon = latestNeonHeadlines.filter((h) =>
      h.source?.toLowerCase().includes("google search")
    );
    if (groundedFromNeon.length > 0) {
      const existingTitles = new Set(
        liveNews.newsHeadlines.map((h) => h.title.toLowerCase())
      );
      const merged = [
        ...groundedFromNeon.filter(
          (h) => !existingTitles.has(h.title.toLowerCase())
        ),
        ...liveNews.newsHeadlines,
      ].slice(0, 8);
      liveNews.newsHeadlines = merged;
    }

    return NextResponse.json({
      ok: true,
      state,
      neonStatus,
      inngestTelemetry,
      liveNews,
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      ),
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
    const { action, userAddress } = body;

    const txResult = await withOperatorLock(async () => {
      const publicClient = getMezoPublicClient();
      const { account, walletClient } = getMezoOperatorWallet();
      const nonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });

      if (action === "DEPOSIT") {
        const valueWei = toSafeEtherWei(body.amountBtc || "0.0001");
        const opBal = await publicClient.getBalance({
          address: account.address,
        });
        // Ensure we never spend more than 50% of remaining operator gas balance
        const safeValueWei =
          valueWei > opBal / 2n ? opBal / 4n : valueWei;
        if (safeValueWei <= 0n) {
          throw new Error(
            "Insufficient BTC balance in operator wallet on Mezo Testnet"
          );
        }

        const txHash = await walletClient.writeContract({
          address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "deposit",
          value: safeValueWei,
          nonce,
          gas: 250000n,
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        return {
          txHash,
          blockNumber: receipt.blockNumber.toString(),
          depositedWei: safeValueWei.toString(),
        };
      }

      if (action === "WITHDRAW") {
        const requestedWei = toSafeEtherWei(body.amountBtc || "0.00005");
        const userDep = await publicClient.readContract({
          address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "userDeposits",
          args: [account.address],
        });
        const withdrawWei =
          requestedWei > userDep ? userDep / 2n : requestedWei;
        if (withdrawWei <= 0n) {
          throw new Error("No operator deposit balance available to withdraw");
        }

        const txHash = await walletClient.writeContract({
          address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "withdraw",
          args: [withdrawWei],
          nonce,
          gas: 250000n,
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        return {
          txHash,
          blockNumber: receipt.blockNumber.toString(),
          withdrawnWei: withdrawWei.toString(),
        };
      }

      if (action === "UPDATE_POLICY") {
        const maxSingleTradeBps = Number(body.maxSingleTradeBps ?? 1000);
        const maxDailyDrawdownBps = Number(body.maxDailyDrawdownBps ?? 500);
        const minConfidenceBps = Number(body.minConfidenceBps ?? 7000);
        const cooldownSeconds = Number(body.cooldownSeconds ?? 0);
        const emergencyLock = Boolean(body.emergencyLock ?? false);

        const txHash = await walletClient.writeContract({
          address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "updatePolicy",
          args: [
            maxSingleTradeBps,
            maxDailyDrawdownBps,
            minConfidenceBps,
            cooldownSeconds,
            emergencyLock,
          ],
          nonce,
          gas: 250000n,
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        return {
          txHash,
          blockNumber: receipt.blockNumber.toString(),
        };
      }

      if (action === "CREATE_DCA_SCHEDULE") {
        const strategyName = String(
          body.strategyName || "stBTC Auto-DCA Accumulation"
        );
        const targetAsset = String(body.targetAsset || "stBTC-MEZO-VAULT");
        let sliceAmountWei = toSafeEtherWei(body.sliceAmountBtc || "0.000025");
        if (sliceAmountWei <= 0n) {
          sliceAmountWei = 1000n;
        }
        const intervalSeconds = Number(body.intervalSeconds || 3600);
        const maxSlippageBps = Number(body.maxSlippageBps || 45);
        const totalSlices = Number(body.totalSlices || 24);

        const txHash = await walletClient.writeContract({
          address: DEFAULT_CONTRACT_ADDRESSES.dcaEngine,
          abi: DCA_ENGINE_ABI,
          functionName: "createDCASchedule",
          args: [
            strategyName,
            targetAsset,
            sliceAmountWei,
            intervalSeconds,
            maxSlippageBps,
            totalSlices,
          ],
          nonce,
          gas: 450000n,
        });
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        return {
          txHash,
          blockNumber: receipt.blockNumber.toString(),
        };
      }

      throw new Error(`Unsupported action: ${action}`);
    });

    const state = await fetchLiveOnChainState(userAddress, false);

    return NextResponse.json({
      ok: true,
      ...txResult,
      state,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
