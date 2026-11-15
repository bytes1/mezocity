"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseEther } from "viem";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  ExternalLink,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Unlock,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  computeMezoTroveHints,
  extractEvmRevertReason,
  MEZO_TESTNET_LENDING_ADDRESSES,
  mezoTestnet,
  MUSD_ERC20_ABI,
  SMUSD_SAVINGS_ABI,
  STABILITY_POOL_ABI,
} from "@/lib/mezo-chain";
import type { MezoCoordinationProfile } from "@/lib/mezo-coordination";
import { shortenHex } from "@/lib/utils";

interface StabilityPoolApiResponse {
  ok: boolean;
  error?: string;
  chainId: number;
  btcPriceUsd: number;
  contracts: {
    musdToken: `0x${string}`;
    stabilityPool: `0x${string}`;
    sMusdVault: `0x${string}`;
    mezoToken: `0x${string}`;
    veBtc: `0x${string}`;
    veBtcVoter: `0x${string}`;
  };
  stabilityPool: {
    address: string;
    totalMusdDeposits: number;
    totalCollateralBtc: number;
  };
  sMusd: {
    address: string;
    totalSupply: number;
    yieldIndex: number;
    pendingYieldMusd: number;
  };
  veBtcProtocol: {
    veBtcAddress: string;
    veBtcVoterAddress: string;
    veMezoAddress: string;
    totalVeBtcVotingPower: number;
    currentEpoch: number;
    validatorsVoterStatus: string;
  };
  user: {
    connected: boolean;
    address: string;
    walletBtc: number;
    walletMusd: number;
    sMusdAllowanceMusd: number;
    troveActive: boolean;
    troveCollBtc: number;
    troveDebtMusd: number;
    spInitialDepositMusd: number;
    spCompoundedDepositMusd: number;
    spCollateralGainBtc: number;
    sMusdBalance: number;
    sMusdClaimableYieldMusd: number;
    mezoProfile: MezoCoordinationProfile;
  };
}

interface MezoStabilityYieldPanelProps {
  onVaultChanged?: () => void;
  proMode?: boolean;
}

const EXPLORER_BASE = "https://explorer.test.mezo.org";

