"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  ExternalLink,
  Gift,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  Unlock,
  Zap,
} from "lucide-react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MainMezoVaultApiResponse } from "@/app/api/main-mezo-vault/route";
import {
  MAIN_MEZO_VAULT_ABI,
  MAIN_MEZO_VAULT_ADDRESS,
  MEZO_EARN_ADDRESSES,
  MUSD_ERC20_ABI,
  extractEvmRevertReason,
  mezoTestnet,
} from "@/lib/mezo-chain";
import { shortenHex } from "@/lib/utils";

const EXPLORER = "https://explorer.test.mezo.org";

interface MainMezoVaultPanelProps {
  onOpenMusdEarn?: () => void;
  onOpenLendingGuard?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenGovernance?: () => void;
}

function formatUnlockRemaining(unlockAtSec: number): string {
  if (!unlockAtSec) return "Flexible (unlocked)";
  const nowSec = Math.floor(Date.now() / 1000);
  const diff = unlockAtSec - nowSec;
  if (diff <= 0) return "Lock expired (ready to withdraw)";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.max(1, Math.floor((diff % 3600) / 60));
  return `${hours}h ${mins}m remaining`;
}

export function MainMezoVaultPanel({
  onOpenMusdEarn,
  onOpenLendingGuard,
  onOpenLeaderboard,
  onOpenGovernance,
}: MainMezoVaultPanelProps) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [proMode, setProMode] = useState(false);
  const [txTab, setTxTab] = useState<"stake" | "unstake">("stake");
  const [selectedTier, setSelectedTier] = useState<0 | 1 | 2>(0);
  const [amountInput, setAmountInput] = useState("25");
  const [notifyRewardInput, setNotifyRewardInput] = useState("10");
  const [data, setData] = useState<MainMezoVaultApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
    txHash?: string;
  } | null>(null);

  const fetchVaultState = useCallback(async () => {
    try {
      const qs = address ? `?user=${encodeURIComponent(address)}` : "";
      const res = await fetch(`/api/main-mezo-vault${qs}`, { cache: "no-store" });
      const json = (await res.json()) as MainMezoVaultApiResponse;
      if (json.ok) {
        setData(json);
        if (json.userState.isLocked && json.userState.tierId > selectedTier) {
          setSelectedTier(json.userState.tierId);
        }
      }
    } catch (err) {
      console.error("Failed to fetch Main MEZO Vault:", err);
    } finally {
      setLoading(false);
    }
  }, [address, selectedTier]);

  useEffect(() => {
    fetchVaultState();
  }, [fetchVaultState]);

  const vs = data?.vaultStats;
  const us = data?.userState;
  const profile = us?.profile;
  const tier = profile?.tier;

  const ensureMezoChain = async () => {
    if (!isConnected || !address) {
      throw new Error("Connect your wallet on Mezo Testnet (31611) first.");
    }
    if (chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
  };

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (!MAIN_MEZO_VAULT_ADDRESS) {
      setNotice({
        type: "error",
        text: "MainMEZOVault is not deployed yet (NEXT_PUBLIC_MAIN_MEZO_VAULT_ADDRESS is unset).",
      });
      return;
    }

    const amount = Number(amountInput || "0");
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ type: "error", text: "Enter a positive MEZO stake amount." });
      return;
    }

    setBusyAction("STAKE");
    try {
      await ensureMezoChain();
      const amountWei = parseEther(amount.toString());

      if (publicClient && address) {
        const allowance = (await publicClient.readContract({
          address: MEZO_EARN_ADDRESSES.mezoToken,
          abi: MUSD_ERC20_ABI,
          functionName: "allowance",
          args: [address, MAIN_MEZO_VAULT_ADDRESS],
        })) as bigint;

        if (allowance < amountWei) {
          setNotice({ type: "info", text: "Step 1/2: Approving MEZO spend..." });
          const appHash = await writeContractAsync({
            address: MEZO_EARN_ADDRESSES.mezoToken,
            abi: MUSD_ERC20_ABI,
            functionName: "approve",
            args: [MAIN_MEZO_VAULT_ADDRESS, amountWei],
            chainId: mezoTestnet.id,
          });
          await publicClient.waitForTransactionReceipt({ hash: appHash });
        }
      }

      setNotice({
        type: "info",
        text: `Staking ${amount} MEZO into Main Island MEZO Vault...`,
      });
      const stakeHash = await writeContractAsync({
        address: MAIN_MEZO_VAULT_ADDRESS,
        abi: MAIN_MEZO_VAULT_ABI,
        functionName: "stakeMezo",
        args: [amountWei, selectedTier],
        chainId: mezoTestnet.id,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: stakeHash });
      }
      setNotice({
        type: "success",
        text: `Staked ${amount} MEZO in MainMEZOVault (Tier ${
          selectedTier === 2 ? "90d 2.5x" : selectedTier === 1 ? "30d 1.5x" : "Flexible 1.0x"
        }).`,
        txHash: stakeHash,
      });
      await fetchVaultState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleUnstake = async (unstakeAll = false) => {
    setNotice(null);
    if (!MAIN_MEZO_VAULT_ADDRESS || !address || !publicClient) {
      setNotice({
        type: "error",
        text: "Wallet or MainMEZOVault address is not ready.",
      });
      return;
    }

    setBusyAction("UNSTAKE");
    try {
      await ensureMezoChain();
      const pos = await publicClient.readContract({
        address: MAIN_MEZO_VAULT_ADDRESS,
        abi: MAIN_MEZO_VAULT_ABI,
        functionName: "getPosition",
        args: [address],
      });
      const stakedWei = pos[0] as bigint;
      if (stakedWei <= 0n) {
        throw new Error("You have 0 staked MEZO in MainMEZOVault.");
      }

      let targetWei = stakedWei;
      if (!unstakeAll) {
        const want = Number(amountInput || "0");
        if (!Number.isFinite(want) || want <= 0) {
          throw new Error("Enter a positive MEZO amount to unstake.");
        }
        const parsed = parseEther(want.toString());
        targetWei = parsed > stakedWei ? stakedWei : parsed;
      }

      const hash = await writeContractAsync({
        address: MAIN_MEZO_VAULT_ADDRESS,
        abi: MAIN_MEZO_VAULT_ABI,
        functionName: "unstakeMezo",
        args: [targetWei],
        chainId: mezoTestnet.id,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      setNotice({
        type: "success",
        text: `Unstaked ${Number(formatEther(targetWei)).toFixed(2)} MEZO from MainMEZOVault.`,
        txHash: hash,
      });
      await fetchVaultState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleClaimRewards = async () => {
    setNotice(null);
    if (!MAIN_MEZO_VAULT_ADDRESS) {
      setNotice({ type: "error", text: "MainMEZOVault is not deployed yet." });
      return;
    }

    setBusyAction("CLAIM");
    try {
      await ensureMezoChain();
      const hash = await writeContractAsync({
        address: MAIN_MEZO_VAULT_ADDRESS,
        abi: MAIN_MEZO_VAULT_ABI,
        functionName: "claimRewards",
        args: [],
        chainId: mezoTestnet.id,
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setNotice({
        type: "success",
        text: "Claimed MUSD protocol fee-share rewards to your wallet.",
        txHash: hash,
      });
      await fetchVaultState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleOperatorNotifyReward = async () => {
    setNotice(null);
    const amt = Number(notifyRewardInput || "0");
    if (!Number.isFinite(amt) || amt <= 0) {
      setNotice({ type: "error", text: "Enter a positive MUSD reward amount." });
      return;
    }

    setBusyAction("NOTIFY");
    try {
      const res = await fetch("/api/main-mezo-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notify_reward", musdAmount: amt }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to distribute MUSD reward.");
      }
      setNotice({
        type: "success",
        text: `Distributed ${amt} MUSD protocol yield to MainMEZOVault stakers.`,
        txHash: json.txHash,
      });
      await fetchVaultState();
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyAction("");
    }
  };

  const lockTiers = vs?.lockTiers ?? [
    {
      tierId: 0 as const,
      label: "Flexible",
      durationLabel: "Withdraw anytime (60s hold guard)",
      multiplierLabel: "1.0x Weight",
      multiplierBps: 10_000,
    },
    {
      tierId: 1 as const,
      label: "30-Day Boost",
      durationLabel: "30 days lock",
      multiplierLabel: "1.5x Weight",
      multiplierBps: 15_000,
    },
    {
      tierId: 2 as const,
      label: "90-Day Citadel",
      durationLabel: "90 days lock",
      multiplierLabel: "2.5x Weight",
      multiplierBps: 25_000,
    },
  ];

  const effectiveScore = profile?.effectiveScore ?? 0;
  const nextTier =
    effectiveScore < 10
      ? { label: "Mezo Supporter", target: 10 }
      : effectiveScore < 100
        ? { label: "Mezo Alliance", target: 100 }
        : effectiveScore < 500
          ? { label: "Citadel Council", target: 500 }
          : null;
  const progressPct = nextTier
    ? Math.min(100, Math.round((effectiveScore / nextTier.target) * 100))
    : 100;

  const selectedTierMeta =
    lockTiers.find((t) => t.tierId === selectedTier) ?? lockTiers[0];
  const previewAddedWeight =
    Number(amountInput || "0") > 0
      ? (Number(amountInput) * selectedTierMeta.multiplierBps) / 10_000
      : 0;
  const downgradeBlocked = Boolean(us?.isLocked && selectedTier < (us?.tierId ?? 0));

  return (
    <div className="space-y-5">
      {/* Hero Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border-2 border-white bg-gradient-to-r from-[#1f1635] via-[#2b1f4d] to-[#1a2238] px-6 py-5 text-white shadow-xl">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-widest text-violet-300">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span>Main Island MEZO Vault</span>
            {tier && (
              <Badge className="bg-white/15 text-white border border-white/25 text-[10px]">
                {tier.label} · -{tier.aprDiscountBps} bps Loan APR
              </Badge>
            )}
          </div>
          <h2 className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight">
            {proMode
              ? "MainMEZOVault + Canonical veMEZO / stMEZO Coordination"
              : "Stake MEZO, Lower Loan Rates & Earn MUSD Rewards"}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-violet-100/90 leading-relaxed">
            {proMode
              ? "Anti-flash-loan MEZO staking vault (1.0x / 1.5x / 2.5x lock tiers) with O(1) MUSD fee-share accrual combined with canonical Mezo veMEZO & stMEZO telemetry."
              : "Lock or flexibly stake MEZO on Main Island to earn MUSD protocol fee share and unlock discounted Credit Council loan rates."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenGovernance && (
            <Button
              onClick={onOpenGovernance}
              variant="secondary"
              className="rounded-xl font-extrabold bg-amber-300/95 text-[#1f1635] hover:bg-amber-200"
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Governance &amp; Revenue
            </Button>
          )}
          <div className="inline-flex items-center rounded-xl bg-white/10 p-1 border border-white/15">
            <button
              type="button"
              onClick={() => setProMode(false)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-black transition-all ${
                !proMode
                  ? "bg-white text-[#1f1635] shadow-sm"
                  : "text-violet-100 hover:text-white"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setProMode(true)}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-black transition-all ${
                proMode
                  ? "bg-white text-[#1f1635] shadow-sm"
                  : "text-violet-100 hover:text-white"
              }`}
            >
              <Sliders className="h-3 w-3" />
              Pro Details
            </button>
          </div>

          <Button
            onClick={fetchVaultState}
            variant="secondary"
            disabled={loading}
            className="rounded-xl font-extrabold bg-white/95 text-[#1f1635] hover:bg-white"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {proMode ? "Sync On-Chain" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Deployment notice (non-blocking: canonical telemetry still works) */}
      {vs && !vs.deployed && (
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 px-4 py-3 text-xs text-amber-950 flex items-start gap-2.5 shadow-sm">
          <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-black">
              Canonical MEZO, stMEZO &amp; veMEZO Telemetry Active — Vault Contract Pending Deploy
            </div>
            <p className="text-[11px] mt-0.5">
              Your wallet&apos;s <code className="font-mono">MEZO</code>,{" "}
              <code className="font-mono">stMEZO</code>, <code className="font-mono">veMEZO</code>,
              and <code className="font-mono">veBTC</code> tiers are live right now. Broadcast{" "}
              <code className="font-mono bg-amber-100 px-1 rounded">
                DeployMainMezoVault.s.sol
              </code>{" "}
              on Chain 31611 and set{" "}
              <code className="font-mono">NEXT_PUBLIC_MAIN_MEZO_VAULT_ADDRESS</code> to enable on-chain staking &amp; MUSD reward claims.
            </p>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`rounded-2xl border-2 px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 ${
            notice.type === "error"
              ? "bg-rose-50 border-rose-300 text-rose-900"
              : notice.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                : "bg-violet-50 border-violet-300 text-violet-950"
          }`}
        >
          <span>{notice.text}</span>
          {notice.txHash && (
            <a
              href={`${EXPLORER}/tx/${notice.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline shrink-0"
            >
              <span>{shortenHex(notice.txHash, 6)}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Summary Strip */}
      <div
        className={`grid grid-cols-1 gap-3.5 ${
          proMode ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
        }`}
      >
        <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10.5px] font-extrabold uppercase">
              Your Staked MEZO
            </CardDescription>
            <CardTitle className="text-2xl font-black text-violet-800">
              {(us?.principalMezo ?? 0).toFixed(2)} MEZO
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] font-semibold text-stone-600 flex items-center justify-between gap-2">
            <span>
              {(us?.weightedPower ?? 0).toFixed(1)} weight ·{" "}
              {us?.tierId === 2 ? "90d (2.5x)" : us?.tierId === 1 ? "30d (1.5x)" : "Flexible (1x)"}
            </span>
            {us?.isLocked ? (
              <Badge variant="outline" className="text-[9.5px] border-amber-300 text-amber-800">
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                Locked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[9.5px] border-emerald-300 text-emerald-800">
                <Unlock className="h-2.5 w-2.5 mr-0.5" />
                Open
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10.5px] font-extrabold uppercase">
              Wallet MEZO &amp; stMEZO
            </CardDescription>
            <CardTitle className="text-2xl font-black text-[#231f20]">
              {(us?.walletMezoBalance ?? 0).toFixed(2)} MEZO
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] font-semibold text-stone-600 flex items-center justify-between gap-2">
            <span>{(us?.walletStMezoBalance ?? 0).toFixed(2)} stMEZO held</span>
            {profile && (
              <span className="font-bold text-indigo-700">
                {profile.effectiveScore.toFixed(0)} total pts
              </span>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10.5px] font-extrabold uppercase">
              Claimable MUSD Rewards
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-700">
              {(us?.pendingRewardsMusd ?? 0).toFixed(3)} MUSD
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-2 text-[11px] font-semibold text-stone-600">
            <span>Fee share from Main Island loans</span>
            <Button
              type="button"
              size="sm"
              disabled={!vs?.deployed || (us?.pendingRewardsMusd ?? 0) <= 0 || busyAction !== ""}
              onClick={handleClaimRewards}
              className="h-7 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[10.5px] font-black px-2.5"
            >
              {busyAction === "CLAIM" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Gift className="h-3 w-3 mr-1" />
              )}
              Claim MUSD
            </Button>
          </CardContent>
        </Card>

        {proMode && (
          <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10.5px] font-extrabold uppercase">
                MainMEZOVault Pool
              </CardDescription>
              <CardTitle className="text-2xl font-black text-indigo-700">
                {(vs?.totalStakedMezo ?? 0).toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}{" "}
                MEZO
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] font-semibold text-stone-600">
              {(vs?.totalWeightedPower ?? 0).toFixed(1)} total weight ·{" "}
              {(vs?.totalRewardsDistributedMusd ?? 0).toFixed(2)} MUSD paid
            </CardContent>
          </Card>
        )}
      </div>

      {/* Coordination Tier & Main Island Use Cases Bar */}
      <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-md">
        <CardHeader className="pb-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-600" />
                Coordination Tier &amp; Active Perks
              </CardTitle>
              <CardDescription className="text-xs">
                Combines MainMEZOVault weight, wallet MEZO / stMEZO, canonical veMEZO locks, and veBTC voting power.
              </CardDescription>
            </div>
            <Badge
              className={`border text-[11px] font-black px-3 py-1 ${
                tier?.badgeClasses || "bg-stone-100 text-stone-800 border-stone-300"
              }`}
            >
              {tier?.label || "Standard Tier"} ({effectiveScore.toFixed(0)} pts)
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-stone-600">
              <span>
                {nextTier
                  ? `${progressPct}% toward ${nextTier.label} (${nextTier.target} pts)`
                  : "Maximum Citadel Council tier unlocked"}
              </span>
              <span>{profile?.boostSourceLabel || "Connect wallet"}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden border border-stone-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 via-indigo-500 to-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <button
              type="button"
              onClick={onOpenMusdEarn}
              className="rounded-xl bg-emerald-50/80 border border-emerald-200 p-2.5 text-left hover:bg-emerald-100/70 transition-colors"
            >
              <div className="font-black text-emerald-950">
                1. Credit Council Loan Discount
              </div>
              <div className="text-[11px] text-emerald-900 mt-0.5">
                Current discount: <strong>-{tier?.aprDiscountBps ?? 0} bps</strong> (min{" "}
                {((tier?.effectiveMinAprBps ?? 500) / 100).toFixed(2)}% APR, +
                {tier?.priorityBoostPct ?? 0}% queue boost)
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenLendingGuard}
              className="rounded-xl bg-indigo-50/80 border border-indigo-200 p-2.5 text-left hover:bg-indigo-100/70 transition-colors"
            >
              <div className="font-black text-indigo-950">
                2. Mezo Guard Priority Defense
              </div>
              <div className="text-[11px] text-indigo-900 mt-0.5">
                Priority Trove protection &amp; keeper fee rebates during volatility spikes
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenLeaderboard}
              className="rounded-xl bg-amber-50/80 border border-amber-200 p-2.5 text-left hover:bg-amber-100/70 transition-colors"
            >
              <div className="font-black text-amber-950">
                3. MUSD Fee Share &amp; Rank Boost
              </div>
              <div className="text-[11px] text-amber-900 mt-0.5">
                Earn proportional MUSD rewards + verified boost badge on Leaderboard
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Unified Stake / Unstake Card */}
      <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-black">
                {txTab === "stake" ? (
                  <ArrowDownToLine className="h-4 w-4 text-violet-700" />
                ) : (
                  <ArrowUpFromLine className="h-4 w-4 text-stone-800" />
                )}
                {txTab === "stake"
                  ? "Stake MEZO into Main Island Vault"
                  : "Unstake Principal MEZO"}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {txTab === "stake"
                  ? "Choose a lock duration multiplier (up to 2.5x coordination power) and stake MEZO."
                  : us?.isLocked
                    ? `Active lock: ${formatUnlockRemaining(us.unlockAt)}`
                    : (us?.holdRemainingSec ?? 0) > 0
                      ? `Security hold window active: unlocks in ${us?.holdRemainingSec}s`
                      : `Available to unstake: ${(us?.principalMezo ?? 0).toFixed(2)} MEZO`}
              </CardDescription>
            </div>

            <div className="inline-flex rounded-xl bg-stone-100 p-1 border border-stone-200">
              <button
                type="button"
                onClick={() => setTxTab("stake")}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-black transition-all ${
                  txTab === "stake"
                    ? "bg-violet-700 text-white shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Stake MEZO
              </button>
              <button
                type="button"
                onClick={() => setTxTab("unstake")}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-black transition-all ${
                  txTab === "unstake"
                    ? "bg-[#242331] text-white shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Unstake
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {txTab === "stake" ? (
            <form onSubmit={handleStake} className="space-y-4">
              {/* Lock Tier Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {lockTiers.map((lt) => {
                  const lockedLower = Boolean(us?.isLocked && lt.tierId < (us?.tierId ?? 0));
                  const active = selectedTier === lt.tierId;
                  return (
                    <button
                      key={lt.tierId}
                      type="button"
                      disabled={lockedLower}
                      onClick={() => setSelectedTier(lt.tierId)}
                      className={`rounded-2xl border-2 p-3 text-left transition-all ${
                        lockedLower
                          ? "border-stone-200 bg-stone-100/70 text-stone-400 cursor-not-allowed"
                          : active
                            ? "border-violet-600 bg-violet-50/90 shadow-sm"
                            : "border-stone-200 bg-white hover:border-violet-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-stone-900">
                          {lt.label}
                        </span>
                        <Badge
                          variant={active ? "default" : "secondary"}
                          className="text-[10px] font-black"
                        >
                          {lt.multiplierLabel}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-stone-600 mt-1">
                        {lockedLower ? "Disabled during active higher lock" : lt.durationLabel}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[180px]">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-3 py-2.5 text-sm font-black"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {["10", "50", "250"].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAmountInput(preset)}
                      className="rounded-xl text-xs font-extrabold"
                    >
                      {preset}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAmountInput(
                        String(Math.floor((us?.walletMezoBalance ?? 0) * 100) / 100)
                      )
                    }
                    className="rounded-xl text-xs font-extrabold"
                  >
                    MAX
                  </Button>
                </div>
                <Button
                  type="submit"
                  disabled={!vs?.deployed || downgradeBlocked || busyAction !== ""}
                  className="bg-violet-700 hover:bg-violet-800 text-white font-black rounded-xl px-5 py-2.5"
                >
                  {busyAction === "STAKE" && (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  )}
                  Stake {amountInput || "0"} MEZO
                </Button>
              </div>

              <div className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2 text-[11px] text-stone-600 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Adds <strong>+{previewAddedWeight.toFixed(1)}</strong> coordination points
                  after {vs?.minHoldSeconds ?? 60}s anti-flash-loan hold window.
                </span>
                {proMode && us?.mezoAllowance !== undefined && (
                  <span className="font-mono">
                    Allowance: {us.mezoAllowance.toFixed(2)} MEZO
                  </span>
                )}
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[180px]">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-3 py-2.5 text-sm font-black"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !vs?.deployed ||
                  busyAction !== "" ||
                  Boolean(us?.isLocked) ||
                  (us?.holdRemainingSec ?? 0) > 0 ||
                  (us?.principalMezo ?? 0) <= 0
                }
                onClick={() => handleUnstake(false)}
                className="rounded-xl font-black border-2 border-[#231f20]"
              >
                {busyAction === "UNSTAKE" && (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                )}
                Unstake MEZO
              </Button>
              <Button
                type="button"
                disabled={
                  !vs?.deployed ||
                  busyAction !== "" ||
                  Boolean(us?.isLocked) ||
                  (us?.holdRemainingSec ?? 0) > 0 ||
                  (us?.principalMezo ?? 0) <= 0
                }
                onClick={() => handleUnstake(true)}
                className="rounded-xl font-black bg-[#242331] hover:bg-stone-800 text-white"
              >
                Unstake All ({(us?.principalMezo ?? 0).toFixed(2)})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pro Details: Canonical veMEZO / stMEZO + Tigris Pools & Admin Reward Sync */}
      {proMode && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600" />
                Canonical Mezo Testnet Telemetry (`veMEZO`, `stMEZO`, `veBTC`)
              </CardTitle>
              <CardDescription className="text-xs">
                Existing canonical locks combine additively with MainMEZOVault weight.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-stone-50 border border-stone-200 p-2.5">
                  <div className="text-[10px] font-bold text-stone-500 uppercase">
                    Canonical veMEZO Locks
                  </div>
                  <div className="font-black text-stone-900 mt-0.5">
                    {(profile?.veMezoLockedAmount ?? 0).toFixed(2)} MEZO (
                    {profile?.veMezoNftCount ?? 0} NFTs)
                  </div>
                </div>
                <div className="rounded-xl bg-stone-50 border border-stone-200 p-2.5">
                  <div className="text-[10px] font-bold text-stone-500 uppercase">
                    Tigris veBTC Boost
                  </div>
                  <div className="font-black text-stone-900 mt-0.5">
                    {(profile?.veBtcVotingPower ?? 0).toFixed(4)} veBTC (
                    {profile?.veBtcBoostPoints.toFixed(0) ?? 0} pts)
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                {[
                  {
                    label: "MainMEZOVault.sol",
                    addr: vs?.address || "",
                  },
                  {
                    label: "MEZO ERC-20 Precompile",
                    addr: vs?.mezoTokenAddress || MEZO_EARN_ADDRESSES.mezoToken,
                  },
                  {
                    label: "stMEZO Token",
                    addr: vs?.stMezoTokenAddress || MEZO_EARN_ADDRESSES.stMezoToken,
                  },
                  {
                    label: "Canonical veMEZO",
                    addr: vs?.veMezoAddress || data?.veBtcProtocol.veMezoAddress || "",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-lg bg-[#faf7f2] border border-[#e7dfd0] px-2.5 py-1.5"
                  >
                    <span className="font-bold text-stone-800">{item.label}</span>
                    {item.addr ? (
                      <a
                        href={`${EXPLORER}/address/${item.addr}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[11px] font-bold text-violet-700 hover:underline inline-flex items-center gap-1"
                      >
                        {shortenHex(item.addr, 6)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="font-mono text-[10.5px] text-stone-400">
                        Not set in env
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Protocol Reward Funding &amp; Tigris Liquidity Routing
              </CardTitle>
              <CardDescription className="text-xs">
                Reward distributors can stream MUSD fee-share into `notifyRewardMusd`, or route MEZO into Tigris LPs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-stone-800">
                    Distribute MUSD Fee-Share (`notifyRewardMusd`)
                  </span>
                  <span className="font-mono text-[10.5px] text-stone-500">
                    Reserve: {(vs?.rewardReserveMusd ?? 0).toFixed(2)} MUSD
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={notifyRewardInput}
                    onChange={(e) => setNotifyRewardInput(e.target.value)}
                    className="w-32 rounded-xl bg-white border border-stone-300 px-3 py-1.5 text-xs font-black"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!vs?.deployed || busyAction !== ""}
                    onClick={handleOperatorNotifyReward}
                    className="rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-black"
                  >
                    {busyAction === "NOTIFY" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    )}
                    Notify MUSD Reward
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {onOpenMusdEarn && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenMusdEarn}
                    className="rounded-xl text-xs font-black"
                  >
                    <Coins className="h-3.5 w-3.5 mr-1 text-indigo-600" />
                    Pair in vAMM-MUSD/MEZO &amp; MEZO/stMEZO
                  </Button>
                )}
                {onOpenLendingGuard && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenLendingGuard}
                    className="rounded-xl text-xs font-black"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                    Open Mezo Guard
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
