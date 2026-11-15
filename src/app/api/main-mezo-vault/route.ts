import { NextRequest, NextResponse } from "next/server";
import { formatEther, parseEther } from "viem";
import {
  MAIN_MEZO_VAULT_ABI,
  MAIN_MEZO_VAULT_ADDRESS,
  MEZO_EARN_ADDRESSES,
  MEZO_TESTNET_LENDING_ADDRESSES,
  MUSD_ERC20_ABI,
  extractEvmRevertReason,
} from "@/lib/mezo-chain";
import {
  MEZO_COORDINATION_TIERS,
  resolveMezoCoordinationProfile,
  type MezoCoordinationProfile,
} from "@/lib/mezo-coordination";
import {
  readLiveMezoCoordinationProfiles,
  readVeBtcProtocolTelemetry,
} from "@/lib/mezo-coordination-server";
import {
  getMezoOperatorWallet,
  getMezoPublicClient,
  withOperatorLock,
} from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

export interface MainMezoVaultApiResponse {
  ok: boolean;
  vaultStats: {
    deployed: boolean;
    address: string;
    mezoTokenAddress: string;
    musdTokenAddress: string;
    stMezoTokenAddress: string;
    veMezoAddress: string;
    totalStakedMezo: number;
    totalWeightedPower: number;
    totalRewardsDistributedMusd: number;
    rewardReserveMusd: number;
    minHoldSeconds: number;
    emergencyPause: boolean;
    lockTiers: Array<{
      tierId: 0 | 1 | 2;
      label: string;
      durationLabel: string;
      multiplierLabel: string;
      multiplierBps: number;
    }>;
  };
  userState: {
    address: string | null;
    walletMezoBalance: number;
    walletStMezoBalance: number;
    walletMusdBalance: number;
    mezoAllowance: number;
    principalMezo: number;
    weightedPower: number;
    activeCoordinationPower: number;
    unlockAt: number;
    lastStakeTimestamp: number;
    tierId: 0 | 1 | 2;
    pendingRewardsMusd: number;
    isLocked: boolean;
    holdRemainingSec: number;
    profile: MezoCoordinationProfile;
  };
  veBtcProtocol: Awaited<ReturnType<typeof readVeBtcProtocolTelemetry>>;
  coordinationTiers: typeof MEZO_COORDINATION_TIERS;
}

const LOCK_TIERS_META: MainMezoVaultApiResponse["vaultStats"]["lockTiers"] = [
  {
    tierId: 0,
    label: "Flexible",
    durationLabel: "Withdraw anytime (60s hold guard)",
    multiplierLabel: "1.0x Weight",
    multiplierBps: 10_000,
  },
  {
    tierId: 1,
    label: "30-Day Boost",
    durationLabel: "30 days lock",
    multiplierLabel: "1.5x Weight",
    multiplierBps: 15_000,
  },
  {
    tierId: 2,
    label: "90-Day Citadel",
    durationLabel: "90 days lock",
    multiplierLabel: "2.5x Weight",
    multiplierBps: 25_000,
  },
];

