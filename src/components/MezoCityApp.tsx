"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Play,
  Wallet,
  ExternalLink,
  Cpu,
  Wrench,
  Lock,
  Unlock,
  ArrowUpRight,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  Plus,
  Send,
  Minimize2,
  Maximize2,
  Clock,
  Activity,
  RotateCcw,
  Crosshair,
  X,
  Globe,
} from "lucide-react";
import { CrewAgentsPanel } from "@/components/CrewAgentsPanel";
import {
  createPublicClient,
  http,
  parseEther,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  AgentReasoningLog,
  ClayAgent,
  CyclePhase,
  DCAScheduleItem,
  ExecutionAuditEntry,
  INITIAL_AGENTS,
  ISLAND_STATIONS,
  NewsItemHeadline,
  PolicyGuardrails,
} from "@/lib/simulation-data";
import {
  DCA_ENGINE_ABI,
  DEFAULT_CONTRACT_ADDRESSES,
  POLICY_VAULT_ABI,
  mezoTestnet,
} from "@/lib/mezo-chain";
import {
  bpsToPercent,
  formatBtc,
  formatBtcNumber,
  shortenHex,
} from "@/lib/utils";
import type { LiveOnChainState } from "@/lib/mezo-onchain-server";
import {
  DEFAULT_MAIN_STRATEGY_MANDATE,
  type InngestRunTelemetry,
  type MainActionResult,
  type MainRiskMode,
  type MainStrategyMandate,
  type StoredCycleRecord,
} from "@/lib/neon-db";
import { MezoLendingGuardPanel } from "@/components/MezoLendingGuardPanel";
import { MainMusdVaultPanel } from "@/components/MainMusdVaultPanel";
import { CreateIslandModal } from "@/components/CreateIslandModal";
import {
  SubIslandWorkspace,
  type SubIslandDetailsResponse,
} from "@/components/SubIslandWorkspace";
import type { CustomIslandRecord } from "@/lib/island-db";
import type { WorkshopPreviewConfig } from "@/components/island/CustomIslandScene";
import { MAIN_MUSD_VAULT_STATION } from "@/components/island/ClayIslandScene";

const CustomIslandScene = dynamic(
  () =>
    import("@/components/island/CustomIslandScene").then(
      (mod) => mod.CustomIslandScene
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff] text-[#231f20]">
        <div className="h-12 w-12 rounded-full bg-[#7c3aed] animate-bounce flex items-center justify-center text-white font-black shadow-lg mb-3">
          🏝️
        </div>
        <p className="text-sm font-bold tracking-tight">
          Loading Empty Sub-Island Diorama...
        </p>
      </div>
    ),
  }
);

const ClayIslandScene = dynamic(
  () =>
    import("@/components/island/ClayIslandScene").then(
      (mod) => mod.ClayIslandScene
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff] text-[#231f20]">
        <div className="h-12 w-12 rounded-full animate-bounce shadow-lg mb-3 overflow-hidden">
          <img src="/mezo-logo.svg" alt="MezoCity" className="h-full w-full" />
        </div>
        <p className="text-sm font-bold tracking-tight">
          Loading MezoCity Clay Island (Chain ID: 31611)...
        </p>
      </div>
    ),
  }
);

