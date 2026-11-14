import { NextRequest, NextResponse } from "next/server";
import { formatEther } from "viem";
import {
  MEZO_TESTNET_LENDING_ADDRESSES,
  MUSD_ERC20_ABI,
  PRICE_FEED_ABI,
  SMUSD_SAVINGS_ABI,
  STABILITY_POOL_ABI,
  TROVE_MANAGER_ABI,
} from "@/lib/mezo-chain";
import {
  MEZO_TOKEN_ADDRESS,
  resolveMezoCoordinationProfile,
  VEBTC_TOKEN_ADDRESS,
  VEBTC_VOTER_ADDRESS,
} from "@/lib/mezo-coordination";
import {
  readLiveMezoCoordinationProfiles,
  readVeBtcProtocolTelemetry,
} from "@/lib/mezo-coordination-server";
import { getMezoPublicClient } from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userAddress = (req.nextUrl.searchParams.get("user") || "").trim();
    const hasValidUser = /^0x[0-9a-fA-F]{40}$/.test(userAddress);
    const publicClient = getMezoPublicClient();

    const spAddr = MEZO_TESTNET_LENDING_ADDRESSES.stabilityPool;
    const sMusdAddr = MEZO_TESTNET_LENDING_ADDRESSES.sMusdVault;

    const [
      spTotalMusdW,
      spCollBalanceW,
      sMusdSupplyW,
      sMusdYieldIndexW,
      sMusdPendingYieldW,
      btcPriceW,
      veBtcProtocol,
    ] = await Promise.all([
      publicClient
        .readContract({
          address: spAddr,
          abi: STABILITY_POOL_ABI,
          functionName: "getTotalMUSDDeposits",
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: spAddr,
          abi: STABILITY_POOL_ABI,
          functionName: "getCollateralBalance",
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: sMusdAddr,
          abi: SMUSD_SAVINGS_ABI,
          functionName: "totalSupply",
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: sMusdAddr,
          abi: SMUSD_SAVINGS_ABI,
          functionName: "yieldIndex",
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: sMusdAddr,
          abi: SMUSD_SAVINGS_ABI,
          functionName: "pendingYield",
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.priceFeed,
          abi: PRICE_FEED_ABI,
          functionName: "fetchPrice",
        })
        .catch(() => 0n),
      readVeBtcProtocolTelemetry(),
    ]);

    const btcPriceUsd =
      Number(formatEther((btcPriceW as bigint) || 0n)) || 90_000;

    let userState = {
      connected: hasValidUser,
      address: hasValidUser ? userAddress : "",
      walletBtc: 0,
      walletMusd: 0,
      sMusdAllowanceMusd: 0,
      troveActive: false,
      troveCollBtc: 0,
      troveDebtMusd: 0,
      spInitialDepositMusd: 0,
      spCompoundedDepositMusd: 0,
      spCollateralGainBtc: 0,
      sMusdBalance: 0,
      sMusdClaimableYieldMusd: 0,
      mezoProfile: resolveMezoCoordinationProfile(0),
    };

    if (hasValidUser) {
      const addr = userAddress as `0x${string}`;
      const [
        btcW,
        musdW,
        sMusdAllowW,
        troveStatusW,
        troveData,
        spDepW,
        spCompoundedW,
        spCollGainW,
        sMusdBalW,
        sMusdClaimableW,
        profileMap,
      ] = await Promise.all([
        publicClient.getBalance({ address: addr }).catch(() => 0n),
        publicClient
          .readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "balanceOf",
            args: [addr],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "allowance",
            args: [addr, sMusdAddr],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
            abi: TROVE_MANAGER_ABI,
            functionName: "getTroveStatus",
            args: [addr],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
            abi: TROVE_MANAGER_ABI,
            functionName: "getEntireDebtAndColl",
            args: [addr],
          })
          .catch(() => [0n, 0n, 0n, 0n, 0n, 0n] as const),
        publicClient
          .readContract({
            address: spAddr,
            abi: STABILITY_POOL_ABI,
            functionName: "deposits",
            args: [addr],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: spAddr,
            abi: STABILITY_POOL_ABI,
            functionName: "getCompoundedMUSDDeposit",
            args: [addr],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: spAddr,
            abi: STABILITY_POOL_ABI,
            functionName: "getDepositorCollateralGain",
            args: [addr],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: sMusdAddr,
            abi: SMUSD_SAVINGS_ABI,
            functionName: "balanceOf",
            args: [addr],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: sMusdAddr,
            abi: SMUSD_SAVINGS_ABI,
            functionName: "claimableYield",
            args: [addr],
          })
          .catch(() => 0n),
        readLiveMezoCoordinationProfiles([addr]),
      ]);

      const collW = troveData[0] + troveData[3];
      const debtW = troveData[1] + troveData[2] + troveData[4];
      const mezoProfile =
        profileMap[addr.toLowerCase()] ?? resolveMezoCoordinationProfile(0);

      userState = {
        connected: true,
        address: addr,
        walletBtc: Number(formatEther(btcW)),
        walletMusd: Number(formatEther(musdW as bigint)),
        sMusdAllowanceMusd: Number(formatEther(sMusdAllowW as bigint)),
        troveActive: Number(troveStatusW) === 1,
        troveCollBtc: Number(formatEther(collW)),
        troveDebtMusd: Number(formatEther(debtW)),
        spInitialDepositMusd: Number(formatEther(spDepW as bigint)),
        spCompoundedDepositMusd: Number(formatEther(spCompoundedW as bigint)),
        spCollateralGainBtc: Number(formatEther(spCollGainW as bigint)),
        sMusdBalance: Number(formatEther(sMusdBalW as bigint)),
        sMusdClaimableYieldMusd: Number(formatEther(sMusdClaimableW as bigint)),
        mezoProfile,
      };
    }

    return NextResponse.json({
      ok: true,
      chainId: 31611,
      btcPriceUsd,
      contracts: {
        musdToken: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
        stabilityPool: spAddr,
        sMusdVault: sMusdAddr,
        mezoToken: MEZO_TOKEN_ADDRESS,
        veBtc: VEBTC_TOKEN_ADDRESS,
        veBtcVoter: VEBTC_VOTER_ADDRESS,
      },
      stabilityPool: {
        address: spAddr,
        totalMusdDeposits: Number(formatEther(spTotalMusdW as bigint)),
        totalCollateralBtc: Number(formatEther(spCollBalanceW as bigint)),
      },
      sMusd: {
        address: sMusdAddr,
        totalSupply: Number(formatEther(sMusdSupplyW as bigint)),
        yieldIndex: Number(formatEther(sMusdYieldIndexW as bigint)),
        pendingYieldMusd: Number(formatEther(sMusdPendingYieldW as bigint)),
      },
      veBtcProtocol,
      user: userState,
    });
  } catch (err) {
    console.error("[GET /api/stability-pool] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to read Mezo StabilityPool & sMUSD telemetry",
      },
      { status: 500 }
    );
  }
}