export async function GET(req: NextRequest) {
  try {
    const userAddress = (req.nextUrl.searchParams.get("user") || "").trim();
    const hasValidUser = /^0x[0-9a-fA-F]{40}$/.test(userAddress);
    const publicClient = getMezoPublicClient();
    const vaultAddr = MAIN_MEZO_VAULT_ADDRESS;

    let totalStakedMezo = 0;
    let totalWeightedPower = 0;
    let totalRewardsDistributedMusd = 0;
    let rewardReserveMusd = 0;
    let minHoldSeconds = 60;
    let emergencyPause = false;

    if (vaultAddr) {
      try {
        const overview = await publicClient.readContract({
          address: vaultAddr,
          abi: MAIN_MEZO_VAULT_ABI,
          functionName: "vaultOverview",
        });
        totalStakedMezo = Number(formatEther(overview[0]));
        totalWeightedPower = Number(formatEther(overview[1]));
        totalRewardsDistributedMusd = Number(formatEther(overview[2]));
        rewardReserveMusd = Number(formatEther(overview[3]));
        minHoldSeconds = Number(overview[4]);
        emergencyPause = Boolean(overview[5]);
      } catch (err) {
        console.warn("[main-mezo-vault] vaultOverview read fallback:", err);
      }
    }

    const [profileMap, veBtcProtocol] = await Promise.all([
      hasValidUser
        ? readLiveMezoCoordinationProfiles([userAddress])
        : Promise.resolve({} as Record<string, MezoCoordinationProfile>),
      readVeBtcProtocolTelemetry(),
    ]);

    const emptyProfile = resolveMezoCoordinationProfile(0);
    const resolvedProfile =
      (hasValidUser ? profileMap[userAddress.toLowerCase()] : undefined) ?? emptyProfile;

    let walletMusdBalance = 0;
    let mezoAllowance = 0;
    let principalMezo = resolvedProfile.vaultStakedMezo;
    let weightedPower = resolvedProfile.vaultCoordinationPower;
    let activeCoordinationPower = resolvedProfile.vaultCoordinationPower;
    let unlockAt = 0;
    let lastStakeTimestamp = 0;
    let tierId: 0 | 1 | 2 = 0;
    let pendingRewardsMusd = 0;
    let isLocked = false;
    let holdRemainingSec = 0;

    if (hasValidUser) {
      const target = userAddress as `0x${string}`;
      const [musdBalW, allowanceW, posRaw] = await Promise.all([
        publicClient
          .readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "balanceOf",
            args: [target],
          })
          .catch(() => 0n),
        vaultAddr
          ? publicClient
              .readContract({
                address: MEZO_EARN_ADDRESSES.mezoToken,
                abi: MUSD_ERC20_ABI,
                functionName: "allowance",
                args: [target, vaultAddr],
              })
              .catch(() => 0n)
          : Promise.resolve(0n),
        vaultAddr
          ? publicClient
              .readContract({
                address: vaultAddr,
                abi: MAIN_MEZO_VAULT_ABI,
                functionName: "getPosition",
                args: [target],
              })
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      walletMusdBalance = Number(formatEther((musdBalW as bigint) || 0n));
      mezoAllowance = Number(formatEther((allowanceW as bigint) || 0n));

      if (Array.isArray(posRaw) && posRaw.length >= 8) {
        principalMezo = Number(formatEther((posRaw[0] as bigint) || 0n));
        weightedPower = Number(formatEther((posRaw[1] as bigint) || 0n));
        unlockAt = Number(posRaw[2] || 0n);
        lastStakeTimestamp = Number(posRaw[3] || 0n);
        const rawTier = Number(posRaw[4] || 0);
        tierId = rawTier === 2 ? 2 : rawTier === 1 ? 1 : 0;
        pendingRewardsMusd = Number(formatEther((posRaw[5] as bigint) || 0n));
        activeCoordinationPower = Number(formatEther((posRaw[6] as bigint) || 0n));
        isLocked = Boolean(posRaw[7]);

        const nowSec = Math.floor(Date.now() / 1000);
        if (principalMezo > 0 && lastStakeTimestamp > 0) {
          holdRemainingSec = Math.max(0, lastStakeTimestamp + minHoldSeconds - nowSec);
        }
      }
    }

    const payload: MainMezoVaultApiResponse = {
      ok: true,
      vaultStats: {
        deployed: Boolean(vaultAddr),
        address: vaultAddr,
        mezoTokenAddress: MEZO_EARN_ADDRESSES.mezoToken,
        musdTokenAddress: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
        stMezoTokenAddress: MEZO_EARN_ADDRESSES.stMezoToken,
        veMezoAddress: MEZO_TESTNET_LENDING_ADDRESSES.veMezo,
        totalStakedMezo,
        totalWeightedPower,
        totalRewardsDistributedMusd,
        rewardReserveMusd,
        minHoldSeconds,
        emergencyPause,
        lockTiers: LOCK_TIERS_META,
      },
      userState: {
        address: hasValidUser ? userAddress : null,
        walletMezoBalance: resolvedProfile.mezoBalance,
        walletStMezoBalance: resolvedProfile.stMezoBalance,
        walletMusdBalance,
        mezoAllowance,
        principalMezo,
        weightedPower,
        activeCoordinationPower,
        unlockAt,
        lastStakeTimestamp,
        tierId,
        pendingRewardsMusd,
        isLocked,
        holdRemainingSec,
        profile: resolvedProfile,
      },
      veBtcProtocol,
      coordinationTiers: MEZO_COORDINATION_TIERS,
    };

    return NextResponse.json(payload);
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
    const action = String(body?.action || "").trim();

    if (action !== "notify_reward") {
      return NextResponse.json(
        { ok: false, error: "Unsupported action. Use action='notify_reward'." },
        { status: 400 }
      );
    }

    if (!MAIN_MEZO_VAULT_ADDRESS) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "MainMEZOVault is not deployed yet (NEXT_PUBLIC_MAIN_MEZO_VAULT_ADDRESS missing).",
        },
        { status: 400 }
      );
    }

    const vaultAddr: `0x${string}` = MAIN_MEZO_VAULT_ADDRESS;

    const musdAmountNum = Number(body?.musdAmount || 0);
    if (!Number.isFinite(musdAmountNum) || musdAmountNum <= 0 || musdAmountNum > 5000) {
      return NextResponse.json(
        { ok: false, error: "musdAmount must be between 0 and 5000 MUSD." },
        { status: 400 }
      );
    }

    const txHash = await withOperatorLock(async () => {
      const publicClient = getMezoPublicClient();
      const { account, walletClient } = getMezoOperatorWallet();
      const amountWei = parseEther(musdAmountNum.toString());

      const allowance = await publicClient.readContract({
        address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
        abi: MUSD_ERC20_ABI,
        functionName: "allowance",
        args: [account.address, vaultAddr],
      });

      if ((allowance as bigint) < amountWei) {
        const appHash = await walletClient.writeContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "approve",
          args: [vaultAddr, amountWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: appHash });
      }

      const hash = await walletClient.writeContract({
        address: vaultAddr,
        abi: MAIN_MEZO_VAULT_ABI,
        functionName: "notifyRewardMusd",
        args: [amountWei],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    });

    return NextResponse.json({
      ok: true,
      txHash,
      musdAmount: musdAmountNum,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: extractEvmRevertReason(err) },
      { status: 400 }
    );
  }
}
