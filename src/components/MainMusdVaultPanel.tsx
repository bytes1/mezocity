"use client";

import React, { useCallback, useEffect, useState } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  Coins,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Gavel,
  Loader2,
  ExternalLink,
  Zap,
  Vault,
} from "lucide-react";
import { TroveToIslandLoopPanel } from "@/components/TroveToIslandLoopPanel";
import { MezoStabilityYieldPanel } from "@/components/MezoStabilityYieldPanel";
import { MezoEarnOptimizerPanel } from "@/components/MezoEarnOptimizerPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ISLAND_CREDIT_COUNCIL_ABI,
  ISLAND_ECOSYSTEM_ADDRESSES,
  MAIN_MUSD_VAULT_ABI,
} from "@/lib/island-contracts";
import type { IslandLoanApplicationRecord } from "@/lib/island-db";
import type { MezoCoordinationTier } from "@/lib/mezo-coordination";
import {
  extractEvmRevertReason,
  MEZO_TESTNET_LENDING_ADDRESSES,
  mezoTestnet,
  MUSD_ERC20_ABI,
} from "@/lib/mezo-chain";
import { shortenHex } from "@/lib/utils";

interface MainMusdVaultApiResponse {
  ok: boolean;
  contracts: typeof ISLAND_ECOSYSTEM_ADDRESSES;
  vaultStats: {
    deployed: boolean;
    address: string;
    musdAddress: string;
    mezoTokenAddress?: string;
    totalAssetsMusd: number;
    trackedLiquidMusd: number;
    activePrincipalLoanedMusd: number;
    cumulativeInterestEarnedMusd: number;
    sharePriceMusd: number;
    totalShares: number;
    maxEligibleLoanMusd: number;
    minLiquidReserveBps: number;
    maxSingleLoanBps: number;
    dailyAutoDisburseCapMusd: number;
    dailyAutoDisbursedMusd: number;
    minHoldSeconds: number;
    emergencyPause: boolean;
    userMusdBalance: number;
    userMezoBalance?: number;
    userVeBtcVotingPower?: number;
    userMezoTier?: MezoCoordinationTier;
    userVaultAllowance: number;
    userShares: number;
    userAssetsMusd: number;
    canWithdrawAfterSec: number;
  };
  swapPoolStats: {
    deployed: boolean;
    address: string;
    btcReserve: number;
    musdReserve: number;
    effectivePriceUsd: number;
  };
  councilAutoCapMusd: number;
  loanApplications: IslandLoanApplicationRecord[];
}

interface MainMusdVaultPanelProps {
  onSelectIsland?: (islandId: string) => void;
}

