"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { keccak256, toBytes } from "viem";
import {
  Activity,
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  Gavel,
  Loader2,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wrench,
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
  AGENT_REGISTRY_ABI,
  DCA_ENGINE_ABI,
  DEFAULT_CONTRACT_ADDRESSES,
  extractEvmRevertReason,
  mezoTestnet,
} from "@/lib/mezo-chain";
import { ISLAND_CREDIT_COUNCIL_ABI } from "@/lib/island-contracts";
import type {
  AnchoredDebateRecord,
  ArenaAgentProfile,
  DcaKeeperOpportunity,
  LoanKeeperOpportunity,
} from "@/app/api/debate-keeper/route";

interface DebateKeeperApiResponse {
  ok: boolean;
  error?: string;
  contracts: {
    agentRegistry: string;
    policyVault: string;
    dcaEngine: string;
    mainMusdVault?: string;
    islandFactory?: string;
    islandCreditCouncil?: string;
  };
  market: {
    btcPriceUsd: number;
    btc24hChangePct: number;
    fearGreedIndex: number;
    fearGreedLabel: string;
    volatilityRegime: string;
    trendDirection: string;
    systemTcrPct: number;
    recoveryMode: boolean;
  };
  vaultSummary: {
    policyEquityBtc: number;
    maxSingleTradeBps: number;
    maxDailyDrawdownBps: number;
    minConfidenceBps: number;
    cooldownSeconds: number;
    cooldownRemainingSec: number;
    emergencyLock: boolean;
    mainTotalAssetsMusd: number;
    mainLiquidMusd: number;
    mainPrincipalMusd: number;
  };
  agents: ArenaAgentProfile[];
  debates: AnchoredDebateRecord[];
  totalDebates: number;
  dcaBounties: DcaKeeperOpportunity[];
  loanBounties: LoanKeeperOpportunity[];
  userTrove: {
    connected: boolean;
    address: string;
    troveActive: boolean;
    icrPct: number;
  };
}

interface DebateDraft {
  marketTicker: string;
  thesis: string;
  bullAgentId: number;
  bearAgentId: number;
  factCheckerId: number;
  councilYesBps: number;
  marketYesBps: number;
  divergenceBps: number;
  bullArgument: string;
  bearArgument: string;
  factCheckVerdict: string;
  transcriptHash: `0x${string}`;
  provider: string;
}

interface DebateKeeperArenaPanelProps {
  onNavigateTab?: (
    tab:
      | "island"
      | "leaderboard"
      | "crew"
      | "arena"
      | "dca"
      | "musd-vault"
      | "lending"
      | "contracts"
      | "docs"
  ) => void;
}

const EXPLORER_TX_BASE = "https://explorer.test.mezo.org/tx/";
const EXPLORER_ADDR_BASE = "https://explorer.test.mezo.org/address/";

const MARKET_PRESETS = [
  {
    ticker: "BTC/USD",
    prompt: "Evaluate BTC breakout momentum vs Mezo TCR safety floor",
  },
  {
    ticker: "MUSD/PEG",
    prompt: "Assess MUSD liquidity pool utilization and borrowing carry spread",
  },
  {
    ticker: "MEZO/TCR",
    prompt: "Debate Recovery Mode proximity and Trove collateral buffer sizing",
  },
  {
    ticker: "ISLAND/CREDIT",
    prompt: "Evaluate Sub-Island Proof-of-Profit expansion and default buffer",
  },
];

