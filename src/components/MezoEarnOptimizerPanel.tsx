"use client";

import React, { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  Coins,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Vault,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ERC4626_VAULT_ABI,
  MEZO_EARN_ADDRESSES,
  MUSD_ERC20_ABI,
  SMUSD_SAVINGS_ABI,
  STABILITY_POOL_ABI,
  TIGRIS_GAUGE_ABI,
  TIGRIS_POOL_ABI,
  TIGRIS_ROUTER_ABI,
  extractEvmRevertReason,
  mezoTestnet,
} from "@/lib/mezo-chain";
import type {
  EarnPoolTelemetry,
  EarnVaultTelemetry,
  MezoEarnSnapshot,
} from "@/lib/mezo-earn";
import { shortenHex } from "@/lib/utils";

const EXPLORER = "https://explorer.test.mezo.org";

function fmtNum(v: number, decimals = 2): string {
  if (!Number.isFinite(v) || v === 0) return "0";
  if (Math.abs(v) < 0.0001) return v.toExponential(2);
  return v.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

interface SwapTokenOption {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
}

const SWAP_TOKENS: SwapTokenOption[] = [
  { symbol: "MUSD", address: MEZO_EARN_ADDRESSES.musdToken, decimals: 18 },
  { symbol: "MEZO", address: MEZO_EARN_ADDRESSES.mezoToken, decimals: 18 },
  { symbol: "BTC", address: MEZO_EARN_ADDRESSES.btcToken, decimals: 18 },
  { symbol: "stMEZO", address: MEZO_EARN_ADDRESSES.stMezoToken, decimals: 18 },
  { symbol: "mUSDC", address: MEZO_EARN_ADDRESSES.mUsdcToken, decimals: 6 },
];

export function MezoEarnOptimizerPanel({
  onVaultChanged,
  proMode = false,
  section = "all",
}: {
  onVaultChanged?: () => void;
  proMode?: boolean;
  section?: "all" | "vaults" | "pools";
}) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [snapshot, setSnapshot] = useState<MezoEarnSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>("");
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
    txHash?: string;
  } | null>(null);

  // Per-vault input map
  const [vaultAmounts, setVaultAmounts] = useState<Record<string, string>>({
    smusd: "10",
    upmusd: "10",
    "stability-pool": "10",
    upbtc: "0.0002",
    "morpho-musdc": "5",
    mblp: "10",
  });

  // Per-pool LP tokenA desired input map
  const [poolAmounts, setPoolAmounts] = useState<Record<string, string>>({
    "pool-musd-mezo": "5",
    "pool-musd-btc": "5",
    "pool-musd-musdc": "5",
    "pool-mezo-stmezo": "0.5",
    "pool-mcbbtc-btc": "0.0001",
  });

  // Live Tigris Swap widget
  const [swapFromSym, setSwapFromSym] = useState<string>("BTC");
  const [swapToSym, setSwapToSym] = useState<string>("MUSD");
  const [swapAmountIn, setSwapAmountIn] = useState<string>("0.0002");
  const [swapQuoteOut, setSwapQuoteOut] = useState<string>("");
  const [swapRoutes, setSwapRoutes] = useState<
    Array<{
      from: `0x${string}`;
      to: `0x${string}`;
      stable: boolean;
      factory: `0x${string}`;
    }>
  >([]);

  const fetchSnapshot = useCallback(async () => {
    try {
      const qs = address ? `?user=${encodeURIComponent(address)}` : "";
      const res = await fetch(`/api/earn-router${qs}`, { cache: "no-store" });
      const data = (await res.json()) as MezoEarnSnapshot;
      if (data?.ok) {
        setSnapshot(data);
      }
    } catch (err) {
      console.error("Failed to fetch Mezo Earn snapshot:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // Quote Tigris swap automatically when pair/amount changes
  useEffect(() => {
    const fromTok = SWAP_TOKENS.find((t) => t.symbol === swapFromSym);
    const toTok = SWAP_TOKENS.find((t) => t.symbol === swapToSym);
    if (
      !fromTok ||
      !toTok ||
      fromTok.symbol === toTok.symbol ||
      Number(swapAmountIn || "0") <= 0
    ) {
      setSwapQuoteOut("");
      setSwapRoutes([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const isStablePair =
          (fromTok.symbol === "MUSD" && toTok.symbol === "mUSDC") ||
          (fromTok.symbol === "mUSDC" && toTok.symbol === "MUSD");
        const needsMusdHop =
          fromTok.symbol !== "MUSD" &&
          toTok.symbol !== "MUSD" &&
          !(
            (fromTok.symbol === "MEZO" && toTok.symbol === "stMEZO") ||
            (fromTok.symbol === "stMEZO" && toTok.symbol === "MEZO")
          );
        const res = await fetch("/api/earn-router", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "quote-swap",
            fromToken: fromTok.address,
            toToken: toTok.address,
            stable: isStablePair,
            viaMusdHop: needsMusdHop,
            amountIn: swapAmountIn,
            decimalsIn: fromTok.decimals,
            decimalsOut: toTok.decimals,
          }),
        });
        const json = await res.json();
        if (json.ok) {
          setSwapQuoteOut(json.amountOut || "");
          setSwapRoutes(json.routes || []);
        } else {
          setSwapQuoteOut("");
        }
      } catch {
        setSwapQuoteOut("");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [swapFromSym, swapToSym, swapAmountIn]);

  const ensureMezoChain = async () => {
    if (!isConnected || !address) {
      throw new Error("Connect your wallet on Mezo Testnet (31611) first.");
    }
    if (chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
  };

  const approveIfNeeded = async (
    tokenAddr: `0x${string}`,
    spender: `0x${string}`,
    neededWei: bigint
  ) => {
    if (!publicClient || !address) return;
    const current = (await publicClient.readContract({
      address: tokenAddr,
      abi: MUSD_ERC20_ABI,
      functionName: "allowance",
      args: [address, spender],
    })) as bigint;

    if (current >= neededWei) return;
    setNotice({
      type: "info",
      text: "Approving exact token amount on Mezo Testnet...",
    });
    const appHash = await writeContractAsync({
      address: tokenAddr,
      abi: MUSD_ERC20_ABI,
      functionName: "approve",
      args: [spender, neededWei],
      chainId: mezoTestnet.id,
    });
    await publicClient.waitForTransactionReceipt({ hash: appHash });
  };

  const handleAgentAutonomousEarn = async (venueId?: string) => {
    const key = `agent-${venueId || "auto"}`;
    setBusyKey(key);
    setNotice({
      type: "info",
      text: "AI Agent Operator is evaluating BTC regime & executing on-chain Earn allocation...",
    });
    try {
      const res = await fetch("/api/earn-router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute-ai-rotation",
          userAddress: address,
          venueId,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Agent Earn execution failed");
      }
      if (json.snapshot?.ok) {
        setSnapshot(json.snapshot);
      } else {
        await fetchSnapshot();
      }
      onVaultChanged?.();
      setNotice({
        type: "success",
        text: json.execution?.detail || "Autonomous Earn allocation confirmed on Mezo 31611!",
        txHash: json.execution?.primaryTxHash,
      });
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyKey("");
    }
  };

  const handleWalletSwap = async () => {
    setBusyKey("wallet-swap");
    setNotice(null);
    try {
      await ensureMezoChain();
      if (!publicClient || !address) throw new Error("Wallet not connected");
      const fromTok = SWAP_TOKENS.find((t) => t.symbol === swapFromSym);
      const toTok = SWAP_TOKENS.find((t) => t.symbol === swapToSym);
      if (!fromTok || !toTok || swapRoutes.length === 0) {
        throw new Error("Select a valid token pair and amount.");
      }
      const amtInWei = parseUnits(swapAmountIn || "0", fromTok.decimals);
      const estOutWei = parseUnits(swapQuoteOut || "0", toTok.decimals);
      if (amtInWei <= 0n || estOutWei <= 0n) {
        throw new Error("Quote unavailable for this amount.");
      }

      await approveIfNeeded(
        fromTok.address,
        MEZO_EARN_ADDRESSES.tigrisRouter,
        amtInWei
      );

      const minOut = (estOutWei * 94n) / 100n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      setNotice({
        type: "info",
        text: `Confirm Tigris swap (${swapAmountIn} ${swapFromSym} -> ${swapToSym})...`,
      });
      const txHash = await writeContractAsync({
        address: MEZO_EARN_ADDRESSES.tigrisRouter,
        abi: TIGRIS_ROUTER_ABI,
        functionName: "swapExactTokensForTokens",
        args: [amtInWei, minOut, swapRoutes, address, deadline],
        chainId: mezoTestnet.id,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await fetchSnapshot();
      onVaultChanged?.();
      setNotice({
        type: "success",
        text: `Swapped ${swapAmountIn} ${swapFromSym} -> ${fmtNum(Number(formatUnits(estOutWei, toTok.decimals)), 4)} ${swapToSym} on Tigris!`,
        txHash,
      });
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyKey("");
    }
  };

  const handleVaultDeposit = async (vault: EarnVaultTelemetry) => {
    setBusyKey(`vault-dep-${vault.id}`);
    setNotice(null);
    try {
      await ensureMezoChain();
      if (!publicClient || !address) throw new Error("Wallet not connected");
      const rawAmt = vaultAmounts[vault.id] || "0";
      const dec = vault.assetSymbol === "mUSDC" ? 6 : 18;
      const amtWei = parseUnits(rawAmt, dec);
      if (amtWei <= 0n) throw new Error("Enter a positive amount to deposit.");

      let txHash: `0x${string}`;
      if (vault.interactionType === "SMUSD") {
        await approveIfNeeded(vault.assetAddress, vault.contractAddress, amtWei);
        txHash = await writeContractAsync({
          address: vault.contractAddress,
          abi: SMUSD_SAVINGS_ABI,
          functionName: "deposit",
          args: [amtWei],
          chainId: mezoTestnet.id,
        });
      } else if (vault.interactionType === "STABILITY_POOL") {
        txHash = await writeContractAsync({
          address: vault.contractAddress,
          abi: STABILITY_POOL_ABI,
          functionName: "provideToSP",
          args: [amtWei],
          chainId: mezoTestnet.id,
        });
      } else if (vault.interactionType === "ERC4626") {
        await approveIfNeeded(vault.assetAddress, vault.contractAddress, amtWei);
        txHash = await writeContractAsync({
          address: vault.contractAddress,
          abi: ERC4626_VAULT_ABI,
          functionName: "deposit",
          args: [amtWei, address],
          chainId: mezoTestnet.id,
        });
      } else {
        throw new Error(
          "Use the Tigris vAMM-MUSD/BTC Pool card below to supply dual MUSD + BTC LP."
        );
      }

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await fetchSnapshot();
      onVaultChanged?.();
      setNotice({
        type: "success",
        text: `Deposited ${rawAmt} ${vault.assetSymbol} into ${vault.symbol}!`,
        txHash,
      });
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyKey("");
    }
  };

  const handleVaultWithdraw = async (vault: EarnVaultTelemetry) => {
    setBusyKey(`vault-wd-${vault.id}`);
    setNotice(null);
    try {
      await ensureMezoChain();
      if (!publicClient || !address) throw new Error("Wallet not connected");
      const rawAmt = vaultAmounts[vault.id] || "0";
      const dec = vault.assetSymbol === "mUSDC" ? 6 : 18;
      const amtWei = parseUnits(rawAmt, dec);
      if (amtWei <= 0n) throw new Error("Enter a positive amount to withdraw.");

      let txHash: `0x${string}`;
      if (vault.interactionType === "SMUSD") {
        txHash = await writeContractAsync({
          address: vault.contractAddress,
          abi: SMUSD_SAVINGS_ABI,
          functionName: "withdraw",
          args: [amtWei],
          chainId: mezoTestnet.id,
        });
      } else if (vault.interactionType === "STABILITY_POOL") {
        txHash = await writeContractAsync({
          address: vault.contractAddress,
          abi: STABILITY_POOL_ABI,
          functionName: "withdrawFromSP",
          args: [amtWei],
          chainId: mezoTestnet.id,
        });
      } else if (vault.id === "morpho-musdc") {
        txHash = await writeContractAsync({
          address: vault.contractAddress,
          abi: ERC4626_VAULT_ABI,
          functionName: "withdraw",
          args: [amtWei, address, address],
          chainId: mezoTestnet.id,
        });
      } else {
        throw new Error(`${vault.symbol} redemptions follow vault epoch settlement.`);
      }

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await fetchSnapshot();
      onVaultChanged?.();
      setNotice({
        type: "success",
        text: `Withdrew ${rawAmt} from ${vault.symbol}!`,
        txHash,
      });
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyKey("");
    }
  };

  const handlePoolAddLiquidity = async (pool: EarnPoolTelemetry) => {
    setBusyKey(`pool-add-${pool.id}`);
    setNotice(null);
    try {
      await ensureMezoChain();
      if (!publicClient || !address) throw new Error("Wallet not connected");
      const amtAInput = poolAmounts[pool.id] || "5";
      const amtADesired = Number(amtAInput);
      if (amtADesired <= 0 || pool.spotPriceToken1PerToken0 <= 0) {
        throw new Error("Enter a positive Token A deposit amount.");
      }

      const estB = amtADesired * pool.spotPriceToken1PerToken0 * 1.04;
      const desiredAWei = parseUnits(amtADesired.toFixed(6), pool.token0Decimals);
      const desiredBWei = parseUnits(
        estB.toFixed(pool.token1Decimals === 6 ? 6 : 8),
        pool.token1Decimals
      );

      const qRes = await fetch("/api/earn-router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quote-lp",
          tokenA: pool.token0Address,
          tokenB: pool.token1Address,
          stable: pool.stable,
          amountADesiredWei: desiredAWei.toString(),
          amountBDesiredWei: desiredBWei.toString(),
        }),
      });
      const qJson = await qRes.json();
      if (!qJson.ok) throw new Error(qJson.error || "Failed to quote LP ratio");

      const exactAWei = BigInt(qJson.amountAWei);
      const exactBWei = BigInt(qJson.amountBWei);
      await approveIfNeeded(
        pool.token0Address,
        MEZO_EARN_ADDRESSES.tigrisRouter,
        exactAWei
      );
      await approveIfNeeded(
        pool.token1Address,
        MEZO_EARN_ADDRESSES.tigrisRouter,
        exactBWei
      );

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      setNotice({
        type: "info",
        text: `Adding ${formatUnits(exactAWei, pool.token0Decimals)} ${pool.token0Symbol} + ${Number(formatUnits(exactBWei, pool.token1Decimals)).toFixed(4)} ${pool.token1Symbol} to ${pool.symbol}...`,
      });
      const txHash = await writeContractAsync({
        address: MEZO_EARN_ADDRESSES.tigrisRouter,
        abi: TIGRIS_ROUTER_ABI,
        functionName: "addLiquidity",
        args: [
          pool.token0Address,
          pool.token1Address,
          pool.stable,
          exactAWei,
          exactBWei,
          (exactAWei * 94n) / 100n,
          (exactBWei * 94n) / 100n,
          address,
          deadline,
        ],
        chainId: mezoTestnet.id,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await fetchSnapshot();
      onVaultChanged?.();
      setNotice({
        type: "success",
        text: `Added liquidity into ${pool.symbol} on Tigris!`,
        txHash,
      });
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyKey("");
    }
  };

  const handleGaugeStake = async (pool: EarnPoolTelemetry) => {
    if (!pool.gaugeAddress) return;
    setBusyKey(`pool-stake-${pool.id}`);
    setNotice(null);
    try {
      await ensureMezoChain();
      if (!publicClient || !address) throw new Error("Wallet not connected");
      const lpBal = (await publicClient.readContract({
        address: pool.poolAddress,
        abi: TIGRIS_POOL_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      if (lpBal <= 0n) {
        throw new Error(`Add ${pool.symbol} liquidity first to get LP tokens.`);
      }
      await approveIfNeeded(pool.poolAddress, pool.gaugeAddress, lpBal);
      const txHash = await writeContractAsync({
        address: pool.gaugeAddress,
        abi: TIGRIS_GAUGE_ABI,
        functionName: "deposit",
        args: [lpBal],
        chainId: mezoTestnet.id,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await fetchSnapshot();
      setNotice({
        type: "success",
        text: `Staked ${pool.symbol} LP into VeBTC Gauge to earn BTC rewards!`,
        txHash,
      });
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyKey("");
    }
  };

  if (loading && !snapshot) {
    return (
      <Card className="bg-white/95 border-white shadow-sm">
        <CardContent className="p-8 flex items-center justify-center gap-2 text-xs font-bold text-stone-600">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          Scanning live Mezo Testnet Earn Vaults & Tigris Pools (Chain 31611)...
        </CardContent>
      </Card>
    );
  }

  const rec = snapshot?.recommendation;
  const opBal = snapshot?.operatorBalances;
  const uBal = snapshot?.userBalances;

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`rounded-2xl border-2 px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 ${
            notice.type === "error"
              ? "bg-rose-50 border-rose-300 text-rose-900"
              : notice.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                : "bg-indigo-50 border-indigo-300 text-indigo-950"
          }`}
        >
          <span className="flex items-center gap-2">
            {notice.type === "error" ? (
              <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            )}
            {notice.text}
          </span>
          {notice.txHash && (
            <a
              href={`${EXPLORER}/tx/${notice.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono underline shrink-0"
            >
              {shortenHex(notice.txHash, 5)} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* 1. AI Yield Advisor Card (Shown on Vaults & All views) */}
      {(section === "all" || section === "vaults") && (
        <Card className="border-2 border-indigo-200 bg-gradient-to-br from-white via-indigo-50/40 to-emerald-50/50 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-600 to-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-black text-stone-900">
                      {proMode ? "Autonomous Multi-Venue Mezo Earn Router" : "AI Yield Recommendation"}
                    </CardTitle>
                    <Badge
                      variant={rec?.btcLowTriggerActive ? "destructive" : "emerald"}
                      className="text-[10px]"
                    >
                      {rec?.regime.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {proMode
                      ? "When BTC dips or weakens, Optimus Prime & Bumblebee automatically rotate idle MUSD and MEZO into canonical Earn Vaults & Tigris Pools."
                      : "Monitors Bitcoin prices live and highlights the safest place to earn MUSD yield right now."}
                  </CardDescription>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={fetchSnapshot}
                className="rounded-xl text-xs font-extrabold"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Live Telemetry Row */}
            <div className={`grid grid-cols-2 ${proMode ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-2.5`}>
              <div className="rounded-2xl bg-white/95 border border-stone-200 p-3">
                <div className="text-[10px] font-bold uppercase text-stone-500">
                  Bitcoin Price (24h)
                </div>
                <div className="text-sm font-black text-stone-900 flex items-center gap-1.5 mt-0.5">
                  ${fmtNum(snapshot?.btcPriceUsd ?? 0, 0)}
                  <span
                    className={`text-[11px] font-extrabold inline-flex items-center ${
                      (snapshot?.btc24hChangePct ?? 0) >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {(snapshot?.btc24hChangePct ?? 0) >= 0 ? (
                      <TrendingUp className="h-3 w-3 mr-0.5" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-0.5" />
                    )}
                    {(snapshot?.btc24hChangePct ?? 0) >= 0 ? "+" : ""}
                    {(snapshot?.btc24hChangePct ?? 0).toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="rounded-2xl bg-white/95 border border-stone-200 p-3">
                <div className="text-[10px] font-bold uppercase text-stone-500">
                  MEZO Token Price
                </div>
                <div className="text-sm font-black text-indigo-700 mt-0.5">
                  ${fmtNum(snapshot?.mezoSpotUsd ?? 0, 2)}{" "}
                  <span className="text-[10px] font-bold text-stone-500">MUSD</span>
                </div>
              </div>

              <div className="rounded-2xl bg-white/95 border border-stone-200 p-3">
                <div className="text-[10px] font-bold uppercase text-stone-500">
                  Market Mood
                </div>
                <div className="text-sm font-black text-stone-900 mt-0.5">
                  {snapshot?.fearGreedLabel} ({snapshot?.fearGreedIndex ?? 50}/100)
                </div>
              </div>

              {proMode && (
                <div className="rounded-2xl bg-white/95 border border-stone-200 p-3">
                  <div className="text-[10px] font-bold uppercase text-stone-500">
                    Operator Wallet
                  </div>
                  <div className="text-[11px] font-black text-emerald-800 mt-0.5 leading-tight">
                    {fmtNum(opBal?.btc ?? 0, 4)} BTC • {fmtNum(opBal?.musd ?? 0, 2)} MUSD •{" "}
                    {fmtNum(opBal?.mezo ?? 0, 2)} MEZO
                  </div>
                </div>
              )}
            </div>

            {rec && (
              <div className="rounded-2xl bg-white/95 border border-indigo-200 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    {rec.headline}
                  </div>
                  {proMode && (
                    <Badge variant="outline" className="text-[10px] font-black">
                      Risk: {snapshot?.riskMode}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  {rec.rationale}
                </p>

                {proMode && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
                    <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-2.5">
                      <div className="font-black text-emerald-950 mb-1">
                        AI MUSD Allocation Target
                      </div>
                      <div className="flex flex-wrap gap-1.5 font-extrabold">
                        <Badge variant="secondary">sMUSD {rec.musdAllocationPct.sMusd}%</Badge>
                        <Badge variant="secondary">upMUSD {rec.musdAllocationPct.upMusd}%</Badge>
                        <Badge variant="secondary">
                          StabilityPool {rec.musdAllocationPct.stabilityPool}%
                        </Badge>
                        <Badge variant="secondary">
                          Tigris LP {rec.musdAllocationPct.tigrisPools}%
                        </Badge>
                      </div>
                    </div>
                    <div className="rounded-xl bg-indigo-50/70 border border-indigo-200 p-2.5">
                      <div className="font-black text-indigo-950 mb-1">
                        AI MEZO Allocation Target
                      </div>
                      <div className="flex flex-wrap gap-1.5 font-extrabold">
                        <Badge variant="secondary">
                          vAMM-MUSD/MEZO {rec.mezoAllocationPct.musdMezoLp}%
                        </Badge>
                        <Badge variant="secondary">
                          vAMM-MEZO/stMEZO {rec.mezoAllocationPct.mezoStMezoLp}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    disabled={busyKey !== ""}
                    onClick={() => handleAgentAutonomousEarn()}
                    className="bg-gradient-to-r from-indigo-600 to-emerald-600 hover:opacity-95 text-white text-xs font-black rounded-xl"
                  >
                    {busyKey === "agent-auto" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    {proMode ? "Execute AI Optimal Rotation (On-Chain)" : "Run AI Recommended Yield"}
                  </Button>

                  {proMode &&
                    [
                      { id: "smusd", label: "Agent -> sMUSD" },
                      { id: "upmusd", label: "Agent -> upMUSD" },
                      { id: "stability-pool", label: "Agent -> StabilityPool" },
                      { id: "pool-musd-mezo", label: "Agent -> MUSD/MEZO LP" },
                      { id: "pool-musd-btc", label: "Agent -> MUSD/BTC LP + Gauge" },
                    ].map((btn) => (
                      <Button
                        key={btn.id}
                        size="sm"
                        variant="outline"
                        disabled={busyKey !== ""}
                        onClick={() => handleAgentAutonomousEarn(btn.id)}
                        className="rounded-xl text-[11px] font-bold"
                      >
                        {busyKey === `agent-${btn.id}` && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {btn.label}
                      </Button>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2. Connected Wallet Balances & Instant Swap (Pools / All view) */}
      {(section === "all" || section === "pools") && (
        <Card className="bg-white/95 border-white shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-black flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-indigo-600" />
                  Instant Token Swap (BTC &harr; MUSD &harr; MEZO)
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {proMode ? (
                    <>
                      Convert wallet tokens via canonical Router{" "}
                      <a
                        href={`${EXPLORER}/address/${MEZO_EARN_ADDRESSES.tigrisRouter}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono underline"
                      >
                        {shortenHex(MEZO_EARN_ADDRESSES.tigrisRouter, 5)}
                      </a>{" "}
                      before entering Earn Vaults or Tigris LP Pools.
                    </>
                  ) : (
                    "Quickly swap between BTC, MUSD, and MEZO using Mezo's built-in decentralized exchange."
                  )}
                </CardDescription>
              </div>
              {uBal && (
                <div className="text-[11px] font-bold text-stone-700 bg-stone-100 rounded-xl px-3 py-1.5 flex flex-wrap gap-2.5">
                  <span className="inline-flex items-center gap-1">
                    <Wallet className="h-3 w-3 text-emerald-600" />
                    {fmtNum(uBal.btc, 4)} BTC
                  </span>
                  <span>{fmtNum(uBal.musd, 2)} MUSD</span>
                  <span>{fmtNum(uBal.mezo, 3)} MEZO</span>
                  {proMode && <span>{fmtNum(uBal.mUsdc, 2)} mUSDC</span>}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
              <div className="md:col-span-3 flex gap-1.5">
                <select
                  value={swapFromSym}
                  onChange={(e) => setSwapFromSym(e.target.value)}
                  className="h-9 rounded-xl border border-stone-300 bg-white px-2 text-xs font-black"
                >
                  {SWAP_TOKENS.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  value={swapAmountIn}
                  onChange={(e) => setSwapAmountIn(e.target.value)}
                  className="w-full h-9 rounded-xl border border-stone-300 px-2.5 text-xs font-bold"
                />
              </div>

              <div className="md:col-span-1 flex justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const prev = swapFromSym;
                    setSwapFromSym(swapToSym);
                    setSwapToSym(prev);
                  }}
                  className="rounded-full h-8 w-8 p-0"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="md:col-span-4 flex gap-1.5">
                <select
                  value={swapToSym}
                  onChange={(e) => setSwapToSym(e.target.value)}
                  className="h-9 rounded-xl border border-stone-300 bg-white px-2 text-xs font-black"
                >
                  {SWAP_TOKENS.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
                <div className="flex-1 h-9 rounded-xl border border-stone-200 bg-stone-50 px-3 flex items-center text-xs font-black text-emerald-800">
                  {swapQuoteOut ? `~${fmtNum(Number(swapQuoteOut), 5)} ${swapToSym}` : "Quoting..."}
                </div>
              </div>

              <div className="md:col-span-4">
                <Button
                  size="sm"
                  disabled={busyKey !== "" || !swapQuoteOut}
                  onClick={handleWalletSwap}
                  className="w-full h-9 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black rounded-xl"
                >
                  {busyKey === "wallet-swap" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  )}
                  Swap Tokens Now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Canonical Mezo Earn Vaults (/earn/vaults) */}
      {(section === "all" || section === "vaults") && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-stone-900 flex items-center gap-2">
              <Vault className="h-4 w-4 text-emerald-600" />
              {proMode
                ? "Mezo Testnet Earn Vaults (`sMUSD`, `upMUSD`, `StabilityPool`, `upBTC`, `Morpho`, `mbLP`)"
                : "Single-Asset Earn Vaults (Deposit & Earn Yield)"}
            </h3>
            {proMode && (
              <a
                href="https://testnet.mezo.org/earn/vaults"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-extrabold text-indigo-700 hover:underline inline-flex items-center gap-1"
              >
                testnet.mezo.org/earn/vaults <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(snapshot?.vaults || []).map((vault) => {
              const isRecommended = rec?.primaryVaultId === vault.id;
              return (
                <Card
                  key={vault.id}
                  className={`bg-white/95 shadow-sm transition-all ${
                    isRecommended
                      ? "border-2 border-emerald-400 ring-2 ring-emerald-100"
                      : "border border-stone-200"
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant={
                          vault.riskTier === "CONSERVATIVE"
                            ? "emerald"
                            : vault.riskTier === "BALANCED"
                              ? "secondary"
                              : "outline"
                        }
                        className="text-[10px]"
                      >
                        {vault.symbol} • {vault.riskTier === "CONSERVATIVE" ? "Low Risk" : vault.riskTier === "BALANCED" ? "Balanced" : vault.riskTier}
                      </Badge>
                      {proMode && (
                        <a
                          href={`${EXPLORER}/address/${vault.contractAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-mono text-stone-500 hover:underline inline-flex items-center gap-0.5"
                        >
                          {shortenHex(vault.contractAddress, 4)}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                    <CardTitle className="text-sm font-black mt-1 flex items-center justify-between">
                      <span>{vault.name}</span>
                      {isRecommended && (
                        <span className="text-[9px] font-black uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                          Top Pick
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      {vault.yieldAngle}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-50 border border-stone-200 p-2.5">
                      <div>
                        <div className="text-[10px] text-stone-500 font-bold">Total Deposited</div>
                        <div className="font-black text-stone-900">
                          ${fmtNum(vault.tvlUsd, 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-stone-500 font-bold">
                          {proMode ? "Your / Agent Pos" : "Your Balance"}
                        </div>
                        <div className="font-black text-emerald-700">
                          {proMode
                            ? `${fmtNum(vault.userBalance, 3)} / ${fmtNum(vault.operatorBalance, 2)}`
                            : `${fmtNum(vault.userBalance, 3)} ${vault.assetSymbol}`}
                        </div>
                      </div>
                    </div>

                    {proMode && (
                      <div className="text-[10.5px] text-indigo-950 bg-indigo-50/60 border border-indigo-100 rounded-xl p-2 leading-snug">
                        <strong>When BTC is Low:</strong> {vault.btcLowRole}
                      </div>
                    )}

                    {vault.interactionType !== "MBLP" ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="any"
                          value={vaultAmounts[vault.id] || ""}
                          onChange={(e) =>
                            setVaultAmounts((prev) => ({
                              ...prev,
                              [vault.id]: e.target.value,
                            }))
                          }
                          className="w-24 h-8 rounded-xl border border-stone-300 px-2 text-xs font-bold"
                        />
                        <Button
                          size="sm"
                          disabled={busyKey !== ""}
                          onClick={() => handleVaultDeposit(vault)}
                          className="flex-1 h-8 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-black rounded-xl"
                        >
                          {busyKey === `vault-dep-${vault.id}` && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          Deposit {vault.assetSymbol}
                        </Button>
                        {vault.supportsWithdraw && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyKey !== "" || vault.userBalance <= 0}
                            onClick={() => handleVaultWithdraw(vault)}
                            className="h-8 text-[11px] font-bold rounded-xl"
                          >
                            Withdraw
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10.5px] font-bold text-stone-500">
                        Available inside the Liquidity Pools tab.
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Canonical Tigris Earn Pools (/earn/pools) */}
      {(section === "all" || section === "pools") && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-stone-900 flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              {proMode
                ? "Tigris AMM Earn Pools (`vAMM-MUSD/MEZO`, `vAMM-MUSD/BTC`, `sAMM-MUSD/mUSDC`, `MEZO/stMEZO`)"
                : "Liquidity Pools (Pair Two Tokens & Earn Trading Fees)"}
            </h3>
            {proMode && (
              <a
                href="https://testnet.mezo.org/earn/pools"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-extrabold text-indigo-700 hover:underline inline-flex items-center gap-1"
              >
                testnet.mezo.org/earn/pools <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(snapshot?.pools || []).map((pool) => {
              const isRec = rec?.primaryPoolId === pool.id;
              return (
                <Card
                  key={pool.id}
                  className={`bg-white/95 shadow-sm ${
                    isRec
                      ? "border-2 border-indigo-400 ring-2 ring-indigo-100"
                      : "border border-stone-200"
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {pool.stable ? "Stable Pool" : "Volatile Pool"}
                        </Badge>
                        {pool.gaugeAddress && (
                          <Badge variant="emerald" className="text-[10px]">
                            {proMode ? `VeBTC Gauge (${pool.voterWeight.toFixed(2)}w)` : "Earns BTC Rewards"}
                          </Badge>
                        )}
                      </div>
                      {proMode && (
                        <a
                          href={`${EXPLORER}/address/${pool.poolAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-mono text-stone-500 hover:underline inline-flex items-center gap-0.5"
                        >
                          {shortenHex(pool.poolAddress, 4)}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                    <CardTitle className="text-sm font-black mt-1 flex items-center justify-between">
                      <span>{pool.symbol}</span>
                      <span className="text-xs font-extrabold text-emerald-700">
                        TVL ~${fmtNum(pool.tvlUsd, 0)}
                      </span>
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                      {pool.yieldAngle}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs">
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-stone-50 border border-stone-200 p-2.5 text-[11px]">
                      <div>
                        <div className="text-[10px] text-stone-500 font-bold">
                          Pool Size
                        </div>
                        <div className="font-black text-stone-900">
                          {fmtNum(pool.reserve0, 1)} {pool.token0Symbol}
                          <div className="text-[10px] text-stone-600">
                            + {fmtNum(pool.reserve1, 3)} {pool.token1Symbol}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-stone-500 font-bold">
                          Rewards
                        </div>
                        <div className="font-black text-indigo-800">
                          {pool.rewardTokenSymbol}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-stone-500 font-bold">
                          Your LP / Staked
                        </div>
                        <div className="font-black text-emerald-700">
                          {fmtNum(pool.userLpBalance, 3)} / {fmtNum(pool.userGaugeStakedBalance, 3)}
                        </div>
                      </div>
                    </div>

                    {proMode && (
                      <div className="text-[10.5px] text-stone-700 bg-amber-50/60 border border-amber-200/80 rounded-xl p-2 leading-snug">
                        <strong>AI Strategy Fit:</strong> {pool.btcLowRole}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          value={poolAmounts[pool.id] || ""}
                          onChange={(e) =>
                            setPoolAmounts((prev) => ({
                              ...prev,
                              [pool.id]: e.target.value,
                            }))
                          }
                          className="w-20 h-8 rounded-xl border border-stone-300 px-2 text-xs font-bold"
                        />
                        <span className="text-[10px] font-black text-stone-600">
                          {pool.token0Symbol}
                        </span>
                      </div>

                      <Button
                        size="sm"
                        disabled={busyKey !== ""}
                        onClick={() => handlePoolAddLiquidity(pool)}
                        className="flex-1 h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black rounded-xl"
                      >
                        {busyKey === `pool-add-${pool.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Coins className="h-3 w-3" />
                        )}
                        Add {pool.token0Symbol}/{pool.token1Symbol}
                      </Button>

                      {pool.gaugeAddress && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyKey !== "" || pool.userLpBalance <= 0}
                          onClick={() => handleGaugeStake(pool)}
                          className="h-8 text-[11px] font-extrabold rounded-xl border-emerald-300 text-emerald-900"
                        >
                          {busyKey === `pool-stake-${pool.id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-3 w-3" />
                          )}
                          Earn BTC Rewards
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
