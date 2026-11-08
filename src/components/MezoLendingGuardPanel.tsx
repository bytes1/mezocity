"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Cpu,
  ExternalLink,
  KeyRound,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  useBalance,
  useSendTransaction,
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
import { Slider } from "@/components/ui/slider";
import {
  BORROWER_OPERATIONS_ABI,
  DEFAULT_CONTRACT_ADDRESSES,
  MEZO_TESTNET_LENDING_ADDRESSES,
  POLICY_VAULT_ABI,
} from "@/lib/mezo-chain";
import { shortenHex } from "@/lib/utils";
import type { LendingGuardLiveSnapshot } from "@/lib/mezo-lending-guard";

type ExtendedLendingGuardSnapshot = LendingGuardLiveSnapshot & {
  aiMonitorAnalysis?: string;
  aiModelUsed?: string;
};

const MCR_RATIO = 1.1; // Mezo MUSD 110% Minimum Collateral Ratio

const STEP_WALKTHROUGH = [
  {
    step: 1,
    label: "Step 1 / 6",
    title: "Arm Reserve & Partition Gas Share",
    detail:
      "You fund a separate rescue reserve wallet with test BTC. At arm, 80% is allocated to MUSD / collateral rescue power while 20% (10–50% configurable) is kept as native BTC for gas.",
    sampleHf: 1.52,
  },
  {
    step: 2,
    label: "Step 2 / 6",
    title: "Monitor Position via Finalized Reads",
    detail:
      "The guard watches your named borrower account on Mezo Testnet TroveManager (0xE47c…6bb0) without ever holding its private key or signing for it.",
    sampleHf: 1.44,
  },
  {
    step: 3,
    label: "Step 3 / 6",
    title: "It Crosses Your Trigger Line (Obs #1/2)",
    detail:
      "The example trigger is 1.15. Ordinary rescues require two qualifying finalized observations one interval apart; Observation #1/2 is recorded.",
    sampleHf: 1.11,
  },
  {
    step: 4,
    label: "Step 4 / 6",
    title: "Second Qualifying Observation Confirmed (Obs #2/2)",
    detail:
      "Monitored liquidation-basis HF remains in working range (1.00 < HF < Trigger) for a second finalized read. Sizing engine computes Repay-First rescue to reach Target HF 1.55.",
    sampleHf: 1.09,
  },
  {
    step: 5,
    label: "Step 5 / 6",
    title: "Exact ERC-20 Approve & repayBorrowBehalf",
    detail:
      "Any residual MUSD allowance is reset to 0 first, then exact repayment amount is approved (never MaxUint256). Reserve calls repayBorrowBehalf / supplies collateral.",
    sampleHf: 1.32,
  },
  {
    step: 6,
    label: "Step 6 / 6",
    title: "Restored to Target Health Factor",
    detail:
      "Debt reduction is final and restores the monitored position to Target HF (1.55). The single lending worker returns to finalized polling.",
    sampleHf: 1.55,
  },
];

interface MezoLendingGuardPanelProps {
  onRecoverWithdrawClick?: () => void;
}