function fmtNum(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function shortHex(hex: string, chars = 6): string {
  if (!hex || hex.length <= chars * 2 + 2) return hex || "";
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

function fmtRelativeTime(secRemaining: number): string {
  if (secRemaining <= 0) return "Ready now";
  const d = Math.floor(secRemaining / 86400);
  const h = Math.floor((secRemaining % 86400) / 3600);
  const m = Math.floor((secRemaining % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${secRemaining % 60}s`;
  return `${secRemaining}s`;
}

export function DebateKeeperArenaPanel({
  onNavigateTab,
}: DebateKeeperArenaPanelProps) {
  const { address, chainId, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { writeContractAsync } = useWriteContract();

  const [subTab, setSubTab] = useState<"debate" | "keepers">("debate");
  const [proMode, setProMode] = useState(false);
  const [data, setData] = useState<DebateKeeperApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>("");
  const [copiedHash, setCopiedHash] = useState<string>("");
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
    txHash?: string;
  } | null>(null);

  // Debate composer state
  const [marketTicker, setMarketTicker] = useState("BTC/USD");
  const [customPrompt, setCustomPrompt] = useState(
    "Evaluate BTC breakout momentum vs Mezo TCR safety floor"
  );
  const [bullAgentId, setBullAgentId] = useState(2);
  const [bearAgentId, setBearAgentId] = useState(4);
  const [factCheckerId, setFactCheckerId] = useState(5);
  const [draft, setDraft] = useState<DebateDraft | null>(null);

  const fetchArenaState = useCallback(async () => {
    setLoading(true);
    try {
      const qs = address ? `?user=${address}` : "";
      const res = await fetch(`/api/debate-keeper${qs}`, { cache: "no-store" });
      const json = (await res.json()) as DebateKeeperApiResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load Debate & Keeper state");
      }
      setData(json);
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchArenaState();
  }, [fetchArenaState]);

  const ensureMezoWallet = useCallback(async (): Promise<`0x${string}`> => {
    if (!isConnected || !address) {
      openConnectModal?.();
      throw new Error("Connect your wallet to sign on Mezo Testnet (31611).");
    }
    if (chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
    if (!publicClient) {
      throw new Error("Mezo Testnet RPC client unavailable.");
    }
    return address;
  }, [
    address,
    chainId,
    isConnected,
    openConnectModal,
    publicClient,
    switchChainAsync,
  ]);

  const agents = useMemo(() => data?.agents ?? [], [data]);
  const debates = useMemo(() => data?.debates ?? [], [data]);
  const dcaBounties = useMemo(() => data?.dcaBounties ?? [], [data]);
  const loanBounties = useMemo(() => data?.loanBounties ?? [], [data]);

  const topAgent = useMemo(() => {
    if (agents.length === 0) return null;
    return [...agents].sort(
      (a, b) =>
        b.reputationBps - a.reputationBps || b.totalActions - a.totalActions
    )[0];
  }, [agents]);

  const readyDcaCount = useMemo(
    () => dcaBounties.filter((d) => d.keeperExecutable).length,
    [dcaBounties]
  );
  const readyLoanCount = useMemo(
    () => loanBounties.filter((l) => l.keeperExecutable).length,
    [loanBounties]
  );

  const avgCouncilYesPct = useMemo(() => {
    if (debates.length === 0) return 0;
    const sum = debates.reduce((acc, d) => acc + d.councilYesBps / 100, 0);
    return sum / debates.length;
  }, [debates]);

  const copyHash = (id: string, val: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(val);
      setCopiedHash(id);
      setTimeout(() => setCopiedHash(""), 1600);
    }
  };

  // Step 1: Synthesize 3-Way AI Adversarial Debate Draft
  const handleSynthesizeDebate = async () => {
    try {
      setNotice(null);
      setBusyAction("SYNTHESIZE");
      const res = await fetch("/api/debate-keeper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketTicker,
          customPrompt,
          bullAgentId,
          bearAgentId,
          factCheckerId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok || !json.draft) {
        throw new Error(json.error || "Debate synthesis failed");
      }
      setDraft(json.draft as DebateDraft);
      setNotice({
        type: "info",
        text: `3-Way Council Debate synthesized via ${json.draft.provider}. Review conviction & anchor on AgentRegistry.sol.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyAction("");
    }
  };

  // Recompute keccak256 if user customizes draft fields
  const updateDraftField = <K extends keyof DebateDraft>(
    key: K,
    val: DebateDraft[K]
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: val };
      next.divergenceBps = next.councilYesBps - next.marketYesBps;
      next.transcriptHash = keccak256(
        toBytes(
          JSON.stringify({
            version: "mezocity-debate-v1",
            chainId: 31611,
            marketTicker: next.marketTicker,
            thesis: next.thesis,
            bullAgentId: next.bullAgentId,
            bearAgentId: next.bearAgentId,
            factCheckerId: next.factCheckerId,
            councilYesBps: next.councilYesBps,
            marketYesBps: next.marketYesBps,
            bullArgument: next.bullArgument,
            bearArgument: next.bearArgument,
            factCheckVerdict: next.factCheckVerdict,
          })
        )
      );
      return next;
    });
  };

  // Step 2: Anchor Debate On-Chain via AgentRegistry.anchorCouncilDebate
  const handleAnchorDebate = async () => {
    try {
      if (!draft) {
        throw new Error("Synthesize a debate draft first before anchoring.");
      }
      setNotice(null);
      const userAddr = await ensureMezoWallet();
      if (!publicClient) return;

      setBusyAction("ANCHOR_DEBATE");
      const registryAddr =
        (data?.contracts?.agentRegistry as `0x${string}`) ||
        DEFAULT_CONTRACT_ADDRESSES.agentRegistry;

      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: registryAddr,
        abi: AGENT_REGISTRY_ABI,
        functionName: "anchorCouncilDebate",
        args: [
          draft.marketTicker.slice(0, 32),
          draft.thesis.slice(0, 155),
          BigInt(draft.bullAgentId),
          BigInt(draft.bearAgentId),
          BigInt(draft.factCheckerId),
          draft.councilYesBps,
          draft.marketYesBps,
          draft.transcriptHash,
        ],
      });

      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setNotice({
        type: "success",
        text: `Anchored Council Debate (${draft.marketTicker}) on AgentRegistry.sol!`,
        txHash,
      });
      await fetchArenaState();
    } catch (err) {
      setNotice({
        type: "error",
        text: extractEvmRevertReason(err),
      });
    } finally {
      setBusyAction("");
    }
  };

  // Keeper Action A: Permissionless Sub-Island Loan Liquidation
  const handleLiquidateLoan = async (loan: LoanKeeperOpportunity) => {
    try {
      setNotice(null);
      const userAddr = await ensureMezoWallet();
      if (!publicClient) return;
      const councilAddr = data?.contracts?.islandCreditCouncil as `0x${string}`;
      if (!councilAddr) {
        throw new Error("IslandCreditCouncil address not configured.");
      }

      setBusyAction(`LIQ-${loan.appId}`);
      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: councilAddr,
        abi: ISLAND_CREDIT_COUNCIL_ABI,
        functionName: "liquidateDefaultedLoan",
        args: [BigInt(loan.appId)],
      });
      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setNotice({
        type: "success",
        text: `Keeper executed liquidateDefaultedLoan(#${loan.appId}) for ${loan.islandName} and returned collateral to MainMUSDVault!`,
        txHash,
      });
      await fetchArenaState();
    } catch (err) {
      setNotice({
        type: "error",
        text: extractEvmRevertReason(err),
      });
    } finally {
      setBusyAction("");
    }
  };

  // Keeper Action B: Permissionless DCA Slice / Ratchet Self-Heal Execution
  const handleExecuteDcaKeeper = async (dca: DcaKeeperOpportunity) => {
    try {
      setNotice(null);
      const userAddr = await ensureMezoWallet();
      if (!publicClient) return;
      const dcaAddr =
        (data?.contracts?.dcaEngine as `0x${string}`) ||
        DEFAULT_CONTRACT_ADDRESSES.dcaEngine;

      setBusyAction(`DCA-${dca.scheduleId}`);
      const proofHash = keccak256(
        toBytes(
          `keeper-dca-${dca.scheduleId}-${dca.executedSlices}-${Date.now()}`
        )
      );

      let txHash: `0x${string}`;
      if (dca.needsRectify) {
        const rectifiedWei = BigInt(dca.rectifiedAmountWei);
        const sim = await publicClient.simulateContract({
          account: userAddr,
          address: dcaAddr,
          abi: DCA_ENGINE_ABI,
          functionName: "rectifyAndExecuteDCASlice",
          args: [
            BigInt(dca.scheduleId),
            3n, // Ratchet Self-Healing Agent #3
            rectifiedWei,
            8200,
            `MAX_TRADE_EXCEEDED: ${dca.sliceAmountBtc.toFixed(6)} BTC > ${dca.maxAllowedBtc.toFixed(6)} BTC cap`,
            `Keeper clamped DCA slice to ${dca.maxAllowedBtc.toFixed(6)} BTC within PolicyVault cap`,
            proofHash,
          ],
        });
        txHash = await writeContractAsync(sim.request);
      } else {
        const sim = await publicClient.simulateContract({
          account: userAddr,
          address: dcaAddr,
          abi: DCA_ENGINE_ABI,
          functionName: "executeDCASlice",
          args: [
            BigInt(dca.scheduleId),
            2n, // Bumblebee DCA Agent #2
            8500,
            proofHash,
          ],
        });
        txHash = await writeContractAsync(sim.request);
      }

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setNotice({
        type: "success",
        text: dca.needsRectify
          ? `Keeper triggered Ratchet self-heal on Schedule #${dca.scheduleId} and executed compliant slice!`
          : `Keeper executed DCA Schedule #${dca.scheduleId} (${dca.strategyName}) on-chain!`,
        txHash,
      });
      await fetchArenaState();
    } catch (err) {
      setNotice({
        type: "error",
        text: extractEvmRevertReason(err),
      });
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="space-y-6 text-[#231f20]">
      {/* Dark Executive Hero Header */}
      <div className="rounded-[28px] border border-slate-800 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#064e3b] p-6 text-white shadow-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-amber-400/20 text-amber-200 border border-amber-300/30 font-black">
              <Zap className="h-3.5 w-3.5 mr-1" />
              {proMode ? "Plan J • Consensus & Keepers" : "AI Debates & Rewards"}
            </Badge>
            {proMode && (
              <Badge className="bg-white/10 text-slate-200 border border-white/15 font-bold">
                AgentRegistry.sol (ERC-8004) • Chain 31611
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            {proMode
              ? "On-Chain Council Debate Arena & Keeper Bounty Board"
              : "AI Council Debates & Automated Tasks"}
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            {proMode ? (
              <>
                Run adversarial 3-agent market debates anchored permanently to{" "}
                <span className="font-mono text-emerald-300">
                  AgentRegistry.anchorCouncilDebate
                </span>
                , inspect verifiable Bull vs. Bear divergence transcripts, and
                execute permissionless DCA, Ratchet self-healing, and Sub-Island
                default liquidation keepers from your connected wallet.
              </>
            ) : (
              "Watch the AI agents debate Bitcoin & market strategy from bullish and cautious viewpoints, or trigger ready keeper tasks directly."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex rounded-xl bg-black/30 p-1 border border-white/15">
            <button
              type="button"
              onClick={() => setProMode(false)}
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                !proMode
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setProMode(true)}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                proMode
                  ? "bg-amber-400 text-slate-950 shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Sliders className="h-3 w-3" />
              Pro Details
            </button>
          </div>
          {!isConnected && (
            <Button
              onClick={() => openConnectModal?.()}
              className="rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black"
            >
              <Wallet className="h-4 w-4 mr-1.5" />
              Connect Wallet
            </Button>
          )}
          <Button
            onClick={fetchArenaState}
            variant="secondary"
            disabled={loading}
            className="rounded-xl bg-white/95 hover:bg-white text-slate-900 font-extrabold"
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            {proMode ? "Sync Mezo 31611" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-bold flex flex-wrap items-center justify-between gap-2 ${
            notice.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : notice.type === "error"
                ? "border-rose-300 bg-rose-50 text-rose-950"
                : "border-indigo-300 bg-indigo-50 text-indigo-950"
          }`}
        >
          <span className="flex items-center gap-2">
            {notice.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : notice.type === "error" ? (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            ) : (
              <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
            )}
            {notice.text}
          </span>
          {notice.txHash && (
            <a
              href={`${EXPLORER_TX_BASE}${notice.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline font-black"
            >
              View on Mezo Explorer
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {/* 4 Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl bg-white/95 border-white shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span>{proMode ? "On-Chain Debates" : "Saved Debates"}</span>
              <Scale className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="text-xl font-black text-slate-900">
              {data?.totalDebates ?? 0} {proMode ? "Anchored" : "Records"}
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Avg Conviction: {fmtNum(avgCouncilYesPct, 1)}% Bullish
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl bg-white/95 border-white shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span>
                {proMode ? "ERC-8004 Reputation Leader" : "Top Performing AI"}
              </span>
              <Award className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-xl font-black text-slate-900 truncate">
              {topAgent
                ? `${topAgent.name} (${fmtNum(topAgent.reputationBps / 100, 1)}%)`
                : "Syncing..."}
            </div>
            <div className="text-xs font-semibold text-slate-600">
              {topAgent
                ? `${topAgent.successfulActions}/${topAgent.totalActions} successful runs`
                : `${agents.length} active AI agents`}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl bg-white/95 border-white shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span>{proMode ? "Keeper Bounty Queue" : "Automated Tasks"}</span>
              <Gavel className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-emerald-700">
              {readyDcaCount + readyLoanCount} Ready Now
            </div>
            <div className="text-xs font-semibold text-slate-600">
              {readyLoanCount} Loan Checks • {readyDcaCount} Auto-Invests Due
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl bg-white/95 border-white shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span>{proMode ? "Mezo Oracle & Vaults" : "Live Bitcoin Price"}</span>
              <Coins className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-xl font-black text-slate-900">
              ${fmtNum(data?.market?.btcPriceUsd ?? 0, 0)} / BTC
            </div>
            <div className="text-xs font-semibold text-slate-600">
              {proMode
                ? `TCR ${fmtNum(data?.market?.systemTcrPct ?? 0, 1)}% • PolicyVault ${fmtNum(data?.vaultSummary?.policyEquityBtc ?? 0, 4)} BTC`
                : `Vault Total: ${fmtNum(data?.vaultSummary?.policyEquityBtc ?? 0, 4)} BTC`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1.5 rounded-2xl border border-stone-200 bg-white/90 p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setSubTab("debate")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
              subTab === "debate"
                ? "bg-[#242331] text-white shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            Council Debate Arena ({data?.totalDebates ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("keepers")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
              subTab === "keepers"
                ? "bg-gradient-to-r from-emerald-600 to-indigo-600 text-white shadow-sm"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            Keeper Bounty Board ({readyDcaCount + readyLoanCount} Ready)
          </button>
        </div>

        {onNavigateTab && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("crew")}
              className="rounded-xl bg-white/90 text-xs font-extrabold"
            >
              Crew (5 AI) Overview
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("musd-vault")}
              className="rounded-xl bg-white/90 text-xs font-extrabold"
            >
              MUSD Vault &amp; Loop
            </Button>
          </div>
        )}
      </div>

      {/* =====================================================================
          SUB-VIEW 1: ON-CHAIN COUNCIL DEBATE ARENA
         ===================================================================== */}
      {subTab === "debate" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 5 Cols: Debate Synthesizer & On-Chain Anchor Composer */}
          <Card className="lg:col-span-5 rounded-[24px] border-2 border-white bg-white/95 shadow-lg h-fit">
            <CardHeader className="pb-3 border-b border-stone-100">
              <div className="flex items-center justify-between">
                <Badge className="bg-indigo-100 text-indigo-900 border-indigo-200 font-black">
                  Adversarial Synthesis
                </Badge>
                <span className="text-[11px] font-bold text-stone-500">
                  Permissionless On-Chain Proof
                </span>
              </div>
              <CardTitle className="text-base font-black pt-1">
                Convene &amp; Anchor Council Debate
              </CardTitle>
              <CardDescription className="text-xs">
                {proMode ? (
                  <>
                    Generate a 3-way Bull vs. Bear vs. Fact-Checker thesis from
                    live Mezo oracle &amp; vault telemetry, then anchor its{" "}
                    <span className="font-mono">keccak256</span> transcript hash
                    on <span className="font-mono">AgentRegistry.sol</span>.
                  </>
                ) : (
                  "Pick a market question below and have our Bull, Bear, and Fact-Checker AI agents debate the best move."
                )}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {/* Presets */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-black uppercase tracking-wider text-stone-500">
                  Market Focus Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {MARKET_PRESETS.map((p) => (
                    <button
                      key={p.ticker}
                      type="button"
                      onClick={() => {
                        setMarketTicker(p.ticker);
                        setCustomPrompt(p.prompt);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-black border transition-all ${
                        marketTicker === p.ticker
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                      }`}
                    >
                      {p.ticker}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">
                    Market Ticker
                  </label>
                  <input
                    type="text"
                    value={marketTicker}
                    onChange={(e) => setMarketTicker(e.target.value)}
                    placeholder="BTC/USD"
                    className="w-full h-9 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">
                    Debate Question / Macro Hypothesis
                  </label>
                  <textarea
                    rows={2}
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="What thesis should Bull, Bear, and Fact-Checker debate?"
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Agent Role Selectors */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-black uppercase text-emerald-700 mb-1">
                    Bull Agent
                  </label>
                  <select
                    value={bullAgentId}
                    onChange={(e) => setBullAgentId(Number(e.target.value))}
                    className="w-full h-9 rounded-xl border border-stone-200 bg-white px-2 text-[11px] font-bold"
                  >
                    {(agents.length > 0
                      ? agents
                      : [
                          { agentId: 1, name: "Optimus Prime" },
                          { agentId: 2, name: "Bumblebee" },
                          { agentId: 3, name: "Ratchet" },
                          { agentId: 4, name: "Ironhide" },
                          { agentId: 5, name: "Soundwave" },
                        ]
                    ).map((a) => (
                      <option key={a.agentId} value={a.agentId}>
                        #{a.agentId} {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-rose-700 mb-1">
                    Bear Agent
                  </label>
                  <select
                    value={bearAgentId}
                    onChange={(e) => setBearAgentId(Number(e.target.value))}
                    className="w-full h-9 rounded-xl border border-stone-200 bg-white px-2 text-[11px] font-bold"
                  >
                    {(agents.length > 0
                      ? agents
                      : [
                          { agentId: 1, name: "Optimus Prime" },
                          { agentId: 2, name: "Bumblebee" },
                          { agentId: 3, name: "Ratchet" },
                          { agentId: 4, name: "Ironhide" },
                          { agentId: 5, name: "Soundwave" },
                        ]
                    ).map((a) => (
                      <option key={a.agentId} value={a.agentId}>
                        #{a.agentId} {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-indigo-700 mb-1">
                    Fact-Checker
                  </label>
                  <select
                    value={factCheckerId}
                    onChange={(e) => setFactCheckerId(Number(e.target.value))}
                    className="w-full h-9 rounded-xl border border-stone-200 bg-white px-2 text-[11px] font-bold"
                  >
                    {(agents.length > 0
                      ? agents
                      : [
                          { agentId: 1, name: "Optimus Prime" },
                          { agentId: 2, name: "Bumblebee" },
                          { agentId: 3, name: "Ratchet" },
                          { agentId: 4, name: "Ironhide" },
                          { agentId: 5, name: "Soundwave" },
                        ]
                    ).map((a) => (
                      <option key={a.agentId} value={a.agentId}>
                        #{a.agentId} {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleSynthesizeDebate}
                disabled={busyAction !== ""}
                className="w-full rounded-xl bg-[#242331] hover:bg-indigo-700 text-white font-black"
              >
                {busyAction === "SYNTHESIZE" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Synthesizing 3-Way Debate...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    1. Synthesize Adversarial AI Debate
                  </>
                )}
              </Button>

              {/* Synthesized Draft Preview + Direct On-Chain Anchor */}
              {draft && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase text-indigo-900">
                      Ready to Anchor • {draft.provider}
                    </span>
                    <Badge className="bg-white text-indigo-900 border-indigo-200 font-mono text-[10px]">
                      {shortHex(draft.transcriptHash, 5)}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <div className="rounded-xl bg-white border border-emerald-200 p-2.5">
                      <div className="font-black text-emerald-800 flex items-center gap-1 mb-0.5">
                        <TrendingUp className="h-3.5 w-3.5" /> Bull Case (Agent
                        #{draft.bullAgentId})
                      </div>
                      <p className="text-stone-700 leading-snug">
                        {draft.bullArgument}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-rose-200 p-2.5">
                      <div className="font-black text-rose-800 flex items-center gap-1 mb-0.5">
                        <TrendingDown className="h-3.5 w-3.5" /> Bear Risk Case
                        (Agent #{draft.bearAgentId})
                      </div>
                      <p className="text-stone-700 leading-snug">
                        {draft.bearArgument}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-indigo-200 p-2.5">
                      <div className="font-black text-indigo-900 flex items-center gap-1 mb-0.5">
                        <ShieldCheck className="h-3.5 w-3.5" /> Fact-Checker
                        Reconciliation (Agent #{draft.factCheckerId})
                      </div>
                      <p className="text-stone-700 leading-snug">
                        {draft.factCheckVerdict}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">
                      Anchored On-Chain Thesis (editable, max 155 chars)
                    </label>
                    <input
                      type="text"
                      maxLength={155}
                      value={draft.thesis}
                      onChange={(e) =>
                        updateDraftField("thesis", e.target.value)
                      }
                      className="w-full h-9 rounded-xl border border-indigo-200 bg-white px-2.5 text-xs font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 mb-1">
                        Council YES (bps: {(draft.councilYesBps / 100).toFixed(1)}
                        %)
                      </label>
                      <input
                        type="number"
                        min={100}
                        max={9900}
                        step={100}
                        value={draft.councilYesBps}
                        onChange={(e) =>
                          updateDraftField(
                            "councilYesBps",
                            Math.min(
                              9900,
                              Math.max(100, Number(e.target.value) || 5000)
                            )
                          )
                        }
                        className="w-full h-8 rounded-lg border border-indigo-200 bg-white px-2 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 mb-1">
                        Market Implied (bps:{" "}
                        {(draft.marketYesBps / 100).toFixed(1)}%)
                      </label>
                      <input
                        type="number"
                        min={100}
                        max={9900}
                        step={100}
                        value={draft.marketYesBps}
                        onChange={(e) =>
                          updateDraftField(
                            "marketYesBps",
                            Math.min(
                              9900,
                              Math.max(100, Number(e.target.value) || 5000)
                            )
                          )
                        }
                        className="w-full h-8 rounded-lg border border-indigo-200 bg-white px-2 text-xs font-mono font-bold"
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={handleAnchorDebate}
                    disabled={busyAction !== ""}
                    className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                  >
                    {busyAction === "ANCHOR_DEBATE" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        Signing on Mezo 31611...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        2. Anchor Debate On-Chain (Wallet)
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right 7 Cols: Live Immutable AgentRegistry Debate Archive */}
          <Card className="lg:col-span-7 rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
            <CardHeader className="pb-3 border-b border-stone-100 flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-black flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  Live On-Chain Council Debate Feed (`AgentRegistry.debates`)
                </CardTitle>
                <CardDescription className="text-xs">
                  Verifiable divergence between AI Council conviction and
                  external market implied odds, anchored on Mezo Testnet.
                </CardDescription>
              </div>
              <a
                href={`${EXPLORER_ADDR_BASE}${data?.contracts?.agentRegistry || DEFAULT_CONTRACT_ADDRESSES.agentRegistry}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-[11px] font-black text-stone-700 hover:bg-stone-100"
              >
                AgentRegistry Contract
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {debates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-xs font-semibold text-stone-600">
                  No Council Debates anchored yet on AgentRegistry. Click{" "}
                  <strong>Synthesize Adversarial AI Debate</strong> and anchor
                  the first verifiable consensus record on-chain!
                </div>
              ) : (
                debates.map((d) => {
                  const councilPct = d.councilYesBps / 100;
                  const marketPct = d.marketYesBps / 100;
                  const spreadPct = d.divergenceBps / 100;
                  const bullishAlpha = d.divergenceBps >= 0;

                  return (
                    <div
                      key={d.debateId}
                      className="rounded-2xl border border-stone-200/90 bg-[#faf8f4] p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-[#242331] text-white font-mono text-[10px]">
                            Debate #{d.debateId}
                          </Badge>
                          <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-black text-[10px]">
                            {d.marketTicker}
                          </Badge>
                          <Badge
                            className={`text-[10px] font-black ${
                              bullishAlpha
                                ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                : "bg-rose-100 text-rose-900 border-rose-300"
                            }`}
                          >
                            {bullishAlpha ? "+" : ""}
                            {fmtNum(spreadPct, 1)}% Divergence
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-semibold text-stone-500">
                          {d.timestampIso && (
                            <span>
                              {new Date(d.timestampIso).toLocaleString()}
                            </span>
                          )}
                          {d.txHash && (
                            <a
                              href={`${EXPLORER_TX_BASE}${d.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-black text-indigo-700 hover:underline"
                            >
                              Tx <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      <p className="text-xs font-bold text-stone-900 leading-snug">
                        {d.thesis}
                      </p>

                      {/* Conviction vs Market Bars */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="rounded-xl bg-white border border-stone-200 p-2.5 space-y-1">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-indigo-900">
                              Council Conviction
                            </span>
                            <span className="font-mono font-black">
                              {fmtNum(councilPct, 1)}% YES
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-600"
                              style={{
                                width: `${Math.min(100, Math.max(2, councilPct))}%`,
                              }}
                            />
                          </div>
                        </div>

                        <div className="rounded-xl bg-white border border-stone-200 p-2.5 space-y-1">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-stone-600">
                              External Market Implied
                            </span>
                            <span className="font-mono font-black">
                              {fmtNum(marketPct, 1)}% YES
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-500"
                              style={{
                                width: `${Math.min(100, Math.max(2, marketPct))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Agent Roster & Proof Hash */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1.5 font-bold">
                          <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-900">
                            Bull: {d.bullAgentName} (#{d.bullAgentId})
                          </span>
                          <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-rose-900">
                            Bear: {d.bearAgentName} (#{d.bearAgentId})
                          </span>
                          <span className="rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-indigo-900">
                            Check: {d.factCheckerName} (#{d.factCheckerId})
                          </span>
                        </div>

                        {proMode && (
                          <button
                            type="button"
                            onClick={() =>
                              copyHash(`hash-${d.debateId}`, d.transcriptHash)
                            }
                            className="inline-flex items-center gap-1 font-mono text-[10px] text-stone-500 hover:text-stone-900"
                            title="Copy anchored transcript keccak256 hash"
                          >
                            {copiedHash === `hash-${d.debateId}` ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {shortHex(d.transcriptHash, 7)}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 2: PERMISSIONLESS KEEPER BOUNTY BOARD & AGENT REPUTATION
         ===================================================================== */}
      {subTab === "keepers" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* A. Sub-Island Credit Loan Liquidations */}
            <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
              <CardHeader className="pb-3 border-b border-stone-100">
                <div className="flex items-center justify-between">
                  <Badge className="bg-rose-100 text-rose-900 border-rose-200 font-black">
                    IslandCreditCouncil Keeper
                  </Badge>
                  <span className="text-[11px] font-bold text-stone-500">
                    {readyLoanCount} Liquidatable / {loanBounties.length} Active
                  </span>
                </div>
                <CardTitle className="text-base font-black pt-1">
                  Sub-Island Default &amp; Margin Watchlist
                </CardTitle>
                <CardDescription className="text-xs">
                  {proMode ? (
                    <>
                      Permissionless execution of{" "}
                      <span className="font-mono">liquidateDefaultedLoan</span>{" "}
                      when a Sub-Island loan passes maturity or drops below{" "}
                      <span className="font-bold">115%</span> maintenance
                      margin.
                    </>
                  ) : (
                    "Monitor Sub-Island credit lines that need health checks or margin settlements."
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 space-y-3">
                {loanBounties.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-xs font-semibold text-stone-600">
                    No active disbursed Sub-Island credit lines found on-chain
                    right now.
                  </div>
                ) : (
                  loanBounties.map((loan) => (
                    <div
                      key={loan.appId}
                      className={`rounded-2xl border p-4 space-y-2.5 ${
                        loan.keeperExecutable
                          ? "border-rose-300 bg-rose-50/70"
                          : "border-stone-200 bg-[#faf8f4]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black">
                            {loan.islandName} • Loan #{loan.appId}
                          </span>
                          <Badge
                            className={`text-[10px] font-black ${
                              loan.keeperExecutable
                                ? "bg-rose-600 text-white"
                                : "bg-emerald-100 text-emerald-900 border-emerald-300"
                            }`}
                          >
                            {loan.keeperExecutable
                              ? loan.isUndercollateralized
                                ? "UNDERCOLLATERALIZED • READY"
                                : "PAST DUE • READY"
                              : "HEALTHY WATCHLIST"}
                          </Badge>
                        </div>

                        <a
                          href={`${EXPLORER_ADDR_BASE}${loan.vaultAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-mono font-bold text-indigo-700 hover:underline inline-flex items-center gap-1"
                        >
                          Vault {shortHex(loan.vaultAddress, 4)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded-xl bg-white border border-stone-200 p-2">
                          <div className="text-[10px] text-stone-500 font-bold">
                            Debt + Interest
                          </div>
                          <div className="font-mono font-black">
                            {fmtNum(loan.totalDebtMusd, 2)} MUSD
                          </div>
                        </div>
                        <div className="rounded-xl bg-white border border-stone-200 p-2">
                          <div className="text-[10px] text-stone-500 font-bold">
                            Vault Gross NAV
                          </div>
                          <div className="font-mono font-black">
                            ${fmtNum(loan.grossNavUsd, 2)}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white border border-stone-200 p-2">
                          <div className="text-[10px] text-stone-500 font-bold">
                            Margin Coverage
                          </div>
                          <div
                            className={`font-mono font-black ${
                              loan.coveragePct < 115
                                ? "text-rose-700"
                                : "text-emerald-700"
                            }`}
                          >
                            {fmtNum(loan.coveragePct, 1)}%
                          </div>
                        </div>
                        <div className="rounded-xl bg-white border border-stone-200 p-2">
                          <div className="text-[10px] text-stone-500 font-bold">
                            Due Countdown
                          </div>
                          <div className="font-mono font-black">
                            {loan.isPastDue
                              ? "OVERDUE"
                              : fmtRelativeTime(loan.secondsUntilDue)}
                          </div>
                        </div>
                      </div>

                      <Button
                        type="button"
                        onClick={() => handleLiquidateLoan(loan)}
                        disabled={!loan.keeperExecutable || busyAction !== ""}
                        className={`w-full rounded-xl font-black text-xs ${
                          loan.keeperExecutable
                            ? "bg-rose-600 hover:bg-rose-700 text-white"
                            : "bg-stone-200 text-stone-500 cursor-not-allowed"
                        }`}
                      >
                        {busyAction === `LIQ-${loan.appId}` ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Executing Liquidation...
                          </>
                        ) : loan.keeperExecutable ? (
                          <>
                            <Gavel className="h-3.5 w-3.5 mr-1.5" />
                            Execute liquidateDefaultedLoan(#{loan.appId})
                          </>
                        ) : (
                          `Protected Until Due (${fmtRelativeTime(loan.secondsUntilDue)}) or <115% Margin`
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* B. Policy-Fenced DCA & Ratchet Self-Heal Keepers */}
            <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
              <CardHeader className="pb-3 border-b border-stone-100">
                <div className="flex items-center justify-between">
                  <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 font-black">
                    MezoDCAEngine Keeper
                  </Badge>
                  <span className="text-[11px] font-bold text-stone-500">
                    {readyDcaCount} Executable / {dcaBounties.length} Active
                  </span>
                </div>
                <CardTitle className="text-base font-black pt-1">
                  Autonomous DCA &amp; Ratchet Self-Heal Bounties
                </CardTitle>
                <CardDescription className="text-xs">
                  Trigger due{" "}
                  <span className="font-mono">executeDCASlice</span> cycles or
                  heal oversized orders via{" "}
                  <span className="font-mono">rectifyAndExecuteDCASlice</span>{" "}
                  bounded by PolicyVault caps.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 space-y-3">
                {dcaBounties.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-xs font-semibold text-stone-600">
                    No active DCA schedules pending execution. Create one in{" "}
                    <strong>DCA &amp; Vault</strong> to populate keeper tasks.
                  </div>
                ) : (
                  dcaBounties.map((dca) => (
                    <div
                      key={dca.scheduleId}
                      className={`rounded-2xl border p-4 space-y-2.5 ${
                        dca.keeperExecutable
                          ? "border-emerald-300 bg-emerald-50/60"
                          : "border-stone-200 bg-[#faf8f4]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black">
                            #{dca.scheduleId} {dca.strategyName}
                          </span>
                          <Badge
                            className={`text-[10px] font-black ${
                              dca.keeperExecutable
                                ? dca.needsRectify
                                  ? "bg-amber-500 text-white"
                                  : "bg-emerald-600 text-white"
                                : "bg-stone-200 text-stone-700"
                            }`}
                          >
                            {dca.keeperExecutable
                              ? dca.needsRectify
                                ? "SELF-HEAL DUE"
                                : "DUE NOW"
                              : "IN COOLDOWN"}
                          </Badge>
                        </div>

                        <span className="text-[11px] font-mono font-bold text-stone-600">
                          {dca.executedSlices}/{dca.totalSlices} Slices
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-xl bg-white border border-stone-200 p-2">
                          <div className="text-[10px] text-stone-500 font-bold">
                            Target / Slice
                          </div>
                          <div className="font-mono font-black truncate">
                            {dca.sliceAmountBtc.toFixed(6)} BTC
                          </div>
                        </div>
                        <div className="rounded-xl bg-white border border-stone-200 p-2">
                          <div className="text-[10px] text-stone-500 font-bold">
                            PolicyVault Max Cap
                          </div>
                          <div className="font-mono font-black">
                            {dca.maxAllowedBtc.toFixed(6)} BTC
                          </div>
                        </div>
                        <div className="rounded-xl bg-white border border-stone-200 p-2">
                          <div className="text-[10px] text-stone-500 font-bold">
                            Next Window
                          </div>
                          <div className="font-mono font-black">
                            {dca.keeperExecutable
                              ? "OPEN"
                              : fmtRelativeTime(
                                  Math.max(
                                    dca.nextDueInSec,
                                    dca.cooldownRemainingSec
                                  )
                                )}
                          </div>
                        </div>
                      </div>

                      {dca.blockerReason && (
                        <div className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
                          {dca.blockerReason}
                        </div>
                      )}

                      <Button
                        type="button"
                        onClick={() => handleExecuteDcaKeeper(dca)}
                        disabled={!dca.keeperExecutable || busyAction !== ""}
                        className={`w-full rounded-xl font-black text-xs ${
                          dca.keeperExecutable
                            ? dca.needsRectify
                              ? "bg-amber-600 hover:bg-amber-700 text-white"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "bg-stone-200 text-stone-500 cursor-not-allowed"
                        }`}
                      >
                        {busyAction === `DCA-${dca.scheduleId}` ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Executing Keeper Tx...
                          </>
                        ) : dca.needsRectify ? (
                          <>
                            <Wrench className="h-3.5 w-3.5 mr-1.5" />
                            Ratchet Self-Heal &amp; Execute Slice
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5 mr-1.5" />
                            Execute DCA Slice (#{dca.scheduleId})
                          </>
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* C. Live ERC-8004 Agent Reputation Table */}
          {proMode && (
          <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
            <CardHeader className="pb-3 border-b border-stone-100">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-500" />
                Live ERC-8004 Agent Reputation Ledger (`AgentRegistry.getAllAgents`)
              </CardTitle>
              <CardDescription className="text-xs">
                Reputation scores and action counts updated directly on Mezo
                Testnet by{" "}
                <span className="font-mono">AgentRegistry.sol</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-2 px-3">ID</th>
                      <th className="py-2 px-3">Agent Name &amp; Role</th>
                      <th className="py-2 px-3">Reputation Score</th>
                      <th className="py-2 px-3">Successful / Total</th>
                      <th className="py-2 px-3">Operator Wallet</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {agents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-6 text-center text-stone-500"
                        >
                          Syncing ERC-8004 agents from AgentRegistry.sol...
                        </td>
                      </tr>
                    ) : (
                      agents.map((ag) => (
                        <tr key={ag.agentId}>
                          <td className="py-2.5 px-3 font-mono font-black">
                            #{ag.agentId}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-black text-stone-900">
                              {ag.name}
                            </div>
                            <div className="text-[11px] text-stone-500">
                              {ag.role}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-black text-emerald-700">
                            {fmtNum(ag.reputationBps / 100, 2)}%
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold">
                            {ag.successfulActions} / {ag.totalActions}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            <a
                              href={`${EXPLORER_ADDR_BASE}${ag.operator}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-700 hover:underline inline-flex items-center gap-1"
                            >
                              {shortHex(ag.operator, 6)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              className={`text-[10px] font-black ${
                                ag.active
                                  ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                  : "bg-stone-200 text-stone-700"
                              }`}
                            >
                              {ag.active ? "ACTIVE" : "INACTIVE"}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          )}
        </div>
      )}
    </div>
  );
}