function fmt(val: number, decimals = 2): string {
  if (!Number.isFinite(val)) return "0.00";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function MezoStabilityYieldPanel({
  onVaultChanged,
  proMode = false,
}: MezoStabilityYieldPanelProps) {
  const { address, chainId, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { writeContractAsync } = useWriteContract();

  const [data, setData] = useState<StabilityPoolApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>("");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
    txHash?: string;
  } | null>(null);

  const [spDepositInput, setSpDepositInput] = useState("100");
  const [spWithdrawInput, setSpWithdrawInput] = useState("100");
  const [spTab, setSpTab] = useState<"deposit" | "withdraw">("deposit");
  const [sMusdDepositInput, setSMusdDepositInput] = useState("100");
  const [sMusdWithdrawInput, setSMusdWithdrawInput] = useState("100");
  const [sMusdTab, setSMusdTab] = useState<"deposit" | "withdraw">("deposit");

  const loadTelemetry = useCallback(async () => {
    setLoading(true);
    try {
      const qs = address ? `?user=${encodeURIComponent(address)}` : "";
      const res = await fetch(`/api/stability-pool${qs}`, { cache: "no-store" });
      const json = (await res.json()) as StabilityPoolApiResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load Mezo StabilityPool state");
      }
      setData(json);
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to load canonical Mezo yield telemetry",
      });
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    loadTelemetry();
  }, [loadTelemetry]);

  const ensureWallet = useCallback(async (): Promise<`0x${string}`> => {
    if (!isConnected || !address) {
      openConnectModal?.();
      throw new Error("Connect your wallet to transact on Mezo Testnet (31611).");
    }
    if (chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
    if (!publicClient) {
      throw new Error("Mezo Testnet RPC client unavailable.");
    }
    return address;
  }, [address, chainId, isConnected, openConnectModal, publicClient, switchChainAsync]);

  // --- StabilityPool: provideToSP ---
  const handleProvideToSp = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureWallet();
      if (!publicClient) return;
      const amt = Number(spDepositInput);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error("Enter a positive MUSD amount to deposit into StabilityPool.");
      }
      const amtWei = parseEther(amt.toFixed(6));
      if (data && data.user.walletMusd + 0.0001 < amt) {
        throw new Error(
          `Insufficient MUSD in wallet (${fmt(data.user.walletMusd)} MUSD available).`
        );
      }

      setBusyAction("sp-deposit");
      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: MEZO_TESTNET_LENDING_ADDRESSES.stabilityPool,
        abi: STABILITY_POOL_ABI,
        functionName: "provideToSP",
        args: [amtWei],
      });
      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setNotice({
        type: "success",
        text: `Deposited ${fmt(amt)} MUSD into canonical Mezo StabilityPool!`,
        txHash,
      });
      await loadTelemetry();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  // --- StabilityPool: withdrawFromSP ---
  const handleWithdrawFromSp = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureWallet();
      if (!publicClient) return;
      const amt = Number(spWithdrawInput);
      if (!Number.isFinite(amt) || amt < 0) {
        throw new Error("Enter a non-negative MUSD amount (0 claims BTC gains only).");
      }
      const amtWei = parseEther(amt.toFixed(6));

      setBusyAction("sp-withdraw");
      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: MEZO_TESTNET_LENDING_ADDRESSES.stabilityPool,
        abi: STABILITY_POOL_ABI,
        functionName: "withdrawFromSP",
        args: [amtWei],
      });
      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setNotice({
        type: "success",
        text:
          amt > 0
            ? `Withdrew ${fmt(amt)} MUSD (+ any BTC liquidation gain) from StabilityPool!`
            : "Claimed StabilityPool BTC liquidation gains!",
        txHash,
      });
      await loadTelemetry();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  // --- StabilityPool: withdrawCollateralGainToTrove ---
  const handleCompoundGainToTrove = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureWallet();
      if (!publicClient || !data) return;
      if (!data.user.troveActive) {
        throw new Error("Open an active Trove first to compound BTC gains directly into collateral.");
      }

      setBusyAction("sp-compound");
      const newCollWei = parseEther(
        (data.user.troveCollBtc + data.user.spCollateralGainBtc).toFixed(8)
      );
      const debtWei = parseEther(Math.max(1, data.user.troveDebtMusd).toFixed(6));
      const [upperHint, lowerHint] = await computeMezoTroveHints(
        publicClient,
        newCollWei,
        debtWei
      );

      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: MEZO_TESTNET_LENDING_ADDRESSES.stabilityPool,
        abi: STABILITY_POOL_ABI,
        functionName: "withdrawCollateralGainToTrove",
        args: [upperHint, lowerHint],
      });
      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setNotice({
        type: "success",
        text: `Compounded ${data.user.spCollateralGainBtc.toFixed(6)} BTC StabilityPool liquidation gain straight into your Trove!`,
        txHash,
      });
      await loadTelemetry();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  // --- sMUSD (MUSDSavingsRate): exact MUSD.approve + deposit ---
  const handleDepositSmusd = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureWallet();
      if (!publicClient) return;
      const amt = Number(sMusdDepositInput);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error("Enter a positive MUSD amount to stake into sMUSD.");
      }
      const amtWei = parseEther(amt.toFixed(6));
      if (data && data.user.walletMusd + 0.0001 < amt) {
        throw new Error(
          `Insufficient MUSD in wallet (${fmt(data.user.walletMusd)} MUSD available).`
        );
      }

      setBusyAction("smusd-deposit");
      const sMusdAddr = MEZO_TESTNET_LENDING_ADDRESSES.sMusdVault;
      const currentAllow = (await publicClient.readContract({
        address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
        abi: MUSD_ERC20_ABI,
        functionName: "allowance",
        args: [userAddr, sMusdAddr],
      })) as bigint;

      if (currentAllow < amtWei) {
        if (currentAllow > 0n) {
          const resetSim = await publicClient.simulateContract({
            account: userAddr,
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "approve",
            args: [sMusdAddr, 0n],
          });
          const resetHash = await writeContractAsync(resetSim.request);
          await publicClient.waitForTransactionReceipt({ hash: resetHash });
        }
        const appSim = await publicClient.simulateContract({
          account: userAddr,
          address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "approve",
          args: [sMusdAddr, amtWei],
        });
        const appHash = await writeContractAsync(appSim.request);
        await publicClient.waitForTransactionReceipt({ hash: appHash });
      }

      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: sMusdAddr,
        abi: SMUSD_SAVINGS_ABI,
        functionName: "deposit",
        args: [amtWei],
      });
      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setNotice({
        type: "success",
        text: `Deposited ${fmt(amt)} MUSD into canonical MUSDSavingsRate (sMUSD)!`,
        txHash,
      });
      await loadTelemetry();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  // --- sMUSD: withdraw ---
  const handleWithdrawSmusd = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureWallet();
      if (!publicClient) return;
      const amt = Number(sMusdWithdrawInput);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error("Enter a positive sMUSD amount to redeem back into MUSD.");
      }
      const amtWei = parseEther(amt.toFixed(6));

      setBusyAction("smusd-withdraw");
      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: MEZO_TESTNET_LENDING_ADDRESSES.sMusdVault,
        abi: SMUSD_SAVINGS_ABI,
        functionName: "withdraw",
        args: [amtWei],
      });
      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setNotice({
        type: "success",
        text: `Redeemed ${fmt(amt)} sMUSD -> MUSD + claimed accrued savings yield!`,
        txHash,
      });
      await loadTelemetry();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  // --- sMUSD: claimYield ---
  const handleClaimSmusdYield = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureWallet();
      if (!publicClient) return;

      setBusyAction("smusd-claim");
      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: MEZO_TESTNET_LENDING_ADDRESSES.sMusdVault,
        abi: SMUSD_SAVINGS_ABI,
        functionName: "claimYield",
        args: [],
      });
      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setNotice({
        type: "success",
        text: "Claimed accrued MUSD savings yield from sMUSD!",
        txHash,
      });
      await loadTelemetry();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const u = data?.user;
  const profile = u?.mezoProfile;

  return (
    <div className="space-y-6 text-[#231f20]">
      {/* Hero Banner */}
      <div className="rounded-[28px] bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#134e4a] text-white p-6 shadow-xl border border-white/15 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-500/25 text-emerald-100 border-emerald-400/40 font-black">
                {proMode
                  ? "CANONICAL MEZO PRIMITIVES · CHAIN 31611"
                  : "EARN WITH MUSD"}
              </Badge>
              {proMode && (
                <Badge className="bg-amber-400/20 text-amber-100 border-amber-300/35 font-extrabold">
                  StabilityPool + sMUSD + Tigris veBTC
                </Badge>
              )}
            </div>
            <h2 className="text-2xl font-black tracking-tight">
              {proMode
                ? "Canonical Mezo StabilityPool, sMUSD Savings & veBTC Boost"
                : "Earn Bitcoin Rewards or Steady MUSD Interest"}
            </h2>
            <p className="text-xs text-slate-200 leading-relaxed">
              {proMode ? (
                <>
                  Route idle MUSD directly into Mezo&apos;s canonical{" "}
                  <code className="font-mono text-emerald-300">
                    StabilityPool
                  </code>{" "}
                  for BTC liquidation gains or stake into{" "}
                  <code className="font-mono text-amber-300">
                    sMUSD (MUSDSavingsRate)
                  </code>{" "}
                  for yield — all wired alongside your live Tigris{" "}
                  <code className="font-mono text-orange-300">veBTC</code>{" "}
                  voting power.
                </>
              ) : (
                "Put MUSD to work in two simple ways: earn discounted BTC when risky loans get liquidated, or stake for passive savings interest."
              )}
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={loadTelemetry}
            disabled={loading}
            className="rounded-xl font-black bg-white/95 text-slate-900 hover:bg-white"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            {proMode ? "Refresh Chain Reads" : "Refresh"}
          </Button>
        </div>

        {/* Live Protocol Stats Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
            <div className="text-[10px] font-black uppercase text-emerald-200">
              {proMode ? "StabilityPool MUSD TVL" : "Liquidation Pool Size"}
            </div>
            <div className="text-lg font-black text-white mt-0.5">
              {fmt(data?.stabilityPool.totalMusdDeposits ?? 0, 0)} MUSD
            </div>
            {proMode ? (
              <a
                href={`${EXPLORER_BASE}/address/${data?.stabilityPool.address || MEZO_TESTNET_LENDING_ADDRESSES.stabilityPool}`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-mono text-emerald-300 hover:underline inline-flex items-center gap-1"
              >
                {shortenHex(MEZO_TESTNET_LENDING_ADDRESSES.stabilityPool, 5)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <div className="text-[10px] text-emerald-100/80">
                Backed by MUSD savers
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
            <div className="text-[10px] font-black uppercase text-amber-200">
              {proMode ? "sMUSD Total Supply" : "Savings Pool Size"}
            </div>
            <div className="text-lg font-black text-white mt-0.5">
              {fmt(data?.sMusd.totalSupply ?? 0, 0)} {proMode ? "sMUSD" : "MUSD"}
            </div>
            {proMode ? (
              <a
                href={`${EXPLORER_BASE}/address/${MEZO_TESTNET_LENDING_ADDRESSES.sMusdVault}`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-mono text-amber-300 hover:underline inline-flex items-center gap-1"
              >
                {shortenHex(MEZO_TESTNET_LENDING_ADDRESSES.sMusdVault, 5)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <div className="text-[10px] text-amber-100/80">
                1:1 redeemable savings
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
            <div className="text-[10px] font-black uppercase text-orange-200">
              {proMode ? "Your Wallet MUSD / BTC" : "Your Wallet Balance"}
            </div>
            <div className="text-lg font-black text-white mt-0.5">
              {u?.connected ? `${fmt(u.walletMusd)} MUSD` : "Not Connected"}
            </div>
            <div className="text-[10px] font-mono text-slate-300">
              {u?.connected ? `${u.walletBtc.toFixed(5)} BTC ready` : "Connect wallet"}
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 border border-white/15 p-3">
            <div className="text-[10px] font-black uppercase text-violet-200">
              {proMode ? "MEZO + veBTC Coordination" : "Your Boost Tier"}
            </div>
            <div className="text-lg font-black text-white mt-0.5">
              {profile ? profile.tier.shortLabel : "Standard"}
              {profile && profile.tier.aprDiscountBps > 0
                ? ` (-${profile.tier.aprDiscountBps} bps)`
                : ""}
            </div>
            <div className="text-[10px] font-mono text-violet-200">
              {profile
                ? `${profile.mezoBalance.toFixed(1)} MEZO + ${profile.veBtcVotingPower.toFixed(4)} veBTC`
                : `Epoch #${data?.veBtcProtocol.currentEpoch ?? "-"}`}
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {notice && (
        <div
          className={`rounded-2xl border p-3.5 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 ${
            notice.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-950"
              : "bg-red-50 border-red-300 text-red-900"
          }`}
        >
          <span>{notice.text}</span>
          {notice.txHash && (
            <a
              href={`${EXPLORER_BASE}/tx/${notice.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono font-black underline"
            >
              View Tx {shortenHex(notice.txHash, 6)}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Two Canonical Yield Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Canonical Mezo StabilityPool */}
        <Card className="clay-card border-2 border-emerald-500/25 bg-white/95">
          <CardHeader className="pb-3 border-b border-black/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge className="bg-emerald-100 text-emerald-900 font-black text-[10px] uppercase">
                {proMode
                  ? "CANONICAL MEZO LIQUIDATION BACKSTOP"
                  : "OPTION 1 · EARN BTC REWARDS"}
              </Badge>
              <div className="flex items-center gap-2">
                {proMode && (
                  <a
                    href={`${EXPLORER_BASE}/address/${MEZO_TESTNET_LENDING_ADDRESSES.stabilityPool}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-mono font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                  >
                    StabilityPool <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <div className="inline-flex rounded-xl bg-stone-100 p-0.5 border border-stone-200">
                  <button
                    type="button"
                    onClick={() => setSpTab("deposit")}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-black transition-all ${
                      spTab === "deposit"
                        ? "bg-emerald-700 text-white shadow-sm"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Deposit
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpTab("withdraw")}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-black transition-all ${
                      spTab === "withdraw"
                        ? "bg-[#231f20] text-white shadow-sm"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            </div>
            <CardTitle className="text-lg font-black text-[#231f20] mt-1.5 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              {proMode
                ? "Mezo StabilityPool (Earn Liquidated BTC)"
                : "Bitcoin Liquidation Rewards Pool"}
            </CardTitle>
            <CardDescription className="text-xs">
              {proMode ? (
                <>
                  Deposit MUSD directly into <code>provideToSP</code> to absorb
                  Trove liquidations and earn pro-rata tBTC collateral gains.
                </>
              ) : (
                "Put MUSD here to earn discounted BTC whenever underwater loans get liquidated. Withdraw anytime."
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className={`grid ${proMode ? "grid-cols-3" : "grid-cols-2"} gap-2.5`}>
              <div className="rounded-xl bg-[#f8f5f0] border border-black/10 p-2.5">
                <div className="text-[10px] font-black uppercase text-slate-500">
                  {proMode ? "Compounded MUSD" : "Your Deposited MUSD"}
                </div>
                <div className="text-sm font-black text-[#231f20]">
                  {fmt(u?.spCompoundedDepositMusd ?? 0)} MUSD
                </div>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-300/60 p-2.5">
                <div className="text-[10px] font-black uppercase text-amber-900">
                  {proMode ? "Claimable BTC Gain" : "Earned BTC Rewards"}
                </div>
                <div className="text-sm font-black text-amber-950">
                  {(u?.spCollateralGainBtc ?? 0).toFixed(6)} BTC
                </div>
              </div>
              {proMode && (
                <div className="rounded-xl bg-[#f8f5f0] border border-black/10 p-2.5">
                  <div className="text-[10px] font-black uppercase text-slate-500">
                    Pool BTC Balance
                  </div>
                  <div className="text-sm font-black text-[#231f20]">
                    {(data?.stabilityPool.totalCollateralBtc ?? 0).toFixed(4)} BTC
                  </div>
                </div>
              )}
            </div>

            {spTab === "deposit" ? (
              <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-black">
                  <span>
                    {proMode
                      ? "Deposit MUSD -> StabilityPool"
                      : "Amount to Deposit (MUSD)"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSpDepositInput(
                        String(
                          Math.floor(Math.max(0, (u?.walletMusd ?? 0) * 100)) /
                            100
                        )
                      )
                    }
                    className="text-[10px] font-mono text-emerald-700 hover:underline"
                  >
                    Max Wallet: {fmt(u?.walletMusd ?? 0)}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={spDepositInput}
                    onChange={(e) => setSpDepositInput(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-black"
                  />
                  <Button
                    type="button"
                    disabled={busyAction !== ""}
                    onClick={handleProvideToSp}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4"
                  >
                    {busyAction === "sp-deposit" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Lock className="h-3.5 w-3.5 mr-1.5" />
                        {proMode ? "provideToSP" : "Deposit MUSD"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-black">
                  <span>Withdraw MUSD &amp; Claim BTC Rewards</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSpWithdrawInput(
                        String(
                          Math.floor(
                            Math.max(0, (u?.spCompoundedDepositMusd ?? 0) * 100)
                          ) / 100
                        )
                      )
                    }
                    className="text-[10px] font-mono text-slate-600 hover:underline"
                  >
                    Max Deposit: {fmt(u?.spCompoundedDepositMusd ?? 0)}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={spWithdrawInput}
                    onChange={(e) => setSpWithdrawInput(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-black"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      busyAction !== "" ||
                      (u?.spCompoundedDepositMusd ?? 0) <= 0
                    }
                    onClick={handleWithdrawFromSp}
                    className="rounded-xl font-black text-xs px-4 bg-white"
                  >
                    {busyAction === "sp-withdraw" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Unlock className="h-3.5 w-3.5 mr-1.5" />
                        {proMode ? "withdrawFromSP" : "Withdraw MUSD"}
                      </>
                    )}
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    busyAction !== "" ||
                    !u?.troveActive ||
                    (u?.spCollateralGainBtc ?? 0) <= 0
                  }
                  onClick={handleCompoundGainToTrove}
                  className="w-full rounded-xl font-black text-xs border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950"
                >
                  {busyAction === "sp-compound" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5 text-amber-700" />
                  )}
                  {proMode
                    ? "Compound BTC Gain -> Trove Collateral (withdrawCollateralGainToTrove)"
                    : "Add Earned BTC Rewards to My Loan Collateral"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Canonical sMUSD (MUSDSavingsRate) */}
        <Card className="clay-card border-2 border-amber-500/30 bg-white/95">
          <CardHeader className="pb-3 border-b border-black/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge className="bg-amber-100 text-amber-900 font-black text-[10px] uppercase">
                {proMode
                  ? "MUSD SAVINGS RATE (sMUSD)"
                  : "OPTION 2 · STEADY INTEREST"}
              </Badge>
              <div className="flex items-center gap-2">
                {proMode && (
                  <a
                    href={`${EXPLORER_BASE}/address/${MEZO_TESTNET_LENDING_ADDRESSES.sMusdVault}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-mono font-bold text-amber-800 hover:underline inline-flex items-center gap-1"
                  >
                    MUSDSavingsRate <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <div className="inline-flex rounded-xl bg-stone-100 p-0.5 border border-stone-200">
                  <button
                    type="button"
                    onClick={() => setSMusdTab("deposit")}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-black transition-all ${
                      sMusdTab === "deposit"
                        ? "bg-amber-600 text-white shadow-sm"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Stake
                  </button>
                  <button
                    type="button"
                    onClick={() => setSMusdTab("withdraw")}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-black transition-all ${
                      sMusdTab === "withdraw"
                        ? "bg-[#231f20] text-white shadow-sm"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            </div>
            <CardTitle className="text-lg font-black text-[#231f20] mt-1.5 flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-600" />
              {proMode
                ? "sMUSD Savings Vault (ERC-20 Staked MUSD)"
                : "sMUSD High-Yield Savings Account"}
            </CardTitle>
            <CardDescription className="text-xs">
              {proMode ? (
                <>
                  Approve exact MUSD &amp; mint 1:1 transferable{" "}
                  <code>sMUSD</code> shares backed by Mezo protocol yield
                  strategies.
                </>
              ) : (
                "Stake MUSD to earn steady savings interest while staying 1:1 redeemable back to MUSD."
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className={`grid ${proMode ? "grid-cols-3" : "grid-cols-2"} gap-2.5`}>
              <div className="rounded-xl bg-[#f8f5f0] border border-black/10 p-2.5">
                <div className="text-[10px] font-black uppercase text-slate-500">
                  {proMode ? "Your sMUSD" : "Your Staked Savings"}
                </div>
                <div className="text-sm font-black text-[#231f20]">
                  {fmt(u?.sMusdBalance ?? 0)} sMUSD
                </div>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-300/60 p-2.5">
                <div className="text-[10px] font-black uppercase text-emerald-900">
                  {proMode ? "Claimable Yield" : "Earned Interest"}
                </div>
                <div className="text-sm font-black text-emerald-950">
                  {fmt(u?.sMusdClaimableYieldMusd ?? 0, 4)} MUSD
                </div>
              </div>
              {proMode && (
                <div className="rounded-xl bg-[#f8f5f0] border border-black/10 p-2.5">
                  <div className="text-[10px] font-black uppercase text-slate-500">
                    Yield Index
                  </div>
                  <div className="text-sm font-black text-[#231f20]">
                    {fmt(data?.sMusd.yieldIndex ?? 0, 2)}
                  </div>
                </div>
              )}
            </div>

            {sMusdTab === "deposit" ? (
              <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-black">
                  <span>
                    {proMode
                      ? "Stake MUSD -> Mint sMUSD (Exact Approve)"
                      : "Amount to Stake (MUSD)"}
                  </span>
                  {proMode ? (
                    <span className="text-[10px] font-mono text-slate-500">
                      Allowance: {fmt(u?.sMusdAllowanceMusd ?? 0)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setSMusdDepositInput(
                          String(
                            Math.floor(Math.max(0, (u?.walletMusd ?? 0) * 100)) /
                              100
                          )
                        )
                      }
                      className="text-[10px] font-mono text-amber-800 hover:underline"
                    >
                      Max Wallet: {fmt(u?.walletMusd ?? 0)}
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={sMusdDepositInput}
                    onChange={(e) => setSMusdDepositInput(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-black"
                  />
                  <Button
                    type="button"
                    disabled={busyAction !== ""}
                    onClick={handleDepositSmusd}
                    className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-4"
                  >
                    {busyAction === "smusd-deposit" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Stake MUSD
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-black">
                  <span>
                    {proMode
                      ? "Withdraw sMUSD -> MUSD (+ Auto-Claim)"
                      : "Withdraw MUSD (+ Auto-Claim Interest)"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSMusdWithdrawInput(
                        String(
                          Math.floor(Math.max(0, (u?.sMusdBalance ?? 0) * 100)) /
                            100
                        )
                      )
                    }
                    className="text-[10px] font-mono text-amber-700 hover:underline"
                  >
                    Max sMUSD: {fmt(u?.sMusdBalance ?? 0)}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={sMusdWithdrawInput}
                    onChange={(e) => setSMusdWithdrawInput(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-black"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      busyAction !== "" || (u?.sMusdBalance ?? 0) <= 0
                    }
                    onClick={handleWithdrawSmusd}
                    className="rounded-xl font-black text-xs px-4 bg-white"
                  >
                    {busyAction === "smusd-withdraw" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                        Withdraw
                      </>
                    )}
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    busyAction !== "" ||
                    (u?.sMusdClaimableYieldMusd ?? 0) <= 0
                  }
                  onClick={handleClaimSmusdYield}
                  className="w-full rounded-xl font-black text-xs border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950"
                >
                  {busyAction === "smusd-claim" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-700" />
                  )}
                  {proMode
                    ? "Claim Accrued sMUSD Yield (claimYield)"
                    : "Claim Earned Interest"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Card: Unified Tigris veBTC + MEZO Voter Telemetry */}
      <Card className="clay-card border border-violet-500/25 bg-white/95">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            {proMode && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-violet-100 text-violet-900 font-black text-[10px]">
                  TIGRIS VEBTC + MEZO COORDINATION LAYER
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  ValidatorsVoter: Mainnet-Only (Testnet uses Pools Voter 0x72F8…)
                </Badge>
              </div>
            )}
            <div className="text-sm font-black text-[#231f20] flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              {proMode ? "Wallet Power: " : "MEZO Boost Tier: "}
              {profile
                ? `${profile.mezoBalance.toFixed(2)} MEZO + ${profile.veBtcVotingPower.toFixed(
                    4
                  )} veBTC (${profile.veBtcNftCount} lock NFTs) -> ${
                    profile.tier.label
                  } (-${profile.tier.aprDiscountBps} bps APR)`
                : "Connect wallet to see your MEZO & veBTC loan discounts"}
            </div>
            {proMode && (
              <p className="text-[11px] text-slate-600">
                Both ERC-20 <code className="font-mono">MEZO</code> and Tigris
                ERC-721 <code className="font-mono">VeBTC</code> voting power (
                <code>balanceOfNFT</code> + locked BTC) feed into Main Island
                Credit Council APR floor discounts and Leaderboard prominence.
              </p>
            )}
          </div>

          {proMode && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <a
                href={`${EXPLORER_BASE}/address/${MEZO_TESTNET_LENDING_ADDRESSES.veBtc}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#f8f5f0] border border-black/10 px-3 py-1.5 font-bold hover:bg-white inline-flex items-center gap-1"
              >
                VeBTC {shortenHex(MEZO_TESTNET_LENDING_ADDRESSES.veBtc, 4)}
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={`${EXPLORER_BASE}/address/${MEZO_TESTNET_LENDING_ADDRESSES.veBtcVoter}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#f8f5f0] border border-black/10 px-3 py-1.5 font-bold hover:bg-white inline-flex items-center gap-1"
              >
                VeBTCVoter{" "}
                {shortenHex(MEZO_TESTNET_LENDING_ADDRESSES.veBtcVoter, 4)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