export function MezoLendingGuardPanel({
  onRecoverWithdrawClick,
}: MezoLendingGuardPanelProps) {
  const { address: connectedOwnerAddress, isConnected } = useAccount();
  const { data: connectedWalletBalance } = useBalance({
    address: connectedOwnerAddress,
  });
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [snapshot, setSnapshot] =
    useState<ExtendedLendingGuardSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [lastTxHash, setLastTxHash] = useState<string>("");
  const [copiedReserve, setCopiedReserve] = useState<boolean>(false);
  const [fundAmountBtc, setFundAmountBtc] = useState<string>("0.00001");

  // Borrow MUSD Using BTC interactive form state
  const [collateralBtcInput, setCollateralBtcInput] =
    useState<string>("0.0005");
  const [borrowMusdInput, setBorrowMusdInput] = useState<string>("25");

  // Editable configuration form state
  const [monitoredBorrower, setMonitoredBorrower] = useState<string>("");
  const [triggerHf, setTriggerHf] = useState<number>(1.15);
  const [targetHf, setTargetHf] = useState<number>(1.55);
  const [btcReserveSharePct, setBtcReserveSharePct] = useState<number>(20);
  const [rescuesGasCount, setRescuesGasCount] = useState<number>(5);
  const [previewStepIndex, setPreviewStepIndex] = useState<number | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/lending-guard", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok && data.snapshot) {
        const s: ExtendedLendingGuardSnapshot = data.snapshot;
        setSnapshot(s);
        setMonitoredBorrower(s.monitoredBorrower || "");
        setTriggerHf(s.triggerHf);
        setTargetHf(s.targetHf);
        setBtcReserveSharePct(s.btcReserveSharePct);
        setRescuesGasCount(s.rescuesGasCount);
      }
    } catch (err) {
      console.error("Failed to load Mezo Guard snapshot:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const runGuardAction = async (
    action:
      | "configure"
      | "borrow_musd"
      | "fund_reserve"
      | "simulate_drop"
      | "poll_and_rescue"
      | "force_liquidatable_test"
      | "pause"
      | "retire"
      | "recover",
    overrideParams?: Partial<{
      triggerHf: number;
      targetHf: number;
      btcReserveSharePct: number;
      rescuesGasCount: number;
      monitoredBorrower: string;
      borrowerAddress: string;
      collateralBtcInput: number;
      borrowMusdInput: number;
      fundAmountBtc: number;
      externalTxHash: string;
      ownerAddress: string;
    }>
  ) => {
    setBusyAction(action);
    setErrorMessage("");
    setPreviewStepIndex(null);
    try {
      const effTrigger = overrideParams?.triggerHf ?? triggerHf;
      const effTarget = Math.max(
        Number((effTrigger + 0.05).toFixed(2)),
        overrideParams?.targetHf ?? targetHf
      );
      const res = await fetch("/api/lending-guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          monitoredBorrower:
            overrideParams?.monitoredBorrower ??
            (monitoredBorrower || connectedOwnerAddress || ""),
          borrowerAddress:
            overrideParams?.borrowerAddress ??
            (connectedOwnerAddress || monitoredBorrower || ""),
          triggerHf: effTrigger,
          targetHf: effTarget,
          btcReserveSharePct:
            overrideParams?.btcReserveSharePct ?? btcReserveSharePct,
          rescuesGasCount: overrideParams?.rescuesGasCount ?? rescuesGasCount,
          collateralBtcInput: overrideParams?.collateralBtcInput,
          borrowMusdInput: overrideParams?.borrowMusdInput,
          fundAmountBtc:
            overrideParams?.fundAmountBtc ??
            (Number(fundAmountBtc) > 0 ? Number(fundAmountBtc) : 0.00001),
          externalTxHash: overrideParams?.externalTxHash,
          ownerAddress: overrideParams?.ownerAddress ?? connectedOwnerAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setErrorMessage(
          data?.error || "Failed to execute Mezo Lending Guard action."
        );
        return;
      }
      if (data.snapshot) {
        setSnapshot(data.snapshot);
        setMonitoredBorrower(data.snapshot.monitoredBorrower || "");
        setTriggerHf(data.snapshot.triggerHf);
        setTargetHf(data.snapshot.targetHf);
        setBtcReserveSharePct(data.snapshot.btcReserveSharePct);
        setRescuesGasCount(data.snapshot.rescuesGasCount);
        if (data.actionSummary) {
          setBannerMessage(data.actionSummary);
        }
        if (data.txHash) {
          setLastTxHash(data.txHash);
        }
      }
    } catch (err) {
      console.error("Mezo Guard action failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Mezo Guard action failed"
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleFundReserveFromConnectedWallet = async () => {
    const reserveAddr = snapshot?.reserveWallet;
    const amt = Math.max(0.000001, Number(fundAmountBtc) || 0.00001);
    if (isConnected && reserveAddr && reserveAddr.startsWith("0x")) {
      setBusyAction("fund_wallet");
      try {
        const hash = await sendTransactionAsync({
          to: reserveAddr as `0x${string}`,
          value: parseEther(amt.toFixed(18)),
        });
        await runGuardAction("fund_reserve", {
          fundAmountBtc: amt,
          externalTxHash: hash,
        });
        return;
      } catch (err) {
        console.warn(
          "Connected wallet send cancelled or failed, using Testnet Vault:",
          err
        );
      } finally {
        setBusyAction(null);
      }
    }
    await runGuardAction("fund_reserve", { fundAmountBtc: amt });
  };

  // Live Borrow MUSD Using BTC calculations
  const liveBtcPrice = snapshot?.btcPriceUsd ?? 0;
  const parsedCollBtc = Math.max(0, Number(collateralBtcInput) || 0);
  const parsedBorrowMusd = Math.max(0, Number(borrowMusdInput) || 0);
  const collateralPreviewUsd = Number(
    (parsedCollBtc * liveBtcPrice).toFixed(2)
  );
  const maxBorrowableMusdAt110Mcr =
    liveBtcPrice > 0
      ? Number(((parsedCollBtc * liveBtcPrice) / MCR_RATIO).toFixed(2))
      : 0;
  const recommendedSafeBorrowAt150Hf =
    liveBtcPrice > 0
      ? Number(((parsedCollBtc * liveBtcPrice) / (MCR_RATIO * 1.5)).toFixed(2))
      : 0;
  const projectedBorrowHf =
    parsedBorrowMusd > 0 && liveBtcPrice > 0
      ? Number(
          (
            (parsedCollBtc * liveBtcPrice) /
            (parsedBorrowMusd * MCR_RATIO)
          ).toFixed(2)
        )
      : 0;
  const projectedLiquidationBtcPrice =
    parsedCollBtc > 0 && parsedBorrowMusd > 0
      ? Number(((parsedBorrowMusd * MCR_RATIO) / parsedCollBtc).toFixed(2))
      : 0;

  const connectedWalletBtc = connectedWalletBalance
    ? Number(formatEther(connectedWalletBalance.value))
    : 0;
  const availableScaleBtc =
    connectedWalletBtc > 0.00002
      ? Number(Math.max(0.00001, connectedWalletBtc * 0.5).toFixed(6))
      : snapshot?.reserveNativeBtc && snapshot.reserveNativeBtc > 0
      ? Number((snapshot.reserveNativeBtc * 0.5).toFixed(6))
      : 0.0005;

  const handleLockBtcAndBorrowMusd = async () => {
    setErrorMessage("");
    if (parsedCollBtc <= 0) {
      setErrorMessage("Enter a positive BTC collateral amount to lock.");
      return;
    }
    if (parsedBorrowMusd <= 0) {
      setErrorMessage("Enter a positive MUSD amount to borrow.");
      return;
    }
    if (liveBtcPrice > 0 && projectedBorrowHf < 1.0) {
      setErrorMessage(
        `Requested borrow (${parsedBorrowMusd} MUSD) exceeds Mezo's 110% MCR limit (Max ${maxBorrowableMusdAt110Mcr.toFixed(
          2
        )} MUSD for ${parsedCollBtc} BTC).`
      );
      return;
    }

    const activeBorrower =
      connectedOwnerAddress ||
      monitoredBorrower ||
      snapshot?.monitoredBorrower ||
      "";

    let externalTxHash: string | undefined;
    // Call official Mezo Testnet BorrowerOperations (0xCdF7028ceAB81fA0C6971208e83fa7872994beE5) openTrove directly from connected wallet
    if (
      isConnected &&
      connectedOwnerAddress &&
      connectedWalletBtc >= parsedCollBtc + 0.00001
    ) {
      setBusyAction("borrow_musd_wallet");
      try {
        const borrowerOpsAddr =
          snapshot?.contracts.borrowerOperations ||
          MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations;
        const zeroHint =
          "0x0000000000000000000000000000000000000000" as `0x${string}`;
        const txHash = await writeContractAsync({
          address: borrowerOpsAddr,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "openTrove",
          args: [
            parseEther("0.05"), // 5% max fee percentage
            parseEther(parsedBorrowMusd.toFixed(18)),
            zeroHint,
            zeroHint,
          ],
          value: parseEther(parsedCollBtc.toFixed(18)),
        });
        externalTxHash = txHash;
      } catch (err) {
        console.warn(
          "BorrowerOperations.openTrove via browser wallet reverted or was skipped; falling back to backend execution:",
          err
        );
      } finally {
        setBusyAction(null);
      }
    }

    await runGuardAction("borrow_musd", {
      collateralBtcInput: parsedCollBtc,
      borrowMusdInput: parsedBorrowMusd,
      borrowerAddress: activeBorrower,
      monitoredBorrower: activeBorrower,
      externalTxHash,
    });
  };

  const hasActivePosition =
    (snapshot?.debtMusd ?? 0) > 0 || (snapshot?.collateralBtc ?? 0) > 0;

  const activeStepNumber =
    previewStepIndex !== null
      ? previewStepIndex
      : snapshot?.currentStep || 1;
  const activeStepWalkthrough =
    STEP_WALKTHROUGH.find((s) => s.step === activeStepNumber) ||
    STEP_WALKTHROUGH[0];

  const displayedHf =
    previewStepIndex !== null
      ? activeStepWalkthrough.sampleHf
      : snapshot?.currentHf ?? 0;

  // Map HF (0.90 to 1.85) onto 0% - 100% horizontal gauge
  const hfToPercent = (hf: number) =>
    hf <= 0
      ? 2
      : Math.min(98, Math.max(2, Math.round(((hf - 0.9) / (1.85 - 0.9)) * 100)));

  const liqBoundaryPct = hfToPercent(1.0);
  const triggerLinePct = hfToPercent(triggerHf);
  const targetLinePct = hfToPercent(targetHf);
  const currentHfPct = hfToPercent(displayedHf);

  return (
    <div className="space-y-6 pb-10">
      {/* Top Hero Header */}
      <div className="rounded-3xl bg-gradient-to-r from-[#1e1b2e] via-[#27203d] to-[#1f2937] text-white p-6 shadow-xl border border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[#f97316] text-white font-black text-[10px] tracking-wider uppercase px-2.5 py-0.5">
                MEZO LENDING · MEZO TESTNET (31611)
              </Badge>
              <Badge className="bg-purple-500/20 text-purple-200 border border-purple-400/30 font-bold text-[10px] uppercase px-2.5 py-0.5">
                BORROW MUSD WITH BTC
              </Badge>
              <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 font-bold text-[10px] uppercase px-2.5 py-0.5">
                REPAY ON BEHALF · IRONHIDE #04
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2.5">
              <ShieldCheck className="h-7 w-7 text-[#f97316]" />
              Lending Agent: Mezo Guard
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Lock BTC collateral to borrow MUSD on Mezo Testnet (31611), while{" "}
              <strong className="text-white">Ironhide (#04)</strong> monitors
              your live position via finalized reads and uses your{" "}
              <strong className="text-emerald-300">
                Dedicated Guard Reserve Wallet
              </strong>{" "}
              to restore Health Factor via exact ERC-20 approvals and on-behalf
              debt repayment (
              <code className="text-amber-300 font-mono">
                repayBorrowBehalf
              </code>{" "}
              / <code className="text-amber-300 font-mono">repayMUSD</code>) or
              collateral top-up.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Badge
              className={`text-xs font-black px-3 py-1.5 rounded-xl border ${
                snapshot?.status === "ARMED"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40"
                  : snapshot?.status === "PAUSED"
                  ? "bg-amber-500/20 text-amber-300 border-amber-400/40"
                  : "bg-slate-700 text-slate-200 border-slate-600"
              }`}
            >
              STATUS: {snapshot?.status || "ARMED"}
            </Badge>

            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(busyAction)}
              onClick={() =>
                runGuardAction(
                  snapshot?.status === "PAUSED" ? "configure" : "pause"
                )
              }
              className="rounded-xl bg-white/10 hover:bg-white/20 text-white border-white/20 font-bold text-xs"
            >
              {snapshot?.status === "PAUSED" ? (
                <>
                  <Play className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                  Resume Guard
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 mr-1.5 text-amber-300" />
                  Pause
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={loading || Boolean(busyAction)}
              onClick={loadSnapshot}
              className="rounded-xl bg-white/10 hover:bg-white/20 text-white border-white/20 font-bold text-xs"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${
                  loading ? "animate-spin" : ""
                }`}
              />
              Sync Testnet
            </Button>
          </div>
        </div>

        {/* Summary Pill */}
        <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-300">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-amber-300 font-black">
              TRIGGER HF {triggerHf.toFixed(2)} · TARGET HF{" "}
              {targetHf.toFixed(2)} · REPAYS FROM WALLET BALANCE ONLY
            </span>
            <span className="text-slate-400">|</span>
            <span>
              Live BTC Price:{" "}
              <strong className="text-white">
                ${(snapshot?.btcPriceUsd ?? 0).toLocaleString()}
              </strong>
            </span>
            <span className="text-slate-400">|</span>
            <span>
              Single Worker Lock:{" "}
              <strong className="text-emerald-300">ACTIVE (1 / DB)</strong>
            </span>
          </div>
          {lastTxHash && (
            <a
              href={`https://explorer.test.mezo.org/tx/${lastTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-300 hover:underline font-mono"
            >
              Latest On-Chain Tx: {shortenHex(lastTxHash, 6)}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {bannerMessage && (
        <div className="rounded-2xl bg-purple-950/90 text-purple-100 border border-purple-500/40 px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            <span>{bannerMessage}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastTxHash && (
              <a
                href={`https://explorer.test.mezo.org/tx/${lastTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-300 hover:underline font-mono text-[11px]"
              >
                View Tx {shortenHex(lastTxHash, 5)}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              onClick={() => setBannerMessage("")}
              className="text-[11px] text-purple-300 hover:text-white underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-2xl bg-red-950/90 text-red-100 border border-red-500/40 px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage("")}
            className="text-[11px] text-red-300 hover:text-white underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* PROMINENT CARD #1: Borrow MUSD Using BTC (Mezo Testnet 31611) */}
      <Card className="clay-card border-2 border-[#f97316]/40 bg-white/95 shadow-xl overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-[#fff7ed] via-[#ffedd5] to-[#fef3c7] border-b border-[#f97316]/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-[#f97316] text-white font-black text-[10px] uppercase px-2.5 py-0.5">
                  BORROW MUSD USING BTC · MEZO TESTNET (31611)
                </Badge>
                <Badge className="bg-[#231f20] text-white font-black text-[10px] uppercase px-2.5 py-0.5">
                  110% MCR · LIVE ORACLE ${(snapshot?.btcPriceUsd ?? 0).toLocaleString()}
                </Badge>
                <Badge
                  className={`font-black text-[10px] px-2.5 py-0.5 ${
                    hasActivePosition
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-700 text-white"
                  }`}
                >
                  {hasActivePosition
                    ? `ACTIVE POSITION: ${(snapshot?.collateralBtc ?? 0).toFixed(
                        5
                      )} BTC / ${(snapshot?.debtMusd ?? 0).toLocaleString()} MUSD (HF ${(
                        snapshot?.currentHf ?? 0
                      ).toFixed(2)})`
                    : "NO BORROW POSITION OPENED YET (0 BTC / 0 MUSD)"}
                </Badge>
              </div>
              <CardTitle className="text-lg sm:text-xl font-black text-[#231f20] mt-1.5 flex items-center gap-2">
                <Coins className="h-5 w-5 text-[#f97316]" />
                Borrow MUSD Using BTC Collateral (Mezo Testnet 31611)
              </CardTitle>
              <CardDescription className="text-xs text-[#231f20]/80 font-medium">
                Lock BTC collateral and mint/borrow MUSD against it on Mezo
                Testnet. Once opened, Ironhide (#04) automatically guards your
                position using your Dedicated Guard Reserve Wallet.
              </CardDescription>
            </div>

            {/* Quick Borrow Scenario Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const coll = 0.0005;
                  const safeMusd =
                    liveBtcPrice > 0
                      ? Number(((coll * liveBtcPrice) / (MCR_RATIO * 1.5)).toFixed(2))
                      : 0;
                  setCollateralBtcInput(String(coll));
                  setBorrowMusdInput(String(safeMusd));
                }}
                className="rounded-xl text-[11px] font-bold h-8 bg-white hover:bg-orange-50 border-orange-300 text-[#231f20]"
              >
                0.0005 BTC (Safe 1.50 HF)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const coll = 0.05;
                  const safeMusd =
                    liveBtcPrice > 0
                      ? Number(((coll * liveBtcPrice) / (MCR_RATIO * 1.45)).toFixed(2))
                      : 0;
                  setCollateralBtcInput(String(coll));
                  setBorrowMusdInput(String(safeMusd));
                }}
                className="rounded-xl text-[11px] font-bold h-8 bg-white hover:bg-orange-50 border-orange-300 text-[#231f20]"
              >
                0.05 BTC Standard Trove
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const coll = availableScaleBtc;
                  const safeMusd =
                    liveBtcPrice > 0
                      ? Number(((coll * liveBtcPrice) / (MCR_RATIO * 1.5)).toFixed(2))
                      : 0;
                  setCollateralBtcInput(String(coll));
                  setBorrowMusdInput(String(safeMusd));
                }}
                className="rounded-xl text-[11px] font-bold h-8 bg-white hover:bg-emerald-50 border-emerald-400 text-emerald-900"
              >
                Scale to Wallet/Vault ({availableScaleBtc.toFixed(5)} BTC)
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Inputs Column (7 cols) */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* BTC Collateral Input */}
              <div className="p-4 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase text-[#231f20]">
                      1. BTC Collateral to Lock
                    </label>
                    <span className="text-[11px] font-bold text-orange-700">
                      ≈ ${collateralPreviewUsd.toLocaleString()} USD
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={collateralBtcInput}
                      onChange={(e) => setCollateralBtcInput(e.target.value)}
                      placeholder="0.0005"
                      className="w-full rounded-xl border border-black/20 bg-white px-3 py-2.5 pr-14 text-sm font-mono font-black text-[#231f20]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-orange-600">
                      BTC
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {[0.00005, 0.0005, 0.01, 0.05].map((presetBtc) => (
                    <button
                      key={presetBtc}
                      type="button"
                      onClick={() => {
                        setCollateralBtcInput(String(presetBtc));
                        if (liveBtcPrice > 0) {
                          const suggestedMusd = Number(
                            (
                              (presetBtc * liveBtcPrice) /
                              (MCR_RATIO * 1.45)
                            ).toFixed(2)
                          );
                          setBorrowMusdInput(String(suggestedMusd));
                        }
                      }}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-orange-100 border border-black/10 text-[10px] font-bold text-[#231f20]"
                    >
                      {presetBtc} BTC
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCollateralBtcInput(String(availableScaleBtc));
                      if (liveBtcPrice > 0) {
                        const suggestedMusd = Number(
                          (
                            (availableScaleBtc * liveBtcPrice) /
                            (MCR_RATIO * 1.45)
                          ).toFixed(2)
                        );
                        setBorrowMusdInput(String(suggestedMusd));
                      }
                    }}
                    className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 border border-emerald-400/40 text-[10px] font-black text-emerald-900"
                  >
                    50% Bal ({availableScaleBtc.toFixed(5)})
                  </button>
                </div>
              </div>

              {/* MUSD Amount to Borrow Input */}
              <div className="p-4 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase text-[#231f20]">
                      2. MUSD Amount to Borrow
                    </label>
                    <span className="text-[11px] font-bold text-purple-800">
                      Max: {maxBorrowableMusdAt110Mcr.toLocaleString()} MUSD
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={borrowMusdInput}
                      onChange={(e) => setBorrowMusdInput(e.target.value)}
                      placeholder="25"
                      className="w-full rounded-xl border border-black/20 bg-white px-3 py-2.5 pr-16 text-sm font-mono font-black text-[#231f20]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-purple-700">
                      MUSD
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setBorrowMusdInput(
                        String(
                          Number(
                            (
                              (parsedCollBtc * liveBtcPrice) /
                              (MCR_RATIO * 1.5)
                            ).toFixed(2)
                          )
                        )
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 border border-emerald-400/40 text-[10px] font-black text-emerald-900"
                  >
                    Safe 150% HF ({recommendedSafeBorrowAt150Hf.toLocaleString()})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBorrowMusdInput(
                        String(
                          Number(
                            (
                              (parsedCollBtc * liveBtcPrice) /
                              (MCR_RATIO * Math.max(1.08, triggerHf - 0.03))
                            ).toFixed(2)
                          )
                        )
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-400/40 text-[10px] font-black text-amber-900"
                  >
                    Near Trigger ({(triggerHf - 0.03).toFixed(2)} HF)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBorrowMusdInput(
                        String(
                          Number((maxBorrowableMusdAt110Mcr * 0.95).toFixed(2))
                        )
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-white hover:bg-purple-100 border border-black/10 text-[10px] font-bold text-purple-900"
                  >
                    95% Max MCR
                  </button>
                </div>
              </div>
            </div>

            {/* Live Borrow Telemetry & Execute Column (5 cols) */}
            <div className="lg:col-span-5 p-4 rounded-2xl bg-[#1e1b2e] text-white flex flex-col justify-between space-y-3 border border-white/10">
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    Max Borrow (110% MCR)
                  </div>
                  <div className="text-sm font-black text-amber-300 mt-0.5">
                    {maxBorrowableMusdAt110Mcr.toLocaleString()} MUSD
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    Safe Borrow (150% HF)
                  </div>
                  <div className="text-sm font-black text-emerald-300 mt-0.5">
                    {recommendedSafeBorrowAt150Hf.toLocaleString()} MUSD
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    Live Projected HF
                  </div>
                  <div
                    className={`text-sm font-black mt-0.5 ${
                      projectedBorrowHf <= 0
                        ? "text-slate-400"
                        : projectedBorrowHf < 1.0
                        ? "text-red-400"
                        : projectedBorrowHf < triggerHf
                        ? "text-amber-300"
                        : "text-emerald-400"
                    }`}
                  >
                    {projectedBorrowHf > 0
                      ? `${projectedBorrowHf.toFixed(2)}x`
                      : "—"}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    Liquidation BTC Price
                  </div>
                  <div className="text-sm font-black text-red-300 mt-0.5">
                    ${projectedLiquidationBtcPrice.toLocaleString()}
                  </div>
                </div>
              </div>

              <Button
                type="button"
                disabled={Boolean(busyAction) || parsedCollBtc <= 0 || parsedBorrowMusd <= 0}
                onClick={handleLockBtcAndBorrowMusd}
                className="w-full rounded-xl bg-[#f97316] hover:bg-[#ea580c] text-white font-black text-xs sm:text-sm py-5 shadow-lg"
              >
                <Coins className="h-4 w-4 mr-2" />
                {busyAction === "borrow_musd" ||
                busyAction === "borrow_musd_wallet"
                  ? "Locking BTC & Borrowing MUSD On-Chain (31611)..."
                  : `Lock ${parsedCollBtc} BTC & Borrow ${parsedBorrowMusd.toLocaleString()} MUSD On-Chain (31611)`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PROMINENT CARD #2: How AI Monitors & How Dedicated Guard Reserve Wallet Works */}
      <Card className="clay-card border-2 border-purple-500/30 bg-white/95 shadow-lg overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-[#f5f3ff] via-[#ede9fe] to-[#ecfdf5] border-b border-purple-500/15">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-purple-700 text-white font-black text-[10px] uppercase px-2.5 py-0.5">
                  AI TELEMETRY · IRONHIDE #04
                </Badge>
                <Badge className="bg-emerald-700 text-white font-black text-[10px] uppercase px-2.5 py-0.5">
                  3-WALLET NON-CUSTODIAL ARCHITECTURE
                </Badge>
                {snapshot?.aiModelUsed && (
                  <Badge className="bg-[#231f20] text-amber-300 font-mono font-bold text-[10px] px-2.5 py-0.5">
                    Model: {snapshot.aiModelUsed}
                  </Badge>
                )}
              </div>
              <CardTitle className="text-lg font-black text-[#231f20] mt-1.5 flex items-center gap-2">
                <Bot className="h-5 w-5 text-purple-700" />
                How AI Monitors &amp; How Dedicated Guard Reserve Wallet Works
              </CardTitle>
              <CardDescription className="text-xs text-[#231f20]/75 font-medium">
                Real-time breakdown of how Ironhide (#04) watches finalized Mezo
                Testnet blocks and where your Dedicated Guard Reserve Wallet is
                used during an on-behalf rescue.
              </CardDescription>
            </div>

            <Button
              type="button"
              size="sm"
              disabled={Boolean(busyAction)}
              onClick={() => runGuardAction("poll_and_rescue")}
              className="rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs"
            >
              <Cpu className="h-3.5 w-3.5 mr-1.5" />
              {busyAction === "poll_and_rescue"
                ? "Running AI Monitor & Rescue Check..."
                : "Run Live AI Monitor & Rescue Check"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left Box: How the AI (Ironhide #04) Monitors */}
            <div className="p-4 rounded-2xl bg-[#f8f5f0] border border-purple-500/25 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-purple-950 flex items-center gap-1.5">
                  <Cpu className="h-4 w-4 text-purple-700" />
                  1. How the AI (Ironhide #04) Monitors Your Loan
                </span>
                <Badge className="bg-purple-100 text-purple-900 font-black text-[10px]">
                  Finalized Reads Only
                </Badge>
              </div>

              <ul className="space-y-2 text-xs text-[#231f20]/90 font-medium">
                <li className="flex items-start gap-2">
                  <span className="font-black text-purple-700">①</span>
                  <span>
                    <strong>Polls Finalized Mezo Testnet Blocks:</strong> Reads{" "}
                    <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border">
                      TroveManager (0xE47c…6bb0)
                    </code>{" "}
                    &amp;{" "}
                    <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border">
                      PriceFeed (0x86bC…66)
                    </code>{" "}
                    for borrower{" "}
                    <code className="font-mono text-[11px] font-bold">
                      {shortenHex(
                        snapshot?.monitoredBorrower ||
                          monitoredBorrower ||
                          "0x0000000000000000000000000000000000000000",
                        6
                      )}
                    </code>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-purple-700">②</span>
                  <span>
                    <strong>Computes Liquidation-Basis Health Factor:</strong>{" "}
                    <code className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border font-bold">
                      HF = (Collateral_BTC × Price_BTC) / (Debt_MUSD × 1.10)
                    </code>{" "}
                    &rarr; Currently{" "}
                    <strong>
                      {hasActivePosition
                        ? `HF ${(snapshot?.currentHf ?? 0).toFixed(2)}`
                        : "0 (No Position Yet)"}
                    </strong>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-black text-purple-700">③</span>
                  <span>
                    <strong>2-Observation Confirmation &amp; Gemini Sizing:</strong>{" "}
                    Requires <strong>2 consecutive finalized observations</strong>{" "}
                    with{" "}
                    <code className="font-mono text-[11px] font-bold">
                      1.00 &lt; HF &lt; Trigger ({triggerHf.toFixed(2)})
                    </code>{" "}
                    ({snapshot?.consecutiveBreaches ?? 0}/2 recorded), then invokes{" "}
                    <strong>Gemini AI</strong> (
                    <code className="font-mono text-[11px]">
                      gemini-3.8-flash / gemini-3.5-flash-lite
                    </code>
                    ) to size the exact Repay-First rescue to reach Target HF{" "}
                    <strong>{targetHf.toFixed(2)}</strong>.
                  </span>
                </li>
              </ul>

              {/* Live AI Diagnosis Output Box */}
              <div className="p-3 rounded-xl bg-[#1e1b2e] text-white space-y-1 border border-purple-400/30">
                <div className="flex items-center justify-between text-[10px] font-black uppercase text-purple-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    Live Ironhide #04 AI Monitor Diagnosis
                  </span>
                  <span>
                    {snapshot?.aiModelUsed || "gemini-3.5-flash-lite"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-200 font-medium leading-relaxed">
                  {snapshot?.aiMonitorAnalysis ||
                    (hasActivePosition
                      ? `Monitoring borrower ${shortenHex(
                          snapshot?.monitoredBorrower || "",
                          6
                        )} with ${(snapshot?.collateralBtc ?? 0).toFixed(
                          5
                        )} BTC collateral and ${(
                          snapshot?.debtMusd ?? 0
                        ).toLocaleString()} MUSD debt (HF ${(
                          snapshot?.currentHf ?? 0
                        ).toFixed(2)} vs Trigger ${triggerHf.toFixed(
                          2
                        )}). Dedicated Reserve Wallet (${shortenHex(
                          snapshot?.reserveWallet || "",
                          6
                        )}) holds ${(
                          snapshot?.reserveSupplyableBtc ?? 0
                        ).toFixed(6)} supplyable BTC and ${(
                          snapshot?.reserveMusdBalance ?? 0
                        ).toLocaleString()} MUSD rescue capacity.`
                      : "No active MUSD borrow position opened yet (0 BTC collateral, 0 MUSD debt). Use the 'Borrow MUSD Using BTC' card above to lock BTC and borrow MUSD on Mezo Testnet (31611).")}
                </p>
              </div>
            </div>

            {/* Right Box: Where Dedicated Guard Reserve Wallet Is Used (3-Wallet Flow) */}
            <div className="p-4 rounded-2xl bg-[#f8f5f0] border border-emerald-600/25 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-emerald-950 flex items-center gap-1.5">
                    <Wallet className="h-4 w-4 text-emerald-700" />
                    2. Where Dedicated Guard Reserve Wallet Is Used
                  </span>
                  <Badge className="bg-emerald-100 text-emerald-900 font-black text-[10px]">
                    1 Live Agent / Wallet
                  </Badge>
                </div>

                {/* 3-Step Visual Wallet Pipeline */}
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white border border-black/10 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-500">
                        Wallet #1 · Connected Owner Wallet
                      </div>
                      <div className="font-mono font-bold text-[#231f20]">
                        {connectedOwnerAddress
                          ? shortenHex(connectedOwnerAddress, 8)
                          : "Browser Wallet (Owner Key)"}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold bg-slate-50"
                    >
                      Funds Test BTC &amp; Can Revoke / Recover
                    </Badge>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-50/90 border-2 border-emerald-600/30 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase text-emerald-900">
                        Wallet #2 · Dedicated Guard Reserve Wallet (Signs Rescues)
                      </div>
                      <div className="font-mono font-black text-emerald-950">
                        {snapshot?.reserveWallet
                          ? shortenHex(snapshot.reserveWallet, 8)
                          : "Loading Reserve EOA..."}
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-bold text-emerald-900">
                      <div>
                        {btcReserveSharePct}% Gas:{" "}
                        {(snapshot?.reserveGasLockedBtc ?? 0).toFixed(6)} BTC
                      </div>
                      <div>
                        {100 - btcReserveSharePct}% Rescue:{" "}
                        {(snapshot?.reserveMusdBalance ?? 0).toLocaleString()}{" "}
                        MUSD + {(snapshot?.reserveSupplyableBtc ?? 0).toFixed(6)}{" "}
                        BTC
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-black/10 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase text-purple-900">
                        Wallet #3 · Monitored Borrower Position (Never Signed For)
                      </div>
                      <div className="font-mono font-bold text-[#231f20]">
                        {shortenHex(
                          snapshot?.monitoredBorrower ||
                            monitoredBorrower ||
                            connectedOwnerAddress ||
                            "",
                          8
                        )}
                      </div>
                    </div>
                    <Badge className="bg-purple-100 text-purple-900 font-bold text-[10px]">
                      Receives repayMUSD / addColl On-Behalf
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-950 text-emerald-100 text-[11px] font-medium leading-relaxed">
                <strong className="text-emerald-300">
                  Why a Separate Reserve Wallet?
                </strong>{" "}
                Your borrower wallet keeps its own keys. When HF drops below{" "}
                <strong>{triggerHf.toFixed(2)}</strong> for 2 finalized reads,{" "}
                <strong>Wallet #2 (Dedicated Guard Reserve)</strong> resets any
                residual MUSD allowance to <code>0</code>, approves the exact
                repayment amount, and pays down{" "}
                <strong>Wallet #3&apos;s</strong> debt or tops up its BTC
                collateral on Mezo Testnet (31611).
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive 6-Step Liquidation Boundary & Health Factor Visualizer */}
      <Card className="clay-card border-2 border-[#231f20]/15 bg-white/95 shadow-lg overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-[#f8f5f0] to-[#f1ece1] border-b border-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-[#231f20] text-white font-black text-[10px] px-2.5 py-0.5">
                  STEP {activeStepNumber} / 6
                </Badge>
                <Badge
                  className={`font-black text-[10px] px-2.5 py-0.5 ${
                    !hasActivePosition && previewStepIndex === null
                      ? "bg-slate-600 text-white"
                      : displayedHf <= 1.0
                      ? "bg-red-600 text-white"
                      : displayedHf < triggerHf
                      ? "bg-amber-500 text-white"
                      : "bg-emerald-600 text-white"
                  }`}
                >
                  {!hasActivePosition && previewStepIndex === null
                    ? "HF 0.00 · NO POSITION YET"
                    : `HF ${displayedHf.toFixed(2)} · ${
                        displayedHf <= 1.0
                          ? "LIQUIDATABLE (<= 1.00)"
                          : displayedHf < triggerHf
                          ? "BELOW TRIGGER"
                          : "ABOVE TRIGGER"
                      }`}
                </Badge>
                <span className="text-xs font-bold text-muted-foreground">
                  Observations Below Trigger:{" "}
                  <strong className="text-[#231f20]">
                    {snapshot?.consecutiveBreaches ?? 0} / 2
                  </strong>
                </span>
              </div>
              <CardTitle className="text-lg font-black mt-1.5 text-[#231f20]">
                {activeStepWalkthrough.title}
              </CardTitle>
              <CardDescription className="text-xs text-[#231f20]/75 font-medium mt-0.5">
                {activeStepWalkthrough.detail}
              </CardDescription>
            </div>

            {/* Live Action Triggers for the 6-Step Journey */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busyAction)}
                onClick={() => runGuardAction("simulate_drop")}
                className="rounded-xl border-amber-500/50 bg-amber-50 hover:bg-amber-100 text-amber-900 font-black text-xs"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                1. Cross Trigger Line (Obs #1/2)
              </Button>

              <Button
                size="sm"
                disabled={Boolean(busyAction)}
                onClick={() => runGuardAction("poll_and_rescue")}
                className="rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-black text-xs shadow-md"
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                {busyAction === "poll_and_rescue"
                  ? "Executing On-Behalf Rescue..."
                  : "2. Confirm Obs #2/2 & Execute Rescue (31611)"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busyAction)}
                onClick={() => runGuardAction("force_liquidatable_test")}
                className="rounded-xl border-red-400/50 bg-red-50 hover:bg-red-100 text-red-900 font-bold text-xs"
              >
                <ShieldAlert className="h-3.5 w-3.5 mr-1.5 text-red-600" />
                Test HF &le; 1.00 Refusal
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Horizontal Health Factor Scale Bar */}
          <div className="relative pt-8 pb-6 px-4 rounded-2xl bg-[#181520] text-white border border-white/10">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">
              <span className="text-red-400">
                LIQUIDATION BOUNDARY (1.00)
              </span>
              <span className="text-amber-300">
                WORKING RANGE (1.00 &lt; HF &lt; TRIGGER {triggerHf.toFixed(2)})
              </span>
              <span className="text-emerald-300">
                TARGET HEALTH FACTOR ({targetHf.toFixed(2)})
              </span>
            </div>

            {/* Track */}
            <div className="relative h-5 w-full rounded-full bg-slate-800 overflow-hidden border border-white/15">
              {/* Liquidatable Danger Zone (<= 1.00) */}
              <div
                className="absolute inset-y-0 left-0 bg-red-600/80"
                style={{ width: `${liqBoundaryPct}%` }}
              />
              {/* Guard Rescue Working Zone (1.00 < HF < Trigger) */}
              <div
                className="absolute inset-y-0 bg-amber-500/75"
                style={{
                  left: `${liqBoundaryPct}%`,
                  width: `${Math.max(0, triggerLinePct - liqBoundaryPct)}%`,
                }}
              />
              {/* Healthy Zone (>= Trigger) */}
              <div
                className="absolute inset-y-0 bg-emerald-500/70"
                style={{
                  left: `${triggerLinePct}%`,
                  width: `${Math.max(0, 100 - triggerLinePct)}%`,
                }}
              />
            </div>

            {/* Vertical Markers */}
            <div className="relative h-10 mt-1">
              {/* Liquidation Marker (1.00) */}
              <div
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${liqBoundaryPct}%` }}
              >
                <div className="w-0.5 h-3 bg-red-400" />
                <span className="text-[10px] font-black text-red-400 whitespace-nowrap">
                  LIQ 1.00
                </span>
              </div>

              {/* Trigger Marker */}
              <div
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${triggerLinePct}%` }}
              >
                <div className="w-0.5 h-3 bg-amber-300" />
                <span className="text-[10px] font-black text-amber-300 whitespace-nowrap">
                  TRIGGER {triggerHf.toFixed(2)}
                </span>
              </div>

              {/* Target Marker */}
              <div
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${targetLinePct}%` }}
              >
                <div className="w-0.5 h-3 bg-emerald-300" />
                <span className="text-[10px] font-black text-emerald-300 whitespace-nowrap">
                  TARGET {targetHf.toFixed(2)}
                </span>
              </div>

              {/* Current Live HF Pill */}
              <div
                className="absolute -top-9 -translate-x-1/2 transition-all duration-500"
                style={{ left: `${currentHfPct}%` }}
              >
                <div className="px-2.5 py-0.5 rounded-full bg-white text-[#181520] font-black text-[11px] shadow-lg border-2 border-[#f97316] whitespace-nowrap">
                  {!hasActivePosition && previewStepIndex === null
                    ? "NO POSITION (HF 0)"
                    : `HF ${displayedHf.toFixed(2)}`}
                </div>
              </div>
            </div>
          </div>

          {/* 6-Step Selector Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {STEP_WALKTHROUGH.map((item) => {
              const isActive = activeStepNumber === item.step;
              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() =>
                    setPreviewStepIndex(
                      previewStepIndex === item.step ? null : item.step
                    )
                  }
                  className={`text-left p-2.5 rounded-2xl border transition-all ${
                    isActive
                      ? "bg-[#231f20] text-white border-[#231f20] shadow-md"
                      : "bg-[#f8f5f0] hover:bg-[#efe9de] text-[#231f20] border-black/10"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-black uppercase opacity-80">
                    <span>{item.label}</span>
                    <span>HF {item.sampleHf.toFixed(2)}</span>
                  </div>
                  <div className="text-xs font-extrabold mt-1 line-clamp-2">
                    {item.title}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Main 2-Column Grid: Guard Configuration + Reserve & Sizing Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Guard Arrangement & Settings */}
        <Card className="lg:col-span-7 clay-card border-2 border-[#231f20]/15 bg-white/95">
          <CardHeader className="pb-3 border-b border-black/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Badge className="bg-purple-100 text-purple-900 font-black text-[10px] uppercase">
                  How the Marketplace Guard is Arranged
                </Badge>
                <CardTitle className="text-lg font-black text-[#231f20] mt-1">
                  Configure Monitored Position &amp; Rescue Reserve
                </CardTitle>
                <CardDescription className="text-xs font-medium text-[#231f20]/70">
                  The monitored borrow stays on the account you name. The guard
                  never signs for that account and never proves ownership of it.
                </CardDescription>
              </div>

              {/* Preset Buttons */}
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTriggerHf(1.15);
                    setTargetHf(1.55);
                    setBtcReserveSharePct(20);
                    runGuardAction("configure", {
                      triggerHf: 1.15,
                      targetHf: 1.55,
                      btcReserveSharePct: 20,
                    });
                  }}
                  className="rounded-xl text-[11px] font-bold h-8"
                >
                  Spec Example (1.15 / 1.55)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTriggerHf(1.2);
                    setTargetHf(1.5);
                    setBtcReserveSharePct(20);
                    runGuardAction("configure", {
                      triggerHf: 1.2,
                      targetHf: 1.5,
                      btcReserveSharePct: 20,
                    });
                  }}
                  className="rounded-xl text-[11px] font-bold h-8"
                >
                  Default (1.20 / 1.50)
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-5 space-y-5">
            {/* Monitored Borrower Account Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase text-[#231f20]">
                  Monitored Borrower Account (Mezo Testnet 31611)
                </label>
                <div className="flex items-center gap-1.5">
                  {connectedOwnerAddress && (
                    <button
                      type="button"
                      onClick={() =>
                        setMonitoredBorrower(connectedOwnerAddress)
                      }
                      className="text-[10px] font-bold text-purple-700 hover:underline"
                    >
                      Use Connected Wallet
                    </button>
                  )}
                  <Badge
                    variant="outline"
                    className="text-[10px] font-bold border-emerald-600/40 text-emerald-800 bg-emerald-50"
                  >
                    Non-Custodial · Guard Never Signs For This Account
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={monitoredBorrower}
                  onChange={(e) => setMonitoredBorrower(e.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-xl border border-black/15 bg-[#f8f5f0] px-3 py-2 text-xs font-mono font-bold text-[#231f20]"
                />
                {monitoredBorrower && (
                  <a
                    href={`https://explorer.test.mezo.org/address/${monitoredBorrower}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center px-3 rounded-xl border border-black/15 bg-white hover:bg-slate-50 text-xs font-bold shrink-0"
                    title="View on Mezo Testnet Explorer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Settings Table / Sliders matching User Spec */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Setting 1: Trigger Health Factor */}
              <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#231f20]">
                    Trigger Health Factor
                  </span>
                  <Badge className="bg-amber-500 text-white font-black text-xs">
                    {triggerHf.toFixed(2)}
                  </Badge>
                </div>
                <Slider
                  value={[triggerHf]}
                  min={1.05}
                  max={1.8}
                  step={0.05}
                  onValueChange={(v) => {
                    const nextTrig = Number(v[0].toFixed(2));
                    setTriggerHf(nextTrig);
                    if (targetHf < nextTrig + 0.05) {
                      setTargetHf(Number((nextTrig + 0.05).toFixed(2)));
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground font-medium">
                  When a rescue is considered. Default <strong>1.20</strong>{" "}
                  (example <strong>1.15</strong>). Working range:{" "}
                  <code>1.0 &lt; HF &lt; trigger</code>.
                </p>
              </div>

              {/* Setting 2: Target Health Factor */}
              <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#231f20]">
                    Target Health Factor
                  </span>
                  <Badge className="bg-emerald-600 text-white font-black text-xs">
                    {targetHf.toFixed(2)}
                  </Badge>
                </div>
                <Slider
                  value={[targetHf]}
                  min={Number((triggerHf + 0.05).toFixed(2))}
                  max={2.2}
                  step={0.05}
                  onValueChange={(v) =>
                    setTargetHf(
                      Math.max(
                        Number((triggerHf + 0.05).toFixed(2)),
                        Number(v[0].toFixed(2))
                      )
                    )
                  }
                />
                <p className="text-[11px] text-muted-foreground font-medium">
                  What a rescue aims to restore. Default <strong>1.50</strong>{" "}
                  (example <strong>1.55</strong>), clearing trigger by &ge;{" "}
                  <strong>0.05</strong>.
                </p>
              </div>

              {/* Setting 3: Reserve Share Kept as BTC */}
              <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#231f20]">
                    Reserve Share Kept as BTC
                  </span>
                  <Badge className="bg-[#231f20] text-white font-black text-xs">
                    {btcReserveSharePct}% BTC Gas
                  </Badge>
                </div>
                <Slider
                  value={[btcReserveSharePct]}
                  min={10}
                  max={50}
                  step={5}
                  onValueChange={(v) => setBtcReserveSharePct(v[0])}
                />
                <p className="text-[11px] text-muted-foreground font-medium">
                  Gas headroom left unswapped (<strong>10–50%</strong>, default{" "}
                  <strong>20%</strong>). Remaining{" "}
                  <strong>{100 - btcReserveSharePct}%</strong> backs MUSD repay
                  &amp; collateral supply.
                </p>
              </div>

              {/* Setting 4: Rescues to Reserve Gas For */}
              <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#231f20]">
                    Rescues to Reserve Gas For
                  </span>
                  <Badge className="bg-purple-700 text-white font-black text-xs">
                    {rescuesGasCount} Rescues
                  </Badge>
                </div>
                <Slider
                  value={[rescuesGasCount]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={(v) => setRescuesGasCount(v[0])}
                />
                <p className="text-[11px] text-muted-foreground font-medium">
                  How many repayments that kept BTC should cover (currently
                  covers ~<strong>{snapshot?.rescuesCoveredByGas ?? 0}</strong>{" "}
                  rescues on Mezo Testnet).
                </p>
              </div>
            </div>

            {/* Gift & Finality Notice + Save Button */}
            <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300/70 text-amber-950 text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5 max-w-xl">
                <div className="font-black uppercase text-[11px] flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-amber-700" />
                  Repayments Are Gifts, and They Are Final
                </div>
                <p className="text-[11px] font-medium leading-relaxed">
                  The reserve pays down the monitored account&apos;s debt via{" "}
                  <code>repayBorrowBehalf</code>; it does not buy a claim on
                  that account and cannot be undone. Debt reduction is not
                  investment income.
                </p>
              </div>

              <Button
                disabled={Boolean(busyAction)}
                onClick={() => runGuardAction("configure")}
                className="rounded-xl bg-[#231f20] hover:bg-[#3a3436] text-white font-black text-xs px-4"
              >
                {busyAction === "configure"
                  ? "Arming Guard..."
                  : "Hire / Save Guard Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Column (5 cols): Dedicated Reserve Wallet & Repay-First Sizing Engine */}
        <Card className="lg:col-span-5 clay-card border-2 border-[#231f20]/15 bg-white/95">
          <CardHeader className="pb-3 border-b border-black/5">
            <div className="flex items-center justify-between gap-2">
              <Badge className="w-fit bg-emerald-100 text-emerald-900 font-black text-[10px] uppercase">
                Dedicated Guard Reserve Wallet
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] font-bold border-purple-500/40 text-purple-800 bg-purple-50"
              >
                1 Live Agent / Wallet Enforced
              </Badge>
            </div>
            <CardTitle className="text-lg font-black text-[#231f20] mt-1">
              Dedicated Reserve Wallet &amp; Sizing
            </CardTitle>
            <CardDescription className="text-xs font-medium text-[#231f20]/70">
              Separate dedicated account holding your MUSD &amp; BTC rescue
              funds (distinct from your Monitored Borrower &amp; DCA Operator)
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-3.5">
            {/* Dedicated Guard Reserve Wallet Address & 3-Wallet Separation Proof */}
            <div className="p-3 rounded-2xl bg-[#f8f5f0] border-2 border-emerald-600/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-emerald-900 flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5 text-emerald-700" />
                  Dedicated Guard Reserve Address (31611)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (snapshot?.reserveWallet) {
                        navigator.clipboard.writeText(snapshot.reserveWallet);
                        setCopiedReserve(true);
                        setTimeout(() => setCopiedReserve(false), 1800);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-black/15 text-[10px] font-bold hover:bg-slate-100"
                  >
                    {copiedReserve ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </button>
                  <a
                    href={`https://explorer.test.mezo.org/address/${
                      snapshot?.reserveWallet || ""
                    }`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-black/15 text-[10px] font-bold text-purple-700 hover:underline"
                  >
                    Explorer
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>

              <div className="font-mono text-[11px] font-black text-[#231f20] break-all bg-white px-2.5 py-1.5 rounded-xl border border-black/10">
                {snapshot?.reserveWallet || "Loading dedicated reserve EOA..."}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 border-t border-black/10">
                <div>
                  <span className="text-muted-foreground font-bold block">
                    DCA Agent Operator (Separate):
                  </span>
                  <span className="font-mono font-bold text-slate-700">
                    {snapshot?.dcaOperatorWallet
                      ? shortenHex(snapshot.dcaOperatorWallet, 6)
                      : "Loading..."}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground font-bold block">
                    Your Connected Owner Key:
                  </span>
                  <span className="font-mono font-bold text-emerald-800">
                    {connectedOwnerAddress
                      ? shortenHex(connectedOwnerAddress, 6)
                      : "Connect Wallet above"}
                  </span>
                </div>
              </div>

              {/* Fund Dedicated Reserve Wallet with Test BTC */}
              <div className="pt-2 border-t border-black/10 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-black text-[#231f20]">
                    Fund Dedicated Reserve (Test BTC)
                  </span>
                  <span className="font-bold text-emerald-800">
                    {btcReserveSharePct}% Gas / {100 - btcReserveSharePct}%
                    Rescue
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fundAmountBtc}
                    onChange={(e) => setFundAmountBtc(e.target.value)}
                    placeholder="0.00001"
                    className="w-28 rounded-xl border border-black/15 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-[#231f20]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={Boolean(busyAction)}
                    onClick={handleFundReserveFromConnectedWallet}
                    className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-8"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {busyAction === "fund_reserve" ||
                    busyAction === "fund_wallet"
                      ? "Funding Reserve..."
                      : isConnected
                      ? "Fund Reserve Wallet (BTC)"
                      : "Top Up Reserve (Testnet BTC)"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Monitored Loan Telemetry */}
            <div className="p-3.5 rounded-2xl bg-[#1e1b2e] text-white space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                <span>MONITORED BORROW POSITION</span>
                <Badge className="bg-white/10 text-white text-[10px]">
                  {!hasActivePosition
                    ? "No Position Yet (0 / 0)"
                    : snapshot?.positionSource === "MEZO_TROVE_MANAGER_LIVE"
                    ? "Live TroveManager"
                    : "Mezo Testnet Position"}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-white/5">
                  <div className="text-[10px] text-slate-400 font-bold">
                    Collateral
                  </div>
                  <div className="text-sm font-black text-amber-300">
                    {(snapshot?.collateralBtc ?? 0).toFixed(5)} BTC
                  </div>
                  <div className="text-[10px] text-slate-400">
                    ${(snapshot?.collateralUsd ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-white/5">
                  <div className="text-[10px] text-slate-400 font-bold">
                    MUSD Debt
                  </div>
                  <div className="text-sm font-black text-purple-300">
                    {(snapshot?.debtMusd ?? 0).toLocaleString()} MUSD
                  </div>
                  <div className="text-[10px] text-slate-400">
                    MCR 110% Basis
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-white/5">
                  <div className="text-[10px] text-slate-400 font-bold">
                    Liq. BTC Price
                  </div>
                  <div className="text-sm font-black text-red-300">
                    ${(snapshot?.liquidationPriceUsd ?? 0).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400">HF = 1.00</div>
                </div>
              </div>
            </div>

            {/* Reserve Wallet Partition Breakdown */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-2xl bg-[#f8f5f0] border border-black/10">
                <div className="text-[10px] font-black uppercase text-muted-foreground">
                  BTC Kept for Gas ({btcReserveSharePct}%)
                </div>
                <div className="text-sm font-black text-[#231f20] mt-0.5">
                  {(snapshot?.reserveGasLockedBtc ?? 0).toFixed(6)} BTC
                </div>
                <div className="text-[10px] text-emerald-700 font-bold">
                  Covers ~{snapshot?.rescuesCoveredByGas ?? 0} rescues
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#f8f5f0] border border-black/10">
                <div className="text-[10px] font-black uppercase text-muted-foreground">
                  Rescue Budget ({100 - btcReserveSharePct}%)
                </div>
                <div className="text-sm font-black text-purple-800 mt-0.5">
                  {(snapshot?.reserveMusdBalance ?? 0).toLocaleString()} MUSD
                </div>
                <div className="text-[10px] text-muted-foreground font-bold">
                  + {(snapshot?.reserveSupplyableBtc ?? 0).toFixed(6)} BTC
                  supplyable
                </div>
              </div>
            </div>

            {/* Live Sizing Calculation Box */}
            <div className="p-3.5 rounded-2xl border-2 border-purple-500/30 bg-purple-50/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-purple-950">
                  Live Rescue Sizing Decision
                </span>
                <Badge className="bg-purple-700 text-white font-black text-[10px]">
                  {snapshot?.sizingPreview.preferredAction || "NONE_HEALTHY"}
                </Badge>
              </div>

              <div className="space-y-1 text-xs text-[#231f20]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium">
                    1. Feasible MUSD Debt Repay:
                  </span>
                  <span className="font-black">
                    {(
                      snapshot?.sizingPreview.feasibleRepayMusd ?? 0
                    ).toLocaleString()}{" "}
                    MUSD
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium">
                    2. Fallback Collateral Top-Up:
                  </span>
                  <span className="font-black">
                    {(
                      snapshot?.sizingPreview.feasibleCollateralSupplyBtc ?? 0
                    ).toFixed(6)}{" "}
                    BTC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium">
                    3. Exact ERC-20 Approval Mode:
                  </span>
                  <span className="font-black text-emerald-800">
                    Reset Residual &rarr; Exact Amount
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-purple-200">
                  <span className="font-bold">Projected HF After Rescue:</span>
                  <span className="font-black text-emerald-700">
                    {(
                      snapshot?.sizingPreview.projectedHfAfterRescue ?? 0
                    ).toFixed(2)}{" "}
                    (Target {targetHf.toFixed(2)})
                  </span>
                </div>
              </div>

              {snapshot?.sizingPreview.refusalReason && (
                <div className="p-2 rounded-xl bg-red-100 border border-red-300 text-red-900 text-[11px] font-bold">
                  {snapshot.sizingPreview.refusalReason}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Available Actions Matrix (4 Actions from Spec) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="clay-card border border-black/10 bg-white/95">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge className="bg-emerald-600 text-white font-black text-[10px]">
                PRIMARY · PRIORITY #1
              </Badge>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <CardTitle className="text-sm font-black mt-1">
              Repay Debt (repayBorrowBehalf)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Uses allowed debt token (<strong>MUSD</strong>) already in the
              reserve wallet. Native BTC debt repayment uses a separate payable
              path.
            </p>
            <p className="text-[11px] font-bold text-[#231f20]">
              Exact ERC-20 approval only (resets residual allowance to 0 first;
              never uses MaxUint256).
            </p>
          </CardContent>
        </Card>

        <Card className="clay-card border border-black/10 bg-white/95">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge className="bg-purple-600 text-white font-black text-[10px]">
                FALLBACK · PRIORITY #2
              </Badge>
              <ShieldCheck className="h-4 w-4 text-purple-600" />
            </div>
            <CardTitle className="text-sm font-black mt-1">
              Supply Collateral (BTC / tBTC)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Supplies permitted collateral held in the reserve wallet into an
              eligible, already-entered collateral market within session limits.
            </p>
            <p className="text-[11px] font-bold text-[#231f20]">
              Strictly preserves the {btcReserveSharePct}% native BTC gas
              headroom.
            </p>
          </CardContent>
        </Card>

        <Card className="clay-card border border-black/10 bg-white/95">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge className="bg-amber-600 text-white font-black text-[10px]">
                INCENTIVES
              </Badge>
              <Sparkles className="h-4 w-4 text-amber-600" />
            </div>
            <CardTitle className="text-sm font-black mt-1">
              Claim Rewards (mats / MEZO)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Executes configured protocol reward-claim paths (such as mats or
              MEZO incentives), subject to eligibility, pauses, and claim
              limits.
            </p>
          </CardContent>
        </Card>

        <Card className="clay-card border border-black/10 bg-white/95">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge className="bg-blue-600 text-white font-black text-[10px]">
                TWO SUBMISSIONS
              </Badge>
              <ArrowRight className="h-4 w-4 text-blue-600" />
            </div>
            <CardTitle className="text-sm font-black mt-1">
              Claim Then Repay
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Two sequential submissions when the claimed reward token matches
              the debt token (<strong>MUSD</strong>). No cross-token swap is
              performed.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Three Explicit Limits & Owner Wallet Recovery */}
      <Card className="clay-card border-2 border-[#231f20]/15 bg-white/95">
        <CardHeader className="pb-3 border-b border-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge className="bg-red-100 text-red-900 font-black text-[10px] uppercase">
                Security Boundaries &amp; Session Template
              </Badge>
              <CardTitle className="text-lg font-black text-[#231f20] mt-1">
                Three Architectural Limits &amp; Instant Owner Reserve Recovery
              </CardTitle>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busyAction)}
                onClick={() => runGuardAction("retire")}
                className="rounded-xl text-xs font-bold border-black/20"
              >
                Retire Guard
              </Button>
              <Button
                size="sm"
                disabled={Boolean(busyAction)}
                onClick={() => {
                  runGuardAction("recover");
                  if (onRecoverWithdrawClick) {
                    onRecoverWithdrawClick();
                  }
                }}
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs"
              >
                <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                Owner Revoke &amp; Recover Reserve
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-1">
            <div className="font-black text-[#231f20] flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-purple-700" />
              1. One Worker Per Database
            </div>
            <p className="text-muted-foreground leading-relaxed">
              A second lending worker can race the rescue decision, so this
              deployment runs exactly one singleton worker (
              <code>withLendingGuardWorkerLock</code> + Neon{" "}
              <code>singleton-mezo-guard</code> lock).
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-1">
            <div className="font-black text-[#231f20] flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-amber-600" />
              2. The Guard Needs Its Own Account
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Uses a separate dedicated reserve account (
              <code>
                {snapshot?.reserveWallet
                  ? shortenHex(snapshot.reserveWallet, 6)
                  : "Dedicated Reserve EOA"}
              </code>
              ) rather than signing from your monitored borrower wallet (one
              live agent per wallet constraint).
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-1">
            <div className="font-black text-[#231f20] flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4 text-emerald-700" />
              3. Session Caps &amp; Owner Recovery
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Hard stops: Daily caps (
              <strong>
                {(snapshot?.dailyMusdCap ?? 0).toLocaleString()} MUSD /{" "}
                {snapshot?.dailyBtcCap ?? 0} BTC
              </strong>
              ), call allowlist, 7-day expiry, and owner-signed revoke. Your
              reserve is recoverable with your owner key at any time.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mezo Testnet (31611) Official Contract Directory & Rescue Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Official Mezo Testnet Lending Contracts */}
        <Card className="lg:col-span-5 clay-card border border-black/10 bg-white/95">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase text-[#231f20]">
              Mezo Testnet (31611) Lending Contracts
            </CardTitle>
            <CardDescription className="text-xs">
              Verified protocol &amp; vault addresses used by Mezo Guard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {[
              {
                label: "MUSD Debt Token (ERC-20)",
                addr:
                  snapshot?.contracts.musdToken ||
                  "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
              },
              {
                label: "TroveManager (Health & ICR Reads)",
                addr:
                  snapshot?.contracts.troveManager ||
                  "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
              },
              {
                label: "BorrowerOperations (Borrow / Repay / Supply)",
                addr:
                  snapshot?.contracts.borrowerOperations ||
                  "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
              },
              {
                label: "PriceFeed Oracle (BTC/USD)",
                addr:
                  snapshot?.contracts.priceFeed ||
                  "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
              },
              {
                label: "PolicyVault (Guardrail & Recovery)",
                addr:
                  snapshot?.contracts.policyVault ||
                  "0xb3A7ab7be5116737b05B7682aCaC62e7D54B1477",
              },
            ].map((c) => (
              <div
                key={c.label}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#f8f5f0] border border-black/5"
              >
                <span className="font-bold text-[#231f20]">{c.label}</span>
                <a
                  href={`https://explorer.test.mezo.org/address/${c.addr}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-bold text-purple-700 hover:underline inline-flex items-center gap-1"
                >
                  {shortenHex(c.addr, 6)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Live Finalized Observations & On-Behalf Rescue Log */}
        <Card className="lg:col-span-7 clay-card border border-black/10 bg-white/95">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase text-[#231f20]">
              Finalized Observation &amp; Rescue Audit Log (Neon DB)
            </CardTitle>
            <CardDescription className="text-xs">
              Every MUSD borrow, polling observation, 2-step trigger
              verification, exact approval, and on-behalf repayment or refusal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {(snapshot?.logs || []).length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                No observations recorded yet. Borrow MUSD using BTC above or
                click &quot;Run Live AI Monitor &amp; Rescue Check&quot;.
              </div>
            ) : (
              snapshot?.logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-1 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`text-[10px] font-black ${
                          log.actionType === "BORROW_MUSD"
                            ? "bg-[#f97316] text-white"
                            : log.actionType === "REPAY_DEBT" ||
                              log.actionType === "SUPPLY_COLLATERAL"
                            ? "bg-emerald-600 text-white"
                            : log.actionType === "REFUSAL"
                            ? "bg-red-600 text-white"
                            : "bg-[#231f20] text-white"
                        }`}
                      >
                        STEP {log.stepNumber}/6 · {log.actionType}
                      </Badge>
                      <span className="font-bold text-[#231f20]">
                        HF {log.observedHf.toFixed(2)} &rarr;{" "}
                        {log.restoredHf.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                      {log.txHash && (
                        <a
                          href={`https://explorer.test.mezo.org/tx/${log.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-purple-700 font-bold hover:underline inline-flex items-center gap-1"
                        >
                          {shortenHex(log.txHash, 5)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <span>{log.createdAt}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#231f20]/80 font-medium">
                    {log.summary}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
