"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  TrendingDown,
  Wallet,
  Zap,
} from "lucide-react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useSignTypedData,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
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
  BORROWER_OPERATIONS_SIGNATURES_ABI,
  BORROWER_SIGNATURES_EIP712_DOMAIN,
  BORROWER_SIGNATURES_EIP712_TYPES,
  DEFAULT_CONTRACT_ADDRESSES,
  MEZO_TESTNET_LENDING_ADDRESSES,
  MUSD_ERC20_ABI,
  POLICY_VAULT_ABI,
  PRICE_FEED_ABI,
  TROVE_MANAGER_ABI,
  computeMezoTroveHints,
  extractEvmRevertReason,
  mezoTestnet,
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
  const { address: connectedOwnerAddress, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { data: connectedWalletBalance, refetch: refetchWalletBalance } =
    useBalance({
      address: connectedOwnerAddress,
      chainId: mezoTestnet.id,
    });
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();

  // Direct on-chain Mezo Testnet reads for connected wallet & protocol parameters
  const { data: walletMusdBalWei, refetch: refetchMusdBalance } =
    useReadContract({
      address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
      abi: MUSD_ERC20_ABI,
      functionName: "balanceOf",
      args: connectedOwnerAddress ? [connectedOwnerAddress] : undefined,
      chainId: mezoTestnet.id,
      query: { enabled: Boolean(connectedOwnerAddress) },
    });

  const { data: onChainTroveStatusWei, refetch: refetchTroveStatus } =
    useReadContract({
      address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
      abi: TROVE_MANAGER_ABI,
      functionName: "getTroveStatus",
      args: connectedOwnerAddress ? [connectedOwnerAddress] : undefined,
      chainId: mezoTestnet.id,
      query: { enabled: Boolean(connectedOwnerAddress) },
    });

  const { data: onChainTroveData, refetch: refetchTroveData } = useReadContract({
    address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
    abi: TROVE_MANAGER_ABI,
    functionName: "getEntireDebtAndColl",
    args: connectedOwnerAddress ? [connectedOwnerAddress] : undefined,
    chainId: mezoTestnet.id,
    query: { enabled: Boolean(connectedOwnerAddress) },
  });

  const { data: onChainPriceWei } = useReadContract({
    address: MEZO_TESTNET_LENDING_ADDRESSES.priceFeed,
    abi: PRICE_FEED_ABI,
    functionName: "fetchPrice",
    chainId: mezoTestnet.id,
  });

  const { data: minNetDebtWei } = useReadContract({
    address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
    abi: BORROWER_OPERATIONS_ABI,
    functionName: "minNetDebt",
    chainId: mezoTestnet.id,
  });

  const { data: gasCompWei } = useReadContract({
    address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
    abi: BORROWER_OPERATIONS_ABI,
    functionName: "MUSD_GAS_COMPENSATION",
    chainId: mezoTestnet.id,
  });

  const { data: borrowingRateWei } = useReadContract({
    address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
    abi: BORROWER_OPERATIONS_ABI,
    functionName: "borrowingRate",
    chainId: mezoTestnet.id,
  });

  const [snapshot, setSnapshot] =
    useState<ExtendedLendingGuardSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [lastTxHash, setLastTxHash] = useState<string>("");
  const [copiedReserve, setCopiedReserve] = useState<boolean>(false);
  const [fundAmountBtc, setFundAmountBtc] = useState<string>("0.00001");

  // Borrow MUSD Using BTC interactive form state (defaults meet Mezo's real 1,800 MUSD minNetDebt)
  const [collateralBtcInput, setCollateralBtcInput] =
    useState<string>("0.048");
  const [borrowMusdInput, setBorrowMusdInput] = useState<string>("1800");

  // Editable configuration form state
  const [monitoredBorrower, setMonitoredBorrower] = useState<string>("");
  const [triggerHf, setTriggerHf] = useState<number>(1.15);
  const [targetHf, setTargetHf] = useState<number>(1.55);
  const [btcReserveSharePct, setBtcReserveSharePct] = useState<number>(20);
  const [rescuesGasCount, setRescuesGasCount] = useState<number>(5);
  const [previewStepIndex, setPreviewStepIndex] = useState<number | null>(null);
  const [crashShockPct, setCrashShockPct] = useState<number>(25);
  const [crashPreset, setCrashPreset] = useState<
    "LIVE" | "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE"
  >("BALANCED");
  const [eip712PermitType, setEip712PermitType] = useState<
    "ADD_COLL" | "REPAY_MUSD"
  >("ADD_COLL");
  const [eip712AmountInput, setEip712AmountInput] = useState<string>("0.0005");
  const [eip712ValidityHours, setEip712ValidityHours] = useState<number>(24);

  const activePermitBorrower = (
    connectedOwnerAddress ||
    monitoredBorrower ||
    snapshot?.monitoredBorrower ||
    ""
  ).trim();

  const { data: liveSigNonceWei, refetch: refetchSigNonce } = useReadContract({
    address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperationsSignatures,
    abi: BORROWER_OPERATIONS_SIGNATURES_ABI,
    functionName: "getNonce",
    args:
      activePermitBorrower && activePermitBorrower.startsWith("0x")
        ? [activePermitBorrower as `0x${string}`]
        : undefined,
    chainId: mezoTestnet.id,
  });

  const refreshWalletOnChain = useCallback(async () => {
    await Promise.all([
      refetchWalletBalance().catch(() => undefined),
      refetchMusdBalance().catch(() => undefined),
      refetchTroveStatus().catch(() => undefined),
      refetchTroveData().catch(() => undefined),
      refetchSigNonce().catch(() => undefined),
    ]);
  }, [
    refetchWalletBalance,
    refetchMusdBalance,
    refetchTroveStatus,
    refetchTroveData,
    refetchSigNonce,
  ]);

  const loadSnapshot = useCallback(async () => {
    try {
      const qs = connectedOwnerAddress
        ? `?borrower=${encodeURIComponent(connectedOwnerAddress)}`
        : "";
      const res = await fetch(`/api/lending-guard${qs}`, { cache: "no-store" });
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
  }, [connectedOwnerAddress]);

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
      | "recover"
      | "save_eip712_permit"
      | "revoke_eip712_permit"
      | "execute_eip712_rescue_now",
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
      permitType: "ADD_COLL" | "REPAY_MUSD";
      amountWei: string;
      nonce: number;
      deadline: number;
      signature: string;
      signerAddress: string;
    }>
  ) => {
    setBusyAction(action);
    setBannerMessage("");
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
          permitType: overrideParams?.permitType,
          amountWei: overrideParams?.amountWei,
          nonce: overrideParams?.nonce,
          deadline: overrideParams?.deadline,
          signature: overrideParams?.signature,
          signerAddress: overrideParams?.signerAddress,
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
      await refreshWalletOnChain();
    } catch (err) {
      console.error("Mezo Guard action failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Mezo Guard action failed"
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleSignEip712Permit = async () => {
    setErrorMessage("");
    setBannerMessage("");
    if (!isConnected || !connectedOwnerAddress) {
      openConnectModal?.();
      setErrorMessage(
        "Connect your borrower wallet to sign an EIP-712 BorrowerOperationsSignatures rescue permit."
      );
      return;
    }

    const parsedAmt = Number(eip712AmountInput);
    if (!Number.isFinite(parsedAmt) || parsedAmt <= 0) {
      setErrorMessage("Enter a positive EIP-712 rescue cap amount.");
      return;
    }

    setBusyAction("save_eip712_permit");
    try {
      if (chainId !== mezoTestnet.id) {
        await switchChainAsync({ chainId: mezoTestnet.id });
      }

      const freshNonceWei = publicClient
        ? await publicClient
          .readContract({
            address:
              MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperationsSignatures,
            abi: BORROWER_OPERATIONS_SIGNATURES_ABI,
            functionName: "getNonce",
            args: [connectedOwnerAddress],
          })
          .catch(() => liveSigNonceWei ?? 0n)
        : liveSigNonceWei ?? 0n;

      const amountWei = parseEther(
        parsedAmt.toFixed(eip712PermitType === "ADD_COLL" ? 6 : 2)
      );
      const deadline =
        Math.floor(Date.now() / 1000) +
        Math.max(1, eip712ValidityHours) * 3600;

      const signature = await signTypedDataAsync({
        domain: BORROWER_SIGNATURES_EIP712_DOMAIN,
        types:
          eip712PermitType === "ADD_COLL"
            ? { AddColl: BORROWER_SIGNATURES_EIP712_TYPES.AddColl }
            : { RepayMUSD: BORROWER_SIGNATURES_EIP712_TYPES.RepayMUSD },
        primaryType: eip712PermitType === "ADD_COLL" ? "AddColl" : "RepayMUSD",
        message:
          eip712PermitType === "ADD_COLL"
            ? {
              assetAmount: amountWei,
              borrower: connectedOwnerAddress,
              nonce: freshNonceWei,
              deadline: BigInt(deadline),
            }
            : {
              amount: amountWei,
              borrower: connectedOwnerAddress,
              nonce: freshNonceWei,
              deadline: BigInt(deadline),
            },
      });

      await runGuardAction("save_eip712_permit", {
        permitType: eip712PermitType,
        amountWei: amountWei.toString(),
        nonce: Number(freshNonceWei),
        deadline,
        signature,
        signerAddress: connectedOwnerAddress,
        monitoredBorrower: connectedOwnerAddress,
        borrowerAddress: connectedOwnerAddress,
        ownerAddress: connectedOwnerAddress,
      });
    } catch (err) {
      console.error("Failed to sign EIP-712 rescue permit:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Wallet rejected or failed EIP-712 rescue permit signing."
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

  // Live on-chain protocol + wallet Trove parameters (real Mezo Testnet 31611 contracts)
  const liveBtcPrice =
    onChainPriceWei && onChainPriceWei > 0n
      ? Number(Number(formatEther(onChainPriceWei)).toFixed(2))
      : snapshot?.btcPriceUsd ?? 0;
  const minNetDebtMusd = minNetDebtWei
    ? Number(formatEther(minNetDebtWei))
    : snapshot?.minNetDebtMusd ?? 1800;
  const gasCompMusd = gasCompWei ? Number(formatEther(gasCompWei)) : 200;
  const borrowingRate = borrowingRateWei
    ? Number(formatEther(borrowingRateWei))
    : 0.001;

  const hasActiveOnChainTrove = Number(onChainTroveStatusWei ?? 0n) === 1;
  const liveTroveCollWei =
    hasActiveOnChainTrove && onChainTroveData
      ? onChainTroveData[0] + onChainTroveData[3]
      : 0n;
  const liveTroveDebtWei =
    hasActiveOnChainTrove && onChainTroveData
      ? onChainTroveData[1] +
      onChainTroveData[2] +
      onChainTroveData[4] +
      onChainTroveData[5]
      : 0n;
  const liveTroveCollBtc = Number(formatEther(liveTroveCollWei));
  const liveTroveDebtMusd = Number(formatEther(liveTroveDebtWei));
  const liveWalletMusd = walletMusdBalWei
    ? Number(Number(formatEther(walletMusdBalWei)).toFixed(2))
    : snapshot?.borrowerMusdBalance ?? 0;

  const connectedWalletBtc = connectedWalletBalance
    ? Number(formatEther(connectedWalletBalance.value))
    : 0;

  // Live Borrow MUSD Using BTC calculations (accounting for 200 MUSD gas reserve + 0.1% borrowing fee)
  const parsedCollBtc = Math.max(0, Number(collateralBtcInput) || 0);
  const parsedBorrowMusd = Math.max(0, Number(borrowMusdInput) || 0);
  const estimatedBorrowFeeMusd = Number(
    (parsedBorrowMusd * borrowingRate).toFixed(2)
  );
  const resultingCollBtc = hasActiveOnChainTrove
    ? liveTroveCollBtc + parsedCollBtc
    : parsedCollBtc;
  const resultingTotalDebtMusd = hasActiveOnChainTrove
    ? liveTroveDebtMusd + parsedBorrowMusd + estimatedBorrowFeeMusd
    : parsedBorrowMusd > 0
      ? parsedBorrowMusd + estimatedBorrowFeeMusd + gasCompMusd
      : 0;

  const collateralPreviewUsd = Number(
    (parsedCollBtc * liveBtcPrice).toFixed(2)
  );
  const resultingCollUsd = Number((resultingCollBtc * liveBtcPrice).toFixed(2));

  // Net additional MUSD borrowable so resulting composite debt keeps ICR >= 110% MCR
  const maxTotalDebtAt110Mcr =
    liveBtcPrice > 0 ? resultingCollUsd / MCR_RATIO : 0;
  const maxBorrowableMusdAt110Mcr = Math.max(
    0,
    Number(
      (
        (hasActiveOnChainTrove
          ? maxTotalDebtAt110Mcr - liveTroveDebtMusd
          : maxTotalDebtAt110Mcr - gasCompMusd) /
        (1 + borrowingRate)
      ).toFixed(2)
    )
  );
  const maxTotalDebtAt150Hf =
    liveBtcPrice > 0 ? resultingCollUsd / (MCR_RATIO * 1.5) : 0;
  const recommendedSafeBorrowAt150Hf = Math.max(
    0,
    Number(
      (
        (hasActiveOnChainTrove
          ? maxTotalDebtAt150Hf - liveTroveDebtMusd
          : maxTotalDebtAt150Hf - gasCompMusd) /
        (1 + borrowingRate)
      ).toFixed(2)
    )
  );
  const projectedBorrowHf =
    resultingTotalDebtMusd > 0 && liveBtcPrice > 0
      ? Number(
        (
          resultingCollUsd /
          (resultingTotalDebtMusd * MCR_RATIO)
        ).toFixed(2)
      )
      : 0;
  const projectedIcrPct =
    resultingTotalDebtMusd > 0 && liveBtcPrice > 0
      ? Number(((resultingCollUsd / resultingTotalDebtMusd) * 100).toFixed(1))
      : 0;
  const projectedLiquidationBtcPrice =
    resultingCollBtc > 0 && resultingTotalDebtMusd > 0
      ? Number(
        ((resultingTotalDebtMusd * MCR_RATIO) / resultingCollBtc).toFixed(2)
      )
      : 0;
  const minSafeBtcForMinBorrow =
    liveBtcPrice > 0
      ? Number(
        (
          ((minNetDebtMusd * (1 + borrowingRate) + gasCompMusd) *
            MCR_RATIO *
            1.05) /
          liveBtcPrice
        ).toFixed(4)
      )
      : 0.036;
  const availableScaleBtc =
    connectedWalletBtc > 0.002
      ? Number(Math.max(0.001, connectedWalletBtc - 0.002).toFixed(5))
      : 0.048;

  const ensureMezoTestnetChain = async () => {
    if (chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
  };

  const handleAddMusdTokenToWallet = async () => {
    setErrorMessage("");
    try {
      if (!walletClient) {
        setErrorMessage("Connect your wallet first to import the MUSD token.");
        return;
      }
      await walletClient.watchAsset({
        type: "ERC20",
        options: {
          address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
          symbol: "MUSD",
          decimals: 18,
        },
      });
      setBannerMessage(
        "MUSD token (0x1189…c503) prompt opened in your wallet."
      );
    } catch (err) {
      setErrorMessage(extractEvmRevertReason(err));
    }
  };

  const handleLockBtcAndBorrowMusd = async () => {
    setErrorMessage("");
    if (!isConnected || !connectedOwnerAddress) {
      openConnectModal?.();
      setErrorMessage(
        "Connect your MetaMask / RainbowKit wallet first to borrow real MUSD on Mezo Testnet (31611)."
      );
      return;
    }

    if (!hasActiveOnChainTrove && parsedCollBtc <= 0) {
      setErrorMessage(
        "Enter a positive BTC collateral amount to lock and open your Trove."
      );
      return;
    }
    if (parsedBorrowMusd <= 0) {
      setErrorMessage("Enter a positive MUSD amount to borrow.");
      return;
    }
    if (!hasActiveOnChainTrove && parsedBorrowMusd < minNetDebtMusd) {
      setErrorMessage(
        `Mezo BorrowerOperations requires at least ${minNetDebtMusd.toLocaleString()} MUSD minimum net borrow to open a Trove (minNetDebt = ${minNetDebtMusd.toLocaleString()} MUSD). Click "Min Valid Trove (${minSafeBtcForMinBorrow} BTC)" or increase borrow amount to >= ${minNetDebtMusd}.`
      );
      return;
    }
    if (connectedWalletBtc < parsedCollBtc + 0.0005) {
      setErrorMessage(
        `Insufficient wallet BTC: connected wallet has ${connectedWalletBtc.toFixed(
          5
        )} BTC, need ${(parsedCollBtc + 0.0005).toFixed(
          5
        )} BTC (${parsedCollBtc} BTC collateral + gas).`
      );
      return;
    }
    if (liveBtcPrice > 0 && projectedBorrowHf < 1.0) {
      setErrorMessage(
        `Requested borrow (${parsedBorrowMusd.toLocaleString()} net MUSD / ${resultingTotalDebtMusd.toFixed(
          1
        )} total Trove debt with ${gasCompMusd} MUSD gas reserve) exceeds Mezo's 110% MCR (ICR ${projectedIcrPct}%). Max additional borrow: ${maxBorrowableMusdAt110Mcr.toLocaleString()} MUSD.`
      );
      return;
    }

    setBusyAction("borrow_musd_wallet");
    try {
      await ensureMezoTestnetChain();

      const borrowerOpsAddr =
        snapshot?.contracts.borrowerOperations ||
        MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations;
      const collWei =
        parsedCollBtc > 0 ? parseEther(parsedCollBtc.toFixed(18)) : 0n;
      const debtWei = parseEther(parsedBorrowMusd.toFixed(6));

      const exactFeeWei = publicClient
        ? await publicClient
          .readContract({
            address: borrowerOpsAddr,
            abi: BORROWER_OPERATIONS_ABI,
            functionName: "getBorrowingFee",
            args: [debtWei],
          })
          .catch(() => parseEther(estimatedBorrowFeeMusd.toFixed(6)))
        : parseEther(estimatedBorrowFeeMusd.toFixed(6));

      const targetCollWei = liveTroveCollWei + collWei;
      const targetCompositeDebtWei = hasActiveOnChainTrove
        ? liveTroveDebtWei + debtWei + exactFeeWei
        : debtWei + exactFeeWei + (gasCompWei || parseEther("200"));

      const [upperHint, lowerHint] = await computeMezoTroveHints(
        publicClient,
        targetCollWei,
        targetCompositeDebtWei
      );

      let txHash: `0x${string}`;
      if (!hasActiveOnChainTrove) {
        if (publicClient) {
          await publicClient.simulateContract({
            account: connectedOwnerAddress,
            address: borrowerOpsAddr,
            abi: BORROWER_OPERATIONS_ABI,
            functionName: "openTrove",
            args: [debtWei, upperHint, lowerHint],
            value: collWei,
          });
        }
        txHash = await writeContractAsync({
          address: borrowerOpsAddr,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "openTrove",
          args: [debtWei, upperHint, lowerHint],
          value: collWei,
        });
      } else {
        if (publicClient) {
          await publicClient.simulateContract({
            account: connectedOwnerAddress,
            address: borrowerOpsAddr,
            abi: BORROWER_OPERATIONS_ABI,
            functionName: "adjustTrove",
            args: [0n, debtWei, true, upperHint, lowerHint],
            value: collWei,
          });
        }
        txHash = await writeContractAsync({
          address: borrowerOpsAddr,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "adjustTrove",
          args: [0n, debtWei, true, upperHint, lowerHint],
          value: collWei,
        });
      }

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        if (receipt.status !== "success") {
          throw new Error(
            `BorrowerOperations transaction reverted on-chain (${txHash}).`
          );
        }
      }

      setLastTxHash(txHash);
      await refreshWalletOnChain();

      await runGuardAction("borrow_musd", {
        collateralBtcInput: parsedCollBtc,
        borrowMusdInput: parsedBorrowMusd,
        borrowerAddress: connectedOwnerAddress,
        monitoredBorrower: connectedOwnerAddress,
        externalTxHash: txHash,
      });
    } catch (err) {
      setErrorMessage(extractEvmRevertReason(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCloseActiveTrove = async () => {
    setErrorMessage("");
    if (!isConnected || !connectedOwnerAddress) {
      openConnectModal?.();
      return;
    }
    if (!hasActiveOnChainTrove) {
      setErrorMessage("No active Trove found on-chain for your wallet.");
      return;
    }
    const repayNeeded = Math.max(0, liveTroveDebtMusd - gasCompMusd);
    if (liveWalletMusd < repayNeeded) {
      setErrorMessage(
        `Need ${repayNeeded.toFixed(
          2
        )} MUSD in your wallet to close Trove and unlock ${liveTroveCollBtc.toFixed(
          5
        )} BTC (wallet holds ${liveWalletMusd.toFixed(2)} MUSD).`
      );
      return;
    }

    setBusyAction("close_trove");
    try {
      await ensureMezoTestnetChain();
      const borrowerOpsAddr =
        snapshot?.contracts.borrowerOperations ||
        MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations;
      if (publicClient) {
        await publicClient.simulateContract({
          account: connectedOwnerAddress,
          address: borrowerOpsAddr,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "closeTrove",
        });
      }
      const txHash = await writeContractAsync({
        address: borrowerOpsAddr,
        abi: BORROWER_OPERATIONS_ABI,
        functionName: "closeTrove",
      });
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        if (receipt.status !== "success") {
          throw new Error(`closeTrove reverted on-chain (${txHash}).`);
        }
      }
      setLastTxHash(txHash);
      setBannerMessage(
        `Closed Trove & unlocked ${liveTroveCollBtc.toFixed(
          5
        )} BTC back to your wallet (Tx ${txHash.slice(0, 10)}…).`
      );
      await refreshWalletOnChain();
      await loadSnapshot();
    } catch (err) {
      setErrorMessage(extractEvmRevertReason(err));
    } finally {
      setBusyAction(null);
    }
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

  const crashSimulation = useMemo(() => {
    const basePriceUsd = liveBtcPrice > 0 ? liveBtcPrice : 78_000;
    const useLiveTrove =
      crashPreset === "LIVE" && (hasActiveOnChainTrove || hasActivePosition);

    const presetInitialHf =
      crashPreset === "CONSERVATIVE"
        ? 1.85
        : crashPreset === "AGGRESSIVE"
          ? 1.25
          : 1.48;

    const simDebtMusd = useLiveTrove
      ? hasActiveOnChainTrove
        ? liveTroveDebtMusd
        : snapshot?.debtMusd ?? 2000
      : 2000; // Canonical 1,800 minNetDebt + 200 MUSD gas compensation

    const simCollBtc = useLiveTrove
      ? hasActiveOnChainTrove
        ? liveTroveCollBtc
        : snapshot?.collateralBtc ?? 0.048
      : Number(
          ((simDebtMusd * MCR_RATIO * presetInitialHf) / basePriceUsd).toFixed(5)
        );

    const shockedPriceUsd = Number(
      (basePriceUsd * (1 - crashShockPct / 100)).toFixed(2)
    );
    const baseCollUsd = simCollBtc * basePriceUsd;
    const shockedCollUsd = simCollBtc * shockedPriceUsd;

    const baseHf =
      simDebtMusd > 0 ? Number((baseCollUsd / (simDebtMusd * MCR_RATIO)).toFixed(2)) : 0;
    const shockedHf =
      simDebtMusd > 0
        ? Number((shockedCollUsd / (simDebtMusd * MCR_RATIO)).toFixed(2))
        : 0;
    const liquidationPriceUsd =
      simCollBtc > 0 ? Number(((simDebtMusd * MCR_RATIO) / simCollBtc).toFixed(2)) : 0;

    let regime: "HEALTHY" | "RESCUE_ARMED" | "REFUSE_LIQUIDATABLE" = "HEALTHY";
    if (shockedHf <= 1.0) {
      regime = "REFUSE_LIQUIDATABLE";
    } else if (shockedHf < triggerHf) {
      regime = "RESCUE_ARMED";
    }

    const targetDebtForTargetHf = shockedCollUsd / (targetHf * MCR_RATIO);
    const requiredRepayMusd = Number(
      Math.max(0, simDebtMusd - targetDebtForTargetHf).toFixed(2)
    );
    const requiredCollateralOnlyBtc =
      shockedPriceUsd > 0
        ? Number(
            Math.max(
              0,
              (simDebtMusd * targetHf * MCR_RATIO - shockedCollUsd) / shockedPriceUsd
            ).toFixed(6)
          )
        : 0;

    // Live reserve capacity check (uses actual Testnet Reserve Wallet telemetry)
    const liveReserveMusd = snapshot?.reserveMusdBalance ?? 0;
    const liveReserveBtc = snapshot?.reserveSupplyableBtc ?? 0;
    const dailyMusdCap = snapshot?.dailyMusdCap ?? 2500;
    const dailyBtcCap = snapshot?.dailyBtcCap ?? 0.05;

    const feasibleRepayMusd =
      regime === "RESCUE_ARMED"
        ? Number(
            Math.min(
              requiredRepayMusd,
              liveReserveMusd,
              dailyMusdCap,
              Math.max(0, simDebtMusd - 1)
            ).toFixed(2)
          )
        : 0;
    const debtAfterFeasibleRepay = Math.max(0.01, simDebtMusd - feasibleRepayMusd);
    const hfAfterRepay = Number(
      (shockedCollUsd / (debtAfterFeasibleRepay * MCR_RATIO)).toFixed(2)
    );

    let feasibleTopUpBtc = 0;
    if (regime === "RESCUE_ARMED" && hfAfterRepay < targetHf && shockedPriceUsd > 0) {
      const residualCollUsd =
        debtAfterFeasibleRepay * targetHf * MCR_RATIO - shockedCollUsd;
      feasibleTopUpBtc = Number(
        Math.min(
          Math.max(0, residualCollUsd / shockedPriceUsd),
          liveReserveBtc,
          dailyBtcCap
        ).toFixed(6)
      );
    }

    const postActualReserveHf =
      regime === "RESCUE_ARMED"
        ? Number(
            (
              ((simCollBtc + feasibleTopUpBtc) * shockedPriceUsd) /
              (debtAfterFeasibleRepay * MCR_RATIO)
            ).toFixed(2)
          )
        : shockedHf;
    const postProtocolIdealHf =
      regime === "RESCUE_ARMED" ? Number(targetHf.toFixed(2)) : shockedHf;

    return {
      sourceLabel: useLiveTrove ? "Live Monitored Trove" : `Benchmark ${crashPreset} Trove`,
      basePriceUsd,
      shockedPriceUsd,
      simCollBtc,
      simDebtMusd,
      liquidationPriceUsd,
      baseHf,
      shockedHf,
      regime,
      requiredRepayMusd,
      requiredCollateralOnlyBtc,
      feasibleRepayMusd,
      feasibleTopUpBtc,
      liveReserveMusd,
      liveReserveBtc,
      postActualReserveHf,
      postProtocolIdealHf,
    };
  }, [
    liveBtcPrice,
    crashPreset,
    hasActiveOnChainTrove,
    hasActivePosition,
    liveTroveDebtMusd,
    liveTroveCollBtc,
    snapshot,
    crashShockPct,
    triggerHf,
    targetHf,
  ]);

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
              className={`text-xs font-black px-3 py-1.5 rounded-xl border ${snapshot?.status === "ARMED"
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
                className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""
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
                  110% MCR · LIVE ORACLE ${liveBtcPrice.toLocaleString()}
                </Badge>
                <Badge
                  className={`font-black text-[10px] px-2.5 py-0.5 ${hasActiveOnChainTrove || hasActivePosition
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-700 text-white"
                    }`}
                >
                  {hasActiveOnChainTrove
                    ? `LIVE ON-CHAIN TROVE: ${liveTroveCollBtc.toFixed(
                      5
                    )} BTC / ${liveTroveDebtMusd.toLocaleString()} MUSD Debt`
                    : hasActivePosition
                      ? `MONITORED POSITION: ${(snapshot?.collateralBtc ?? 0).toFixed(
                        5
                      )} BTC / ${(snapshot?.debtMusd ?? 0).toLocaleString()} MUSD (HF ${(
                        snapshot?.currentHf ?? 0
                      ).toFixed(2)})`
                      : `MIN BORROW: ${minNetDebtMusd.toLocaleString()} MUSD (minNetDebt)`}
                </Badge>
              </div>
              <CardTitle className="text-lg sm:text-xl font-black text-[#231f20] mt-1.5 flex items-center gap-2">
                <Coins className="h-5 w-5 text-[#f97316]" />
                {hasActiveOnChainTrove
                  ? "Borrow More MUSD / Top-Up Active Trove (Mezo Testnet 31611)"
                  : "Borrow Real MUSD Using Native BTC Collateral (Mezo Testnet 31611)"}
              </CardTitle>
              <CardDescription className="text-xs text-[#231f20]/80 font-medium">
                {hasActiveOnChainTrove
                  ? `You already have an active Trove on BorrowerOperations (0xCdF7…beE5). Borrow additional MUSD (>= 1 MUSD) and optionally add BTC collateral via adjustTrove.`
                  : `Directly calls Mezo BorrowerOperations.openTrove (0xCdF7…beE5) with live SortedTroves hints to lock native BTC and mint real MUSD ERC-20 into your wallet.`}
              </CardDescription>
            </div>

            {/* Quick Borrow Scenario Presets (Real Valid Trove Sizes) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (hasActiveOnChainTrove) {
                    setCollateralBtcInput("0.005");
                    setBorrowMusdInput("200");
                  } else {
                    setCollateralBtcInput(String(minSafeBtcForMinBorrow));
                    setBorrowMusdInput(String(minNetDebtMusd));
                  }
                }}
                className="rounded-xl text-[11px] font-bold h-8 bg-white hover:bg-orange-50 border-orange-300 text-[#231f20]"
              >
                {hasActiveOnChainTrove
                  ? "+0.005 BTC → +200 MUSD"
                  : `Min Valid Trove (${minSafeBtcForMinBorrow} BTC → ${minNetDebtMusd.toLocaleString()} MUSD)`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const coll = 0.048;
                  const targetMusd = hasActiveOnChainTrove ? 1000 : minNetDebtMusd;
                  setCollateralBtcInput(String(coll));
                  setBorrowMusdInput(String(targetMusd));
                }}
                className="rounded-xl text-[11px] font-bold h-8 bg-white hover:bg-orange-50 border-orange-300 text-[#231f20]"
              >
                {hasActiveOnChainTrove
                  ? "+0.048 BTC → +1,000 MUSD"
                  : `Safe Trove (0.048 BTC → ${minNetDebtMusd.toLocaleString()} MUSD)`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const coll = availableScaleBtc;
                  setCollateralBtcInput(String(coll));
                  if (liveBtcPrice > 0) {
                    const maxNet = Math.max(
                      hasActiveOnChainTrove ? 100 : minNetDebtMusd,
                      Number(
                        (
                          ((coll * liveBtcPrice) / (MCR_RATIO * 1.45) -
                            (hasActiveOnChainTrove ? 0 : gasCompMusd)) /
                          (1 + borrowingRate)
                        ).toFixed(0)
                      )
                    );
                    setBorrowMusdInput(String(maxNet));
                  }
                }}
                className="rounded-xl text-[11px] font-bold h-8 bg-white hover:bg-emerald-50 border-emerald-400 text-emerald-900"
              >
                Use Wallet ({availableScaleBtc.toFixed(4)} BTC)
              </Button>
            </div>
          </div>

          {/* Live Wallet BTC / MUSD / Trove Balance Strip */}
          <div className="mt-3 pt-2.5 border-t border-[#f97316]/15 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-2.5 py-1 rounded-lg bg-white/80 border border-black/10 font-bold text-[#231f20]">
                Wallet BTC:{" "}
                <span className="font-mono text-orange-700">
                  {isConnected ? `${connectedWalletBtc.toFixed(5)} BTC` : "Not connected"}
                </span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/80 border border-black/10 font-bold text-[#231f20]">
                Wallet MUSD:{" "}
                <span className="font-mono text-purple-800">
                  {isConnected
                    ? `${liveWalletMusd.toLocaleString()} MUSD`
                    : "—"}
                </span>
              </span>
              {hasActiveOnChainTrove && (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-400/40 font-bold text-emerald-950">
                  Active Trove: {liveTroveCollBtc.toFixed(5)} BTC /{" "}
                  {liveTroveDebtMusd.toLocaleString()} MUSD Debt
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isConnected && (
                <button
                  type="button"
                  onClick={handleAddMusdTokenToWallet}
                  className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 border border-purple-400/40 text-[11px] font-black text-purple-900"
                >
                  + Add MUSD Token to MetaMask
                </button>
              )}
              {hasActiveOnChainTrove && (
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={handleCloseActiveTrove}
                  className="px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 border border-red-400/40 text-[11px] font-black text-red-900"
                >
                  {busyAction === "close_trove"
                    ? "Closing Trove..."
                    : "Close Trove & Reclaim BTC"}
                </button>
              )}
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
                      {hasActiveOnChainTrove
                        ? "1. Extra BTC to Add (Optional)"
                        : "1. BTC Collateral to Lock"}
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
                      placeholder="0.048"
                      className="w-full rounded-xl border border-black/20 bg-white px-3 py-2.5 pr-14 text-sm font-mono font-black text-[#231f20]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-orange-600">
                      BTC
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {(hasActiveOnChainTrove
                    ? [0, 0.005, 0.01, 0.03]
                    : [minSafeBtcForMinBorrow, 0.048, 0.06, 0.1]
                  ).map((presetBtc) => (
                    <button
                      key={presetBtc}
                      type="button"
                      onClick={() => {
                        setCollateralBtcInput(String(presetBtc));
                        if (!hasActiveOnChainTrove && liveBtcPrice > 0) {
                          const totalCollUsd = presetBtc * liveBtcPrice;
                          const safeNet = Math.max(
                            minNetDebtMusd,
                            Number(
                              (
                                (totalCollUsd / (MCR_RATIO * 1.45) -
                                  gasCompMusd) /
                                (1 + borrowingRate)
                              ).toFixed(0)
                            )
                          );
                          const maxNet = Math.max(
                            0,
                            Number(
                              (
                                (totalCollUsd / (MCR_RATIO * 1.03) -
                                  gasCompMusd) /
                                (1 + borrowingRate)
                              ).toFixed(0)
                            )
                          );
                          setBorrowMusdInput(
                            String(Math.min(safeNet, maxNet || minNetDebtMusd))
                          );
                        }
                      }}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-orange-100 border border-black/10 text-[10px] font-bold text-[#231f20]"
                    >
                      {presetBtc} BTC
                    </button>
                  ))}
                  {isConnected && connectedWalletBtc > 0.002 && (
                    <button
                      type="button"
                      onClick={() => setCollateralBtcInput(String(availableScaleBtc))}
                      className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 border border-emerald-400/40 text-[10px] font-black text-emerald-900"
                    >
                      Max ({availableScaleBtc.toFixed(4)})
                    </button>
                  )}
                </div>
              </div>

              {/* MUSD Amount to Borrow Input */}
              <div className="p-4 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase text-[#231f20]">
                      {hasActiveOnChainTrove
                        ? "2. Extra MUSD to Borrow"
                        : "2. Net MUSD to Mint"}
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
                      placeholder={String(minNetDebtMusd)}
                      className="w-full rounded-xl border border-black/20 bg-white px-3 py-2.5 pr-16 text-sm font-mono font-black text-[#231f20]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-purple-700">
                      MUSD
                    </span>
                  </div>
                  <div className="text-[10px] font-semibold text-muted-foreground">
                    +{estimatedBorrowFeeMusd.toFixed(2)} fee (
                    {(borrowingRate * 100).toFixed(2)}%)
                    {!hasActiveOnChainTrove
                      ? ` + ${gasCompMusd} MUSD liquidation reserve`
                      : ""}{" "}
                    ={" "}
                    <strong className="text-[#231f20]">
                      {resultingTotalDebtMusd.toFixed(2)} total Trove debt
                    </strong>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {!hasActiveOnChainTrove && (
                    <button
                      type="button"
                      onClick={() => setBorrowMusdInput(String(minNetDebtMusd))}
                      className="px-2 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 border border-orange-400/40 text-[10px] font-black text-orange-900"
                    >
                      Min {minNetDebtMusd.toLocaleString()} MUSD
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setBorrowMusdInput(
                        String(Math.floor(recommendedSafeBorrowAt150Hf))
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 border border-emerald-400/40 text-[10px] font-black text-emerald-900"
                  >
                    Safe 150% HF (
                    {Math.floor(recommendedSafeBorrowAt150Hf).toLocaleString()})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBorrowMusdInput(
                        String(Math.floor(maxBorrowableMusdAt110Mcr * 0.92))
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-white hover:bg-purple-100 border border-black/10 text-[10px] font-bold text-purple-900"
                  >
                    92% Max MCR
                  </button>
                </div>
              </div>
            </div>

            {/* Live Borrow Telemetry & Execute Column (5 cols) */}
            <div className="lg:col-span-5 p-4 rounded-2xl bg-[#1e1b2e] text-white flex flex-col justify-between space-y-3 border border-white/10">
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    Resulting Collateral Ratio
                  </div>
                  <div className="text-sm font-black text-amber-300 mt-0.5">
                    {projectedIcrPct > 0 ? `${projectedIcrPct}% ICR` : "—"} (Min 110%)
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    Max Net Borrow (110%)
                  </div>
                  <div className="text-sm font-black text-emerald-300 mt-0.5">
                    {maxBorrowableMusdAt110Mcr.toLocaleString()} MUSD
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">
                    Projected Trove HF
                  </div>
                  <div
                    className={`text-sm font-black mt-0.5 ${projectedBorrowHf <= 0
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

              <div className="p-2.5 rounded-xl bg-white/5 border border-emerald-400/30 text-[10px] text-slate-300 leading-relaxed">
                <span className="font-black text-emerald-300 uppercase">
                  Direct Mezo Protocol Execution (No Simulation):
                </span>{" "}
                Native BTC is sent as <code className="text-amber-200">msg.value</code>{" "}
                (no BTC <code className="text-amber-200">approve()</code> needed).{" "}
                {hasActiveOnChainTrove
                  ? "Calls BorrowerOperations.adjustTrove (0xCdF7…beE5) with live SortedTroves hints."
                  : `Calls BorrowerOperations.openTrove (0xCdF7…beE5) requiring >= ${minNetDebtMusd.toLocaleString()} MUSD net borrow.`}
              </div>

              <Button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={handleLockBtcAndBorrowMusd}
                className="w-full rounded-xl bg-[#f97316] hover:bg-[#ea580c] text-white font-black text-xs sm:text-sm py-5 shadow-lg"
              >
                <Coins className="h-4 w-4 mr-2" />
                {busyAction === "borrow_musd_wallet"
                  ? "Confirm Borrow Transaction in Wallet (31611)..."
                  : busyAction === "borrow_musd"
                    ? "Syncing On-Chain Trove & AI Guard..."
                    : !isConnected
                      ? "Connect Wallet to Borrow MUSD (31611)"
                      : hasActiveOnChainTrove
                        ? `Add ${parsedCollBtc} BTC & Borrow +${parsedBorrowMusd.toLocaleString()} MUSD`
                        : `Lock ${parsedCollBtc} BTC & Borrow ${parsedBorrowMusd.toLocaleString()} MUSD`}
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
                  className={`font-black text-[10px] px-2.5 py-0.5 ${!hasActivePosition && previewStepIndex === null
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
                    : `HF ${displayedHf.toFixed(2)} · ${displayedHf <= 1.0
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
                  className={`text-left p-2.5 rounded-2xl border transition-all ${isActive
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

      {/* Interactive Trove BTC Crash Stress-Test Simulator (Zero Wallet Balance Needed) */}
      <Card className="clay-card border-2 border-rose-500/35 bg-white/95 shadow-xl overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-[#fff1f2] via-[#fff7ed] to-[#eef2ff] border-b border-rose-500/15">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-rose-600 text-white font-black text-[10px] uppercase px-2.5 py-0.5">
                  INTERACTIVE STRESS-TEST SIMULATOR · 110% MCR
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-white text-[#231f20] border-black/15 font-bold text-[10px]"
                >
                  Zero Wallet Funds Needed · Live Mezo PriceFeed ($
                  {crashSimulation.basePriceUsd.toLocaleString()})
                </Badge>
              </div>
              <CardTitle className="text-lg font-black text-[#231f20] mt-1.5 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-rose-600" />
                Trove BTC Crash Stress-Test &amp; Repay-First Rescue Sizing
              </CardTitle>
              <CardDescription className="text-xs text-[#231f20]/75 font-medium mt-0.5">
                Drag a simulated BTC drawdown against live Mezo Testnet oracle pricing to verify Ironhide (#04)&apos;s exact Health Factor trigger boundary (
                <strong>1.00 &lt; HF &lt; {triggerHf.toFixed(2)}</strong>), Repay-First MUSD math, and{" "}
                <strong>HF &le; 1.00</strong> anti-liquidation-race refusal.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "LIVE", label: "Live Trove", disabled: !(hasActiveOnChainTrove || hasActivePosition) },
                  { id: "CONSERVATIVE", label: "Safe (1.85x)", disabled: false },
                  { id: "BALANCED", label: "Balanced (1.48x)", disabled: false },
                  { id: "AGGRESSIVE", label: "Tight (1.25x)", disabled: false },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={preset.disabled}
                  onClick={() => setCrashPreset(preset.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    crashPreset === preset.id
                      ? "bg-[#231f20] text-white border-[#231f20] shadow-sm"
                      : "bg-white hover:bg-stone-100 text-[#231f20] border-black/15"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5 space-y-5">
          {/* Shock Slider + Quick Shock Buttons */}
          <div className="p-4 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-[#231f20]">
                  Simulated BTC Price Shock:
                </span>
                <Badge
                  className={`font-black text-xs px-2.5 py-0.5 ${
                    crashShockPct === 0
                      ? "bg-emerald-600 text-white"
                      : crashShockPct <= 20
                        ? "bg-amber-500 text-white"
                        : "bg-rose-600 text-white"
                  }`}
                >
                  {crashShockPct === 0 ? "0% (Spot Live)" : `-${crashShockPct}% Crash`}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[0, 15, 25, 35, 45].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setCrashShockPct(pct)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all ${
                      crashShockPct === pct
                        ? "bg-rose-600 text-white border-rose-700"
                        : "bg-white hover:bg-rose-50 text-[#231f20] border-black/15"
                    }`}
                  >
                    {pct === 0 ? "0% Live" : `-${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            <Slider
              value={[crashShockPct]}
              min={0}
              max={45}
              step={1}
              onValueChange={(vals) => setCrashShockPct(vals[0] ?? 0)}
            />

            <div className="flex items-center justify-between text-[10.5px] font-bold text-stone-600">
              <span>0% Live (${crashSimulation.basePriceUsd.toLocaleString()})</span>
              <span className="text-amber-700">
                Warning: Trigger HF {triggerHf.toFixed(2)}
              </span>
              <span className="text-rose-700">
                -45% (${(crashSimulation.basePriceUsd * 0.55).toLocaleString(undefined, { maximumFractionDigits: 0 })})
              </span>
            </div>
          </div>

          {/* 3-Stage Visual Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Stage 1: Baseline Trove */}
            <div className="p-4 rounded-2xl bg-[#f8f5f0] border border-black/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-stone-600">
                  1 · Pre-Shock Trove
                </span>
                <Badge variant="outline" className="text-[10px] font-bold bg-white">
                  {crashSimulation.sourceLabel}
                </Badge>
              </div>
              <div className="text-2xl font-black text-emerald-700">
                HF {crashSimulation.baseHf.toFixed(2)}x
              </div>
              <div className="text-xs text-[#231f20]/80 space-y-1 font-medium">
                <div className="flex justify-between">
                  <span>Spot BTC:</span>
                  <strong>${crashSimulation.basePriceUsd.toLocaleString()}</strong>
                </div>
                <div className="flex justify-between">
                  <span>BTC Collateral:</span>
                  <strong>{crashSimulation.simCollBtc.toFixed(5)} BTC</strong>
                </div>
                <div className="flex justify-between">
                  <span>Composite Debt:</span>
                  <strong>{crashSimulation.simDebtMusd.toLocaleString()} MUSD</strong>
                </div>
                <div className="flex justify-between">
                  <span>110% MCR Liq Price:</span>
                  <strong className="text-rose-700">
                    ${crashSimulation.liquidationPriceUsd.toLocaleString()}
                  </strong>
                </div>
              </div>
            </div>

            {/* Stage 2: Shock Impact & Breach Decision */}
            <div
              className={`p-4 rounded-2xl border-2 space-y-2 ${
                crashSimulation.regime === "HEALTHY"
                  ? "bg-emerald-50/70 border-emerald-500/35"
                  : crashSimulation.regime === "RESCUE_ARMED"
                    ? "bg-amber-50/90 border-amber-500/60"
                    : "bg-rose-50/90 border-rose-600/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase text-[#231f20]">
                  2 · Impact at -{crashShockPct}% BTC
                </span>
                <Badge
                  className={`text-[10px] font-black ${
                    crashSimulation.regime === "HEALTHY"
                      ? "bg-emerald-600 text-white"
                      : crashSimulation.regime === "RESCUE_ARMED"
                        ? "bg-amber-600 text-white"
                        : "bg-rose-700 text-white"
                  }`}
                >
                  {crashSimulation.regime === "HEALTHY"
                    ? "NO RESCUE NEEDED"
                    : crashSimulation.regime === "RESCUE_ARMED"
                      ? "RESCUE ARMED"
                      : "HF <= 1.00 REFUSED"}
                </Badge>
              </div>
              <div
                className={`text-2xl font-black ${
                  crashSimulation.regime === "HEALTHY"
                    ? "text-emerald-700"
                    : crashSimulation.regime === "RESCUE_ARMED"
                      ? "text-amber-700"
                      : "text-rose-700"
                }`}
              >
                HF {crashSimulation.shockedHf.toFixed(2)}x
              </div>
              <div className="text-xs text-[#231f20]/85 space-y-1 font-medium">
                <div className="flex justify-between">
                  <span>Shocked BTC Price:</span>
                  <strong>${crashSimulation.shockedPriceUsd.toLocaleString()}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Collateral USD:</span>
                  <strong>
                    $
                    {(
                      crashSimulation.simCollBtc * crashSimulation.shockedPriceUsd
                    ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </strong>
                </div>
                <div className="pt-1 text-[11px] leading-snug font-bold">
                  {crashSimulation.regime === "HEALTHY"
                    ? `HF (${crashSimulation.shockedHf.toFixed(2)}) remains above Trigger (${triggerHf.toFixed(2)}). Zero gas spent.`
                    : crashSimulation.regime === "RESCUE_ARMED"
                      ? `In working range (1.00 < HF ${crashSimulation.shockedHf.toFixed(2)} < ${triggerHf.toFixed(2)}). After 2 finalized blocks, Ironhide rescues.`
                      : `Shocked HF (${crashSimulation.shockedHf.toFixed(2)}) fell <= 1.00 MCR. Guard refuses rescue rather than racing liquidation bots.`}
                </div>
              </div>
            </div>

            {/* Stage 3: Repay-First Rescue Sizing Output */}
            <div className="p-4 rounded-2xl bg-[#181520] text-white border border-white/15 space-y-2.5 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase text-purple-300">
                    3 · Ironhide Rescue Plan
                  </span>
                  <Badge className="bg-purple-600/30 text-purple-200 border border-purple-400/40 text-[10px] font-bold">
                    Repay-First Math
                  </Badge>
                </div>

                {crashSimulation.regime === "RESCUE_ARMED" ? (
                  <>
                    <div className="text-xl font-black text-emerald-300">
                      Restores HF →{" "}
                      {crashSimulation.feasibleRepayMusd + 0.05 >=
                      crashSimulation.requiredRepayMusd
                        ? `${crashSimulation.postActualReserveHf.toFixed(2)}x`
                        : `${crashSimulation.postProtocolIdealHf.toFixed(2)}x (Ideal)`}
                    </div>
                    <div className="text-xs text-slate-200 space-y-1">
                      <div className="flex justify-between">
                        <span>Repay Required (Target {targetHf.toFixed(2)}):</span>
                        <strong className="text-emerald-300">
                          {crashSimulation.requiredRepayMusd.toLocaleString()} MUSD
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Alt. Collateral AddColl:</span>
                        <strong className="text-amber-300">
                          {crashSimulation.requiredCollateralOnlyBtc.toFixed(5)} BTC
                        </strong>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-300 pt-1 border-t border-white/10">
                        <span>Live Reserve Capacity:</span>
                        <strong>
                          ${crashSimulation.liveReserveMusd.toLocaleString()} /{" "}
                          {crashSimulation.feasibleRepayMusd.toLocaleString()} MUSD feasible
                        </strong>
                      </div>
                      <div className="text-[10.5px] text-slate-400 leading-snug pt-0.5">
                        Sequence: <code className="text-amber-200">approve(0)</code> →{" "}
                        <code className="text-amber-200">
                          approve({crashSimulation.requiredRepayMusd})
                        </code>{" "}
                        →{" "}
                        <code className="text-emerald-300">repayMUSD()</code>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xl font-black text-slate-300">
                      {crashSimulation.regime === "HEALTHY"
                        ? `Standby (HF ${crashSimulation.shockedHf.toFixed(2)})`
                        : "Rescue Refused (HF <= 1.00)"}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {crashSimulation.regime === "HEALTHY"
                        ? "Drag shock higher (e.g., -25%) to cross Trigger HF and inspect exact Repay-First MUSD sizing."
                        : "Try -25% instead of an extreme crash to see Ironhide intercept in the 1.00 < HF < Trigger rescue window before liquidation occurs."}
                    </p>
                  </>
                )}
              </div>

              {crashSimulation.regime === "RESCUE_ARMED" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEip712PermitType("REPAY_MUSD");
                    setEip712AmountInput(
                      String(Math.max(1, Math.ceil(crashSimulation.requiredRepayMusd)))
                    );
                    setBannerMessage(
                      `Loaded simulated ${Math.ceil(crashSimulation.requiredRepayMusd)} MUSD Repay-First rescue sizing into EIP-712 Delegation card below.`
                    );
                  }}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs"
                >
                  <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                  Load {Math.ceil(crashSimulation.requiredRepayMusd)} MUSD into EIP-712 Permit
                </Button>
              )}
            </div>
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
                    href={`https://explorer.test.mezo.org/address/${snapshot?.reserveWallet || ""
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

      {/* Canonical EIP-712 Non-Custodial Rescue Permit (BorrowerOperationsSignatures) */}
      <Card className="clay-card border-2 border-indigo-600/25 bg-gradient-to-br from-indigo-50/70 via-white to-emerald-50/40">
        <CardHeader className="pb-3 border-b border-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-indigo-700 text-white font-black text-[10px] uppercase">
                  Canonical EIP-712 Rescue Permit
                </Badge>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] border-indigo-300 text-indigo-900 bg-white"
                >
                  BorrowerOperationsSignatures · 0xD757…639e
                </Badge>
              </div>
              <CardTitle className="text-lg font-black text-[#231f20] mt-1.5 flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-indigo-700" />
                Zero-Custody Keeper Rescue Delegation (Mezo Testnet 31611)
              </CardTitle>
              <CardDescription className="text-xs text-[#231f20]/75 mt-0.5">
                Sign an official Mezo EIP-712{" "}
                <span className="font-mono font-bold">AddColl</span> or{" "}
                <span className="font-mono font-bold">RepayMUSD</span>{" "}
                typed-data permit. The Dedicated Guard Reserve Wallet supplies
                its own tBTC or MUSD on your behalf when triggered — it can
                never withdraw your collateral.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {snapshot?.eip712Delegation?.permitValid ? (
                <Badge className="bg-emerald-600 text-white font-black px-3 py-1">
                  ARMED · {snapshot.eip712Delegation.permitType} (
                  {snapshot.eip712Delegation.amountFormatted}{" "}
                  {snapshot.eip712Delegation.permitType === "ADD_COLL"
                    ? "tBTC"
                    : "MUSD"}
                  )
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-400 bg-amber-50 text-amber-900 font-black px-3 py-1"
                >
                  {snapshot?.eip712Delegation?.hasSignedPermit
                    ? "PERMIT INACTIVE / CONSUMED"
                    : "NOT SIGNED YET"}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Configure & Sign EIP-712 Permit */}
            <div className="lg:col-span-7 p-4 rounded-2xl bg-white border border-black/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-[#231f20]">
                  1 · Choose Canonical EIP-712 Method
                </span>
                <span className="text-[11px] font-mono font-bold text-indigo-800">
                  Live Nonce:{" "}
                  {liveSigNonceWei !== undefined
                    ? Number(liveSigNonceWei)
                    : snapshot?.eip712Delegation?.currentOnChainNonce ?? 0}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEip712PermitType("ADD_COLL");
                    if (
                      eip712AmountInput === "50" ||
                      Number(eip712AmountInput) >= 1
                    ) {
                      setEip712AmountInput("0.0005");
                    }
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${eip712PermitType === "ADD_COLL"
                    ? "bg-[#231f20] text-white border-[#231f20] shadow-sm"
                    : "bg-[#f8f5f0] text-[#231f20] border-black/10 hover:bg-[#efe9de]"
                    }`}
                >
                  <div className="text-xs font-black">AddColl (tBTC Top-Up)</div>
                  <div className="text-[10px] opacity-80">
                    Reserve adds exact tBTC collateral via addCollWithSignature
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEip712PermitType("REPAY_MUSD");
                    if (Number(eip712AmountInput) < 1) {
                      setEip712AmountInput("50");
                    }
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${eip712PermitType === "REPAY_MUSD"
                    ? "bg-[#231f20] text-white border-[#231f20] shadow-sm"
                    : "bg-[#f8f5f0] text-[#231f20] border-black/10 hover:bg-[#efe9de]"
                    }`}
                >
                  <div className="text-xs font-black">
                    RepayMUSD (Debt Burn)
                  </div>
                  <div className="text-[10px] opacity-80">
                    Reserve burns MUSD debt via repayMUSDWithSignature
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase text-muted-foreground">
                    Signed Rescue Amount (
                    {eip712PermitType === "ADD_COLL" ? "tBTC" : "MUSD"})
                  </label>
                  <input
                    type="text"
                    value={eip712AmountInput}
                    onChange={(e) => setEip712AmountInput(e.target.value)}
                    placeholder={
                      eip712PermitType === "ADD_COLL" ? "0.0005" : "50"
                    }
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-xs font-mono font-bold text-[#231f20]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase text-muted-foreground">
                    Signature Expiry Window
                  </label>
                  <div className="flex gap-1.5">
                    {[6, 24, 72].map((hrs) => (
                      <button
                        key={hrs}
                        type="button"
                        onClick={() => setEip712ValidityHours(hrs)}
                        className={`flex-1 py-2 rounded-xl border text-xs font-black ${eip712ValidityHours === hrs
                          ? "bg-indigo-700 text-white border-indigo-700"
                          : "bg-[#f8f5f0] text-[#231f20] border-black/10"
                          }`}
                      >
                        {hrs}h
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={Boolean(busyAction)}
                  onClick={handleSignEip712Permit}
                  className="rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-black text-xs px-4"
                >
                  <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                  {busyAction === "save_eip712_permit"
                    ? "Signing EIP-712 Permit..."
                    : isConnected
                      ? `Sign & Arm ${eip712PermitType === "ADD_COLL" ? "AddColl" : "RepayMUSD"} Permit`
                      : "Connect Wallet to Sign Permit"}
                </Button>

                {snapshot?.eip712Delegation?.hasSignedPermit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busyAction)}
                    onClick={() => runGuardAction("revoke_eip712_permit")}
                    className="rounded-xl border-red-300 text-red-800 hover:bg-red-50 font-black text-xs"
                  >
                    Revoke Permit
                  </Button>
                )}

                {snapshot?.eip712Delegation?.permitValid && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={Boolean(busyAction)}
                    onClick={() => runGuardAction("execute_eip712_rescue_now")}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4"
                  >
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    {busyAction === "execute_eip712_rescue_now"
                      ? "Relaying On-Chain..."
                      : "Relay Canonical Rescue Now"}
                  </Button>
                )}
              </div>
            </div>

            {/* Permit Status & Reserve Wallet Readiness */}
            <div className="lg:col-span-5 p-4 rounded-2xl bg-[#181520] text-white space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black uppercase text-[11px] text-indigo-300">
                  Permit &amp; Reserve Readiness
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Chain 31611
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-[11px] leading-relaxed text-slate-200">
                {snapshot?.eip712Delegation?.statusReason ||
                  "No borrower EIP-712 rescue permit signed yet."}
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Reserve Native tBTC</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {(snapshot?.reserveNativeBtc ?? 0).toFixed(6)} tBTC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reserve On-Chain MUSD</span>
                  <span className="font-mono font-bold text-amber-300">
                    {(snapshot?.reserveOnChainMusdBalance ?? 0).toFixed(2)} MUSD
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Monitored Trove Status</span>
                  <span className="font-mono font-bold">
                    {snapshot?.onChainTroveStatus === 1
                      ? "Active (#1)"
                      : `Inactive (${snapshot?.onChainTroveStatus ?? 0})`}
                  </span>
                </div>
                {snapshot?.eip712Delegation?.deadline ? (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Permit Deadline</span>
                    <span className="font-mono">
                      {new Date(
                        snapshot.eip712Delegation.deadline * 1000
                      ).toLocaleString()}
                    </span>
                  </div>
                ) : null}
              </div>

              {snapshot?.eip712Delegation?.lastSigTxHash && (
                <a
                  href={`https://explorer.test.mezo.org/tx/${snapshot.eip712Delegation.lastSigTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 hover:underline pt-1"
                >
                  Last Signature Rescue Tx{" "}
                  {shortenHex(snapshot.eip712Delegation.lastSigTxHash, 6)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
                label: "BorrowerOperationsSignatures (EIP-712 Rescue)",
                addr:
                  snapshot?.contracts.borrowerOperationsSignatures ||
                  "0xD757e3646AF370b15f32EB557F0F8380Df7D639e",
              },
              {
                label: "StabilityPool (MUSD Liquidation Yield)",
                addr:
                  snapshot?.contracts.stabilityPool ||
                  "0x1CCA7E410eE41739792eA0A24e00349Dd247680e",
              },
              {
                label: "MUSDSavingsRate (sMUSD Native Savings)",
                addr:
                  snapshot?.contracts.sMusdVault ||
                  "0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16",
              },
              {
                label: "Tigris VeBTC (Voting Escrow Locks)",
                addr:
                  snapshot?.contracts.veBtc ||
                  "0xB63fcCd03521Cf21907627bd7fA465C129479231",
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
                        className={`text-[10px] font-black ${log.actionType === "BORROW_MUSD"
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