export function MezoCityApp() {
  // Active Top Navigation View
  const [activeTab, setActiveTab] = useState<
    "island" | "crew" | "dca" | "musd-vault" | "lending" | "contracts" | "docs"
  >("island");

  // Sub-Island Builder & Switcher State (Main Island preserved as "main")
  const [selectedIslandId, setSelectedIslandId] = useState<"main" | string>("main");
  const [customIslands, setCustomIslands] = useState<CustomIslandRecord[]>([]);
  const [subIslandDetails, setSubIslandDetails] =
    useState<SubIslandDetailsResponse | null>(null);
  const [subPlotIndex, setSubPlotIndex] = useState<number | null>(null);
  const [subAgentId, setSubAgentId] = useState<string | null>(null);
  const [workshopPreview, setWorkshopPreview] =
    useState<WorkshopPreviewConfig | null>(null);
  const [createIslandModalOpen, setCreateIslandModalOpen] =
    useState<boolean>(false);
  const [islandMenuOpen, setIslandMenuOpen] = useState<boolean>(false);
  const [selectedSatelliteIslandId, setSelectedSatelliteIslandId] =
    useState<string | null>(null);
  const [archipelagoOverviewTick, setArchipelagoOverviewTick] =
    useState<number>(0);

  // 4 Real AI Agents State (Aura, Kronos, Patch, Sentinel) synced from AgentRegistry.sol
  const [agents, setAgents] = useState<ClayAgent[]>(INITIAL_AGENTS);
  const [currentPhase, setCurrentPhase] =
    useState<CyclePhase>("HEAD_PLANNING");
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(1);
  const [selectedStationId, setSelectedStationId] =
    useState<string | null>("head_citadel");
  const [cameraResetTick, setCameraResetTick] = useState<number>(0);
  const [vaultAlertState, setVaultAlertState] = useState<
    "NORMAL" | "PASSED" | "BLOCKED" | "RECTIFIED"
  >("NORMAL");

  // Live AI Reasoning & On-Chain DCA State (100% Real from Neon Cloud DB & Mezo Testnet 31611)
  const [reasoningFeed, setReasoningFeed] = useState<AgentReasoningLog[]>([]);
  const [dcaSchedules, setDcaSchedules] = useState<DCAScheduleItem[]>([]);
  const [executionLedger, setExecutionLedger] = useState<ExecutionAuditEntry[]>(
    []
  );
  const [isAiRunning, setIsAiRunning] = useState<boolean>(false);
  const [isChainSyncing, setIsChainSyncing] = useState<boolean>(true);
  const [isTxPending, setIsTxPending] = useState<boolean>(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const [headlineSpeech, setHeadlineSpeech] = useState<string>(
    "Syncing live contracts on Mezo Testnet (Chain ID: 31611)..."
  );
  const [latestCycleHeadline, setLatestCycleHeadline] = useState<string>(
    "Syncing live 5-Agent Transformers Crew & PolicyVault.sol on Mezo Testnet (31611)..."
  );
  const [latestModelDecision, setLatestModelDecision] = useState<
    "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD"
  >("HOLD");
  const [latestDecisionReason, setLatestDecisionReason] = useState<string>(
    "Optimus Prime & the Autobot Council autonomously evaluate Soundwave's live signals and PolicyVault guardrails each cycle to decide: EXECUTE, RECTIFY, or HOLD."
  );
  const [latestCycleActions, setLatestCycleActions] = useState<MainActionResult[]>(
    []
  );
  const [strategyMandate, setStrategyMandate] = useState<MainStrategyMandate>(
    DEFAULT_MAIN_STRATEGY_MANDATE
  );
  const [mandateDrawerOpen, setMandateDrawerOpen] = useState<boolean>(false);
  const [isSavingMandate, setIsSavingMandate] = useState<boolean>(false);
  const [chatTargetAgent, setChatTargetAgent] = useState<
    "Council" | "Optimus Prime" | "Soundwave" | "Bumblebee" | "Ratchet" | "Ironhide"
  >("Council");
  const [latestActionBadge, setLatestActionBadge] = useState<{
    text: string;
    edge: string;
    amount: string;
    wasRectified: boolean;
  }>({
    text: "Autonomous Mode Active",
    edge: "Model Decides Action",
    amount: "0.0000 BTC",
    wasRectified: false,
  });
  const [customDirective, setCustomDirective] = useState<string>("");
  const [rightCardCollapsed, setRightCardCollapsed] = useState<boolean>(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState<boolean>(false);

  // Neon Postgres & Inngest Telemetry State
  const [neonConnected, setNeonConnected] = useState<boolean>(false);
  const [inngestTelemetry, setInngestTelemetry] =
    useState<InngestRunTelemetry | null>(null);
  const [activeDispatchedCycleUid, setActiveDispatchedCycleUid] = useState<
    string | null
  >(null);

  // Live Captured Crypto/Macro News & Market Trends from Narada (#05)
  const [capturedNews, setCapturedNews] = useState<NewsItemHeadline[]>([]);
  const [liveBtcPriceUsd, setLiveBtcPriceUsd] = useState<number>(0);
  const [liveBtcChange24h, setLiveBtcChange24h] = useState<number>(0);
  const [liveHigh24hUsd, setLiveHigh24hUsd] = useState<number>(0);
  const [liveLow24hUsd, setLiveLow24hUsd] = useState<number>(0);
  const [liveRangePositionPct, setLiveRangePositionPct] = useState<number>(50);
  const [liveFearGreedIndex, setLiveFearGreedIndex] = useState<number>(55);
  const [liveFearGreedLabel, setLiveFearGreedLabel] =
    useState<string>("Neutral");
  const [liveTrendDirection, setLiveTrendDirection] = useState<
    "UPTREND" | "DOWNTREND" | "RANGE_BOUND"
  >("RANGE_BOUND");
  const [liveVolatilityRegime, setLiveVolatilityRegime] = useState<
    "LOW" | "MODERATE" | "HIGH"
  >("MODERATE");
  const [liveBullishCount, setLiveBullishCount] = useState<number>(0);
  const [liveBearishCount, setLiveBearishCount] = useState<number>(0);
  const [liveNeutralCount, setLiveNeutralCount] = useState<number>(0);

  // Real 1-Hour Autonomous Cron (`0 * * * *`) + One-Shot 2-Minute Judge Trigger
  const [autoCronEnabled] = useState<boolean>(true);
  const [cronIntervalMode, setCronIntervalMode] = useState<"1h" | "2m">("1h");

  // PolicyVault & Mezo BTC Balance State (100% synced from Mezo Testnet 31611)
  const [vaultTvlBtc, setVaultTvlBtc] = useState<number>(0);
  const [userDepositedBtc, setUserDepositedBtc] = useState<number>(0);
  const [operatorAddress, setOperatorAddress] = useState<string>(
    "0xc176c1c6cdf68c852a8b4b80ddbcb9aaccf44e27"
  );
  const [operatorBalanceBtc, setOperatorBalanceBtc] = useState<number>(0);
  const [userWalletBalanceBtc, setUserWalletBalanceBtc] = useState<number>(0);
  const [depositInput, setDepositInput] = useState<string>("0.00005");
  const [hasScaledInputs, setHasScaledInputs] = useState<boolean>(false);
  const [rectifiedCount, setRectifiedCount] = useState<number>(0);
  const [totalSlicesExecuted, setTotalSlicesExecuted] = useState<number>(0);
  const [guardrails, setGuardrails] = useState<PolicyGuardrails>({
    maxSingleTradeBps: 1000, // 10.0%
    maxDailyDrawdownBps: 500, // 5.0%
    minConfidenceBps: 7000, // 70.0%
    cooldownSeconds: 0,
    emergencyLock: false,
  });

  // New DCA Schedule Form State
  const [newDcaAsset, setNewDcaAsset] = useState<string>("stBTC-MEZO-VAULT");
  const [newDcaSliceBtc, setNewDcaSliceBtc] = useState<string>("0.00002");
  const [newDcaInterval, setNewDcaInterval] =
    useState<string>("Every 1h (TWAP)");
  const [newDcaTotalSlices, setNewDcaTotalSlices] = useState<string>("24");

  // Real Wall-Clock Countdown Timer for Inngest 1-Hour Cron (`0 * * * *`)
  const [secondsLeft, setSecondsLeft] = useState<number>(
    () => 3600 - (Math.floor(Date.now() / 1000) % 3600)
  );

  const formatCountdown = (sec: number) => {
    const h = Math.floor(sec / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((sec % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString()
      .padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // Wallet & Mezo Testnet RPC State (Wagmi v2 + RainbowKit)
  const {
    address: wagmiAddress,
    isConnected,
    chainId,
    connector,
  } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const wagmiPublicClient = usePublicClient({ chainId: mezoTestnet.id });
  const walletAddress = wagmiAddress ?? null;
  const [contractAddresses, setContractAddresses] = useState(
    DEFAULT_CONTRACT_ADDRESSES
  );
  const [rpcBlockNumber, setRpcBlockNumber] = useState<string>("Syncing...");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastBanner, setToastBanner] = useState<{
    type: "success" | "error" | "info";
    title: string;
    detail: string;
    txHash?: string;
  } | null>(null);

  // MCP Playground State
  const [mcpResponse, setMcpResponse] = useState<string>("");
  const [isMcpLoading, setIsMcpLoading] = useState<boolean>(false);

  const showNotice = useCallback(
    (
      type: "success" | "error" | "info",
      title: string,
      detail: string,
      txHash?: string
    ) => {
      setToastBanner({ type, title, detail, txHash });
    },
    []
  );

  // Apply LiveOnChainState from /api/onchain-state or /api/ai-agents
  const applyOnChainState = useCallback(
    (state: LiveOnChainState) => {
      setRpcBlockNumber(state.blockNumber);
      setOperatorAddress(state.operatorAddress);
      setOperatorBalanceBtc(state.operatorBalanceBtc);
      setUserWalletBalanceBtc(state.userWalletBalanceBtc);
      setVaultTvlBtc(state.vaultTvlBtc);
      setUserDepositedBtc(state.userDepositedBtc);
      setGuardrails(state.guardrails);
      setAgents(state.agents);
      setDcaSchedules(state.dcaSchedules);
      setExecutionLedger(state.executionLedger);
      setRectifiedCount(state.rectifiedCount);
      setTotalSlicesExecuted(state.totalSlicesExecuted);

      if (!hasScaledInputs && state.vaultTvlBtc > 0) {
        const suggestedDeposit = Math.max(
          0.000001,
          Number((state.vaultTvlBtc * 0.2).toPrecision(2))
        );
        const suggestedSlice = Math.max(
          0.0000005,
          Number(
            (
              ((state.vaultTvlBtc * state.guardrails.maxSingleTradeBps) /
                10000) *
              0.5
            ).toPrecision(2)
          )
        );
        setDepositInput(formatBtcNumber(suggestedDeposit));
        setNewDcaSliceBtc(formatBtcNumber(suggestedSlice));
        setHasScaledInputs(true);
      }
    },
    [hasScaledInputs]
  );

  // Fetch 100% live state from Mezo Testnet (Chain ID 31611)
  const refreshOnChainState = useCallback(
    async (silent = false) => {
      if (!silent) setIsChainSyncing(true);
      try {
        const query = walletAddress
          ? `?user=${encodeURIComponent(walletAddress)}`
          : "";
        const res = await fetch(`/api/onchain-state${query}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (data.ok && data.state) {
          const st = data.state as LiveOnChainState;
          applyOnChainState(st);

          if (data.liveNews) {
            if (data.liveNews.btcPriceUsd) {
              setLiveBtcPriceUsd(data.liveNews.btcPriceUsd);
              setLiveBtcChange24h(data.liveNews.change24hPercent || 0);
            }
            if (data.liveNews.high24hUsd) {
              setLiveHigh24hUsd(data.liveNews.high24hUsd);
            }
            if (data.liveNews.low24hUsd) {
              setLiveLow24hUsd(data.liveNews.low24hUsd);
            }
            if (data.liveNews.rangePositionPct !== undefined) {
              setLiveRangePositionPct(data.liveNews.rangePositionPct);
            }
            if (data.liveNews.fearGreedIndex !== undefined) {
              setLiveFearGreedIndex(data.liveNews.fearGreedIndex);
            }
            if (data.liveNews.fearGreedLabel) {
              setLiveFearGreedLabel(data.liveNews.fearGreedLabel);
            }
            if (data.liveNews.trendDirection) {
              setLiveTrendDirection(data.liveNews.trendDirection);
            }
            if (data.liveNews.volatilityRegime) {
              setLiveVolatilityRegime(data.liveNews.volatilityRegime);
            }
            if (data.liveNews.bullishCount !== undefined) {
              setLiveBullishCount(data.liveNews.bullishCount);
            }
            if (data.liveNews.bearishCount !== undefined) {
              setLiveBearishCount(data.liveNews.bearishCount);
            }
            if (data.liveNews.neutralCount !== undefined) {
              setLiveNeutralCount(data.liveNews.neutralCount);
            }
            if (
              Array.isArray(data.liveNews.newsHeadlines) &&
              data.liveNews.newsHeadlines.length > 0
            ) {
              setCapturedNews(data.liveNews.newsHeadlines);
            }
          }

          if (data.neonStatus) {
            setNeonConnected(Boolean(data.neonStatus.neonConnected));
            const latestNeonCycle = data.neonStatus.latestCycle;
            if (
              latestNeonCycle &&
              Array.isArray(latestNeonCycle.messages) &&
              latestNeonCycle.messages.length > 0
            ) {
              setReasoningFeed(latestNeonCycle.messages);
              if (latestNeonCycle.headline) {
                setLatestCycleHeadline(latestNeonCycle.headline);
              }
              if (latestNeonCycle.decision) {
                setLatestModelDecision(latestNeonCycle.decision);
              }
              if (Array.isArray(latestNeonCycle.actions)) {
                setLatestCycleActions(latestNeonCycle.actions);
              }
              if (latestNeonCycle.txHash) {
                setLastTxHash(latestNeonCycle.txHash);
              }
            }
          }

          if (data.inngestTelemetry) {
            const tele = data.inngestTelemetry as InngestRunTelemetry;
            setInngestTelemetry(tele);
            if (tele.activeCycle) {
              setActiveDispatchedCycleUid(
                (prev) => prev ?? tele.activeCycle!.cycleUid
              );
              setIsAiRunning(true);
            }
          }

          if (!silent) {
            setHeadlineSpeech(
              `Live on Mezo 31611 (Block #${st.blockNumber}) • Vault TVL: ${formatBtc(
                st.vaultTvlBtc
              )}`
            );
          }
          if (st.initializedTxHashes && st.initializedTxHashes.length > 0) {
            const latestInitTx =
              st.initializedTxHashes[st.initializedTxHashes.length - 1];
            setLastTxHash(latestInitTx);
            showNotice(
              "success",
              "Mezo Testnet Contracts Initialized On-Chain",
              `Funded PolicyVault & created active DCA schedule on Chain 31611.`,
              latestInitTx
            );
          }
        }
      } catch (err) {
        if (!silent) {
          showNotice(
            "error",
            "Mezo Testnet RPC Sync Error",
            err instanceof Error ? err.message : "Could not reach Mezo RPC"
          );
        }
      } finally {
        if (!silent) setIsChainSyncing(false);
      }
    },
    [walletAddress, applyOnChainState, showNotice]
  );

  useEffect(() => {
    refreshOnChainState(false);
    const id = setInterval(() => {
      refreshOnChainState(true);
    }, 15000);
    return () => clearInterval(id);
  }, [refreshOnChainState]);

  useEffect(() => {
    let active = true;
    fetch("/api/mandate", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.ok && data.mandate) {
          setStrategyMandate(data.mandate as MainStrategyMandate);
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, []);

  const saveStrategyMandate = useCallback(
    async (
      patch: Partial<Omit<MainStrategyMandate, "mandateId" | "updatedAt">>
    ) => {
      setStrategyMandate((prev) => ({ ...prev, ...patch }));
      setIsSavingMandate(true);
      try {
        const res = await fetch("/api/mandate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (data?.ok && data.mandate) {
          setStrategyMandate(data.mandate as MainStrategyMandate);
        }
      } catch (err) {
        console.warn("[MainMandate] Save error:", err);
      } finally {
        setIsSavingMandate(false);
      }
    },
    []
  );

  const applyMultiActionStationMovements = useCallback(
    (actions: MainActionResult[]) => {
      if (!Array.isArray(actions) || actions.length === 0) return;
      const stationMap = new Map<string, string>();
      for (const act of actions) {
        if (act.status !== "EXECUTED") continue;
        if (
          act.type === "DEPOSIT_MUSD_VAULT" ||
          act.type === "WITHDRAW_MUSD_VAULT"
        ) {
          stationMap.set("Bumblebee", MAIN_MUSD_VAULT_STATION.id);
        } else if (
          act.type === "TUNE_POLICY_GUARDRAILS" ||
          act.type === "RESCUE_TROVE" ||
          act.type === "SWEEP_OVERDUE_LOAN"
        ) {
          stationMap.set("Ironhide", "guardrail_fort");
        } else if (act.type === "ANCHOR_COUNCIL_DEBATE") {
          stationMap.set("Soundwave", "lighthouse_beacon");
        }
      }
      if (stationMap.size === 0) return;
      setAgents((prev) =>
        prev.map((a) => {
          const target = stationMap.get(a.name);
          return target ? { ...a, currentStationId: target } : a;
        })
      );
    },
    []
  );

  const applyCyclePhaseToIsland = useCallback(
    (status: StoredCycleRecord["status"], wasRectified = false) => {
      if (status === "NEWS_SCANNING") {
        setCurrentPhase("NEWS_SCANNING");
        setVaultAlertState("NORMAL");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId:
              a.name === "Soundwave" || a.name === "Optimus Prime"
                ? "lighthouse_beacon"
                : a.homeStationId,
          }))
        );
      } else if (status === "HEAD_PLANNING") {
        setCurrentPhase("HEAD_PLANNING");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId:
              a.name === "Optimus Prime" || a.name === "Soundwave"
                ? "head_citadel"
                : a.homeStationId,
          }))
        );
      } else if (status === "DCA_SCHEDULING") {
        setCurrentPhase("DCA_SCHEDULING");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId:
              a.name === "Optimus Prime" || a.name === "Bumblebee"
                ? "dca_piggy"
                : a.homeStationId,
          }))
        );
      } else if (status === "ERROR_RECTIFYING") {
        setCurrentPhase("ERROR_RECTIFYING");
        setVaultAlertState("BLOCKED");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId:
              a.name === "Ratchet" ||
                a.name === "Bumblebee" ||
                a.name === "Optimus Prime"
                ? "rectifier_lab"
                : a.homeStationId,
          }))
        );
      } else if (status === "POLICY_AUDIT") {
        setCurrentPhase("POLICY_AUDIT");
        setVaultAlertState(wasRectified ? "RECTIFIED" : "PASSED");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId:
              a.name === "Ironhide" || a.name === "Ratchet"
                ? "policy_fortress"
                : a.homeStationId,
          }))
        );
      } else if (status === "ONCHAIN_SETTLEMENT") {
        setCurrentPhase("ONCHAIN_SETTLEMENT");
        setVaultAlertState(wasRectified ? "RECTIFIED" : "PASSED");
      } else {
        setCurrentPhase("ONCHAIN_SETTLEMENT");
        setVaultAlertState("NORMAL");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId: a.homeStationId,
          }))
        );
      }
    },
    []
  );

  // Live Turn-by-Turn Neon Streaming (SSE via /api/cycles/live?stream=1, with 1.5s poll fallback)
  useEffect(() => {
    if (!activeDispatchedCycleUid) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let eventSource: EventSource | null = null;
    const startedAt = Date.now();

    const handleLivePayload = (data: {
      ok?: boolean;
      telemetry?: InngestRunTelemetry;
      history?: StoredCycleRecord[];
      cycle?: StoredCycleRecord | null;
    }) => {
      if (cancelled || !data.ok) return;

      if (data.telemetry) {
        setInngestTelemetry(data.telemetry);
      }

      const tracked = data.cycle;
      if (tracked && tracked.cycleUid === activeDispatchedCycleUid) {
        applyCyclePhaseToIsland(tracked.status, tracked.wasRectified);

        if (Array.isArray(tracked.messages) && tracked.messages.length > 0) {
          setReasoningFeed(tracked.messages);
          setAgents((prev) =>
            prev.map((ag) => {
              const msg = tracked.messages.find((m) => m.speaker === ag.name);
              return msg
                ? { ...ag, speechBubble: msg.text.slice(0, 105) }
                : ag;
            })
          );
        }

        if (
          Array.isArray(tracked.newsHeadlines) &&
          tracked.newsHeadlines.length > 0
        ) {
          setCapturedNews(tracked.newsHeadlines);
        }
        if (tracked.headline) {
          setLatestCycleHeadline(tracked.headline);
        }
        if (tracked.decision) {
          setLatestModelDecision(tracked.decision);
        }
        if (Array.isArray(tracked.actions)) {
          setLatestCycleActions(tracked.actions);
        }
        if (tracked.txHash) {
          setLastTxHash(tracked.txHash);
        }

        if (tracked.status === "COMPLETED") {
          setActiveDispatchedCycleUid(null);
          setIsAiRunning(false);
          if (Array.isArray(tracked.actions)) {
            applyMultiActionStationMovements(tracked.actions);
          }
          const finalBtcStr = formatBtcNumber(tracked.finalSliceBtc || 0);
          if (tracked.decision === "HOLD") {
            setLatestActionBadge({
              text: "Verdict: HOLD (No On-Chain Tx)",
              edge: "Capital Preserved",
              amount: "0 BTC Spent",
              wasRectified: false,
            });
            setHeadlineSpeech(
              "⏸️ Autobot Council Verdict: HOLD — Preserved PolicyVault BTC (0 gas spent)"
            );
            showNotice(
              "info",
              "Cycle Completed: HOLD",
              tracked.headline || "Autobot Council preserved vault capital."
            );
          } else if (tracked.decision === "RECTIFY_AND_EXECUTE") {
            setLatestActionBadge({
              text: `Healed On-Chain: ${formatBtcNumber(
                tracked.proposedSliceBtc
              )} → ${finalBtcStr} BTC`,
              edge: "Ratchet Clamped (<=Cap)",
              amount: `${finalBtcStr} BTC`,
              wasRectified: true,
            });
            setHeadlineSpeech(
              `✅ Ratchet Healed & Settled ${finalBtcStr} BTC on Mezo 31611`
            );
            showNotice(
              "success",
              "Cycle Completed: RECTIFY & EXECUTE",
              `Ratchet healed and settled ${finalBtcStr} BTC on Mezo Testnet.`,
              tracked.txHash || undefined
            );
          } else {
            setLatestActionBadge({
              text: `Executed ${finalBtcStr} BTC Slice`,
              edge: "Ironhide Verified",
              amount: `${finalBtcStr} BTC`,
              wasRectified: false,
            });
            setHeadlineSpeech(
              `✅ Bumblebee Settled ${finalBtcStr} BTC DCA slice on Mezo 31611`
            );
            showNotice(
              "success",
              `Cycle Completed: EXECUTE DCA (${finalBtcStr} BTC)`,
              "Transformers crew settled on Mezo Testnet (31611).",
              tracked.txHash || undefined
            );
          }
          refreshOnChainState(true);
          return;
        }

        if (tracked.status === "FAILED") {
          setActiveDispatchedCycleUid(null);
          setIsAiRunning(false);
          showNotice(
            "error",
            "Autonomous Cycle Failed",
            tracked.headline || "Autonomous cycle failed while running."
          );
          refreshOnChainState(true);
          return;
        }
      }

      if (Date.now() - startedAt > 125000) {
        setActiveDispatchedCycleUid(null);
        setIsAiRunning(false);
        refreshOnChainState(true);
      }
    };

    const pollOnce = async () => {
      try {
        const res = await fetch(
          `/api/cycles/live?cycleUid=${encodeURIComponent(
            activeDispatchedCycleUid
          )}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        handleLivePayload(data);
      } catch {
        // retry on next tick
      }
    };

    const startFallbackPolling = () => {
      if (pollTimer || cancelled) return;
      pollOnce();
      pollTimer = setInterval(pollOnce, 1500);
    };

    if (typeof EventSource !== "undefined") {
      eventSource = new EventSource(
        `/api/cycles/live?cycleUid=${encodeURIComponent(
          activeDispatchedCycleUid
        )}&stream=1`
      );
      eventSource.addEventListener("cycle", (ev: MessageEvent) => {
        try {
          handleLivePayload(JSON.parse(ev.data));
        } catch {
          // ignore malformed chunk
        }
      });
      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
        startFallbackPolling();
      };
    } else {
      startFallbackPolling();
    }

    return () => {
      cancelled = true;
      eventSource?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [
    activeDispatchedCycleUid,
    applyCyclePhaseToIsland,
    refreshOnChainState,
    showNotice,
  ]);

  // Trigger Autonomous 5-Agent Transformers Gemini Decision Cycle (synced live to Neon DB writes)
  const runLiveAiCycle = useCallback(
    async (
      mode: "NORMAL_DCA" | "ERROR_RECTIFY" = "NORMAL_DCA",
      userChatMsg?: string,
      triggerSource: "MANUAL_UI" | "AUTO_TIMER" | "USER_CHAT" = "AUTO_TIMER"
    ) => {
      if (guardrails.emergencyLock) {
        showNotice(
          "error",
          "PolicyVault Emergency Lock Active",
          "Unlock the PolicyVault kill-switch on-chain before running autonomous cycles."
        );
        return;
      }

      const messageText = (userChatMsg ?? customDirective).trim();
      const clientCycleUid = `cycle-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      setIsAiRunning(true);
      setActionsMenuOpen(false);
      applyCyclePhaseToIsland("NEWS_SCANNING");
      setActiveDispatchedCycleUid(clientCycleUid);

      const activeSched = dcaSchedules[0];
      setHeadlineSpeech(
        messageText
          ? `💬 @${chatTargetAgent} & Autobot Council analyzing your message & deciding action...`
          : "🤖 Soundwave, Optimus Prime, Bumblebee, Ratchet & Ironhide streaming turns from Neon DB..."
      );

      let handedOffToInngest = false;

      try {
        const res = await fetch("/api/ai-agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleUid: clientCycleUid,
            scenario:
              mode === "ERROR_RECTIFY" ? "INTENTIONAL_OVERFLOW" : "NORMAL_DCA",
            scheduleId: activeSched !== undefined ? activeSched.id : 0,
            triggerSource: messageText ? "MANUAL_UI" : triggerSource,
            dispatchMode: "inngest-first",
            userDirective: messageText || undefined,
          }),
        });

        const data = await res.json();
        if (!data.ok) {
          throw new Error(data.error || "Autonomous agent cycle failed");
        }

        if (data.telemetry) {
          setInngestTelemetry(data.telemetry as InngestRunTelemetry);
        }

        if (data.dispatchedVia === "INNGEST" && data.cycleUid) {
          handedOffToInngest = true;
          setActiveDispatchedCycleUid(String(data.cycleUid));
          setHeadlineSpeech(
            "⚡ Dispatched via Inngest (mezo/cycle.requested) — streaming 5-agent Gemini deliberation..."
          );
          showNotice(
            "info",
            "Dispatched via Inngest (mezo/cycle.requested)",
            `Tracking live durable execution (${data.cycleUid}) turn-by-turn via SSE.`
          );
          setCustomDirective("");
          return;
        }

        setActiveDispatchedCycleUid(null);
        applyCyclePhaseToIsland("COMPLETED", Boolean(data.wasRectified));

        if (data.liveState) {
          applyOnChainState(data.liveState as LiveOnChainState);
        }

        if (data.neonPersisted !== undefined) {
          setNeonConnected(Boolean(data.neonPersisted));
        }

        if (data.decision) {
          setLatestModelDecision(data.decision);
        }
        if (Array.isArray(data.actions)) {
          setLatestCycleActions(data.actions as MainActionResult[]);
          applyMultiActionStationMovements(data.actions as MainActionResult[]);
        }
        if (data.mandate) {
          setStrategyMandate(data.mandate as MainStrategyMandate);
        }
        if (data.decisionReason) {
          setLatestDecisionReason(data.decisionReason);
        }

        if (data.market) {
          if (data.market.btcPriceUsd) {
            setLiveBtcPriceUsd(data.market.btcPriceUsd);
            setLiveBtcChange24h(data.market.change24hPercent || 0);
          }
          if (data.market.high24hUsd) {
            setLiveHigh24hUsd(data.market.high24hUsd);
          }
          if (data.market.low24hUsd) {
            setLiveLow24hUsd(data.market.low24hUsd);
          }
          if (data.market.rangePositionPct !== undefined) {
            setLiveRangePositionPct(data.market.rangePositionPct);
          }
          if (data.market.fearGreedIndex !== undefined) {
            setLiveFearGreedIndex(data.market.fearGreedIndex);
          }
          if (data.market.fearGreedLabel) {
            setLiveFearGreedLabel(data.market.fearGreedLabel);
          }
          if (data.market.trendDirection) {
            setLiveTrendDirection(data.market.trendDirection);
          }
          if (data.market.volatilityRegime) {
            setLiveVolatilityRegime(data.market.volatilityRegime);
          }
          if (data.market.bullishCount !== undefined) {
            setLiveBullishCount(data.market.bullishCount);
          }
          if (data.market.bearishCount !== undefined) {
            setLiveBearishCount(data.market.bearishCount);
          }
          if (data.market.neutralCount !== undefined) {
            setLiveNeutralCount(data.market.neutralCount);
          }
          if (Array.isArray(data.market.newsHeadlines)) {
            setCapturedNews(data.market.newsHeadlines);
          }
        }

        if (Array.isArray(data.agentThoughts)) {
          const roleTagByAgent: Record<string, AgentReasoningLog["stance"]> = {
            You: "USER",
            Soundwave: "NEWS",
            "Optimus Prime": "HEAD",
            Bumblebee: "DCA",
            Ratchet: "RECTIFIER",
            Ironhide: "GUARDRAIL",
          };
          const mappedLogs: AgentReasoningLog[] = data.agentThoughts.map(
            (t: {
              turnOrder: number;
              agentName: AgentReasoningLog["speaker"];
              replyToAgent: string;
              model: string;
              phase: string;
              thought: string;
              timestamp: string;
            }) => ({
              id: `turn-${Date.now()}-${t.turnOrder}`,
              timestamp: t.timestamp,
              speaker: t.agentName,
              replyTo: t.replyToAgent,
              roleTag: roleTagByAgent[t.agentName] || "DCA",
              stance: roleTagByAgent[t.agentName] || "DCA",
              aiModel: t.model,
              text: t.thought,
              badgeText:
                t.agentName === "You"
                  ? `You → @${t.replyToAgent}`
                  : `Turn #${t.turnOrder} • @${t.replyToAgent}`,
              badgeTone:
                t.agentName === "Soundwave"
                  ? "pink"
                  : t.agentName === "Optimus Prime" || t.agentName === "You"
                    ? "purple"
                    : t.agentName === "Bumblebee"
                      ? "amber"
                      : t.agentName === "Ratchet"
                        ? "emerald"
                        : "blue",
            })
          );

          setReasoningFeed(mappedLogs);
          setAgents((prev) =>
            prev.map((ag) => {
              const found = mappedLogs.find((l) => l.speaker === ag.name);
              return found
                ? {
                  ...ag,
                  speechBubble: found.text.slice(0, 105),
                }
                : ag;
            })
          );
        }

        const primaryTx = data.primaryTxHash || data.txHash || "";
        if (primaryTx) {
          setLastTxHash(primaryTx);
        }

        const initBtcStr = formatBtcNumber(data.proposedSliceBtc || 0);
        const finalBtcStr = formatBtcNumber(data.executedSliceBtc || 0);

        if (data.decision === "HOLD") {
          setLatestCycleHeadline(
            `Model Decision: HOLD & Preserve Capital • BTC $${(
              data.market?.btcPriceUsd || liveBtcPriceUsd
            ).toLocaleString()} (${data.market?.sentimentLabel || "NEUTRAL"})`
          );
          setLatestActionBadge({
            text: "Verdict: HOLD (No On-Chain Tx)",
            edge: "Capital Preserved",
            amount: "0 BTC Spent",
            wasRectified: false,
          });
          setHeadlineSpeech(
            `⏸️ Autobot Council Verdict: HOLD — Preserved PolicyVault BTC (Zero gas spent on Mezo 31611)`
          );
          showNotice(
            "info",
            "Autonomous Verdict: HOLD (No Transaction Broadcast)",
            data.decisionReason ||
            "Optimus Prime & Bumblebee decided not to execute a trade this cycle, preserving PolicyVault BTC."
          );
        } else if (data.wasRectified || data.decision === "RECTIFY_AND_EXECUTE") {
          setLatestCycleHeadline(
            `Model Decision: RECTIFY & EXECUTE • Healed ${initBtcStr} → ${finalBtcStr} BTC by Ratchet AI`
          );
          setLatestActionBadge({
            text: `Healed On-Chain: ${initBtcStr} → ${finalBtcStr} BTC`,
            edge: `Ratchet Clamped (<=Cap)`,
            amount: `${finalBtcStr} BTC`,
            wasRectified: true,
          });
          setHeadlineSpeech(
            `✅ Ratchet AI rectified ${data.violationReason || "MAX_SINGLE_TRADE_EXCEEDED"
            } on Mezo 31611 (Tx: ${shortenHex(primaryTx || "", 4)})`
          );
          showNotice(
            "success",
            "Autonomous Verdict: RECTIFY & EXECUTE (Mezo 31611)",
            `PolicyVault intercepted ${initBtcStr} BTC, then Ratchet executed rectified ${finalBtcStr} BTC slice on-chain!`,
            primaryTx
          );
        } else {
          setLatestCycleHeadline(
            `Model Decision: EXECUTE DCA • Bumblebee Mined ${finalBtcStr} BTC Slice on Mezo 31611`
          );
          setLatestActionBadge({
            text: `Executed ${finalBtcStr} BTC Slice`,
            edge: `Ironhide Verified`,
            amount: `${finalBtcStr} BTC`,
            wasRectified: false,
          });
          setHeadlineSpeech(
            `✅ Bumblebee Mined ${finalBtcStr} BTC DCA slice on Mezo 31611 (Tx: ${shortenHex(
              primaryTx || "",
              4
            )})`
          );
          showNotice(
            "success",
            `Autonomous Verdict: EXECUTE DCA (${finalBtcStr} BTC)`,
            `5 Transformers Agents settled on Mezo Testnet (31611).`,
            primaryTx
          );
        }

        setCustomDirective("");
      } catch (e) {
        setActiveDispatchedCycleUid(null);
        applyCyclePhaseToIsland("FAILED");
        showNotice(
          "error",
          "Mezo Testnet Execution Error",
          e instanceof Error ? e.message : "Failed to execute cycle"
        );
      } finally {
        if (!handedOffToInngest) {
          setIsAiRunning(false);
        }
      }
    },
    [
      guardrails.emergencyLock,
      dcaSchedules,
      customDirective,
      chatTargetAgent,
      liveBtcPriceUsd,
      applyCyclePhaseToIsland,
      applyOnChainState,
      showNotice,
    ]
  );

  // Real Wall-Clock 1-Hour Inngest Autonomous Cron + One-Shot 2-Minute Judge Trigger
  useEffect(() => {
    const timer = setInterval(() => {
      if (cronIntervalMode === "2m") {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            if (autoCronEnabled && !isAiRunning) {
              runLiveAiCycle("NORMAL_DCA", undefined, "AUTO_TIMER");
            }
            // Automatically switch back to 1-Hour schedule after the 2-minute trigger fires
            setCronIntervalMode("1h");
            return 3600 - (Math.floor(Date.now() / 1000) % 3600);
          }
          return prev - 1;
        });
      } else {
        const rem = 3600 - (Math.floor(Date.now() / 1000) % 3600);
        setSecondsLeft(rem);
        if (rem === 3600 && autoCronEnabled && !isAiRunning) {
          runLiveAiCycle("NORMAL_DCA", undefined, "AUTO_TIMER");
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [cronIntervalMode, autoCronEnabled, isAiRunning, runLiveAiCycle]);

  // Sync user on-chain balance & vault deposit whenever Wagmi wallet connects/switches
  useEffect(() => {
    if (walletAddress) {
      refreshOnChainState(true);
    }
  }, [walletAddress, refreshOnChainState]);

  const ensureMezoChain = async () => {
    if (isConnected && chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
  };

  const getReceiptClient = () =>
    wagmiPublicClient ??
    createPublicClient({
      chain: mezoTestnet,
      transport: http("https://rpc.test.mezo.org"),
    });

  // Real On-Chain Deposit into PolicyVault.sol (0xb3A7ab7be5116737b05B7682aCaC62e7D54B1477)
  const handleVaultDeposit = async () => {
    const amount = parseFloat(depositInput);
    if (isNaN(amount) || amount <= 0) return;

    setIsTxPending(true);
    try {
      if (isConnected && walletAddress && userWalletBalanceBtc >= amount) {
        await ensureMezoChain();
        const hash = await writeContractAsync({
          address: contractAddresses.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "deposit",
          chainId: mezoTestnet.id,
          value: parseEther(amount.toFixed(18)),
          gas: 300000n,
        });
        await getReceiptClient().waitForTransactionReceipt({ hash });
        setLastTxHash(hash);
        await refreshOnChainState(true);
        showNotice(
          "success",
          `Deposited ${depositInput} BTC on Mezo Testnet`,
          "Confirmed on PolicyVault.sol (Chain 31611).",
          hash
        );
        return;
      }

      // Otherwise execute via live Mezo Testnet operator wallet
      const res = await fetch("/api/onchain-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DEPOSIT",
          amountBtc: depositInput,
          userAddress: walletAddress || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Deposit failed");
      if (data.state) applyOnChainState(data.state);
      if (data.txHash) setLastTxHash(data.txHash);
      showNotice(
        "success",
        "Mezo Testnet Deposit Confirmed On-Chain",
        `Block #${data.blockNumber} • PolicyVault TVL updated.`,
        data.txHash
      );
    } catch (err) {
      showNotice(
        "error",
        "On-Chain Deposit Failed",
        err instanceof Error ? err.message : "Transaction failed"
      );
    } finally {
      setIsTxPending(false);
    }
  };

  // Real On-Chain Withdraw from PolicyVault.sol
  const handleVaultWithdraw = async () => {
    const amount = parseFloat(depositInput);
    if (isNaN(amount) || amount <= 0) return;

    setIsTxPending(true);
    try {
      if (isConnected && walletAddress && userDepositedBtc >= amount) {
        await ensureMezoChain();
        const hash = await writeContractAsync({
          address: contractAddresses.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "withdraw",
          chainId: mezoTestnet.id,
          args: [parseEther(amount.toFixed(18))],
          gas: 300000n,
        });
        await getReceiptClient().waitForTransactionReceipt({ hash });
        setLastTxHash(hash);
        await refreshOnChainState(true);
        showNotice(
          "success",
          `Withdrew ${depositInput} BTC from PolicyVault`,
          "Confirmed on Mezo Testnet (Chain 31611).",
          hash
        );
        return;
      }

      const res = await fetch("/api/onchain-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "WITHDRAW",
          amountBtc: depositInput,
          userAddress: walletAddress || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Withdraw failed");
      if (data.state) applyOnChainState(data.state);
      if (data.txHash) setLastTxHash(data.txHash);
      showNotice(
        "success",
        "Mezo Testnet Withdrawal Confirmed On-Chain",
        `Block #${data.blockNumber} • Self-custodial withdrawal settled.`,
        data.txHash
      );
    } catch (err) {
      showNotice(
        "error",
        "On-Chain Withdrawal Failed",
        err instanceof Error ? err.message : "Transaction failed"
      );
    } finally {
      setIsTxPending(false);
    }
  };

  // Real On-Chain Policy Guardrails Update (PolicyVault.updatePolicy)
  const handleSavePolicyOnChain = async (overrideLock?: boolean) => {
    setIsTxPending(true);
    const nextLock =
      overrideLock !== undefined ? overrideLock : guardrails.emergencyLock;
    try {
      const res = await fetch("/api/onchain-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_POLICY",
          maxSingleTradeBps: guardrails.maxSingleTradeBps,
          maxDailyDrawdownBps: guardrails.maxDailyDrawdownBps,
          minConfidenceBps: guardrails.minConfidenceBps,
          cooldownSeconds: guardrails.cooldownSeconds,
          emergencyLock: nextLock,
          userAddress: walletAddress || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Update policy failed");
      if (data.state) applyOnChainState(data.state);
      if (data.txHash) setLastTxHash(data.txHash);
      showNotice(
        "success",
        "PolicyVault Guardrails Updated On-Chain",
        `Confirmed in Block #${data.blockNumber} on Mezo Testnet (31611).`,
        data.txHash
      );
    } catch (err) {
      showNotice(
        "error",
        "On-Chain Policy Update Failed",
        err instanceof Error ? err.message : "Transaction failed"
      );
    } finally {
      setIsTxPending(false);
    }
  };

  // Real On-Chain DCA Schedule Creation (MezoDCAEngine.createDCASchedule)
  const handleCreateDcaSchedule = async () => {
    const slice = parseFloat(newDcaSliceBtc);
    const total = parseInt(newDcaTotalSlices, 10);
    if (isNaN(slice) || slice <= 0 || isNaN(total) || total <= 0) return;

    const intervalSeconds =
      newDcaInterval === "Every 4h"
        ? 14400
        : newDcaInterval === "Daily Epoch"
          ? 86400
          : 3600;

    setIsTxPending(true);
    try {
      if (isConnected && walletAddress && userWalletBalanceBtc > 0.00001) {
        await ensureMezoChain();
        const hash = await writeContractAsync({
          address: contractAddresses.dcaEngine,
          abi: DCA_ENGINE_ABI,
          functionName: "createDCASchedule",
          chainId: mezoTestnet.id,
          args: [
            `${newDcaAsset} Auto-DCA`,
            newDcaAsset,
            parseEther(slice.toFixed(18)),
            intervalSeconds,
            45,
            total,
          ],
          gas: 450000n,
        });
        await getReceiptClient().waitForTransactionReceipt({ hash });
        setLastTxHash(hash);
        await refreshOnChainState(true);
        showNotice(
          "success",
          `Created On-Chain DCA Schedule: ${newDcaAsset}`,
          `Confirmed on MezoDCAEngine.sol (Chain 31611).`,
          hash
        );
        return;
      }

      const res = await fetch("/api/onchain-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_DCA_SCHEDULE",
          strategyName: `${newDcaAsset} Auto-DCA`,
          targetAsset: newDcaAsset,
          sliceAmountBtc: newDcaSliceBtc,
          intervalSeconds,
          maxSlippageBps: 45,
          totalSlices: total,
          userAddress: walletAddress || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Create DCA schedule failed");
      if (data.state) applyOnChainState(data.state);
      if (data.txHash) setLastTxHash(data.txHash);
      showNotice(
        "success",
        `DCA Schedule Created On-Chain (Block #${data.blockNumber})`,
        `Kronos AI will accumulate ${newDcaSliceBtc} BTC per slice (${total} slices) on Mezo 31611.`,
        data.txHash
      );
    } catch (err) {
      showNotice(
        "error",
        "Create DCA Schedule Failed",
        err instanceof Error ? err.message : "Transaction failed"
      );
    } finally {
      setIsTxPending(false);
    }
  };

  const invokeMcpEndpoint = async (tool: string) => {
    setIsMcpLoading(true);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: tool,
            arguments:
              tool === "check_policy_vault"
                ? {
                  agentId: 2,
                  amountBtc:
                    vaultTvlBtc > 0
                      ? Number((vaultTvlBtc * 0.22).toFixed(8))
                      : 0.0001,
                  confidenceBps: 9200,
                }
                : {},
          },
        }),
      });
      const data = await res.json();
      setMcpResponse(JSON.stringify(data, null, 2));
    } catch (e) {
      setMcpResponse(JSON.stringify({ error: String(e) }, null, 2));
    } finally {
      setIsMcpLoading(false);
    }
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const fetchCustomIslands = useCallback(async () => {
    try {
      const res = await fetch(`/api/islands`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok && Array.isArray(data.islands)) {
        setCustomIslands(data.islands);
      }
    } catch (err) {
      console.error("Failed to fetch custom islands:", err);
    }
  }, []);

  const fetchSubIslandDetails = useCallback(async (id: string) => {
    if (!id || id === "main") {
      setSubIslandDetails(null);
      return;
    }
    try {
      const res = await fetch(`/api/islands/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as SubIslandDetailsResponse;
      if (data.ok) {
        setSubIslandDetails(data);
      }
    } catch (err) {
      console.error("Failed to fetch Sub-Island details:", err);
    }
  }, []);

  useEffect(() => {
    if (selectedIslandId !== "main") {
      fetchSubIslandDetails(selectedIslandId);
    } else {
      setSubIslandDetails(null);
      setWorkshopPreview(null);
      fetchCustomIslands();
    }
  }, [selectedIslandId, fetchSubIslandDetails, fetchCustomIslands]);

  const inspectedStation =
    selectedStationId === MAIN_MUSD_VAULT_STATION.id
      ? {
        id: MAIN_MUSD_VAULT_STATION.id,
        name: "Main MUSD Treasury Vault",
        subtitle: "ERC-4626 Lending & 5-Agent Credit Council",
        phase: "HEAD_PLANNING" as CyclePhase,
        position: MAIN_MUSD_VAULT_STATION.position,
        color: MAIN_MUSD_VAULT_STATION.color,
        roofColor: "#047857",
        description:
          "Main Island MUSD liquidity pool funding profitable Sub-Islands evaluated by Optimus Prime's 5-Agent Credit Council.",
      }
      : selectedStationId
        ? ISLAND_STATIONS.find((s) => s.id === selectedStationId) ?? null
        : null;
  const inspectedAgent =
    (selectedAgentId !== null
      ? agents.find((a) => a.id === selectedAgentId)
      : undefined) ??
    (inspectedStation
      ? agents.find((a) => a.homeStationId === inspectedStation.id)
      : undefined) ??
    null;

  const inspectedSatellite = selectedSatelliteIslandId
    ? customIslands.find((c) => c.islandId === selectedSatelliteIslandId) ?? null
    : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#a7d4f9] text-[#231f20] font-sans select-none">
      {/* =====================================================================
          1. POLLY.TOWN STYLE TOP-LEFT FLOATING PILL NAVIGATION & KPI CARDS
         ===================================================================== */}
      <div className="z-30 absolute top-4 left-4 right-4 flex flex-wrap items-start justify-between gap-3 pointer-events-none">
        <div className="flex flex-col gap-3">
          {/* Top Pill Row */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-2.5">
            {/* Main White Pill Navigation Bar */}
            <div className="flex items-center gap-1 rounded-full bg-white/95 p-1.5 pl-3 shadow-[0_10px_30px_rgba(35,31,32,0.1)] border border-white">
              <button
                onClick={() => setActiveTab("island")}
                className="flex items-center gap-2 pr-3"
              >
                <svg
                  viewBox="0 0 1000 1000"
                  className="h-7 w-7 rounded-full shadow-sm shrink-0"
                >
                  <circle cx="500" cy="500" r="495" fill="#FF083B" />
                  <path
                    fill="#FFFFFF"
                    d="M 62 512 L 278 512 C 278 432, 332 392, 396 392 C 445 392, 478 412, 510 444 L 566 508 C 566 432, 618 392, 682 392 C 732 392, 765 412, 796 444 L 852 512 L 924 512 C 924 590, 868 632, 804 632 C 754 632, 720 612, 688 580 L 636 512 C 636 590, 582 632, 518 632 C 468 632, 434 612, 402 580 L 348 512 L 284 580 C 252 612, 218 632, 174 632 C 108 632, 62 590, 62 512 Z"
                  />
                </svg>
                <span className="text-base tracking-tight text-[#231f20]">
                  <strong className="font-black">Mezo</strong>
                  <span className="font-normal text-[#524c48]">City</span>
                </span>
              </button>

              {[
                { id: "island" as const, label: "Island" },
                { id: "crew" as const, label: "Crew (5 AI)" },
                { id: "dca" as const, label: "DCA & Vault" },
                { id: "musd-vault" as const, label: "MUSD Vault" },
                { id: "lending" as const, label: "Mezo Guard" },
                { id: "contracts" as const, label: "Contracts" },
                { id: "docs" as const, label: "Docs" },
              ].map((nav) => (
                <button
                  key={nav.id}
                  onClick={() => {
                    setActiveTab(nav.id);
                    if (nav.id === "contracts" && !mcpResponse) {
                      invokeMcpEndpoint("check_policy_vault");
                    }
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${activeTab === nav.id
                    ? "bg-[#242331] text-white shadow-sm"
                    : "text-[#57524e] hover:text-[#231f20] hover:bg-stone-100"
                    }`}
                >
                  {nav.label}
                </button>
              ))}

              <a
                href="https://explorer.test.mezo.org"
                target="_blank"
                rel="noreferrer"
                title="Mezo Testnet Explorer"
                className="ml-1 h-8 w-8 rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
              >
                <svg viewBox="0 0 1000 1000" className="h-8 w-8 rounded-full">
                  <circle cx="500" cy="500" r="495" fill="#FF083B" />
                  <path
                    fill="#FFFFFF"
                    d="M 62 512 L 278 512 C 278 432, 332 392, 396 392 C 445 392, 478 412, 510 444 L 566 508 C 566 432, 618 392, 682 392 C 732 392, 765 412, 796 444 L 852 512 L 924 512 C 924 590, 868 632, 804 632 C 754 632, 720 612, 688 580 L 636 512 C 636 590, 582 632, 518 632 C 468 632, 434 612, 402 580 L 348 512 L 284 580 C 252 612, 218 632, 174 632 C 108 632, 62 590, 62 512 Z"
                  />
                </svg>
              </a>
            </div>

            {/* RainbowKit Multi-Wallet Pill (Wagmi v2 + EIP-6963) */}
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                const connected = ready && account && chain;

                if (!connected) {
                  return (
                    <button
                      type="button"
                      onClick={openConnectModal}
                      disabled={!ready}
                      className="flex items-center gap-2 rounded-full bg-[#fde896] hover:bg-[#fce078] px-3.5 py-2 text-xs font-extrabold text-[#5c4308] shadow-[0_8px_20px_rgba(35,31,32,0.08)] border border-[#fef4c9] transition-all"
                    >
                      <Wallet className="h-3.5 w-3.5 text-[#855f0a]" />
                      <span>Connect Wallet</span>
                    </button>
                  );
                }

                if (chain.unsupported || chain.id !== mezoTestnet.id) {
                  return (
                    <button
                      type="button"
                      onClick={openChainModal}
                      className="flex items-center gap-2 rounded-full bg-amber-200 hover:bg-amber-300 px-3.5 py-2 text-xs font-extrabold text-amber-950 shadow-[0_8px_20px_rgba(35,31,32,0.08)] border border-amber-300 transition-all"
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-600 animate-pulse" />
                      <span>Switch to Mezo 31611</span>
                    </button>
                  );
                }

                return (
                  <button
                    type="button"
                    onClick={openAccountModal}
                    title={
                      connector?.name
                        ? `Connected via ${connector.name} • Manage Wallet`
                        : "Manage Connected Wallet"
                    }
                    className="flex items-center gap-2 rounded-full bg-[#fde896] hover:bg-[#fce078] px-3.5 py-2 text-xs font-extrabold text-[#5c4308] shadow-[0_8px_20px_rgba(35,31,32,0.08)] border border-[#fef4c9] transition-all"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
                    <span>
                      {connector?.name
                        ? `${connector.name} • `
                        : "Mezo 31611 • "}
                      {account.displayName}
                    </span>
                  </button>
                );
              }}
            </ConnectButton.Custom>

            {/* Island Switcher & Sub-Island Builder Dropdown Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIslandMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-full bg-white/95 hover:bg-white px-3.5 py-2 text-xs font-extrabold text-[#231f20] shadow-[0_8px_20px_rgba(35,31,32,0.08)] border border-white transition-all"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                <span>
                  {selectedIslandId === "main"
                    ? "Main Island"
                    : subIslandDetails?.island?.name || "Sub-Island"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-stone-500" />
              </button>

              {islandMenuOpen && (
                <div className="absolute left-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-2xl bg-white/98 p-2 shadow-2xl border border-stone-200 z-50 space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIslandId("main");
                      setSelectedSatelliteIslandId(null);
                      setActiveTab("island");
                      setIslandMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${selectedIslandId === "main"
                      ? "bg-violet-50 text-violet-900"
                      : "hover:bg-stone-100 text-[#231f20]"
                      }`}
                  >
                    <span>Main MezoCity Island</span>
                    <span className="text-[10px] font-black text-emerald-700">FLAGSHIP</span>
                  </button>

                  {[...customIslands]
                    .sort((a, b) => {
                      const wl = (walletAddress || "").toLowerCase();
                      const aOwned = wl && a.ownerAddress.toLowerCase() === wl ? 1 : 0;
                      const bOwned = wl && b.ownerAddress.toLowerCase() === wl ? 1 : 0;
                      return bOwned - aOwned;
                    })
                    .map((isl) => {
                      const isOwned = Boolean(
                        walletAddress &&
                        isl.ownerAddress.toLowerCase() === walletAddress.toLowerCase()
                      );
                      return (
                        <button
                          key={isl.islandId}
                          type="button"
                          onClick={() => {
                            setSelectedSatelliteIslandId(null);
                            setSelectedIslandId(isl.islandId);
                            setActiveTab("island");
                            setIslandMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${selectedIslandId === isl.islandId
                            ? "bg-violet-50 text-violet-900"
                            : "hover:bg-stone-100 text-[#231f20]"
                            }`}
                        >
                          <span className="truncate flex items-center gap-1.5">
                            {isOwned && (
                              <span className="shrink-0 rounded bg-amber-100 px-1 py-0.2 text-[8.5px] font-black text-amber-800 border border-amber-300">
                                YOU
                              </span>
                            )}
                            <span className="truncate">{isl.name}</span>
                          </span>
                          <span className="shrink-0 text-[10px] font-mono text-stone-500 uppercase">
                            {isl.biomeTheme}
                          </span>
                        </button>
                      );
                    })}

                  <div className="border-t border-stone-200 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIslandMenuOpen(false);
                        setCreateIslandModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-black text-violet-700 hover:bg-violet-50 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      <span>+ Create New Empty Island</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Contract / Vault Address Copy & Explorer Pill */}
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-xs font-bold text-[#231f20] shadow-[0_8px_20px_rgba(35,31,32,0.08)] border border-white">
              <span className="h-4 w-4 rounded-full bg-amber-400 flex items-center justify-center text-[9px] font-black text-amber-950">
                ₿
              </span>
              <span className="font-extrabold">$VAULT</span>
              <a
                href={`https://explorer.test.mezo.org/address/${contractAddresses.policyVault}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-[#6e6762] hover:underline"
              >
                {shortenHex(contractAddresses.policyVault, 4)}
              </a>
              <button
                onClick={() =>
                  copyText("headerVault", contractAddresses.policyVault)
                }
                className="text-[#6e6762] hover:text-[#231f20]"
              >
                {copiedKey === "headerVault" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Dark "Council ▾" Pill Dropdown */}
            <div className="relative">
              <button
                onClick={() => setActionsMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-full bg-[#242331] hover:bg-[#343246] px-4 py-2 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(35,31,32,0.14)] transition-all"
              >
                <span>Council</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              {actionsMenuOpen && (
                <div className="absolute left-0 mt-2 w-68 rounded-2xl bg-white/98 p-2 shadow-2xl border border-stone-200 z-50 space-y-1">
                  <button
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setActiveTab("island");
                      setRightCardCollapsed(false);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#231f20] hover:bg-purple-50 transition-colors"
                  >
                    <Sparkles className="h-4 w-4 text-[#8b5cf6]" />
                    <div>
                      <div>View Council Deliberation & Live Trends</div>
                      <div className="text-[10px] text-stone-500 font-normal">
                        Soundwave signals + 24h trends drive autonomous decisions
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setActiveTab("dca");
                    }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#231f20] hover:bg-amber-50 transition-colors"
                  >
                    <Plus className="h-4 w-4 text-amber-600" />
                    <div>
                      <div>Manage PolicyVault & DCA Schedules</div>
                      <div className="text-[10px] text-stone-500 font-normal">
                        Deposit BTC, update guardrails & schedules
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setActiveTab("contracts");
                    }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#231f20] hover:bg-emerald-50 transition-colors"
                  >
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <div>
                      <div>Inspect On-Chain Audit Ledger</div>
                      <div className="text-[10px] text-stone-500 font-normal">
                        Verify Mezo 31611 PolicyVault & Rectifier proofs
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 4 Pastel KPI Cards on Top-Left (Main Island Only) */}
          {activeTab === "island" && selectedIslandId === "main" && (
            <div className="pointer-events-auto flex flex-wrap items-stretch gap-2.5">
              {/* Card 1: Mint Green On-Chain Vault & DCA Card */}
              <div
                onClick={() => setActiveTab("dca")}
                className="cursor-pointer rounded-2xl bg-[#c2f0d6]/95 border-2 border-white/90 px-4 py-2.5 shadow-[0_10px_25px_rgba(35,31,32,0.08)] min-w-[150px] hover:scale-[1.02] transition-transform"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#26593d]">
                  ON-CHAIN VAULT TVL
                </div>
                <div className="text-lg font-black text-[#126b3a] leading-tight mt-0.5">
                  {formatBtc(vaultTvlBtc)}
                </div>
                <div className="text-[11px] font-semibold text-[#2d6647] mt-0.5">
                  {totalSlicesExecuted} on-chain DCA slices
                </div>
              </div>

              {/* Card 2: Soft Sky-Blue Autonomous Model Decision Card */}
              <div
                onClick={() => {
                  setRightCardCollapsed(false);
                }}
                className="cursor-pointer rounded-2xl bg-[#cde3fe]/95 border-2 border-white/90 px-4 py-2.5 shadow-[0_10px_25px_rgba(35,31,32,0.08)] min-w-[155px] hover:scale-[1.02] transition-transform"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#284b7a]">
                  MODEL VERDICT
                </div>
                <div className="text-lg font-black text-[#1e293b] leading-tight mt-0.5">
                  {latestModelDecision === "HOLD"
                    ? "⏸️ HOLD"
                    : latestModelDecision === "RECTIFY_AND_EXECUTE"
                      ? "🩺 HEALED"
                      : "🟢 EXECUTE"}
                </div>
                <div className="text-[11px] font-semibold text-[#335580] mt-0.5">
                  {latestCycleActions.filter((a) => a.status === "EXECUTED").length > 1
                    ? `${latestCycleActions.filter((a) => a.status === "EXECUTED").length} actions • ${strategyMandate.riskMode}`
                    : latestModelDecision === "HOLD"
                      ? `Capital preserved • ${strategyMandate.riskMode}`
                      : `${rectifiedCount} auto-rectified fixes`}
                </div>
              </div>

              {/* Card 3: Soft Butter-Yellow Transformers Gemini AI Crew Card */}
              <div
                onClick={() => setActiveTab("crew")}
                className="cursor-pointer rounded-2xl bg-[#fdeaa6]/95 border-2 border-white/90 px-4 py-2.5 shadow-[0_10px_25px_rgba(35,31,32,0.08)] min-w-[165px] hover:scale-[1.02] transition-transform"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#6e5111]">
                  TRANSFORMERS CREW
                </div>
                <div className="text-lg font-black text-[#231f20] leading-tight mt-0.5">
                  5 Autobots{" "}
                  <span className="text-xs font-bold text-[#785a16]">
                    / Gemini 3.8
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-[#6e5111] mt-0.5">
                  {neonConnected ? "Neon Cloud DB Live" : "Inngest 1h Cron Armed"}
                </div>
              </div>

              {/* Card 4: Soft Rose-Pink Soundwave Live News & BTC Feed Card */}
              <div
                onClick={() => {
                  setSelectedStationId(null);
                  setSelectedAgentId(5);
                  setChatTargetAgent("Soundwave");
                }}
                className="cursor-pointer rounded-2xl bg-[#fbd5e5]/95 border-2 border-white/90 px-4 py-2.5 shadow-[0_10px_25px_rgba(35,31,32,0.08)] min-w-[165px] hover:scale-[1.02] transition-transform"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#831843]">
                  SOUNDWAVE INTEL
                </div>
                <div className="text-lg font-black text-[#831843] leading-tight mt-0.5">
                  ${liveBtcPriceUsd.toLocaleString()}{" "}
                  <span className="text-xs font-bold">
                    ({liveBtcChange24h >= 0 ? "+" : ""}
                    {liveBtcChange24h}%)
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-[#9d174d] mt-0.5">
                  {capturedNews.length} live headlines captured
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification Banner with Clickable Mezo Testnet Explorer Link */}
      {toastBanner && (
        <div className="z-50 fixed bottom-5 left-1/2 -translate-x-1/2 max-w-md w-[92vw] pointer-events-auto">
          <div
            className={`rounded-2xl border-2 px-4 py-3 shadow-2xl flex items-start justify-between gap-3 ${toastBanner.type === "error"
              ? "bg-red-50 border-red-300 text-red-950"
              : toastBanner.type === "success"
                ? "bg-white border-emerald-400 text-[#231f20]"
                : "bg-white border-[#8b5cf6] text-[#231f20]"
              }`}
          >
            <div className="flex items-start gap-2.5">
              {toastBanner.type === "error" ? (
                <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-xs font-extrabold">{toastBanner.title}</div>
                <div className="text-[11px] text-stone-600 mt-0.5">
                  {toastBanner.detail}
                </div>
                {toastBanner.txHash && (
                  <a
                    href={`https://explorer.test.mezo.org/tx/${toastBanner.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#7c3aed] hover:underline mt-1"
                  >
                    <span>
                      View on Mezo Explorer ({shortenHex(toastBanner.txHash, 6)})
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <button
              onClick={() => setToastBanner(null)}
              className="text-xs font-bold opacity-50 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. VIEW 1: POLLY.TOWN 3D ISLAND + RIGHT FLOATING AI COUNCIL & CHAT CARD
                     OR EMPTY CUSTOM SUB-ISLAND BUILDER WORKSPACE
         ===================================================================== */}
      {activeTab === "island" && selectedIslandId !== "main" && !subIslandDetails && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff] text-[#231f20] gap-3">
          <div className="h-12 w-12 rounded-full bg-[#7c3aed] animate-bounce flex items-center justify-center text-white font-black shadow-lg">
            🏝️
          </div>
          <p className="text-sm font-black">Syncing Sub-Island Vault & Agents...</p>
          <button
            type="button"
            onClick={() => setSelectedIslandId("main")}
            className="rounded-full bg-white px-4 py-1.5 text-xs font-extrabold shadow"
          >
            &larr; Return to Main Island
          </button>
        </div>
      )}

      {activeTab === "island" && selectedIslandId !== "main" && subIslandDetails && (
        <div className="relative w-full h-full">
          <div className="absolute inset-0 z-0">
            <CustomIslandScene
              islandName={subIslandDetails.island.name}
              biomeTheme={subIslandDetails.island.biomeTheme}
              vaults={subIslandDetails.vaults}
              agents={subIslandDetails.agents}
              selectedPlotIndex={subPlotIndex}
              onSelectPlot={(p) => setSubPlotIndex(p)}
              selectedAgentId={subAgentId}
              onSelectAgent={(id) => setSubAgentId(id)}
              workshopPreview={workshopPreview}
              cameraResetTick={cameraResetTick}
            />
          </div>

          <div className="z-20 absolute bottom-4 left-4 flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => setSelectedIslandId("main")}
              className="rounded-full bg-white/95 hover:bg-white px-3.5 py-2 text-xs font-extrabold text-[#231f20] shadow-lg border border-white"
            >
              &larr; Main Island
            </button>
            <button
              type="button"
              onClick={() => {
                setSubPlotIndex(null);
                setSubAgentId(null);
                setCameraResetTick((t) => t + 1);
              }}
              className="rounded-full bg-white/95 hover:bg-white px-3.5 py-2 text-xs font-extrabold text-[#231f20] shadow-lg border border-white inline-flex items-center gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Overview</span>
            </button>
          </div>

          <aside className="z-30 fixed top-20 right-4 bottom-4 pointer-events-none flex justify-end">
            <SubIslandWorkspace
              details={subIslandDetails}
              selectedPlotIndex={subPlotIndex}
              onSelectPlot={setSubPlotIndex}
              selectedAgentId={subAgentId}
              onSelectAgent={setSubAgentId}
              onWorkshopPreviewChange={setWorkshopPreview}
              onRefresh={async () => {
                await fetchSubIslandDetails(selectedIslandId);
                await fetchCustomIslands();
              }}
            />
          </aside>
        </div>
      )}

      {activeTab === "island" && selectedIslandId === "main" && (
        <div className="relative w-full h-full">
          {/* Center 3D Clay Island Scene */}
          <div className="absolute inset-0 z-0">
            <ClayIslandScene
              agents={agents}
              currentPhase={currentPhase}
              selectedAgentId={selectedAgentId}
              onSelectAgent={(id) => {
                setSelectedSatelliteIslandId(null);
                setSelectedStationId(null);
                setSelectedAgentId(id);
                const found = agents.find((a) => a.id === id);
                if (found) setChatTargetAgent(found.name);
              }}
              selectedStationId={selectedStationId}
              onSelectStation={(id) => {
                setSelectedSatelliteIslandId(null);
                setSelectedStationId(id);
                const owner = agents.find((a) => a.homeStationId === id);
                if (owner) {
                  setSelectedAgentId(owner.id);
                  setChatTargetAgent(owner.name);
                } else {
                  setSelectedAgentId(null);
                }
              }}
              cameraResetTick={cameraResetTick}
              archipelagoOverviewTick={archipelagoOverviewTick}
              vaultAlertState={vaultAlertState}
              modelDecision={latestModelDecision}
              headlineSpeech={headlineSpeech}
              dcaCountdown={formatCountdown(secondsLeft)}
              subIslands={customIslands}
              connectedWalletAddress={walletAddress ?? undefined}
              selectedSubIslandId={selectedSatelliteIslandId}
              onSelectSubIsland={(islandId) => {
                setSelectedAgentId(null);
                setSelectedStationId(null);
                setSelectedSatelliteIslandId(islandId);
              }}
              onEnterSubIsland={(islandId) => {
                setSelectedSatelliteIslandId(null);
                setSelectedIslandId(islandId);
                setActiveTab("island");
              }}
            />
          </div>

          {/* BOTTOM-LEFT FLOATING 3D ISLAND INSPECTOR & CAMERA FOCUS HUD */}
          <div className="z-20 absolute bottom-4 left-4 flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)]">
            {inspectedSatellite ? (
              <div className="pointer-events-auto w-[360px] max-w-full rounded-[24px] bg-[#faf7f2]/95 border-[2.5px] border-white shadow-[0_16px_40px_rgba(35,31,32,0.16)] p-3.5 backdrop-blur-md">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-3.5 w-3.5 rounded-full shrink-0 border border-white shadow-sm ${inspectedSatellite.biomeTheme === "grid"
                        ? "bg-cyan-500"
                        : inspectedSatellite.biomeTheme === "basalt"
                          ? "bg-orange-500"
                          : inspectedSatellite.biomeTheme === "sand"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-black text-[#231f20] truncate">
                          {inspectedSatellite.name}
                        </span>
                        {walletAddress &&
                          inspectedSatellite.ownerAddress.toLowerCase() ===
                          walletAddress.toLowerCase() && (
                            <span className="rounded-full bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[8.5px] font-black text-amber-800 uppercase">
                              YOUR ISLAND
                            </span>
                          )}
                        <span className="rounded-full bg-[#242331] px-2 py-0.5 text-[8.5px] font-black text-white uppercase tracking-wider">
                          {inspectedSatellite.biomeTheme}
                        </span>
                      </div>
                      <div className="text-[10.5px] font-bold text-[#6e655d] truncate">
                        Owner {shortenHex(inspectedSatellite.ownerAddress)} •{" "}
                        {inspectedSatellite.chainIslandId !== null
                          ? `Chain #${inspectedSatellite.chainIslandId}`
                          : "Syncing ID"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSatelliteIslandId(null);
                      setCameraResetTick((t) => t + 1);
                    }}
                    title="Close Sub-Island Inspector"
                    className="h-6 w-6 rounded-full bg-[#ede7dc] hover:bg-[#e2d9c8] flex items-center justify-center text-[#4a433d] shrink-0 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Live Bridge Link Status Banner */}
                <div className="rounded-xl bg-[#f3ede2] border border-[#e6dec8] px-2.5 py-2 mb-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold text-[#4a433d]">
                    <span className="truncate">
                      🔗 Linked to Main MUSD Treasury Vault
                    </span>
                    <span className="shrink-0 rounded bg-white/90 px-1.5 py-0.5 text-[8.5px] font-black uppercase text-[#7c3aed]">
                      {(inspectedSatellite.latestLoanStatus || "").replace(
                        /_/g,
                        " "
                      ) ||
                        ((inspectedSatellite.latestProfitUsd || 0) > 0
                          ? "PROFIT PROVED"
                          : (inspectedSatellite.vaultCount || 0) === 0 &&
                            (inspectedSatellite.agentCount || 0) === 0
                            ? "EMPTY LAND"
                            : "ACTIVE LINK")}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-[#5c534a] mt-1 leading-snug line-clamp-2">
                    {inspectedSatellite.description ||
                      "Floating Sub-Island settled on Mezo Testnet 31611, bridged to Main MUSD Credit Council."}
                  </p>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                  <div className="rounded-xl bg-white/90 border border-[#ebe3d3] px-2 py-1.5 text-center">
                    <div className="text-[8.5px] font-extrabold uppercase text-[#7a7067]">
                      Seed Stake
                    </div>
                    <div className="text-[10.5px] font-black text-[#231f20] truncate">
                      {inspectedSatellite.seedBtc > 0
                        ? `${formatBtcNumber(inspectedSatellite.seedBtc)} BTC`
                        : `${inspectedSatellite.seedMusd.toFixed(1)} MUSD`}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/90 border border-[#ebe3d3] px-2 py-1.5 text-center">
                    <div className="text-[8.5px] font-extrabold uppercase text-[#7a7067]">
                      Build Plots
                    </div>
                    <div className="text-[10.5px] font-black text-[#7c3aed]">
                      {inspectedSatellite.vaultCount || 0}V ·{" "}
                      {inspectedSatellite.agentCount || 0}B
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/90 border border-[#ebe3d3] px-2 py-1.5 text-center">
                    <div className="text-[8.5px] font-extrabold uppercase text-[#7a7067]">
                      Latest PnL / Loan
                    </div>
                    <div className="text-[10.5px] font-black text-[#126b3a] truncate">
                      {inspectedSatellite.latestApprovedMusd &&
                        inspectedSatellite.latestApprovedMusd > 0
                        ? `${Math.round(inspectedSatellite.latestApprovedMusd)} MUSD`
                        : inspectedSatellite.latestProfitUsd !== null &&
                          inspectedSatellite.latestProfitUsd !== undefined
                          ? `${inspectedSatellite.latestProfitUsd >= 0 ? "+" : ""}$${inspectedSatellite.latestProfitUsd.toFixed(2)}`
                          : "Seeded"}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSatelliteIslandId(null);
                      setSelectedIslandId(inspectedSatellite.islandId);
                      setActiveTab("island");
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1.5 text-[10.5px] font-extrabold transition-colors"
                  >
                    <span>Enter Sub-Island</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSatelliteIslandId(null);
                      setArchipelagoOverviewTick((t) => t + 1);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-violet-100 hover:bg-violet-200 text-violet-900 px-2.5 py-1.5 text-[10.5px] font-extrabold transition-colors"
                  >
                    <Globe className="h-3 w-3" />
                    <span>Archipelago</span>
                  </button>
                </div>
              </div>
            ) : inspectedAgent || inspectedStation ? (
              <div className="pointer-events-auto w-[345px] max-w-full rounded-[24px] bg-[#faf7f2]/95 border-[2.5px] border-white shadow-[0_16px_40px_rgba(35,31,32,0.16)] p-3.5 backdrop-blur-md">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-3.5 w-3.5 rounded-full shrink-0 border border-white shadow-sm"
                      style={{
                        backgroundColor:
                          inspectedAgent?.color ||
                          inspectedStation?.color ||
                          "#8b5cf6",
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-black text-[#231f20] truncate">
                          {inspectedAgent
                            ? inspectedAgent.name
                            : inspectedStation?.name}
                        </span>
                        {inspectedAgent && (
                          <span className="rounded-full bg-[#242331] px-2 py-0.5 text-[9px] font-black text-white uppercase tracking-wider">
                            {inspectedAgent.erc8004Id}
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] font-bold text-[#6e655d] truncate">
                        {inspectedAgent
                          ? inspectedAgent.role
                          : inspectedStation?.subtitle}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAgentId(null);
                      setSelectedStationId(null);
                      setCameraResetTick((t) => t + 1);
                    }}
                    title="Return Camera to Island Overview"
                    className="h-6 w-6 rounded-full bg-[#ede7dc] hover:bg-[#e2d9c8] flex items-center justify-center text-[#4a433d] shrink-0 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Focused Station or Current Location */}
                {(() => {
                  const activeStation =
                    inspectedStation ||
                    (inspectedAgent
                      ? ISLAND_STATIONS.find(
                        (s) => s.id === inspectedAgent.currentStationId
                      ) ?? null
                      : null);
                  if (!activeStation) return null;
                  return (
                    <div className="rounded-xl bg-[#f3ede2] border border-[#e6dec8] px-2.5 py-2 mb-2">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold text-[#4a433d]">
                        <span className="truncate">
                          📍 {activeStation.name}
                        </span>
                        <span className="shrink-0 rounded bg-white/90 px-1.5 py-0.5 text-[8.5px] font-black uppercase text-[#7c3aed]">
                          {activeStation.phase.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-[#5c534a] mt-1 leading-snug line-clamp-2">
                        {inspectedStation
                          ? inspectedStation.description
                          : `“${inspectedAgent?.speechBubble}”`}
                      </p>
                    </div>
                  );
                })()}

                {/* On-Chain Reputation & Action Metrics */}
                {inspectedAgent && (
                  <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                    <div className="rounded-xl bg-white/90 border border-[#ebe3d3] px-2 py-1.5 text-center">
                      <div className="text-[8.5px] font-extrabold uppercase text-[#7a7067]">
                        Reputation
                      </div>
                      <div className="text-xs font-black text-[#126b3a]">
                        {(inspectedAgent.reputationBps / 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/90 border border-[#ebe3d3] px-2 py-1.5 text-center">
                      <div className="text-[8.5px] font-extrabold uppercase text-[#7a7067]">
                        Success Rate
                      </div>
                      <div className="text-xs font-black text-[#7c3aed]">
                        {inspectedAgent.successRate}%
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/90 border border-[#ebe3d3] px-2 py-1.5 text-center">
                      <div className="text-[8.5px] font-extrabold uppercase text-[#7a7067]">
                        Actions
                      </div>
                      <div className="text-xs font-black text-[#231f20]">
                        {inspectedAgent.totalActions}
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Focus & Chat Controls */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {inspectedStation?.id === MAIN_MUSD_VAULT_STATION.id && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("musd-vault")}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1.5 text-[10.5px] font-extrabold transition-colors"
                    >
                      <span>Open MUSD Vault & Council</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  )}
                  {inspectedAgent && (
                    <button
                      type="button"
                      onClick={() => {
                        setChatTargetAgent(inspectedAgent.name);
                        setRightCardCollapsed(false);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white px-2.5 py-1.5 text-[10.5px] font-extrabold transition-colors"
                    >
                      <Send className="h-3 w-3" />
                      <span>Chat @{inspectedAgent.name}</span>
                    </button>
                  )}
                  {inspectedAgent && !inspectedStation && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedStationId(inspectedAgent.currentStationId)
                      }
                      className="inline-flex items-center gap-1 rounded-xl bg-[#ede7dc] hover:bg-[#e2d9c8] text-[#231f20] px-2.5 py-1.5 text-[10.5px] font-extrabold transition-colors"
                      title="Pan camera to agent's current 3D station"
                    >
                      <Crosshair className="h-3 w-3" />
                      <span>Station</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSatelliteIslandId(null);
                      setSelectedAgentId(null);
                      setSelectedStationId(null);
                      setCameraResetTick((t) => t + 1);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-white hover:bg-stone-100 border border-[#dfd6c5] text-[#4a433d] px-2.5 py-1.5 text-[10.5px] font-extrabold transition-colors"
                    title="Reset 3D camera to island overview"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Overview</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Quick Autobot Camera Switcher Bar */}
            <div className="pointer-events-auto inline-flex flex-wrap items-center gap-1 rounded-full bg-white/95 border-2 border-white px-2.5 py-1.5 shadow-[0_10px_28px_rgba(35,31,32,0.12)] backdrop-blur-md">
              <span className="text-[9.5px] font-black uppercase tracking-wider text-[#6e655d] px-1">
                Focus:
              </span>
              {agents.map((ag) => {
                const isSelected = selectedAgentId === ag.id;
                return (
                  <button
                    key={ag.id}
                    type="button"
                    onClick={() => {
                      setSelectedSatelliteIslandId(null);
                      setSelectedStationId(null);
                      setSelectedAgentId(ag.id);
                      setChatTargetAgent(ag.name);
                    }}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold transition-all ${isSelected
                      ? "bg-[#231f20] text-white scale-105"
                      : "bg-[#f3ede2] text-[#3b342e] hover:bg-[#e8dfd0]"
                      }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: ag.color }}
                    />
                    <span>{ag.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setSelectedSatelliteIslandId(null);
                  setSelectedAgentId(null);
                  setSelectedStationId(null);
                  setCameraResetTick((t) => t + 1);
                }}
                title="Reset camera to Main Island overview"
                className="inline-flex items-center gap-1 rounded-full bg-[#ede7dc] hover:bg-[#e2d9c8] px-2 py-0.5 text-[10px] font-extrabold text-[#4a433d] transition-colors"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Main</span>
              </button>
              {customIslands.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSatelliteIslandId(null);
                    setSelectedAgentId(null);
                    setSelectedStationId(null);
                    setArchipelagoOverviewTick((t) => t + 1);
                  }}
                  title="Zoom out to see Main Island and all connected Sub-Islands"
                  className="inline-flex items-center gap-1 rounded-full bg-violet-100 hover:bg-violet-200 border border-violet-300/70 px-2.5 py-0.5 text-[10px] font-extrabold text-violet-900 transition-colors"
                >
                  <Globe className="h-2.5 w-2.5" />
                  <span>Archipelago ({customIslands.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* RIGHT FLOATING TALL CARD */}
          <aside className="z-30 absolute top-4 right-4 bottom-4 w-[410px] max-w-[92vw] flex flex-col pointer-events-none">
            <div className="pointer-events-auto flex flex-col max-h-full rounded-[28px] bg-[#faf7f2]/96 border-[3px] border-white shadow-[0_20px_50px_rgba(35,31,32,0.16)] p-4 overflow-hidden backdrop-blur-md">
              {/* Card Top Pill Header */}
              <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#242331] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                  <span
                    className={`h-2 w-2 rounded-full ${isAiRunning || isChainSyncing
                      ? "bg-amber-400 animate-ping"
                      : "bg-emerald-400"
                      }`}
                  />
                  <span>
                    {isAiRunning
                      ? "COUNCIL DELIBERATING..."
                      : "AUTONOMOUS COUNCIL • MEZO 31611"}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => refreshOnChainState(false)}
                    className="h-7 w-7 rounded-full bg-[#ede7dc] hover:bg-[#e2d9c8] flex items-center justify-center text-[#4a433d] transition-colors"
                    title="Sync Mezo Testnet State"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isChainSyncing ? "animate-spin" : ""
                        }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMandateDrawerOpen((o) => !o)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black transition-colors border ${mandateDrawerOpen
                      ? "bg-[#231f20] text-white border-[#231f20]"
                      : "bg-white/95 hover:bg-stone-100 text-[#231f20] border-[#dfd6c5]"
                      }`}
                    title="Configure Main Island AI Strategy Mandate & Capabilities"
                  >
                    ⚙️ {strategyMandate.riskMode}
                  </button>
                  <button
                    onClick={() => setRightCardCollapsed((c) => !c)}
                    className="h-7 w-7 rounded-full bg-[#ede7dc] hover:bg-[#e2d9c8] flex items-center justify-center text-[#4a433d] transition-colors"
                    title="Toggle Collapse"
                  >
                    {rightCardCollapsed ? (
                      <Maximize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Minimize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {!rightCardCollapsed && (
                <>
                  {mandateDrawerOpen && (
                    <div className="rounded-2xl bg-white/95 border-2 border-[#e5dec9] p-3 mb-2.5 shrink-0 space-y-2.5 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-wider text-[#6e655d]">
                            AI Strategy Mandate (Neon Persisted)
                          </div>
                          <div className="text-[11px] font-extrabold text-[#231f20]">
                            Multi-Decision Powers & Risk Guardrails
                          </div>
                        </div>
                        {isSavingMandate && (
                          <span className="text-[9.5px] font-bold text-[#7c3aed]">
                            Saving...
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {(["CONSERVATIVE", "BALANCED", "GROWTH"] as MainRiskMode[]).map(
                          (rm) => (
                            <button
                              key={rm}
                              type="button"
                              onClick={() => saveStrategyMandate({ riskMode: rm })}
                              className={`flex-1 rounded-xl py-1 text-[10px] font-black transition-all ${strategyMandate.riskMode === rm
                                ? "bg-[#8b5cf6] text-white shadow-sm"
                                : "bg-[#f3ede2] text-[#4a433d] hover:bg-[#e8dfd0]"
                                }`}
                            >
                              {rm}
                            </button>
                          )
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {[
                          {
                            key: "autoTuneGuardrails" as const,
                            label: "🛡️ Tune Guardrails",
                            val: strategyMandate.autoTuneGuardrails,
                          },
                          {
                            key: "autoMusdYield" as const,
                            label: "💵 MUSD Vault Yield",
                            val: strategyMandate.autoMusdYield,
                          },
                          {
                            key: "autoAnchorDebates" as const,
                            label: "⚖️ Anchor Debates",
                            val: strategyMandate.autoAnchorDebates,
                          },
                          {
                            key: "autoRescueTrove" as const,
                            label: "🚑 Trove Guard",
                            val: strategyMandate.autoRescueTrove,
                          },
                          {
                            key: "autoSweepDefaults" as const,
                            label: "🔨 Sweep Defaults",
                            val: strategyMandate.autoSweepDefaults,
                          },
                        ].map((cap) => (
                          <button
                            key={cap.key}
                            type="button"
                            onClick={() =>
                              saveStrategyMandate({ [cap.key]: !cap.val })
                            }
                            className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold border transition-all ${cap.val
                              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                              : "bg-stone-100 border-stone-200 text-stone-500 line-through"
                              }`}
                          >
                            {cap.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[#4a433d]">
                        <span>Target MUSD Vault Yield Split:</span>
                        <div className="flex items-center gap-1">
                          {[0, 30, 50].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() =>
                                saveStrategyMandate({ targetMusdYieldPct: pct })
                              }
                              className={`rounded-lg px-2 py-0.5 font-extrabold ${strategyMandate.targetMusdYieldPct === pct
                                ? "bg-[#231f20] text-white"
                                : "bg-[#f3ede2] text-[#4a433d]"
                                }`}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* HIGHLIGHTED AUTONOMOUS MODEL DECISION BANNER */}
                  <div
                    className={`rounded-2xl border-2 p-2.5 mb-2.5 shrink-0 transition-all ${latestModelDecision === "HOLD"
                      ? "bg-amber-50/95 border-amber-300 text-amber-950"
                      : latestModelDecision === "RECTIFY_AND_EXECUTE"
                        ? "bg-emerald-50/95 border-emerald-400 text-emerald-950"
                        : "bg-purple-50/95 border-[#8b5cf6] text-[#1f1c1a]"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${latestModelDecision === "HOLD"
                          ? "bg-amber-400 text-amber-950"
                          : latestModelDecision === "RECTIFY_AND_EXECUTE"
                            ? "bg-emerald-600 text-white"
                            : "bg-[#8b5cf6] text-white"
                          }`}
                      >
                        {latestModelDecision === "HOLD"
                          ? "⏸️ MODEL DECISION: HOLD (DCA PAUSED)"
                          : latestModelDecision === "RECTIFY_AND_EXECUTE"
                            ? "🩺 MODEL DECISION: AUTO-RECTIFY & EXECUTE"
                            : "🟢 MODEL DECISION: EXECUTE DCA SLICE"}
                      </span>

                      {lastTxHash &&
                        (latestModelDecision !== "HOLD" ||
                          latestCycleActions.some(
                            (a) => a.type !== "HOLD" && Boolean(a.txHash)
                          )) ? (
                        <a
                          href={`https://explorer.test.mezo.org/tx/${lastTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md bg-white/90 border border-stone-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#231f20] hover:underline flex items-center gap-1"
                        >
                          <span>TX {shortenHex(lastTxHash, 4)}</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        <span className="rounded-md bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-stone-700">
                          {latestModelDecision === "HOLD"
                            ? "0 GAS SPENT"
                            : `BLOCK #${rpcBlockNumber}`}
                        </span>
                      )}
                    </div>

                    <div className="text-[11.5px] font-extrabold leading-snug">
                      {latestCycleHeadline}
                    </div>
                    <div className="text-[10.5px] opacity-85 mt-0.5 leading-snug">
                      {latestDecisionReason}
                    </div>

                    {latestCycleActions.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-black/10 flex flex-wrap gap-1.5">
                        {latestCycleActions.map((act, idx) => {
                          const chipTone =
                            act.status === "EXECUTED"
                              ? act.type === "HOLD"
                                ? "bg-amber-100/90 border-amber-300 text-amber-900"
                                : "bg-white/95 border-emerald-300 text-emerald-950"
                              : "bg-stone-100/90 border-stone-300 text-stone-600";
                          return act.txHash ? (
                            <a
                              key={`${act.type}-${idx}`}
                              href={`https://explorer.test.mezo.org/tx/${act.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              title={act.detail}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[9.5px] font-extrabold hover:underline ${chipTone}`}
                            >
                              <span>{act.agent}:</span>
                              <span>{act.label}</span>
                              {act.amountLabel && (
                                <span className="opacity-75">({act.amountLabel})</span>
                              )}
                              <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                            </a>
                          ) : (
                            <span
                              key={`${act.type}-${idx}`}
                              title={act.detail}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[9.5px] font-extrabold ${chipTone}`}
                            >
                              <span>{act.agent}:</span>
                              <span>{act.label}</span>
                              {act.amountLabel && (
                                <span className="opacity-75">({act.amountLabel})</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Inngest 1-Hour Cron + One-Shot 2-Minute Judge Trigger & Run Telemetry Bar */}
                  <div className="rounded-2xl bg-[#f3ede2] border border-[#e6dec8] px-3 py-2 mb-2 shrink-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold text-[#231f20]">
                        <Clock className="h-3.5 w-3.5 text-[#8b5cf6]" />
                        <span>
                          {cronIntervalMode === "2m"
                            ? "2m Judge Trigger (→1h):"
                            : "Inngest 1h Cron:"}{" "}
                          <span className="font-mono text-[#7c3aed]">
                            {formatCountdown(secondsLeft)}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            if (cronIntervalMode === "1h") {
                              setCronIntervalMode("2m");
                              setSecondsLeft(120);
                            } else {
                              setCronIntervalMode("1h");
                              setSecondsLeft(
                                3600 - (Math.floor(Date.now() / 1000) % 3600)
                              );
                            }
                          }}
                          className={`rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase transition-colors ${cronIntervalMode === "2m"
                            ? "bg-amber-400 text-amber-950 border border-amber-500"
                            : "bg-white text-[#57524e] border border-[#d6cbb9] hover:bg-stone-100"
                            }`}
                          title="Switch to a 2-minute countdown for judging (automatically reverts to 1-hour after firing once)"
                        >
                          {cronIntervalMode === "2m"
                            ? "⚡ 2m Armed (→1h)"
                            : "⏱ Switch to 2m"}
                        </button>
                        <button
                          onClick={() => setActiveTab("crew")}
                          className={`rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase ${neonConnected
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                            : "bg-purple-100 text-purple-900 border border-purple-200"
                            }`}
                          title="Neon Serverless Postgres Status"
                        >
                          {neonConnected ? "Neon DB Live" : "Syncing DB..."}
                        </button>
                      </div>
                    </div>

                    {/* Inngest Dispatch & Run Telemetry Strip */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#e5dec9] text-[9.5px] font-bold text-[#57524e]">
                      <button
                        onClick={() => setActiveTab("crew")}
                        className="flex items-center gap-1 hover:underline"
                        title="Open Inngest Run Telemetry in Transformers Crew tab"
                      >
                        <Activity className="h-3 w-3 text-[#7c3aed]" />
                        <span
                          className={
                            inngestTelemetry?.inngestMode === "CLOUD_SIGNED" ||
                              inngestTelemetry?.inngestMode ===
                              "DEV_SERVER_ONLINE"
                              ? "text-emerald-800 font-black"
                              : "text-amber-800 font-black"
                          }
                        >
                          {inngestTelemetry?.inngestMode === "CLOUD_SIGNED"
                            ? "Inngest Cloud"
                            : inngestTelemetry?.inngestMode ===
                              "DEV_SERVER_ONLINE"
                              ? "Inngest Dev :8288"
                              : "Inngest Offline (Fallback)"}
                        </span>
                      </button>

                      <span className="font-mono text-[9px] text-[#4a433d] truncate">
                        {activeDispatchedCycleUid
                          ? `⚡ Live Stream: ${currentPhase}`
                          : inngestTelemetry
                            ? `Cron ${inngestTelemetry.inngestCronRuns} • Evt ${inngestTelemetry.inngestEventRuns} • Dir ${inngestTelemetry.directRuns}${inngestTelemetry.lastCronRunAt
                              ? ` • Last Cron ${new Date(
                                inngestTelemetry.lastCronRunAt
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                              : ""
                            }`
                            : "Loading telemetry..."}
                      </span>
                    </div>
                  </div>

                  {/* Scrollable 5-Agent Transformers Autonomous Deliberation Stream */}
                  <div className="flex-1 min-h-[155px] rounded-2xl bg-[#f3ede2] border border-[#e6dec8] p-3 overflow-y-auto space-y-2.5 mb-2">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-[#6e655d] pb-1 border-b border-[#e5dec9]">
                      <span>🤖 Agent-to-Agent Council Chat</span>
                      <span>5 Transformers • Zero Human Influence</span>
                    </div>
                    {reasoningFeed.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center py-6 px-2 text-xs text-stone-600">
                        <p className="font-bold text-[#231f20] mb-1">
                          {isAiRunning
                            ? "Soundwave, Optimus Prime, Bumblebee, Ratchet & Ironhide are deliberating live market trends..."
                            : "Waiting for next autonomous Inngest cycle (or switch to 2m Judge Trigger above)."}
                        </p>
                        <p className="text-[11px] text-stone-500">
                          The 5 Transformers autonomously analyze live Bitcoin trends, Fear & Greed, and news headlines below to decide: <strong>HOLD</strong>, <strong>EXECUTE DCA</strong>, or <strong>RECTIFY</strong>.
                        </p>
                      </div>
                    ) : (
                      reasoningFeed
                        .filter((item) => item.speaker !== "You")
                        .map((item) => (
                          <div
                            key={item.id}
                            className="text-xs leading-relaxed rounded-xl p-2 bg-white/80 border border-[#e6dec8] text-[#38322d]"
                          >
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      item.speaker === "Optimus Prime"
                                        ? "#8b5cf6"
                                        : item.speaker === "Bumblebee"
                                          ? "#f59e0b"
                                          : item.speaker === "Ratchet"
                                            ? "#10b981"
                                            : item.speaker === "Soundwave"
                                              ? "#ec4899"
                                              : "#3b82f6",
                                  }}
                                />
                                <strong className="font-extrabold text-[#1f1c1a]">
                                  {item.speaker}
                                </strong>
                                {item.replyTo && (
                                  <span className="rounded bg-purple-100 px-1.5 py-0.2 text-[9.5px] font-black text-[#6d28d9]">
                                    → @{item.replyTo}
                                  </span>
                                )}
                                <span className="text-[9.5px] font-semibold text-[#787067]">
                                  ({item.aiModel})
                                </span>
                              </div>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/90 text-[#4a433d] border border-[#ded6c6]">
                                {item.badgeText}
                              </span>
                            </div>
                            <p className="pl-4 text-[11.5px] text-[#453f3a]">
                              {item.text}
                            </p>
                          </div>
                        ))
                    )}
                  </div>

                  {/* SOUNDWAVE (#05) LIVE NEWS TRENDS, FEAR & GREED & MARKET SIGNALS PANEL */}
                  <div className="rounded-2xl bg-white/95 border border-[#ded6c6] p-3 shrink-0 space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#be185d]">
                        <span className="h-2 w-2 rounded-full bg-[#ec4899] animate-ping" />
                        <span>SOUNDWAVE (#05) LIVE NEWS & MARKET TRENDS</span>
                      </div>
                      <span className="text-[10.5px] font-black text-[#231f20]">
                        {liveBtcPriceUsd > 0
                          ? `$${liveBtcPriceUsd.toLocaleString()} (${liveBtcChange24h >= 0 ? "+" : ""
                          }${liveBtcChange24h}%)`
                          : "Syncing..."}
                      </span>
                    </div>

                    {/* 3 Live Market Trend Badges: Trend Direction, Fear & Greed, Volatility */}
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div
                        className={`rounded-xl px-2 py-1 border text-[10px] font-extrabold ${liveTrendDirection === "UPTREND"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : liveTrendDirection === "DOWNTREND"
                            ? "bg-red-50 border-red-200 text-red-900"
                            : "bg-amber-50 border-amber-200 text-amber-900"
                          }`}
                      >
                        <div className="text-[8.5px] uppercase opacity-70 font-bold">
                          24H TREND
                        </div>
                        <div>
                          {liveTrendDirection === "UPTREND"
                            ? "📈 UPTREND"
                            : liveTrendDirection === "DOWNTREND"
                              ? "📉 DOWNTREND"
                              : "↔️ RANGE"}
                        </div>
                      </div>

                      <div className="rounded-xl px-2 py-1 bg-[#f7f4ed] border border-[#e5dec9] text-[10px] font-extrabold text-[#231f20]">
                        <div className="text-[8.5px] uppercase text-stone-500 font-bold">
                          FEAR & GREED
                        </div>
                        <div>
                          {liveFearGreedIndex} • {liveFearGreedLabel}
                        </div>
                      </div>

                      <div className="rounded-xl px-2 py-1 bg-[#f7f4ed] border border-[#e5dec9] text-[10px] font-extrabold text-[#231f20]">
                        <div className="text-[8.5px] uppercase text-stone-500 font-bold">
                          SENTIMENT MIX
                        </div>
                        <div>
                          <span className="text-emerald-700">
                            {liveBullishCount}B
                          </span>{" "}
                          /{" "}
                          <span className="text-stone-600">
                            {liveNeutralCount}N
                          </span>{" "}
                          /{" "}
                          <span className="text-red-700">
                            {liveBearishCount}S
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 24h Intraday High/Low Range Bar */}
                    {liveHigh24hUsd > 0 && (
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[9.5px] font-bold text-[#6e655d]">
                          <span>24h Low: ${liveLow24hUsd.toLocaleString()}</span>
                          <span className="uppercase text-[8.5px] font-black text-[#7c3aed]">
                            {liveVolatilityRegime} VOLATILITY ({liveRangePositionPct}% of Range)
                          </span>
                          <span>24h High: ${liveHigh24hUsd.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#ede6da] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-[#ec4899] to-[#8b5cf6]"
                            style={{ width: `${liveRangePositionPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Live Captured Headlines Feed */}
                    <div className="space-y-1 max-h-[82px] overflow-y-auto pr-1 pt-0.5 border-t border-[#ede6da]">
                      {capturedNews.length === 0 ? (
                        <div className="text-[10.5px] text-stone-500 font-semibold">
                          Fetching live Bitcoin & macro news from CryptoCompare...
                        </div>
                      ) : (
                        capturedNews.slice(0, 4).map((n, i) => (
                          <a
                            key={i}
                            href={n.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-start justify-between gap-1.5 text-[10.5px] leading-snug text-[#38322d] hover:text-[#7c3aed] group"
                          >
                            <span className="line-clamp-1 font-semibold group-hover:underline">
                              {n.source?.toLowerCase().includes("google search")
                                ? "🔍 "
                                : "• "}
                              {n.title}{" "}
                              <span
                                className={`text-[9px] font-normal ${n.source
                                  ?.toLowerCase()
                                  .includes("google search")
                                  ? "text-[#7c3aed] font-bold"
                                  : "text-stone-400"
                                  }`}
                              >
                                ({n.source})
                              </span>
                            </span>
                            <span
                              className={`shrink-0 rounded px-1 py-0.2 text-[8.5px] font-black uppercase ${n.sentiment === "BULLISH"
                                ? "bg-emerald-100 text-emerald-800"
                                : n.sentiment === "BEARISH"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-stone-200 text-stone-700"
                                }`}
                            >
                              {n.sentiment}
                            </span>
                          </a>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* =====================================================================
          3. VIEW 2: THE 5 TRANSFORMERS AI AGENTS, GEMINI 2.5 & NEON CLOUD DB
         ===================================================================== */}
      {activeTab === "crew" && (
        <CrewAgentsPanel
          agents={agents}
          currentPhase={currentPhase}
          isAiRunning={isAiRunning}
          btcPriceUsd={liveBtcPriceUsd}
          vaultTvlBtc={vaultTvlBtc}
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      )}

      {/* =====================================================================
          4. VIEW 3: DCA SCHEDULER & 4LPHA POLICY-LOCKED VAULT (REAL ON-CHAIN)
         ===================================================================== */}
      {activeTab === "dca" && (
        <div className="h-full overflow-y-auto pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 Cols: 4lpha PolicyVault & Real On-Chain Deposit/Withdraw */}
            <div className="lg:col-span-5 space-y-5">
              <Card className="bg-white/95 border-white">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-black flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      PolicyVault.sol (Mezo 31611)
                    </CardTitle>
                    <Badge
                      variant={
                        guardrails.emergencyLock ? "destructive" : "emerald"
                      }
                    >
                      {guardrails.emergencyLock
                        ? "EMERGENCY LOCKED"
                        : "ARMED ON-CHAIN"}
                    </Badge>
                  </div>
                  <CardDescription>
                    Deployed at{" "}
                    <a
                      href={`https://explorer.test.mezo.org/address/${contractAddresses.policyVault}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono font-bold underline"
                    >
                      {shortenHex(contractAddresses.policyVault, 6)}
                    </a>
                    . Custodies real Mezo Testnet BTC and enforces mathematical
                    limits on every autonomous transaction.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Deposit / Withdraw Box */}
                  <div className="rounded-2xl bg-[#f7f4ed] border border-[#e5dec9] p-3.5 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>
                        On-Chain Vault TVL:{" "}
                        <strong className="font-black text-[#126b3a]">
                          {formatBtc(vaultTvlBtc)}
                        </strong>
                      </span>
                      <span>
                        Deposited:{" "}
                        <strong className="font-black text-emerald-700">
                          {formatBtc(userDepositedBtc)}
                        </strong>
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-stone-500">
                      <span>
                        Operator Wallet ({shortenHex(operatorAddress, 4)}):{" "}
                        <strong>{formatBtc(operatorBalanceBtc)}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        step="any"
                        min="0.00000001"
                        value={depositInput}
                        onChange={(e) => setDepositInput(e.target.value)}
                        className="w-28 h-9 rounded-xl border border-[#d6cbb9] bg-white px-2.5 text-xs font-bold"
                      />
                      <Button
                        size="sm"
                        disabled={isTxPending}
                        className="flex-1 bg-[#242331] hover:bg-[#38364a]"
                        onClick={handleVaultDeposit}
                      >
                        <Wallet className="h-3.5 w-3.5" />{" "}
                        {isTxPending ? "Mining..." : "Deposit BTC"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isTxPending}
                        onClick={handleVaultWithdraw}
                      >
                        Withdraw
                      </Button>
                    </div>
                  </div>

                  {/* Guardrail Sliders */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span>Max Single DCA Slice (`maxSingleTradeBps`)</span>
                        <span className="text-[#8b5cf6]">
                          {bpsToPercent(guardrails.maxSingleTradeBps)} (
                          {formatBtc(
                            (vaultTvlBtc * guardrails.maxSingleTradeBps) / 10000
                          )}
                          )
                        </span>
                      </div>
                      <Slider
                        value={[guardrails.maxSingleTradeBps]}
                        min={200}
                        max={2500}
                        step={50}
                        onValueChange={([v]) =>
                          setGuardrails((g) => ({
                            ...g,
                            maxSingleTradeBps: v,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span>Min AI Confidence (`minConfidenceBps`)</span>
                        <span className="text-emerald-700">
                          {bpsToPercent(guardrails.minConfidenceBps)}
                        </span>
                      </div>
                      <Slider
                        value={[guardrails.minConfidenceBps]}
                        min={5000}
                        max={9500}
                        step={100}
                        onValueChange={([v]) =>
                          setGuardrails((g) => ({
                            ...g,
                            minConfidenceBps: v,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-bold mb-1">
                        <span>Max Daily Drawdown (`maxDailyDrawdownBps`)</span>
                        <span className="text-amber-700">
                          {bpsToPercent(guardrails.maxDailyDrawdownBps)}
                        </span>
                      </div>
                      <Slider
                        value={[guardrails.maxDailyDrawdownBps]}
                        min={100}
                        max={1500}
                        step={50}
                        onValueChange={([v]) =>
                          setGuardrails((g) => ({
                            ...g,
                            maxDailyDrawdownBps: v,
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-stone-200">
                      <span className="font-bold flex items-center gap-1.5">
                        {guardrails.emergencyLock ? (
                          <Lock className="h-4 w-4 text-red-600" />
                        ) : (
                          <Unlock className="h-4 w-4 text-emerald-600" />
                        )}
                        Emergency Vault Kill-Switch
                      </span>
                      <Switch
                        checked={guardrails.emergencyLock}
                        onCheckedChange={(checked) => {
                          setGuardrails((g) => ({
                            ...g,
                            emergencyLock: checked,
                          }));
                          handleSavePolicyOnChain(checked);
                        }}
                      />
                    </div>

                    <Button
                      onClick={() => handleSavePolicyOnChain()}
                      disabled={isTxPending}
                      className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-xs font-extrabold mt-2"
                    >
                      {isTxPending
                        ? "Mining Policy Update on Mezo 31611..."
                        : "Save Policy Guardrails On-Chain (updatePolicy)"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right 7 Cols: Kronos Autonomous BTC DCA Schedules */}
            <div className="lg:col-span-7 space-y-5">
              <Card className="bg-white/95 border-white">
                <CardHeader>
                  <CardTitle className="text-lg font-black flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-500" />
                    On-Chain BTC DCA Schedules (`MezoDCAEngine.sol`)
                  </CardTitle>
                  <CardDescription>
                    Deployed at{" "}
                    <a
                      href={`https://explorer.test.mezo.org/address/${contractAddresses.dcaEngine}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono font-bold underline"
                    >
                      {shortenHex(contractAddresses.dcaEngine, 6)}
                    </a>
                    . Every schedule below is stored directly on Mezo Testnet
                    (31611).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Create New DCA Schedule Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 rounded-2xl bg-[#f7f4ed] p-3 border border-[#e5dec9]">
                    <input
                      value={newDcaAsset}
                      onChange={(e) => setNewDcaAsset(e.target.value)}
                      placeholder="Target Vault (e.g. stBTC)"
                      className="h-9 rounded-xl border border-[#d6cbb9] bg-white px-2.5 text-xs font-bold"
                    />
                    <input
                      type="number"
                      step="any"
                      value={newDcaSliceBtc}
                      onChange={(e) => setNewDcaSliceBtc(e.target.value)}
                      placeholder="Slice BTC"
                      className="h-9 rounded-xl border border-[#d6cbb9] bg-white px-2.5 text-xs font-bold"
                    />
                    <select
                      value={newDcaInterval}
                      onChange={(e) => setNewDcaInterval(e.target.value)}
                      className="h-9 rounded-xl border border-[#d6cbb9] bg-white px-2.5 text-xs font-bold"
                    >
                      <option value="Every 1h (TWAP)">Every 1h (TWAP)</option>
                      <option value="Every 4h">Every 4h</option>
                      <option value="Daily Epoch">Daily Epoch</option>
                    </select>
                    <Button
                      onClick={handleCreateDcaSchedule}
                      disabled={isTxPending}
                      className="h-9 bg-[#8b5cf6] hover:bg-[#7c3aed] text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />{" "}
                      {isTxPending ? "Mining..." : "Create On-Chain"}
                    </Button>
                  </div>

                  {/* Active DCA Schedules List */}
                  <div className="space-y-3">
                    {dcaSchedules.map((sched) => (
                      <div
                        key={sched.id}
                        className="rounded-2xl border border-[#e5dec9] bg-[#faf7f2] p-3.5 text-xs space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-mono text-[11px] font-bold text-stone-500 mr-2">
                              #{sched.id}
                            </span>
                            <span className="font-black text-sm text-[#231f20]">
                              {sched.strategyName}
                            </span>
                            <span className="ml-2 font-mono text-[11px] font-bold text-[#8b5cf6]">
                              {sched.targetAsset}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant={
                                sched.status === "RECTIFIED"
                                  ? "emerald"
                                  : "secondary"
                              }
                            >
                              {sched.status === "RECTIFIED"
                                ? "RECTIFIED ON-CHAIN BY PATCH AI"
                                : sched.status}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[11px] text-stone-600">
                          <div>
                            Slice Size:{" "}
                            <strong className="text-[#231f20]">
                              {formatBtc(sched.sliceAmountBtc)}
                            </strong>
                          </div>
                          <div>
                            Interval:{" "}
                            <strong className="text-[#231f20]">
                              {sched.intervalLabel}
                            </strong>
                          </div>
                          <div>
                            On-Chain Progress:{" "}
                            <strong className="text-[#231f20]">
                              {sched.executedSlices} / {sched.totalSlices}{" "}
                              slices ({formatBtc(sched.totalAccumulatedBtc)})
                            </strong>
                          </div>
                        </div>

                        {sched.lastRectificationNote && (
                          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] text-emerald-900 font-semibold flex items-center gap-1.5">
                            <Wrench className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>{sched.lastRectificationNote}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] font-bold text-stone-500">
                            🤖 Autonomous Execution: Optimus Prime & Bumblebee decide each cycle (`EXECUTE`, `HOLD`, or `RECTIFY`) from live news & market trends
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => {
                              setActiveTab("island");
                              setRightCardCollapsed(false);
                            }}
                          >
                            <Sparkles className="h-3 w-3" /> View Council Verdict
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          5. VIEW 4: MEZO 31611 SMART CONTRACTS, AUDIT LEDGER & /MCP
         ===================================================================== */}
      {activeTab === "contracts" && (
        <div className="h-full overflow-y-auto pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  key: "agentRegistry" as const,
                  title: "AgentRegistry.sol (ERC-8004)",
                  desc: "Registers Aura, Kronos, Patch & Sentinel on Mezo Testnet (31611).",
                },
                {
                  key: "policyVault" as const,
                  title: "PolicyVault.sol (BTC Guardrails)",
                  desc: "Enforces maxSingleTradeBps, maxDailyDrawdownBps & minConfidenceBps.",
                },
                {
                  key: "dcaEngine" as const,
                  title: "MezoDCAEngine.sol (DCA + Rectifier)",
                  desc: "Executes scheduled BTC DCA slices & logs Patch's on-chain error rectifications.",
                },
              ].map((c) => (
                <Card key={c.key} className="bg-white/95 border-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black flex items-center justify-between">
                      <span>{c.title}</span>
                      <a
                        href={`https://explorer.test.mezo.org/address/${contractAddresses[c.key]}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Badge
                          variant="outline"
                          className="hover:bg-stone-100 cursor-pointer flex items-center gap-1"
                        >
                          <span>Explorer</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Badge>
                      </a>
                    </CardTitle>
                    <CardDescription>{c.desc}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={contractAddresses[c.key]}
                        onChange={(e) =>
                          setContractAddresses((prev) => ({
                            ...prev,
                            [c.key]: e.target.value as `0x${string}`,
                          }))
                        }
                        className="w-full rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 font-mono text-xs"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0"
                        onClick={() =>
                          copyText(c.key, contractAddresses[c.key])
                        }
                      >
                        {copiedKey === c.key ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Live Audit Ledger */}
            <Card className="bg-white/95 border-white">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-black">
                      Live On-Chain Execution & Self-Healing Rectification
                      Ledger (`PolicyVault.getRecentExecutions`)
                    </CardTitle>
                    <CardDescription>
                      Read directly from PolicyVault.sol & MezoDCAEngine.sol on
                      Mezo Testnet (Chain ID 31611, Block #{rpcBlockNumber}).
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="/.well-known/agent-card.json"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button variant="outline" size="sm">
                        /.well-known/agent-card.json{" "}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => invokeMcpEndpoint("check_policy_vault")}
                      disabled={isMcpLoading}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${isMcpLoading ? "animate-spin" : ""
                          }`}
                      />
                      Query On-Chain /api/mcp
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {mcpResponse && (
                  <pre className="rounded-xl bg-[#1e1e28] text-emerald-300 p-3 font-mono text-xs overflow-x-auto max-h-44">
                    {mcpResponse}
                  </pre>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2 px-3">Exec ID</th>
                        <th className="py-2 px-3">Agent & Free AI Model</th>
                        <th className="py-2 px-3">Action / Target</th>
                        <th className="py-2 px-3">BTC Amount (% Vault)</th>
                        <th className="py-2 px-3">On-Chain Outcome</th>
                        <th className="py-2 px-3">Anchored Proof Hash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {executionLedger.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-6 text-center text-stone-500"
                          >
                            No executions recorded yet on PolicyVault. Click{" "}
                            <strong>Execute On-Chain DCA</strong> or{" "}
                            <strong>Trigger Error & Fix</strong> to mine a real
                            transaction on Mezo 31611!
                          </td>
                        </tr>
                      ) : (
                        executionLedger.map((row) => (
                          <tr key={row.id}>
                            <td className="py-2.5 px-3 font-mono font-bold">
                              #{row.id}
                              <div className="text-[10px] text-stone-400 font-normal">
                                {row.timestamp}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-extrabold">
                                {row.agentName}
                              </div>
                              <div className="text-[10px] text-[#8b5cf6] font-bold">
                                {row.aiModelUsed} ({row.erc8004Id})
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-mono font-bold">
                                {row.targetAsset}
                              </div>
                              <div className="text-[10px] text-stone-500">
                                {row.actionType}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-bold">
                              {formatBtc(row.amountBtc)} (
                              {row.vaultSharePercent}%)
                            </td>
                            <td className="py-2.5 px-3">
                              {row.wasRectified ? (
                                <div>
                                  <Badge variant="emerald">
                                    AUTO-RECTIFIED ON-CHAIN
                                  </Badge>
                                  <div className="text-[10px] text-emerald-800 mt-0.5">
                                    {row.rectificationSummary}
                                  </div>
                                </div>
                              ) : row.passedPolicy ? (
                                <Badge variant="emerald">VERIFIED_OK</Badge>
                              ) : (
                                <div>
                                  <Badge variant="destructive">
                                    BLOCKED ON-CHAIN BY POLICYVAULT
                                  </Badge>
                                  <div className="text-[10px] text-red-700 mt-0.5">
                                    {row.violationReason}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-stone-500">
                              {shortenHex(row.proofHash, 6)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* =====================================================================
          5A. VIEW 4A: MAIN ISLAND MUSD TREASURY VAULT & 5-AGENT CREDIT COUNCIL
         ===================================================================== */}
      {activeTab === "musd-vault" && (
        <div className="h-full overflow-y-auto pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto">
            <MainMusdVaultPanel
              onSelectIsland={(id) => {
                setSelectedIslandId(id);
                setActiveTab("island");
              }}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          5B. VIEW 4B: LENDING AGENT — MEZO GUARD (MEZO TESTNET 31611)
         ===================================================================== */}
      {activeTab === "lending" && (
        <div className="h-full overflow-y-auto pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto">
            <MezoLendingGuardPanel
              onRecoverWithdrawClick={() => setActiveTab("dca")}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          6. VIEW 5: HACKATHON DOCS (#START)
         ===================================================================== */}
      {activeTab === "docs" && (
        <div className="h-full overflow-y-auto pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-4xl mx-auto">
            <Card className="bg-white/95 border-white">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge className="bg-[#8b5cf6]">
                    Live Deployed Architecture • #start
                  </Badge>
                  <Badge variant="outline">
                    Mezo Testnet • Chain ID: 31611 (0x7b7b)
                  </Badge>
                </div>
                <CardTitle className="text-2xl font-black mt-2">
                  MezoCity: Autonomous 5-Agent BTC DCA, MUSD Vaults & Multi-Island DeFi
                </CardTitle>
                <CardDescription>
                  100% Live On-Chain on Mezo Blockchain Testnet (Chain ID 31611)
                  with Foundry (`./contracts`), Next.js, Three.js Clay Diorama,
                  and Free AI LLMs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 text-sm leading-relaxed text-[#38322d]">
                <section className="space-y-1.5">
                  <h3 className="font-black text-base text-[#231f20]">
                    1. Deployed Contracts on Mezo Testnet (Chain ID: 31611)
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-xs font-mono">
                    <li>
                      <strong>AgentRegistry (ERC-8004):</strong>{" "}
                      <a
                        href={`https://explorer.test.mezo.org/address/${contractAddresses.agentRegistry}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#7c3aed] underline"
                      >
                        {contractAddresses.agentRegistry}
                      </a>
                    </li>
                    <li>
                      <strong>PolicyVault (BTC Guardrails):</strong>{" "}
                      <a
                        href={`https://explorer.test.mezo.org/address/${contractAddresses.policyVault}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#7c3aed] underline"
                      >
                        {contractAddresses.policyVault}
                      </a>
                    </li>
                    <li>
                      <strong>MezoDCAEngine (DCA + Error Rectifier):</strong>{" "}
                      <a
                        href={`https://explorer.test.mezo.org/address/${contractAddresses.dcaEngine}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#7c3aed] underline"
                      >
                        {contractAddresses.dcaEngine}
                      </a>
                    </li>
                  </ul>
                </section>

                <section className="space-y-1.5">
                  <h3 className="font-black text-base text-[#231f20]">
                    2. The 4 Functional AI Agents (Zero Dummy Agents)
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>
                      <strong>Aura (Head Orchestrator Agent, ID #1)</strong> —
                      Connected to <code>Llama-3.3-70B</code>. Monitors Mezo
                      Testnet (`31611`) block state and coordinates the crew.
                    </li>
                    <li>
                      <strong>Kronos (Autonomous BTC DCA Agent, ID #2)</strong>{" "}
                      — Connected to <code>DeepSeek-R1</code>. Executes
                      time-weighted BTC accumulation slices on{" "}
                      <code>MezoDCAEngine.sol</code>.
                    </li>
                    <li>
                      <strong>
                        Patch (Error Rectifier & Self-Healing Agent, ID #3)
                      </strong>{" "}
                      — Connected to <code>Qwen-2.5-Coder</code>. Intercepts
                      blocked or oversized transactions (e.g.,{" "}
                      <code>MAX_TRADE_EXCEEDED</code>) and calls{" "}
                      <code>rectifyAndExecuteDCASlice()</code> on-chain.
                    </li>
                    <li>
                      <strong>Sentinel (Policy Vault Auditor, ID #4)</strong> —
                      Connected to <code>Mistral-Small-3</code>. Enforces
                      on-chain mathematical caps (<code>maxSingleTradeBps</code>
                      , <code>maxDailyDrawdownBps</code>,{" "}
                      <code>minConfidenceBps</code>) and anchors SHA-256
                      reasoning proofs.
                    </li>
                  </ul>
                </section>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <CreateIslandModal
        open={createIslandModalOpen}
        onClose={() => setCreateIslandModalOpen(false)}
        onCreated={(island) => {
          setCustomIslands((prev) => [island, ...prev]);
          setSelectedIslandId(island.islandId);
          setActiveTab("island");
          fetchSubIslandDetails(island.islandId);
          showNotice(
            "success",
            `Sub-Island "${island.name}" Deployed`,
            "Your empty Sub-Island is live! Design agents on the 3D Workshop Pedestal and build vaults."
          );
        }}
      />
    </div>
  );
}