export function MainMusdVaultPanel({ onSelectIsland }: MainMusdVaultPanelProps) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [activeView, setActiveView] = useState<
    "treasury" | "loop" | "stability" | "earn"
  >("earn");
  const [data, setData] = useState<MainMusdVaultApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [depositInput, setDepositInput] = useState("25");
  const [withdrawMusdInput, setWithdrawMusdInput] = useState("10");
  const [busyAction, setBusyAction] = useState<string>("");
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
    txHash?: string;
  } | null>(null);

  const fetchVaultState = useCallback(async () => {
    try {
      const qs = address ? `?user=${encodeURIComponent(address)}` : "";
      const res = await fetch(`/api/main-musd-vault${qs}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as MainMusdVaultApiResponse;
      if (json.ok) setData(json);
    } catch (err) {
      console.error("Failed to fetch Main MUSD Vault:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchVaultState();
  }, [fetchVaultState]);

  const ensureMezoChain = async () => {
    if (!isConnected || !address) {
      throw new Error("Connect your wallet on Mezo Testnet (31611) first.");
    }
    if (chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
  };

  const handleDepositMusd = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const vaultAddr = ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault;
    if (!vaultAddr) {
      setNotice({
        type: "error",
        text: "NEXT_PUBLIC_MAIN_MUSD_VAULT_ADDRESS is not set yet.",
      });
      return;
    }

    const amount = Number(depositInput || "0");
    if (amount <= 0) {
      setNotice({ type: "error", text: "Enter a positive MUSD deposit amount." });
      return;
    }

    setBusyAction("DEPOSIT");
    try {
      await ensureMezoChain();
      const assetsWei = parseEther(amount.toString());

      if (publicClient && address) {
        const allowance = (await publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "allowance",
          args: [address, vaultAddr],
        })) as bigint;

        if (allowance < assetsWei) {
          setNotice({ type: "info", text: "Step 1/2: Approving MUSD spend..." });
          const appHash = await writeContractAsync({
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "approve",
            args: [vaultAddr, assetsWei],
            chainId: mezoTestnet.id,
          });
          await publicClient.waitForTransactionReceipt({ hash: appHash });
        }
      }

      setNotice({ type: "info", text: "Depositing MUSD into MainMUSDVault..." });
      const depHash = await writeContractAsync({
        address: vaultAddr,
        abi: MAIN_MUSD_VAULT_ABI,
        functionName: "depositMUSD",
        args: [assetsWei],
        chainId: mezoTestnet.id,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: depHash });
      }
      setNotice({
        type: "success",
        text: `Deposited ${amount} MUSD into Main Island MUSD Vault.`,
        txHash: depHash,
      });
      await fetchVaultState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleWithdrawMusd = async (withdrawAll = false) => {
    setNotice(null);
    const vaultAddr = ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault;
    if (!vaultAddr || !address || !publicClient) {
      setNotice({
        type: "error",
        text: "Wallet or MainMUSDVault address not ready.",
      });
      return;
    }

    setBusyAction("WITHDRAW");
    try {
      await ensureMezoChain();
      const userSharesWei = (await publicClient.readContract({
        address: vaultAddr,
        abi: MAIN_MUSD_VAULT_ABI,
        functionName: "shareBalances",
        args: [address],
      })) as bigint;

      if (userSharesWei <= 0n) {
        throw new Error("You have 0 vault shares to withdraw.");
      }

      let sharesToBurn = userSharesWei;
      if (!withdrawAll) {
        const wantNum = Number(withdrawMusdInput || "0");
        if (wantNum <= 0) throw new Error("Enter a positive MUSD withdrawal amount.");
        const convShares = (await publicClient.readContract({
          address: vaultAddr,
          abi: MAIN_MUSD_VAULT_ABI,
          functionName: "convertToShares",
          args: [parseEther(wantNum.toString())],
        })) as bigint;
        sharesToBurn = convShares > userSharesWei ? userSharesWei : convShares;
      }

      const wHash = await writeContractAsync({
        address: vaultAddr,
        abi: MAIN_MUSD_VAULT_ABI,
        functionName: "withdrawMUSD",
        args: [sharesToBurn],
        chainId: mezoTestnet.id,
      });
      await publicClient.waitForTransactionReceipt({ hash: wHash });

      setNotice({
        type: "success",
        text: "MUSD liquidity withdrawn from MainMUSDVault.",
        txHash: wHash,
      });
      await fetchVaultState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleConveneCouncil = async (app: IslandLoanApplicationRecord) => {
    setNotice(null);
    setBusyAction(`COUNCIL-${app.appId}`);
    try {
      const res = await fetch("/api/credit-council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: app.appId,
          islandId: app.islandId,
          chainAppId: app.chainAppId,
          checkpointId: app.checkpointId,
          requestedMusd: app.requestedMusd,
          termDays: app.termDays,
          purposeSummary: app.purposeSummary,
          provedProfitUsd: app.provedProfitUsd,
          provedRoiBps: app.provedRoiBps,
          runCouncilImmediately: true,
        }),
      });
      const result = await res.json();
      if (!result.ok) throw new Error(result.error || "Council run failed.");
      setNotice({
        type: "success",
        text: `5-Agent Credit Council verdict: ${result.verdict} (${result.approvedMusd} MUSD @ ${(
          (result.aprBps || 0) / 100
        ).toFixed(2)}% APR)${result.autoDisbursed ? " • Auto-Disbursed!" : ""}`,
        txHash: result.txHash || undefined,
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

  const handleFinalizeDisburse = async (chainAppId: number) => {
    const councilAddr = ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil;
    if (!councilAddr) return;
    setBusyAction(`DISBURSE-${chainAppId}`);
    setNotice(null);
    try {
      await ensureMezoChain();
      const txHash = await writeContractAsync({
        address: councilAddr,
        abi: ISLAND_CREDIT_COUNCIL_ABI,
        functionName: "finalizeAndDisburseLoan",
        args: [BigInt(chainAppId)],
        chainId: mezoTestnet.id,
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: txHash });
      setNotice({
        type: "success",
        text: `Finalized & disbursed Loan #${chainAppId} to Sub-Island Vault.`,
        txHash,
      });
      await fetchVaultState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleLiquidateLoan = async (chainAppId: number) => {
    const councilAddr = ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil;
    if (!councilAddr) return;
    setBusyAction(`LIQUIDATE-${chainAppId}`);
    setNotice(null);
    try {
      await ensureMezoChain();
      const txHash = await writeContractAsync({
        address: councilAddr,
        abi: ISLAND_CREDIT_COUNCIL_ABI,
        functionName: "liquidateDefaultedLoan",
        args: [BigInt(chainAppId)],
        chainId: mezoTestnet.id,
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: txHash });
      setNotice({
        type: "success",
        text: `Settled overdue Loan #${chainAppId} back into MainMUSDVault.`,
        txHash,
      });
      await fetchVaultState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const vs = data?.vaultStats;
  const sp = data?.swapPoolStats;
  const loans = data?.loanApplications || [];

  return (
    <div className="space-y-6 text-[#231f20]">
      {/* Header Banner */}
      <div className="rounded-[28px] bg-gradient-to-r from-[#064e3b] via-[#047857] to-[#0f766e] text-white p-6 shadow-xl border-2 border-white/80 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className="bg-white/20 hover:bg-white/25 text-white font-black border-white/30">
              Main Island Treasury
            </Badge>
            <Badge className="bg-amber-400/25 text-amber-100 border-amber-300/40 font-extrabold">
              ERC-4626 Anti-Inflation Vault
            </Badge>
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            Main MUSD Liquidity Vault & Credit Council Desk
          </h1>
          <p className="text-xs text-emerald-100 max-w-2xl">
            LPs supply MUSD to earn lending APR from profitable Sub-Islands. Main Island&apos;s 5-Agent Council underwrites verifiable Proof-of-Profit checkpoints with deterministic safety caps and reserve protection.
          </p>
        </div>

        <Button
          onClick={fetchVaultState}
          variant="secondary"
          disabled={loading}
          className="rounded-xl font-extrabold bg-white/95 text-emerald-950 hover:bg-white"
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Sync On-Chain State
        </Button>
      </div>

      {/* Sub-view Switcher: Treasury & Credit Council vs Autonomous Trove-to-Island Loop */}
      <div className="inline-flex items-center gap-1.5 rounded-2xl border border-stone-200 bg-stone-100/90 p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveView("treasury")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${activeView === "treasury"
              ? "bg-white text-emerald-950 shadow-sm border border-emerald-200/80"
              : "text-stone-600 hover:text-stone-900"
            }`}
        >
          <Vault className="h-3.5 w-3.5 text-emerald-600" />
          Treasury &amp; Credit Council
        </button>
        <button
          type="button"
          onClick={() => setActiveView("loop")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${activeView === "loop"
              ? "bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-sm"
              : "text-stone-600 hover:text-stone-900"
            }`}
        >
          <Zap className="h-3.5 w-3.5" />
          Trove-to-Island Loop
        </button>
        <button
          type="button"
          onClick={() => setActiveView("earn")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${activeView === "earn"
              ? "bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-sm"
              : "text-stone-600 hover:text-stone-900"
            }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Earn Vaults &amp; Tigris Pools
        </button>
        <button
          type="button"
          onClick={() => setActiveView("stability")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${activeView === "stability"
              ? "bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-sm"
              : "text-stone-600 hover:text-stone-900"
            }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          StabilityPool &amp; sMUSD
        </button>
      </div>

      {activeView === "earn" ? (
        <MezoEarnOptimizerPanel onVaultChanged={fetchVaultState} />
      ) : activeView === "loop" ? (
        <TroveToIslandLoopPanel
          onSelectIsland={onSelectIsland}
          onVaultChanged={fetchVaultState}
        />
      ) : activeView === "stability" ? (
        <MezoStabilityYieldPanel onVaultChanged={fetchVaultState} />
      ) : (
        <>
          {!vs?.deployed && (
            <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 px-4 py-3 text-xs text-amber-950 flex items-start gap-2.5 shadow-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-black">Deploy MainMUSDVault.sol to Go Live on Mezo Testnet</div>
                <p className="text-[11px] mt-0.5">
                  Run <code className="font-mono bg-amber-100 px-1 rounded">DeployIslandEcosystem.s.sol</code> and populate{" "}
                  <code className="font-mono">NEXT_PUBLIC_MAIN_MUSD_VAULT_ADDRESS</code>,{" "}
                  <code className="font-mono">NEXT_PUBLIC_ISLAND_FACTORY_ADDRESS</code>, and{" "}
                  <code className="font-mono">NEXT_PUBLIC_ISLAND_CREDIT_COUNCIL_ADDRESS</code> in <code className="font-mono">.env</code>.
                </p>
              </div>
            </div>
          )}

          {notice && (
            <div
              className={`rounded-2xl border-2 px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 ${notice.type === "error"
                  ? "bg-rose-50 border-rose-300 text-rose-900"
                  : notice.type === "success"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                    : "bg-violet-50 border-violet-300 text-violet-950"
                }`}
            >
              <span>{notice.text}</span>
              {notice.txHash && (
                <a
                  href={`https://explorer.test.mezo.org/tx/${notice.txHash}`}
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

          {/* 4 Telemetry KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10.5px] font-extrabold uppercase">
                  Main Vault Total Assets
                </CardDescription>
                <CardTitle className="text-2xl font-black text-emerald-700">
                  {(vs?.totalAssetsMusd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} MUSD
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] font-semibold text-stone-600">
                Share Price: <strong>{(vs?.sharePriceMusd ?? 1).toFixed(4)} MUSD</strong>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10.5px] font-extrabold uppercase">
                  Liquid vs Loaned Out
                </CardDescription>
                <CardTitle className="text-2xl font-black text-[#231f20]">
                  {(vs?.trackedLiquidMusd ?? 0).toFixed(1)} / {(vs?.activePrincipalLoanedMusd ?? 0).toFixed(1)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] font-semibold text-stone-600">
                Reserve Floor: {((vs?.minLiquidReserveBps ?? 2500) / 100).toFixed(0)}% • Max Loan:{" "}
                {(vs?.maxEligibleLoanMusd ?? 0).toFixed(1)} MUSD
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10.5px] font-extrabold uppercase">
                  Earned Interest & 24h Auto Cap
                </CardDescription>
                <CardTitle className="text-2xl font-black text-violet-700">
                  +{(vs?.cumulativeInterestEarnedMusd ?? 0).toFixed(3)} MUSD
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] font-semibold text-stone-600">
                Auto-Disburse Today: {(vs?.dailyAutoDisbursedMusd ?? 0).toFixed(0)} /{" "}
                {(vs?.dailyAutoDisburseCapMusd ?? 2000).toFixed(0)} MUSD
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
              <CardHeader className="pb-2">
                <CardDescription className="text-[10.5px] font-extrabold uppercase">
                  Your MUSD LP &amp; MEZO Tier
                </CardDescription>
                <CardTitle className="text-2xl font-black text-amber-700">
                  {(vs?.userAssetsMusd ?? 0).toFixed(2)} MUSD
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] font-semibold text-stone-600 space-y-1">
                <div>
                  Wallet: {(vs?.userMusdBalance ?? 0).toFixed(2)} MUSD •{" "}
                  <strong className="text-indigo-800">
                    {(vs?.userMezoBalance ?? 0).toFixed(1)} MEZO
                    {(vs?.userVeBtcVotingPower ?? 0) > 0
                      ? ` + ${(vs?.userVeBtcVotingPower ?? 0).toFixed(4)} veBTC`
                      : ""}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-black ${vs?.userMezoTier?.badgeClasses ||
                      "bg-stone-100 text-stone-700 border-stone-300"
                      }`}
                  >
                    <Zap className="h-2.5 w-2.5" />
                    {vs?.userMezoTier?.label || "Standard Tier"}
                    {vs?.userMezoTier && vs.userMezoTier.aprDiscountBps > 0
                      ? ` (-${vs.userMezoTier.aprDiscountBps} bps APR)`
                      : ""}
                  </span>
                  <span className="text-[10px]">
                    BTC ${(sp?.effectivePriceUsd ?? 0).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* LP Deposit / Withdraw + Swap Pool Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-black">
                  <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                  Supply MUSD Liquidity (Mint Vault Shares)
                </CardTitle>
                <CardDescription className="text-xs">
                  Approve MUSD and deposit into <code className="font-mono">MainMUSDVault.sol</code> to earn interest paid by borrowing Sub-Islands.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDepositMusd} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={depositInput}
                      onChange={(e) => setDepositInput(e.target.value)}
                      className="flex-1 rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-3 py-2 text-sm font-black"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDepositInput(String(Math.floor((vs?.userMusdBalance ?? 0) * 100) / 100))
                      }
                      className="rounded-xl text-xs font-extrabold"
                    >
                      MAX
                    </Button>
                  </div>
                  <Button
                    type="submit"
                    disabled={!vs?.deployed || busyAction !== ""}
                    className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold"
                  >
                    {busyAction === "DEPOSIT" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        Processing Deposit...
                      </>
                    ) : (
                      <>
                        <Coins className="h-4 w-4 mr-1.5" />
                        Approve & Deposit MUSD
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-black">
                  <ArrowUpFromLine className="h-4 w-4 text-violet-700" />
                  Withdraw MUSD + Accrued Yield
                </CardTitle>
                <CardDescription className="text-xs">
                  {(vs?.canWithdrawAfterSec ?? 0) > 0
                    ? `LP flash-loan guard active: withdraw unlocks in ${vs?.canWithdrawAfterSec}s`
                    : `Ready to redeem shares (${(vs?.userShares ?? 0).toFixed(4)} shares held)`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={withdrawMusdInput}
                    onChange={(e) => setWithdrawMusdInput(e.target.value)}
                    className="flex-1 rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-3 py-2 text-sm font-black"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!vs?.deployed || busyAction !== "" || (vs?.userShares ?? 0) <= 0}
                    onClick={() => handleWithdrawMusd(true)}
                    className="rounded-xl text-xs font-extrabold"
                  >
                    Redeem All
                  </Button>
                </div>
                <Button
                  type="button"
                  disabled={
                    !vs?.deployed ||
                    busyAction !== "" ||
                    (vs?.userShares ?? 0) <= 0 ||
                    (vs?.canWithdrawAfterSec ?? 0) > 0
                  }
                  onClick={() => handleWithdrawMusd(false)}
                  className="w-full rounded-xl bg-[#242331] hover:bg-violet-700 text-white font-extrabold"
                >
                  {busyAction === "WITHDRAW" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Redeeming Shares...
                    </>
                  ) : (
                    "Withdraw MUSD from Main Vault"
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* 5-Agent Credit Council Loan Underwriting Desk */}
          <Card className="rounded-[26px] border-2 border-white bg-white/95 shadow-lg">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg font-black">
                  <Scale className="h-5 w-5 text-violet-700" />
                  Main Island 5-Agent Credit Council Queue
                </CardTitle>
                <CardDescription className="text-xs">
                  Loans &lt;= {data?.councilAutoCapMusd ?? 500} MUSD auto-disburse immediately when approved by Optimus Prime&apos;s council; larger loans require final owner disbursement below.
                </CardDescription>
              </div>
              <Badge className="bg-violet-100 text-violet-900 border-violet-200 font-black">
                {loans.length} Applications
              </Badge>
            </CardHeader>

            <CardContent className="space-y-4">
              {loans.length === 0 ? (
                <div className="rounded-2xl bg-[#faf7f2] border border-dashed border-[#d9ceb8] p-8 text-center text-xs font-semibold text-stone-600">
                  No Sub-Island loan applications submitted yet. Build a Sub-Island, generate verifiable on-chain Profit Checkpoints, and apply for Main Island credit!
                </div>
              ) : (
                loans.map((app) => {
                  const verdictJson = app.councilVerdictJson as {
                    opinions?: Array<{
                      speaker: string;
                      role: string;
                      stance: string;
                      summary: string;
                    }>;
                    covenants?: string[];
                    transcriptHash?: string;
                    deterministicMaxLoanUsd?: number;
                    mezoBalance?: number;
                    mezoTierId?: string;
                    mezoTierLabel?: string;
                    aprDiscountBps?: number;
                  };
                  const opinions = Array.isArray(verdictJson?.opinions) ? verdictJson.opinions : [];
                  const mezoDiscount = Number(verdictJson?.aprDiscountBps || 0);
                  const isPendingCouncil =
                    app.status === "PENDING_COUNCIL" || app.verdict === "NONE";
                  const isAwaitingManualDisburse =
                    app.status === "APPROVED_AWAITING_OWNER" ||
                    app.status === "COUNCIL_APPROVED";
                  const isActiveLoan =
                    app.status === "DISBURSED" || app.status === "ACTIVE_LOAN";

                  return (
                    <div
                      key={app.appId}
                      className="rounded-2xl bg-[#faf7f2] border border-[#e6dec8] p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black">
                              Application #{app.chainAppId || app.appId.slice(-6)}
                            </span>
                            <Badge
                              className={`text-[10px] font-black ${app.verdict === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : app.verdict === "PARTIAL_APPROVAL"
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : app.verdict === "REJECTED"
                                      ? "bg-rose-100 text-rose-800 border-rose-300"
                                      : "bg-slate-200 text-slate-800"
                                }`}
                            >
                              {app.verdict} • {app.status}
                            </Badge>
                            {mezoDiscount > 0 && (
                              <Badge className="text-[10px] font-black bg-amber-100 text-amber-900 border-amber-300">
                                ⚡ {String(verdictJson?.mezoTierLabel || "MEZO Boost")} (-{mezoDiscount} bps APR)
                              </Badge>
                            )}
                            {onSelectIsland && (
                              <button
                                type="button"
                                onClick={() => onSelectIsland(app.islandId)}
                                className="text-[11px] font-extrabold text-violet-700 hover:underline"
                              >
                                Inspect Sub-Island ({app.islandId})
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-stone-700 font-medium">
                            {app.purposeSummary}
                          </p>
                          <div className="flex flex-wrap gap-3 text-[11px] font-bold text-stone-600 pt-0.5">
                            <span>Requested: {app.requestedMusd} MUSD</span>
                            <span>Approved: {app.approvedMusd} MUSD</span>
                            <span>APR: {(app.aprBps / 100).toFixed(2)}%</span>
                            <span>Term: {app.termDays}d</span>
                            <span>
                              Proved Profit: ${app.provedProfitUsd.toFixed(2)} (
                              {(app.provedRoiBps / 100).toFixed(2)}% ROI)
                            </span>
                            <span>Repaid: {app.repaidMusd.toFixed(2)} MUSD</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {isPendingCouncil && (
                            <Button
                              size="sm"
                              disabled={busyAction !== ""}
                              onClick={() => handleConveneCouncil(app)}
                              className="rounded-xl bg-[#242331] hover:bg-violet-700 text-white font-extrabold text-xs"
                            >
                              {busyAction === `COUNCIL-${app.appId}` ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                  Deliberating...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                                  Convene 5-Agent Council
                                </>
                              )}
                            </Button>
                          )}

                          {isAwaitingManualDisburse && app.chainAppId > 0 && (
                            <Button
                              size="sm"
                              disabled={busyAction !== ""}
                              onClick={() => handleFinalizeDisburse(app.chainAppId)}
                              className="rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs"
                            >
                              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                              Owner Finalize & Disburse
                            </Button>
                          )}

                          {isActiveLoan && app.chainAppId > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyAction !== ""}
                              onClick={() => handleLiquidateLoan(app.chainAppId)}
                              className="rounded-xl border-rose-300 text-rose-700 hover:bg-rose-50 font-extrabold text-xs"
                            >
                              <Gavel className="h-3.5 w-3.5 mr-1" />
                              Check Default / Liquidate
                            </Button>
                          )}
                        </div>
                      </div>

                      {opinions.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 pt-1">
                          {opinions.map((op) => (
                            <div
                              key={op.speaker}
                              className="rounded-xl bg-white border border-[#e7decb] p-2.5 text-[11px] space-y-1"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-black truncate">{op.speaker}</span>
                                {op.stance === "APPROVE" ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                ) : op.stance === "REJECT" ? (
                                  <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                )}
                              </div>
                              <div className="text-[9.5px] font-bold uppercase text-stone-400 truncate">
                                {op.role}
                              </div>
                              <p className="text-[10.5px] text-stone-700 leading-snug">
                                {op.summary}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
