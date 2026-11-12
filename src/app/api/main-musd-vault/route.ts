import { NextRequest, NextResponse } from "next/server";
import { formatEther } from "viem";
import {
  ISLAND_CREDIT_COUNCIL_ABI,
  ISLAND_ECOSYSTEM_ADDRESSES,
  MAIN_MUSD_VAULT_ABI,
  MEZO_SWAP_POOL_ABI,
} from "@/lib/island-contracts";
import { listLoanApplicationsFromNeon } from "@/lib/island-db";
import {
  MEZO_TESTNET_LENDING_ADDRESSES,
  MUSD_ERC20_ABI,
} from "@/lib/mezo-chain";
import { getMezoPublicClient } from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userAddress = (req.nextUrl.searchParams.get("user") || "").trim();
    const hasValidUser = /^0x[0-9a-fA-F]{40}$/.test(userAddress);
    const publicClient = getMezoPublicClient();

    const vaultAddr = ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault;
    const councilAddr = ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil;
    const poolAddr = ISLAND_ECOSYSTEM_ADDRESSES.mezoSwapPool;

    let vaultStats = {
      deployed: Boolean(vaultAddr),
      address: vaultAddr,
      musdAddress: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
      totalAssetsMusd: 0,
      trackedLiquidMusd: 0,
      activePrincipalLoanedMusd: 0,
      cumulativeInterestEarnedMusd: 0,
      sharePriceMusd: 1,
      totalShares: 0,
      maxEligibleLoanMusd: 0,
      minLiquidReserveBps: 2500,
      maxSingleLoanBps: 2000,
      dailyAutoDisburseCapMusd: 2000,
      dailyAutoDisbursedMusd: 0,
      minHoldSeconds: 60,
      emergencyPause: false,
      userMusdBalance: 0,
      userVaultAllowance: 0,
      userShares: 0,
      userAssetsMusd: 0,
      canWithdrawAfterSec: 0,
    };

    if (vaultAddr) {
      try {
        const [
          totalAssets,
          liquid,
          activePrincipal,
          interestEarned,
          sharePrice,
          totalShares,
          maxEligible,
          minRes,
          maxSingle,
          autoCap,
          autoUsed,
          minHold,
          paused,
        ] = await Promise.all([
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "totalAssets",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "trackedLiquidMusd",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "activePrincipalTotal",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "cumulativeInterestEarnedMusd",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "sharePriceE18",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "totalShares",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "maxEligibleLoanMusd",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "minLiquidReserveBps",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "maxSingleLoanBps",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "dailyAutoDisburseCapMusd",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "dailyAutoDisbursedMusd",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "minHoldSeconds",
          }),
          publicClient.readContract({
            address: vaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "emergencyPause",
          }),
        ]);

        vaultStats.totalAssetsMusd = Number(formatEther(totalAssets as bigint));
        vaultStats.trackedLiquidMusd = Number(formatEther(liquid as bigint));
        vaultStats.activePrincipalLoanedMusd = Number(
          formatEther(activePrincipal as bigint)
        );
        vaultStats.cumulativeInterestEarnedMusd = Number(
          formatEther(interestEarned as bigint)
        );
        vaultStats.sharePriceMusd = Number(formatEther(sharePrice as bigint));
        vaultStats.totalShares = Number(formatEther(totalShares as bigint));
        vaultStats.maxEligibleLoanMusd = Number(
          formatEther(maxEligible as bigint)
        );
        vaultStats.minLiquidReserveBps = Number(minRes);
        vaultStats.maxSingleLoanBps = Number(maxSingle);
        vaultStats.dailyAutoDisburseCapMusd = Number(
          formatEther(autoCap as bigint)
        );
        vaultStats.dailyAutoDisbursedMusd = Number(
          formatEther(autoUsed as bigint)
        );
        vaultStats.minHoldSeconds = Number(minHold);
        vaultStats.emergencyPause = Boolean(paused);

        if (hasValidUser) {
          const [uBal, uAllow, uShares, uLastDep] = await Promise.all([
            publicClient.readContract({
              address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
              abi: MUSD_ERC20_ABI,
              functionName: "balanceOf",
              args: [userAddress as `0x${string}`],
            }),
            publicClient.readContract({
              address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
              abi: MUSD_ERC20_ABI,
              functionName: "allowance",
              args: [userAddress as `0x${string}`, vaultAddr],
            }),
            publicClient.readContract({
              address: vaultAddr,
              abi: MAIN_MUSD_VAULT_ABI,
              functionName: "shareBalances",
              args: [userAddress as `0x${string}`],
            }),
            publicClient.readContract({
              address: vaultAddr,
              abi: MAIN_MUSD_VAULT_ABI,
              functionName: "lastDepositTimestamp",
              args: [userAddress as `0x${string}`],
            }),
          ]);

          vaultStats.userMusdBalance = Number(formatEther(uBal as bigint));
          vaultStats.userVaultAllowance = Number(formatEther(uAllow as bigint));
          vaultStats.userShares = Number(formatEther(uShares as bigint));
          if ((uShares as bigint) > 0n) {
            const uAssets = await publicClient.readContract({
              address: vaultAddr,
              abi: MAIN_MUSD_VAULT_ABI,
              functionName: "convertToAssets",
              args: [uShares as bigint],
            });
            vaultStats.userAssetsMusd = Number(formatEther(uAssets as bigint));
          }
          const unlockAt = Number(uLastDep || 0n) + vaultStats.minHoldSeconds;
          const nowSec = Math.floor(Date.now() / 1000);
          vaultStats.canWithdrawAfterSec = Math.max(0, unlockAt - nowSec);
        }
      } catch (err) {
        console.warn("MainMUSDVault live read failed:", err);
      }
    }

    let swapPoolStats = {
      deployed: Boolean(poolAddr),
      address: poolAddr,
      btcReserve: 0,
      musdReserve: 0,
      effectivePriceUsd: 0,
    };

    if (poolAddr) {
      try {
        const [btcRes, musdRes, effP] = await Promise.all([
          publicClient.readContract({
            address: poolAddr,
            abi: MEZO_SWAP_POOL_ABI,
            functionName: "trackedBtcReserve",
          }),
          publicClient.readContract({
            address: poolAddr,
            abi: MEZO_SWAP_POOL_ABI,
            functionName: "trackedMusdReserve",
          }),
          publicClient.readContract({
            address: poolAddr,
            abi: MEZO_SWAP_POOL_ABI,
            functionName: "getEffectivePrice",
          }),
        ]);
        swapPoolStats = {
          deployed: true,
          address: poolAddr,
          btcReserve: Number(formatEther(btcRes as bigint)),
          musdReserve: Number(formatEther(musdRes as bigint)),
          effectivePriceUsd: Number(formatEther(effP as bigint)),
        };
      } catch {
        // ignore
      }
    }

    let councilAutoCapMusd = 500;
    if (councilAddr) {
      try {
        const cap = await publicClient.readContract({
          address: councilAddr,
          abi: ISLAND_CREDIT_COUNCIL_ABI,
          functionName: "autoDisburseCapMusd",
        });
        councilAutoCapMusd = Number(formatEther(cap as bigint));
      } catch {
        // ignore
      }
    }

    const loanApplications = await listLoanApplicationsFromNeon();

    return NextResponse.json({
      ok: true,
      contracts: ISLAND_ECOSYSTEM_ADDRESSES,
      vaultStats,
      swapPoolStats,
      councilAutoCapMusd,
      loanApplications,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
