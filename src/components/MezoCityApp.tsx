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
  Minimize2,
  Maximize2,
  Clock,
  Activity,
  RotateCcw,
  Crosshair,
  X,
  Globe,
  Trophy,
  Zap,
  CheckCircle2,
  Layers,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { CrewAgentsPanel } from "@/components/CrewAgentsPanel";
import {
  CouncilCommunicationModal,
  CouncilMessageList,
} from "@/components/CouncilCommunicationView";
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
  MAIN_MEZO_VAULT_ADDRESS,
  MEZO_EARN_ADDRESSES,
  MEZO_FEE_SPLITTER_ADDRESS,
  MEZO_GOVERNOR_ADDRESS,
  MEZO_TESTNET_LENDING_ADDRESSES,
  POLICY_VAULT_ABI,
  mezoTestnet,
} from "@/lib/mezo-chain";
import { ISLAND_ECOSYSTEM_ADDRESSES } from "@/lib/island-contracts";
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
import { isInngestTriggerPaused } from "@/lib/inngest-control";
import { MezoLendingGuardPanel } from "@/components/MezoLendingGuardPanel";
import { MainMusdVaultPanel } from "@/components/MainMusdVaultPanel";
import { MainMezoVaultPanel } from "@/components/MainMezoVaultPanel";
import { GovernanceTreasuryPanel } from "@/components/GovernanceTreasuryPanel";
import { DebateKeeperArenaPanel } from "@/components/DebateKeeperArenaPanel";
import { CreateIslandModal } from "@/components/CreateIslandModal";
import { SubIslandLeaderboardPanel } from "@/components/SubIslandLeaderboardPanel";
import { ProtocolDocsPanel } from "@/components/ProtocolDocsPanel";
import {
  SubIslandWorkspace,
  type SubIslandDetailsResponse,
} from "@/components/SubIslandWorkspace";
import type { CustomIslandRecord } from "@/lib/island-db";
import {
  MEZO_COORDINATION_TIERS,
  type IslandCloneTemplate,
} from "@/lib/mezo-coordination";
import {
  classifyBtcEarnRegime,
  type EarnMarketRegime,
} from "@/lib/mezo-earn";
import type { WorkshopPreviewConfig } from "@/components/island/CustomIslandScene";
import {
  MAIN_MEZO_VAULT_STATION,
  MAIN_MUSD_VAULT_STATION,
} from "@/components/island/ClayIslandScene";

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
    | "island"
    | "leaderboard"
    | "crew"
    | "arena"
    | "dca"
    | "musd-vault"
    | "mezo-vault"
    | "governance"
    | "lending"
    | "contracts"
    | "docs"
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
  const [cloneTemplateDraft, setCloneTemplateDraft] =
    useState<IslandCloneTemplate | null>(null);
  const [cloningSatelliteId, setCloningSatelliteId] = useState<string | null>(
    null
  );
  const [islandMenuOpen, setIslandMenuOpen] = useState<boolean>(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState<boolean>(false);
  const [dismissedOnboarding, setDismissedOnboarding] = useState<boolean>(false);
  const [selectedSatelliteIslandId, setSelectedSatelliteIslandId] =
    useState<string | null>(null);
  const [archipelagoOverviewTick, setArchipelagoOverviewTick] =
    useState<number>(0);

  // 5 Autonomous Transformers Crew State (Optimus Prime, Bumblebee, Ratchet, Ironhide, Soundwave)
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
    "Syncing BTC Strategy Vault, Mezo Earn (sMUSD/StabilityPool) & Trove Guard on Mezo 31611..."
  );
  const [latestCycleHeadline, setLatestCycleHeadline] = useState<string>(
    "Syncing Multi-Protocol 5-Agent Council & Mezo Earn Router on Mezo Testnet (31611)..."
  );
  const [latestModelDecision, setLatestModelDecision] = useState<
    "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD"
  >("HOLD");
  const [latestDecisionReason, setLatestDecisionReason] = useState<string>(
    "Optimus Prime & the Autobot Council balance BTC Strategy Vaults, BTC-Low MUSD/MEZO Earn Vaults (sMUSD, upMUSD, StabilityPool), Tigris Pools, PolicyVault caps, and Trove Defense each cycle."
  );
  const [latestCycleActions, setLatestCycleActions] = useState<MainActionResult[]>(
    []
  );
  const [strategyMandate, setStrategyMandate] = useState<MainStrategyMandate>(
    DEFAULT_MAIN_STRATEGY_MANDATE
  );
  const [mandateDrawerOpen, setMandateDrawerOpen] = useState<boolean>(false);
  const [isSavingMandate, setIsSavingMandate] = useState<boolean>(false);
  const [latestActionBadge, setLatestActionBadge] = useState<{
    text: string;
    edge: string;
    amount: string;
    wasRectified: boolean;
  }>({
    text: "Multi-Protocol Mode Active",
    edge: "Vault + Earn + Trove",
    amount: "Mezo 31611",
    wasRectified: false,
  });
  const [customDirective, setCustomDirective] = useState<string>("");
  const [rightCardCollapsed, setRightCardCollapsed] = useState<boolean>(false);
  const [councilModalOpen, setCouncilModalOpen] = useState<boolean>(false);
  const [councilModalAgentFilter, setCouncilModalAgentFilter] =
    useState<string>("ALL");
  const [councilSectionView, setCouncilSectionView] = useState<
    "split" | "feed" | "signals"
  >("split");
  const [decisionDetailsExpanded, setDecisionDetailsExpanded] =
    useState<boolean>(false);
  const [soundwaveExpanded, setSoundwaveExpanded] = useState<boolean>(false);
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
  const [liveSentimentLabel, setLiveSentimentLabel] = useState<
    "BULLISH" | "NEUTRAL" | "CAUTIOUS"
  >("NEUTRAL");
  const [liveVolatilityRegime, setLiveVolatilityRegime] = useState<
    "LOW" | "MODERATE" | "HIGH"
  >("MODERATE");
  const [liveBullishCount, setLiveBullishCount] = useState<number>(0);
  const [liveBearishCount, setLiveBearishCount] = useState<number>(0);
  const [liveNeutralCount, setLiveNeutralCount] = useState<number>(0);

  // Real 1-Hour Autonomous Cron (`0 * * * *`) + One-Shot 2-Minute Judge Trigger
  const [autoCronEnabled] = useState<boolean>(true);
  const [cronIntervalMode, setCronIntervalMode] = useState<"1h" | "2m">("1h");
  const inngestPaused =
    isInngestTriggerPaused() ||
    inngestTelemetry?.inngestMode === "PAUSED" ||
    Boolean(inngestTelemetry?.inngestPaused);
  const effectiveAutoCronEnabled = autoCronEnabled && !inngestPaused;

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
  const [ecosystemSummary, setEcosystemSummary] = useState<{
    earnTotalTvlUsd: number;
    poolTotalTvlUsd: number;
    earnRegime: EarnMarketRegime;
    btcLowTriggerActive: boolean;
    earnHeadline: string;
    primaryVaultName: string;
    primaryPoolName: string;
    operatorMusd: number;
    operatorMezo: number;
    mezoSpotUsd: number;
    troveHf: number;
    troveStatus: string;
    troveDebtMusd: number;
    troveTriggerHf: number;
    mandateRiskMode: MainRiskMode;
  } | null>(null);
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

  // BTC Vault Progressive Disclosure (Simple by default, Pro Details 1-click toggle)
  const [btcVaultProMode, setBtcVaultProMode] = useState<boolean>(false);
  const [btcVaultTxTab, setBtcVaultTxTab] = useState<"deposit" | "withdraw">(
    "deposit"
  );
  const [btcShowRuleSliders, setBtcShowRuleSliders] = useState<boolean>(false);
  const [btcShowProofs, setBtcShowProofs] = useState<boolean>(false);

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

  // MCP & Live Protocol Health Check Playground State
  const [mcpResponse, setMcpResponse] = useState<string>("");
  const [isMcpLoading, setIsMcpLoading] = useState<boolean>(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [protocolHealthChecks, setProtocolHealthChecks] = useState<
    Array<{
      id: string;
      label: string;
      endpoint: string;
      ok: boolean;
      summary: string;
      latencyMs: number;
    }>
  >([]);

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

  const handleCloneSatelliteIsland = useCallback(
    async (isl: CustomIslandRecord) => {
      setCloningSatelliteId(isl.islandId);
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        const json = await res.json();
        const match = Array.isArray(json?.entries)
          ? json.entries.find(
            (entry: {
              islandId: string;
              cloneTemplate?: IslandCloneTemplate;
            }) => entry.islandId === isl.islandId
          )
          : null;
        if (match?.cloneTemplate) {
          setCloneTemplateDraft(match.cloneTemplate);
          setCreateIslandModalOpen(true);
          return;
        }
        setCloneTemplateDraft({
          templateId: `clone-${isl.islandId}`,
          sourceName: isl.name,
          sourceType: "LIVE_ISLAND",
          suggestedName: `${isl.name} Fork`.slice(0, 42),
          description:
            isl.description ||
            `Cloned Sub-Island strategy inspired by ${isl.name}.`,
          biomeTheme: isl.biomeTheme,
          suggestedSeedBtc: String(Math.max(0.0001, isl.seedBtc || 0.0001)),
          suggestedSeedMusd: String(Math.max(0, isl.seedMusd || 0)),
          vaultTemplates: [],
          agentTemplates: [],
        });
        setCreateIslandModalOpen(true);
      } catch (err) {
        showNotice(
          "error",
          "Could Not Load Clone Blueprint",
          err instanceof Error
            ? err.message
            : "Failed to inspect island blueprint"
        );
      } finally {
        setCloningSatelliteId(null);
      }
    },
    [showNotice]
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
            if (data.liveNews.sentimentLabel) {
              setLiveSentimentLabel(data.liveNews.sentimentLabel);
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

          if (data.ecosystemSummary) {
            setEcosystemSummary(data.ecosystemSummary);
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
          act.type === "WITHDRAW_MUSD_VAULT" ||
          act.type === "RECORD_STRATEGIC_ALLOCATION"
        ) {
          stationMap.set("Bumblebee", MAIN_MUSD_VAULT_STATION.id);
          if (act.type === "RECORD_STRATEGIC_ALLOCATION") {
            stationMap.set("Optimus Prime", MAIN_MUSD_VAULT_STATION.id);
          }
        } else if (
          act.type === "TUNE_POLICY_GUARDRAILS" ||
          act.type === "RESCUE_TROVE" ||
          act.type === "SWEEP_OVERDUE_LOAN"
        ) {
          stationMap.set("Ironhide", "policy_fortress");
          if (act.type === "RESCUE_TROVE") {
            stationMap.set("Ratchet", "rectifier_lab");
          }
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
          const trackedExecActions = Array.isArray(tracked.actions)
            ? tracked.actions.filter(
              (a) => a.type !== "HOLD" && a.status === "EXECUTED"
            )
            : [];
          const trackedSecSummary = trackedExecActions
            .map((a) => a.label)
            .slice(0, 2)
            .join(", ");
          if (tracked.decision === "HOLD") {
            if (trackedExecActions.length > 0) {
              setLatestActionBadge({
                text: `BTC Held + ${trackedExecActions.length} Protocol Exec`,
                edge: "Earn & Policy Active",
                amount: trackedSecSummary || "Multi-Protocol",
                wasRectified: false,
              });
              setHeadlineSpeech(
                `🛡️ BTC Reserve Held • Active on Mezo 31611: ${trackedSecSummary}`
              );
              showNotice(
                "success",
                "Cycle Completed: Defensive Hold + Active Protocol Execution",
                tracked.headline || `Executed ${trackedSecSummary} while preserving BTC reserve.`,
                tracked.txHash || undefined
              );
            } else {
              setLatestActionBadge({
                text: "Capital Defense (BTC & Trove Safe)",
                edge: "Earn & Guard Armed",
                amount: "Vault Protected",
                wasRectified: false,
              });
              setHeadlineSpeech(
                "🛡️ Autobot Council Verdict: Capital Defense — BTC Vault & Trove Guardrails Verified"
              );
              showNotice(
                "info",
                "Cycle Completed: Capital Defense & Guardrail Watch",
                tracked.headline || "Autobot Council verified PolicyVault & Trove safety."
              );
            }
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
              text: `Multi-Protocol: ${finalBtcStr} BTC${trackedSecSummary ? ` + ${trackedSecSummary}` : ""}`,
              edge: "Ironhide Verified",
              amount: `${finalBtcStr} BTC`,
              wasRectified: false,
            });
            setHeadlineSpeech(
              `✅ Council Deployed ${finalBtcStr} BTC${trackedSecSummary ? ` + ${trackedSecSummary}` : ""} on Mezo 31611`
            );
            showNotice(
              "success",
              `Cycle Completed: Multi-Protocol Deploy (${finalBtcStr} BTC)`,
              "Transformers crew settled coordinated actions on Mezo Testnet (31611).",
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
          ? `⚡ Autobot Council evaluating directive across Mezo 31611...`
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

        if (data.paused || data.skipped) {
          setActiveDispatchedCycleUid(null);
          showNotice(
            "info",
            "Inngest Trigger Paused",
            data.reason ||
              "Autonomous Inngest triggers are paused via INNGEST_PAUSED."
          );
          return;
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
          if (data.market.sentimentLabel) {
            setLiveSentimentLabel(data.market.sentimentLabel);
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
        const directExecActions: MainActionResult[] = Array.isArray(data.actions)
          ? data.actions.filter(
            (a: MainActionResult) =>
              a.type !== "HOLD" && a.status === "EXECUTED"
          )
          : [];
        const directSecSummary = directExecActions
          .map((a) => a.label)
          .slice(0, 2)
          .join(", ");

        if (data.decision === "HOLD") {
          setLatestCycleHeadline(
            directExecActions.length > 0
              ? `Autobot Council: BTC Hold + ${directSecSummary} • $${(
                data.market?.btcPriceUsd || liveBtcPriceUsd
              ).toLocaleString()} (${data.market?.sentimentLabel || "NEUTRAL"})`
              : `Autobot Council: Capital Defense & Guard Watch • BTC $${(
                data.market?.btcPriceUsd || liveBtcPriceUsd
              ).toLocaleString()} (${data.market?.sentimentLabel || "NEUTRAL"})`
          );
          if (directExecActions.length > 0) {
            setLatestActionBadge({
              text: `BTC Held + ${directExecActions.length} Protocol Exec`,
              edge: "Earn & Policy Active",
              amount: directSecSummary || "Multi-Protocol",
              wasRectified: false,
            });
            setHeadlineSpeech(
              `🛡️ BTC Reserve Held • Active on Mezo 31611: ${directSecSummary}`
            );
            showNotice(
              "success",
              "Autonomous Verdict: Defensive BTC Hold + Active Protocol Execution",
              data.decisionReason || `Executed ${directSecSummary} on Mezo Testnet (31611).`,
              primaryTx
            );
          } else {
            setLatestActionBadge({
              text: "Capital Defense (Vault & Trove Safe)",
              edge: "Earn & Guard Armed",
              amount: "Vault Protected",
              wasRectified: false,
            });
            setHeadlineSpeech(
              `🛡️ Autobot Council Verdict: Capital Defense — BTC Vault & Trove Guardrails Verified`
            );
            showNotice(
              "info",
              "Autonomous Verdict: Capital Defense & Guardrail Watch",
              data.decisionReason ||
              "Optimus Prime & the Council verified PolicyVault, MUSD Earn, and Trove guardrails."
            );
          }
        } else if (data.wasRectified || data.decision === "RECTIFY_AND_EXECUTE") {
          setLatestCycleHeadline(
            `Model Decision: SELF-HEALED EXECUTE • Clamped ${initBtcStr} → ${finalBtcStr} BTC by Ratchet AI`
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
            `PolicyVault intercepted ${initBtcStr} BTC, then Ratchet executed rectified ${finalBtcStr} BTC allocation on-chain!`,
            primaryTx
          );
        } else {
          setLatestCycleHeadline(
            `Multi-Protocol Deploy: ${finalBtcStr} BTC Vault${directSecSummary ? ` + ${directSecSummary}` : ""} • Mezo 31611`
          );
          setLatestActionBadge({
            text: `Deployed ${finalBtcStr} BTC${directSecSummary ? ` + ${directSecSummary}` : ""}`,
            edge: `Ironhide Verified`,
            amount: `${finalBtcStr} BTC`,
            wasRectified: false,
          });
          setHeadlineSpeech(
            `✅ Bumblebee Deployed ${finalBtcStr} BTC${directSecSummary ? ` + ${directSecSummary}` : ""} on Mezo 31611 (Tx: ${shortenHex(
              primaryTx || "",
              4
            )})`
          );
          showNotice(
            "success",
            `Autonomous Verdict: Multi-Protocol Deploy (${finalBtcStr} BTC)`,
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
      liveBtcPriceUsd,
      applyCyclePhaseToIsland,
      applyOnChainState,
      showNotice,
    ]
  );

  // Real Wall-Clock 1-Hour Inngest Autonomous Cron + One-Shot 2-Minute Judge Trigger
  useEffect(() => {
    if (inngestPaused) {
      return;
    }
    const timer = setInterval(() => {
      if (cronIntervalMode === "2m") {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            if (effectiveAutoCronEnabled && !isAiRunning) {
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
        if (rem === 3600 && effectiveAutoCronEnabled && !isAiRunning) {
          runLiveAiCycle("NORMAL_DCA", undefined, "AUTO_TIMER");
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [
    inngestPaused,
    cronIntervalMode,
    effectiveAutoCronEnabled,
    isAiRunning,
    runLiveAiCycle,
  ]);

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
        `BTC Vault Schedule Created On-Chain (Block #${data.blockNumber})`,
        `Bumblebee (#02) will allocate ${newDcaSliceBtc} BTC per slice (${total} slices) on Mezo 31611.`,
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

  const runProtocolHealthCheck = useCallback(async () => {
    setIsCheckingHealth(true);
    const probe = async (
      id: string,
      label: string,
      endpoint: string,
      init?: RequestInit,
      summarize?: (d: Record<string, unknown>) => string
    ) => {
      const t0 = performance.now();
      try {
        const res = await fetch(endpoint, { cache: "no-store", ...init });
        const data = (await res.json()) as Record<string, unknown>;
        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        if (!res.ok || data.ok === false) {
          throw new Error(String(data.error || `HTTP ${res.status}`));
        }
        return {
          id,
          label,
          endpoint,
          ok: true,
          summary: summarize ? summarize(data) : "Live JSON verified",
          latencyMs,
        };
      } catch (err) {
        return {
          id,
          label,
          endpoint,
          ok: false,
          summary: err instanceof Error ? err.message : "Probe failed",
          latencyMs: Math.max(1, Math.round(performance.now() - t0)),
        };
      }
    };

    const results = await Promise.all([
      probe("rpc", "Mezo 31611 RPC + PolicyVault", "/api/onchain-state", undefined, (d) =>
        `Block #${String(d.blockNumber ?? "?")} • ${(Array.isArray(d.agents) ? d.agents.length : 5)} Agents`
      ),
      probe("earn", "Mezo Earn & Tigris Pools", "/api/earn-router", undefined, (d) => {
        const vCount = Array.isArray(d.vaults) ? d.vaults.length : 0;
        const pCount = Array.isArray(d.pools) ? d.pools.length : 0;
        const rec = d.recommendation as { regime?: string } | undefined;
        return `${vCount} Earn Vaults • ${pCount} Tigris Pools • ${rec?.regime ?? "LIVE"}`;
      }),
      probe("musd", "MainMUSDVault & Credit Council", "/api/main-musd-vault", undefined, (d) => {
        const vs = d.vaultStats as { totalAssetsMusd?: number } | undefined;
        return `Total Assets: ${(vs?.totalAssetsMusd ?? 0).toFixed(2)} MUSD`;
      }),
      probe("lb", "Sub-Island Leaderboard & veBTC", "/api/leaderboard", undefined, (d) => {
        const entries = Array.isArray(d.entries) ? d.entries.length : 0;
        return `${entries} Sub-Islands Indexed`;
      }),
      probe("a2a", "ERC-8004 / A2A Agent Card", "/.well-known/agent-card.json", undefined, (d) =>
        `${String(d.protocol || "A2A")} • ${Array.isArray(d.agents) ? d.agents.length : 5} Agents`
      ),
      probe(
        "mcp",
        "MCP JSON-RPC Endpoint",
        "/api/mcp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_ecosystem_telemetry", arguments: {} },
          }),
        },
        (d) => {
          const r = d.result as { blockNumber?: string } | undefined;
          return `JSON-RPC 2.0 OK • Block #${String(r?.blockNumber ?? "?")}`;
        }
      ),
    ]);

    setProtocolHealthChecks(results);
    setIsCheckingHealth(false);
  }, []);

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
      : selectedStationId === MAIN_MEZO_VAULT_STATION.id
        ? {
          id: MAIN_MEZO_VAULT_STATION.id,
          name: "Main MEZO Citadel Vault",
          subtitle: "Stake MEZO · Credit APR Discounts & MUSD Yield",
          phase: "HEAD_PLANNING" as CyclePhase,
          position: MAIN_MEZO_VAULT_STATION.position,
          color: MAIN_MEZO_VAULT_STATION.color,
          roofColor: "#5b21b6",
          description:
            "Stake MEZO with Flexible (1x), 30-day (1.5x), or 90-day (2.5x) tiers to earn MUSD protocol rewards and unlock Credit Council APR discounts alongside veMEZO & stMEZO.",
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

  const activeEarnRec = classifyBtcEarnRegime({
    btcPriceUsd: liveBtcPriceUsd || 70000,
    btc24hChangePct: liveBtcChange24h || 0,
    rangePositionPct: liveRangePositionPct,
    fearGreedIndex: liveFearGreedIndex,
    trendDirection: liveTrendDirection,
    sentimentLabel: liveSentimentLabel,
    riskMode: strategyMandate.riskMode,
  });
  const earnPrimaryVaultLabel =
    ecosystemSummary?.primaryVaultName ||
    (activeEarnRec.primaryVaultId === "smusd"
      ? "sMUSD"
      : activeEarnRec.primaryVaultId === "upmusd"
        ? "upMUSD"
        : "StabilityPool");
  const earnPrimaryPoolLabel =
    ecosystemSummary?.primaryPoolName ||
    (activeEarnRec.primaryPoolId === "pool-musd-mezo"
      ? "vAMM-MUSD/MEZO"
      : activeEarnRec.primaryPoolId === "pool-musd-btc"
        ? "vAMM-MUSD/BTC"
        : "sAMM-MUSD/mUSDC");
  const hasEarnOrPoolAction = latestCycleActions.some(
    (a) =>
      a.status === "EXECUTED" &&
      (a.type === "DEPLOY_EARN_VAULT" ||
        a.type === "DEPLOY_TIGRIS_POOL" ||
        a.type === "DEPOSIT_MUSD_VAULT" ||
        a.type === "WITHDRAW_MUSD_VAULT")
  );
  const hasAnyExecutedNonHold = latestCycleActions.some(
    (a) => a.status === "EXECUTED" && a.type !== "HOLD"
  );
  const totalEarnAndPoolTvlUsd =
    (ecosystemSummary?.earnTotalTvlUsd || 0) +
    (ecosystemSummary?.poolTotalTvlUsd || 0);
  const displayCycleHeadline = latestCycleHeadline.startsWith(
    "Autobot Council: HOLD"
  )
    ? latestCycleHeadline.replace(
      "Autobot Council: HOLD",
      hasEarnOrPoolAction
        ? "Autobot Council: BTC Hold + Earn Rotation"
        : "Autobot Council: BTC Reserve Held + Defense"
    )
    : latestCycleHeadline;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#a7d4f9] text-[#231f20] font-sans select-none">
      {/* =====================================================================
          1. POLLY.TOWN STYLE TOP-LEFT FLOATING PILL NAVIGATION & KPI CARDS
         ===================================================================== */}
      <div className="z-40 absolute top-4 left-4 right-4 flex flex-wrap items-start justify-between gap-3 pointer-events-none">
        {(moreMenuOpen || islandMenuOpen || actionsMenuOpen) && (
          <div
            className="fixed inset-0 z-40 pointer-events-auto"
            onClick={() => {
              setMoreMenuOpen(false);
              setIslandMenuOpen(false);
              setActionsMenuOpen(false);
            }}
          />
        )}
        <div className="flex flex-col gap-3">
          {/* Top Pill Row */}
          <div className="relative z-50 pointer-events-auto flex flex-wrap items-center gap-2.5">
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
                { id: "dca" as const, label: "BTC Vault" },
                { id: "musd-vault" as const, label: "MUSD & Earn" },
                { id: "lending" as const, label: "Mezo Guard" },
                { id: "leaderboard" as const, label: "Leaderboard" },
              ].map((nav) => (
                <button
                  key={nav.id}
                  onClick={() => {
                    setActiveTab(nav.id);
                    setMoreMenuOpen(false);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${activeTab === nav.id
                    ? "bg-[#242331] text-white shadow-sm"
                    : "text-[#57524e] hover:text-[#231f20] hover:bg-stone-100"
                    }`}
                >
                  {nav.label}
                </button>
              ))}

              {/* Pro / Judge Tools Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen((o) => {
                      const next = !o;
                      if (next) {
                        setIslandMenuOpen(false);
                        setActionsMenuOpen(false);
                      }
                      return next;
                    });
                  }}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-all ${
                    activeTab === "mezo-vault" ||
                    activeTab === "governance" ||
                    activeTab === "crew" ||
                    activeTab === "arena" ||
                    activeTab === "contracts" ||
                    activeTab === "docs"
                      ? "bg-[#242331] text-white shadow-sm"
                      : "text-[#57524e] hover:text-[#231f20] hover:bg-stone-100"
                  }`}
                >
                  <span>More / Pro</span>
                  <ChevronDown className="h-3 w-3" />
                </button>

                {moreMenuOpen && (
                  <div className="absolute left-0 mt-2 w-64 rounded-2xl bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.24)] border border-stone-200 z-[70] space-y-1">
                    {[
                      {
                        id: "mezo-vault" as const,
                        label: "MEZO Vault (Main Island)",
                        hint: "Stake MEZO · lower APR & earn MUSD",
                      },
                      {
                        id: "governance" as const,
                        label: "MEZO Governance & Revenue",
                        hint: "Vote on rules & track MUSD fee share",
                      },
                      {
                        id: "crew" as const,
                        label: "Crew (5 AI)",
                        hint: "Meet Optimus, Ratchet & Ironhide",
                      },
                      {
                        id: "arena" as const,
                        label: "Debate & Keepers",
                        hint: "AI council transcripts & bounties",
                      },
                      {
                        id: "contracts" as const,
                        label: "Contracts & /mcp",
                        hint: "Verified addresses & ledger",
                      },
                      {
                        id: "docs" as const,
                        label: "Docs & Health Check",
                        hint: "Architecture & live probes",
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setMoreMenuOpen(false);
                          if (item.id === "contracts" && !mcpResponse) {
                            invokeMcpEndpoint("check_policy_vault");
                          }
                        }}
                        className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${
                          activeTab === item.id
                            ? "bg-stone-900 text-white"
                            : "hover:bg-stone-100 text-[#231f20]"
                        }`}
                      >
                        <div className="text-xs font-extrabold">{item.label}</div>
                        <div
                          className={`text-[10.5px] leading-snug ${
                            activeTab === item.id ? "text-stone-300" : "text-stone-600"
                          }`}
                        >
                          {item.hint}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
                onClick={() => {
                  setIslandMenuOpen((o) => {
                    const next = !o;
                    if (next) {
                      setMoreMenuOpen(false);
                      setActionsMenuOpen(false);
                    }
                    return next;
                  });
                }}
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
                <div className="absolute left-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-2xl bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.24)] border border-stone-200 z-[70] space-y-1">
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
                        setCloneTemplateDraft(null);
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
            <div className="hidden xl:flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-xs font-bold text-[#231f20] shadow-[0_8px_20px_rgba(35,31,32,0.08)] border border-white">
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
                type="button"
                onClick={() => {
                  setActionsMenuOpen((o) => {
                    const next = !o;
                    if (next) {
                      setMoreMenuOpen(false);
                      setIslandMenuOpen(false);
                    }
                    return next;
                  });
                }}
                className="flex items-center gap-1.5 rounded-full bg-[#242331] hover:bg-[#343246] px-4 py-2 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(35,31,32,0.14)] transition-all"
              >
                <span>Council</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              {actionsMenuOpen && (
                <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.24)] border border-stone-200 z-[70] space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setActiveTab("island");
                      setRightCardCollapsed(false);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#231f20] hover:bg-purple-50 transition-colors"
                  >
                    <Sparkles className="h-4 w-4 text-[#8b5cf6] shrink-0" />
                    <div>
                      <div className="font-extrabold">View Council Deliberation &amp; Live Trends</div>
                      <div className="text-[10.5px] text-stone-600 font-normal leading-snug">
                        Soundwave signals + 24h trends drive autonomous decisions
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setCouncilModalAgentFilter("ALL");
                      setCouncilModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#231f20] hover:bg-violet-50 transition-colors"
                  >
                    <Maximize2 className="h-4 w-4 text-[#7c3aed] shrink-0" />
                    <div>
                      <div className="font-extrabold">Open Full-Screen Agent Reader</div>
                      <div className="text-[10.5px] text-stone-600 font-normal leading-snug">
                        Read every agent turn in a spacious transcript modal
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setActiveTab("dca");
                    }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#231f20] hover:bg-amber-50 transition-colors"
                  >
                    <Plus className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-extrabold">BTC Vault &amp; Strategy Guardrails</div>
                      <div className="text-[10.5px] text-stone-600 font-normal leading-snug">
                        Deposit BTC, update guardrails &amp; vault schedules
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setActiveTab("contracts");
                    }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#231f20] hover:bg-emerald-50 transition-colors"
                  >
                    <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-extrabold">Inspect On-Chain Audit Ledger</div>
                      <div className="text-[10.5px] text-stone-600 font-normal leading-snug">
                        Verify Mezo 31611 PolicyVault &amp; Rectifier proofs
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 4 Pastel KPI Cards on Top-Left (Main Island Only) */}
          {activeTab === "island" && selectedIslandId === "main" && (
            <div className="relative z-10 pointer-events-auto flex flex-wrap items-stretch gap-2.5">
              {/* Card 1: Mint Green BTC Strategy Vault Card */}
              <div
                onClick={() => setActiveTab("dca")}
                className="cursor-pointer rounded-2xl bg-[#c2f0d6]/95 border-2 border-white/90 px-4 py-2.5 shadow-[0_10px_25px_rgba(35,31,32,0.08)] min-w-[155px] hover:scale-[1.02] transition-transform"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#26593d]">
                  BTC STRATEGY VAULT
                </div>
                <div className="text-lg font-black text-[#126b3a] leading-tight mt-0.5">
                  {formatBtc(vaultTvlBtc)}
                </div>
                <div className="text-[11px] font-semibold text-[#2d6647] mt-0.5">
                  Cap {(guardrails.maxSingleTradeBps / 100).toFixed(1)}% • {totalSlicesExecuted} Exec
                </div>
              </div>

              {/* Card 2: Soft Sky-Blue MUSD & MEZO Earn Router Card */}
              <div
                onClick={() => setActiveTab("musd-vault")}
                className="cursor-pointer rounded-2xl bg-[#cde3fe]/95 border-2 border-white/90 px-4 py-2.5 shadow-[0_10px_25px_rgba(35,31,32,0.08)] min-w-[165px] hover:scale-[1.02] transition-transform"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#284b7a]">
                  MUSD &amp; MEZO EARN
                </div>
                <div className="text-lg font-black text-[#1e293b] leading-tight mt-0.5">
                  {totalEarnAndPoolTvlUsd > 0
                    ? `$${totalEarnAndPoolTvlUsd.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })} TVL`
                    : `${earnPrimaryVaultLabel} Armed`}
                </div>
                <div className="text-[11px] font-semibold text-[#335580] mt-0.5">
                  {activeEarnRec.btcLowTriggerActive
                    ? `📉 Dip → ${earnPrimaryVaultLabel} + ${earnPrimaryPoolLabel}`
                    : `⚡ Yield → ${earnPrimaryVaultLabel} & Tigris`}
                </div>
              </div>

              {/* Card 3: Soft Butter-Yellow Autonomous Council & Trove Guard Card */}
              <div
                onClick={() => {
                  setRightCardCollapsed(false);
                }}
                className="cursor-pointer rounded-2xl bg-[#fdeaa6]/95 border-2 border-white/90 px-4 py-2.5 shadow-[0_10px_25px_rgba(35,31,32,0.08)] min-w-[165px] hover:scale-[1.02] transition-transform"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#6e5111]">
                  COUNCIL &amp; TROVE GUARD
                </div>
                <div className="text-lg font-black text-[#231f20] leading-tight mt-0.5">
                  {latestModelDecision === "RECTIFY_AND_EXECUTE"
                    ? "🩺 SELF-HEALED"
                    : latestModelDecision === "EXECUTE_DCA"
                      ? "⚡ DEPLOYING"
                      : hasEarnOrPoolAction
                        ? "🌾 EARN ROTATE"
                        : "🛡️ SHIELD ON"}
                </div>
                <div className="text-[11px] font-semibold text-[#6e5111] mt-0.5">
                  {ecosystemSummary && ecosystemSummary.troveHf > 0
                    ? `Trove HF ${ecosystemSummary.troveHf.toFixed(2)} • ${strategyMandate.riskMode}`
                    : `5 AI • ${strategyMandate.riskMode} Mandate`}
                </div>
              </div>

              {/* Card 4: Soft Rose-Pink Soundwave Live News & BTC Feed Card */}
              <div
                onClick={() => {
                  setSelectedStationId(null);
                  setSelectedAgentId(5);
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
                  {capturedNews.length} feeds • F&amp;G {liveFearGreedIndex}
                </div>
              </div>
            </div>
          )}

          {/* First-Time / Zero-Balance Quickstart Checklist (Main Island Only) */}
          {activeTab === "island" &&
            selectedIslandId === "main" &&
            !dismissedOnboarding &&
            (!isConnected ||
              (userWalletBalanceBtc <= 0.00001 && userDepositedBtc <= 0)) && (
              <div className="relative z-10 pointer-events-auto max-w-3xl rounded-2xl bg-white/95 backdrop-blur-md border-2 border-emerald-200/90 px-4 py-3 shadow-[0_12px_30px_rgba(35,31,32,0.12)] flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-900 px-2 py-0.5 text-[10px] font-black uppercase">
                      <Sparkles className="h-3 w-3" />
                      Quickstart Checklist
                    </span>
                    <span className="text-xs font-black text-[#231f20]">
                      New to MezoCity? Get started in 3 quick steps:
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-stone-700">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2
                        className={`h-3.5 w-3.5 ${
                          isConnected && chainId === mezoTestnet.id
                            ? "text-emerald-600"
                            : "text-stone-300"
                        }`}
                      />
                      1. {isConnected && chainId === mezoTestnet.id ? "Mezo 31611 Connected" : "Connect Mezo Testnet"}
                    </span>
                    <span className="text-stone-300">→</span>
                    <a
                      href="https://testnet.mezo.org"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
                    >
                      <CheckCircle2
                        className={`h-3.5 w-3.5 ${
                          userWalletBalanceBtc > 0.00001
                            ? "text-emerald-600"
                            : "text-stone-300"
                        }`}
                      />
                      2. Get Testnet BTC / MUSD
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    <span className="text-stone-300">→</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("dca")}
                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-black"
                    >
                      3. Try Safe BTC Auto-Save
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setActiveTab("dca")}
                    className="rounded-xl bg-[#242331] hover:bg-emerald-700 text-white text-[11px] font-black h-7 px-2.5"
                  >
                    Open BTC Vault
                  </Button>
                  <button
                    type="button"
                    onClick={() => setDismissedOnboarding(true)}
                    aria-label="Dismiss quickstart"
                    className="rounded-lg p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
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
              marketMoodInput={{
                fearGreedIndex: liveFearGreedIndex,
                trendDirection: liveTrendDirection,
                sentimentLabel: liveSentimentLabel,
              }}
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
              }}
              selectedStationId={selectedStationId}
              onSelectStation={(id) => {
                setSelectedSatelliteIslandId(null);
                setSelectedStationId(id);
                const owner = agents.find((a) => a.homeStationId === id);
                if (owner) {
                  setSelectedAgentId(owner.id);
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
              latestActions={latestCycleActions}
              marketMoodInput={{
                fearGreedIndex: liveFearGreedIndex,
                trendDirection: liveTrendDirection,
                sentimentLabel: liveSentimentLabel,
              }}
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
          <div className="z-20 absolute bottom-4 left-14 sm:left-16 flex flex-col gap-2.5 pointer-events-none max-w-[calc(100vw-4.5rem)]">
            {inspectedSatellite ? (
              <div className="pointer-events-auto w-[365px] max-w-full rounded-[26px] bg-white/95 border-[2.5px] border-white shadow-[0_22px_52px_rgba(35,31,32,0.18)] backdrop-blur-xl overflow-hidden">
                <div
                  className="p-3.5 pb-2.5 border-b border-[#ece4d4]"
                  style={{
                    background:
                      inspectedSatellite.biomeTheme === "grid"
                        ? "linear-gradient(135deg, rgba(6,182,212,0.14), rgba(250,247,242,0.95))"
                        : inspectedSatellite.biomeTheme === "basalt"
                          ? "linear-gradient(135deg, rgba(249,115,22,0.14), rgba(250,247,242,0.95))"
                          : inspectedSatellite.biomeTheme === "sand"
                            ? "linear-gradient(135deg, rgba(245,158,11,0.14), rgba(250,247,242,0.95))"
                            : "linear-gradient(135deg, rgba(16,185,129,0.14), rgba(250,247,242,0.95))",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
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
                          {inspectedSatellite.mezoTierId &&
                            inspectedSatellite.mezoTierId !== "NONE" && (() => {
                              const tier = MEZO_COORDINATION_TIERS.find(
                                (t) => t.tierId === inspectedSatellite.mezoTierId
                              );
                              return (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[8.5px] font-black text-amber-900">
                                  <Zap className="h-2.5 w-2.5" />
                                  {tier?.shortLabel || inspectedSatellite.mezoTierId}
                                  {tier ? ` (-${tier.aprDiscountBps} bps)` : ""}
                                </span>
                              );
                            })()}
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
                </div>

                <div className="p-3.5 pt-2.5">
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
                      disabled={
                        cloningSatelliteId === inspectedSatellite.islandId
                      }
                      onClick={() =>
                        handleCloneSatelliteIsland(inspectedSatellite)
                      }
                      title="Clone vaults & agent squad onto a new Sub-Island"
                      className="inline-flex items-center gap-1 rounded-xl bg-amber-100 hover:bg-amber-200 disabled:opacity-60 text-amber-950 border border-amber-300/70 px-2.5 py-1.5 text-[10.5px] font-extrabold transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                      <span>
                        {cloningSatelliteId === inspectedSatellite.islandId
                          ? "Loading..."
                          : "Clone"}
                      </span>
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
              </div>
            ) : inspectedAgent || inspectedStation ? (
              (() => {
                const accentColor =
                  inspectedAgent?.color ||
                  inspectedStation?.roofColor ||
                  "#8b5cf6";
                const activeStation =
                  inspectedStation ||
                  (inspectedAgent
                    ? ISLAND_STATIONS.find(
                      (s) => s.id === inspectedAgent.currentStationId
                    ) ?? null
                    : null);
                const domainCta: {
                  label: string;
                  tab: "arena" | "musd-vault" | "mezo-vault" | "dca" | "lending" | "crew";
                  gradient: string;
                } =
                  inspectedStation?.id === MAIN_MEZO_VAULT_STATION.id
                    ? {
                      label: "Open Main MEZO Vault",
                      tab: "mezo-vault",
                      gradient: "from-violet-600 to-indigo-700",
                    }
                    : inspectedStation?.id === MAIN_MUSD_VAULT_STATION.id ||
                      inspectedAgent?.name === "Bumblebee" ||
                      inspectedStation?.id === "dca_piggy"
                      ? {
                        label: "Open MUSD & Earn Router",
                        tab: "musd-vault",
                        gradient: "from-emerald-600 to-teal-600",
                      }
                    : inspectedAgent?.name === "Ratchet" ||
                      inspectedStation?.id === "rectifier_lab"
                      ? {
                        label: "Inspect BTC Vault Caps",
                        tab: "dca",
                        gradient: "from-teal-600 to-emerald-600",
                      }
                      : inspectedAgent?.name === "Ironhide" ||
                        inspectedStation?.id === "policy_fortress"
                        ? {
                          label: "Open MUSD Trove Guard",
                          tab: "lending",
                          gradient: "from-blue-600 to-indigo-600",
                        }
                        : inspectedAgent?.name === "Soundwave" ||
                          inspectedStation?.id === "lighthouse_beacon"
                          ? {
                            label: "View 5-AI Crew Matrix",
                            tab: "crew",
                            gradient: "from-pink-600 to-rose-600",
                          }
                          : {
                            label: "Open Debate & Keepers",
                            tab: "arena",
                            gradient: "from-[#7c3aed] to-indigo-600",
                          };

                const agentIcon =
                  inspectedAgent?.name === "Bumblebee" ? (
                    <Zap className="h-4 w-4 text-white" />
                  ) : inspectedAgent?.name === "Ratchet" ? (
                    <Wrench className="h-4 w-4 text-white" />
                  ) : inspectedAgent?.name === "Ironhide" ? (
                    <ShieldCheck className="h-4 w-4 text-white" />
                  ) : inspectedAgent?.name === "Soundwave" ? (
                    <Activity className="h-4 w-4 text-white" />
                  ) : (
                    <Cpu className="h-4 w-4 text-white" />
                  );

                return (
                  <div className="pointer-events-auto w-[368px] max-w-full rounded-[26px] bg-white/95 border-[2.5px] border-white shadow-[0_22px_52px_rgba(35,31,32,0.20)] backdrop-blur-xl overflow-hidden">
                    {/* Dynamic Agent-Tinted Header */}
                    <div
                      className="p-3.5 pb-3 border-b border-[#ebe3d4]"
                      style={{
                        background: `linear-gradient(135deg, ${accentColor}22 0%, rgba(250,247,242,0.96) 100%)`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="relative h-10 w-10 rounded-2xl shrink-0 flex items-center justify-center shadow-md border border-white/80"
                            style={{
                              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
                            }}
                          >
                            {agentIcon}
                            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[15px] font-black tracking-tight text-[#1e1b18] truncate">
                                {inspectedAgent
                                  ? inspectedAgent.name
                                  : inspectedStation?.name}
                              </span>
                              {inspectedAgent && (
                                <span className="rounded-full bg-[#1f1c2e] px-2 py-0.5 text-[9px] font-black text-white uppercase tracking-wider shadow-sm">
                                  {inspectedAgent.erc8004Id}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-bold text-[#625951] truncate mt-0.5">
                              {inspectedAgent
                                ? inspectedAgent.role
                                : inspectedStation?.subtitle}
                            </div>
                            {inspectedAgent && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="rounded-md bg-white/85 border border-[#e3d9c6] px-1.5 py-0.5 text-[8.5px] font-extrabold text-[#4a423b]">
                                  {inspectedAgent.weightPercent}% Council Vote
                                </span>
                                <span className="rounded-md bg-white/85 border border-[#e3d9c6] px-1.5 py-0.5 text-[8.5px] font-extrabold text-[#6d28d9]">
                                  {inspectedAgent.aiModelName}
                                </span>
                              </div>
                            )}
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
                          className="h-7 w-7 rounded-full bg-white/90 hover:bg-white border border-[#e3d9c6] flex items-center justify-center text-[#4a433d] shrink-0 shadow-sm transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 pt-2.5 space-y-2.5">
                      {/* Focused Station & Live Telemetry Box */}
                      {activeStation && (
                        <div
                          className="rounded-2xl bg-gradient-to-br from-[#faf6ee] to-[#f1e9da] border border-[#e4dac7] px-3 py-2.5 shadow-inner"
                          style={{
                            borderLeftWidth: "3.5px",
                            borderLeftColor: accentColor,
                          }}
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold text-[#413a34]">
                            <span className="truncate">📍 {activeStation.name}</span>
                            <span className="shrink-0 rounded-full bg-white border border-[#e1d7c4] px-2 py-0.5 text-[8.5px] font-black uppercase text-[#6d28d9] shadow-2xs">
                              {activeStation.phase.replace("_", " ")}
                            </span>
                          </div>
                          <div className="max-h-[135px] overflow-y-auto mt-1.5 pr-1">
                            <p className="text-[11.5px] text-[#3a342e] leading-relaxed">
                              {inspectedStation
                                ? inspectedStation.description
                                : `“${
                                    (inspectedAgent &&
                                      reasoningFeed.find(
                                        (m) => m.speaker === inspectedAgent.name
                                      )?.text) ||
                                    inspectedAgent?.speechBubble
                                  }”`}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Capability / Skill Chips */}
                      {inspectedAgent && inspectedAgent.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {inspectedAgent.skills.slice(0, 3).map((sk) => (
                            <span
                              key={sk}
                              className="rounded-full bg-[#f6f2ea] border border-[#e3d9c6] px-2 py-0.5 text-[9px] font-extrabold text-[#4d443c]"
                            >
                              ✦ {sk}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* On-Chain Reputation & Action Metrics */}
                      {inspectedAgent && (
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="rounded-xl bg-emerald-50/75 border border-emerald-200/80 px-2 py-1.5 text-center">
                            <div className="text-[8.5px] font-extrabold uppercase tracking-wide text-emerald-800/80">
                              Reputation
                            </div>
                            <div className="text-xs font-black tabular-nums text-emerald-800 mt-0.5">
                              {(inspectedAgent.reputationBps / 100).toFixed(1)}%
                            </div>
                          </div>
                          <div className="rounded-xl bg-violet-50/75 border border-violet-200/80 px-2 py-1.5 text-center">
                            <div className="text-[8.5px] font-extrabold uppercase tracking-wide text-violet-800/80">
                              Success Rate
                            </div>
                            <div className="text-xs font-black tabular-nums text-violet-700 mt-0.5">
                              {inspectedAgent.successRate}%
                            </div>
                          </div>
                          <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 px-2 py-1.5 text-center">
                            <div className="text-[8.5px] font-extrabold uppercase tracking-wide text-amber-900/75">
                              On-Chain
                            </div>
                            <div className="text-xs font-black tabular-nums text-[#231f20] mt-0.5">
                              {inspectedAgent.totalActions} Tx
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Protocol Deep-Link & Camera Controls */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setActiveTab(domainCta.tab)}
                          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r ${domainCta.gradient} hover:brightness-110 text-white px-3 py-2 text-[10.5px] font-black shadow-sm transition-all`}
                        >
                          <span>{domainCta.label}</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                        {inspectedStation?.id === MAIN_MEZO_VAULT_STATION.id && (
                          <button
                            type="button"
                            onClick={() => setActiveTab("governance")}
                            className="inline-flex items-center gap-1 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300/70 px-2.5 py-2 text-[10.5px] font-black transition-colors"
                            title="Open MEZO Governance & FeeSplitter Revenue"
                          >
                            <span>Governance</span>
                          </button>
                        )}
                        {inspectedAgent && !inspectedStation && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setCouncilModalAgentFilter(inspectedAgent.name);
                                setCouncilModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl bg-violet-100 hover:bg-violet-200 border border-violet-300 text-violet-950 px-2.5 py-2 text-[10.5px] font-black transition-colors"
                              title={`Read full communication from ${inspectedAgent.name}`}
                            >
                              <Maximize2 className="h-3 w-3" />
                              <span>Read Thread</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedStationId(inspectedAgent.currentStationId)
                              }
                              className="inline-flex items-center gap-1 rounded-xl bg-[#efe9dc] hover:bg-[#e4dccb] text-[#231f20] px-2.5 py-2 text-[10.5px] font-extrabold transition-colors"
                              title="Pan camera to agent's current 3D station"
                            >
                              <Crosshair className="h-3 w-3" />
                              <span>Station</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSatelliteIslandId(null);
                            setSelectedAgentId(null);
                            setSelectedStationId(null);
                            setCameraResetTick((t) => t + 1);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl bg-white hover:bg-stone-100 border border-[#dfd6c5] text-[#4a433d] px-2.5 py-2 text-[10.5px] font-extrabold transition-colors"
                          title="Reset 3D camera to island overview"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Overview</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : null}

            {/* Quick Autobot Camera Switcher Bar */}
            <div className="pointer-events-auto inline-flex flex-wrap items-center gap-1.5 rounded-2xl bg-white/95 border-2 border-white px-3 py-1.5 shadow-[0_14px_34px_rgba(35,31,32,0.14)] backdrop-blur-xl">
              <span className="text-[9.5px] font-black uppercase tracking-widest text-[#7c7166] px-1">
                Focus
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
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold transition-all ${isSelected
                      ? "bg-gradient-to-r from-[#242331] to-[#3a3556] text-white shadow-sm scale-[1.03]"
                      : "bg-[#f6f1e7] text-[#3b342e] hover:bg-[#ebe3d3]"
                      }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: ag.color,
                        boxShadow: isSelected ? `0 0 8px ${ag.color}` : undefined,
                      }}
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
                className="inline-flex items-center gap-1 rounded-full bg-[#efe9dc] hover:bg-[#e3dac9] px-2.5 py-1 text-[10px] font-extrabold text-[#4a433d] transition-colors"
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
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-100 to-indigo-100 hover:from-violet-200 hover:to-indigo-200 border border-violet-300/70 px-2.5 py-1 text-[10px] font-extrabold text-violet-900 transition-colors"
                >
                  <Globe className="h-2.5 w-2.5" />
                  <span>Archipelago ({customIslands.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab("leaderboard")}
                title="Open Verified Yield Leaderboard & 1-Click Cloning"
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 hover:from-amber-200 hover:to-orange-200 border border-amber-300/70 px-2.5 py-1 text-[10px] font-extrabold text-amber-950 transition-colors"
              >
                <Trophy className="h-2.5 w-2.5" />
                <span>Leaderboard</span>
              </button>
            </div>
          </div>

          {/* RIGHT FLOATING TALL CARD */}
          <aside className="z-30 absolute top-20 xl:top-4 right-4 bottom-4 w-[440px] xl:w-[480px] max-w-[94vw] flex flex-col pointer-events-none">
            <div className="pointer-events-auto flex flex-col max-h-full min-h-0 rounded-[28px] bg-[#faf7f2]/95 border-[3px] border-white shadow-[0_20px_50px_rgba(35,31,32,0.16)] p-4 overflow-hidden backdrop-blur-md">
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
                    type="button"
                    onClick={() => {
                      setCouncilModalAgentFilter("ALL");
                      setCouncilModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-2.5 py-1 text-[10px] font-black shadow-sm transition-colors"
                    title="Open Full-Screen Council Communication Reader"
                  >
                    <Maximize2 className="h-3 w-3" />
                    <span>Bigger</span>
                  </button>
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
                  {/* 4-Pillar Multi-Protocol Quick Switcher Strip */}
                  <div className="grid grid-cols-4 gap-1 mb-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab("dca")}
                      className="rounded-xl bg-white/90 hover:bg-white border border-[#e5dec9] px-1.5 py-1 text-[9.5px] font-black text-[#231f20] transition-colors flex flex-col items-center leading-tight"
                      title="BTC Strategy Vault & Policy Guardrails"
                    >
                      <span>🪙 BTC Vault</span>
                      <span className="text-[8px] font-bold text-[#6e655d]">
                        {(guardrails.maxSingleTradeBps / 100).toFixed(0)}% Cap
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("musd-vault")}
                      className={`rounded-xl border px-1.5 py-1 text-[9.5px] font-black transition-colors flex flex-col items-center leading-tight ${activeEarnRec.btcLowTriggerActive
                        ? "bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-950"
                        : "bg-white/90 hover:bg-white border-[#e5dec9] text-[#231f20]"
                        }`}
                      title="Mezo Earn Vaults (sMUSD, upMUSD, StabilityPool) & Tigris Pools"
                    >
                      <span className="flex items-center gap-1">
                        {activeEarnRec.btcLowTriggerActive && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                        )}
                        🌾 MUSD Earn
                      </span>
                      <span className="text-[8px] font-bold text-emerald-800">
                        {activeEarnRec.btcLowTriggerActive ? "Dip Routing" : "Yield Pools"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("lending")}
                      className="rounded-xl bg-white/90 hover:bg-white border border-[#e5dec9] px-1.5 py-1 text-[9.5px] font-black text-[#231f20] transition-colors flex flex-col items-center leading-tight"
                      title="Mezo MUSD Trove Liquidation Defense Guard"
                    >
                      <span>🛡️ Trove Guard</span>
                      <span className="text-[8px] font-bold text-[#6e655d]">
                        {ecosystemSummary && ecosystemSummary.troveHf > 0
                          ? `HF ${ecosystemSummary.troveHf.toFixed(2)}`
                          : "110% MCR"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("arena")}
                      className="rounded-xl bg-white/90 hover:bg-white border border-[#e5dec9] px-1.5 py-1 text-[9.5px] font-black text-[#231f20] transition-colors flex flex-col items-center leading-tight"
                      title="On-Chain Debate Arena & Keeper Bounties"
                    >
                      <span>⚖️ Keepers</span>
                      <span className="text-[8px] font-bold text-[#6e655d]">
                        Debates
                      </span>
                    </button>
                  </div>

                  {/* Panel Focus Switcher: Split View / Full Chat / Signals */}
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#ede6d8] p-1 mb-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCouncilSectionView("split")}
                      className={`rounded-lg py-1 text-[10px] font-black transition-colors ${
                        councilSectionView === "split"
                          ? "bg-white text-[#231f20] shadow-sm"
                          : "text-[#575049] hover:text-[#231f20]"
                      }`}
                    >
                      💬 Overview + Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setCouncilSectionView("feed")}
                      className={`rounded-lg py-1 text-[10px] font-black transition-colors ${
                        councilSectionView === "feed"
                          ? "bg-[#242331] text-white shadow-sm"
                          : "text-[#575049] hover:text-[#231f20]"
                      }`}
                    >
                      🗨️ Full Chat (
                      {reasoningFeed.filter((m) => m.speaker !== "You").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCouncilSectionView("signals")}
                      className={`rounded-lg py-1 text-[10px] font-black transition-colors ${
                        councilSectionView === "signals"
                          ? "bg-white text-[#231f20] shadow-sm"
                          : "text-[#575049] hover:text-[#231f20]"
                      }`}
                    >
                      📡 Legs &amp; News
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-0.5">
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
                            label: "💵 MUSD & Earn Router",
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

                  {/* HIGHLIGHTED AUTONOMOUS MULTI-PROTOCOL DECISION BANNER */}
                  {councilSectionView !== "feed" && (
                  <div
                    className={`rounded-2xl border-2 p-2.5 mb-2 shrink-0 transition-all ${latestModelDecision === "RECTIFY_AND_EXECUTE"
                      ? "bg-emerald-50/95 border-emerald-400 text-emerald-950"
                      : latestModelDecision === "EXECUTE_DCA"
                        ? "bg-purple-50/95 border-[#8b5cf6] text-[#1f1c1a]"
                        : hasEarnOrPoolAction
                          ? "bg-teal-50/95 border-teal-400 text-teal-950"
                          : "bg-amber-50/95 border-amber-300 text-amber-950"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${latestModelDecision === "RECTIFY_AND_EXECUTE"
                          ? "bg-emerald-600 text-white"
                          : latestModelDecision === "EXECUTE_DCA"
                            ? "bg-[#8b5cf6] text-white"
                            : hasEarnOrPoolAction
                              ? "bg-teal-600 text-white"
                              : "bg-amber-400 text-amber-950"
                          }`}
                      >
                        {latestModelDecision === "RECTIFY_AND_EXECUTE"
                          ? "🩺 DECISION: SELF-HEALED EXECUTE"
                          : latestModelDecision === "EXECUTE_DCA"
                            ? "⚡ DECISION: MULTI-PROTOCOL DEPLOY"
                            : hasEarnOrPoolAction
                              ? "🌾 BTC HELD + EARN ROTATION"
                              : hasAnyExecutedNonHold
                                ? "🛡️ BTC HELD + POLICY & GUARD ACTIVE"
                                : "🛡️ CAPITAL DEFENSE ACTIVE"}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {lastTxHash &&
                          (latestModelDecision !== "HOLD" ||
                            latestCycleActions.some(
                              (a) => a.type !== "HOLD" && Boolean(a.txHash)
                            )) ? (
                          <a
                            href={`https://explorer.test.mezo.org/tx/${lastTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md bg-white/90 border border-stone-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#231f20] hover:underline flex items-center gap-1 shrink-0"
                          >
                            <span>TX {shortenHex(lastTxHash, 4)}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span className="rounded-md bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-stone-700 shrink-0">
                            {latestModelDecision === "HOLD"
                              ? "RESERVE GUARDED"
                              : `BLOCK #${rpcBlockNumber}`}
                          </span>
                        )}
                        {councilSectionView === "split" && (
                          <button
                            type="button"
                            onClick={() =>
                              setDecisionDetailsExpanded((prev) => !prev)
                            }
                            className="rounded-md bg-white/90 hover:bg-white border border-stone-300 px-1.5 py-0.5 text-[9px] font-black text-[#231f20]"
                          >
                            {decisionDetailsExpanded ? "Less ▴" : "Legs ▾"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-[12px] font-extrabold leading-snug">
                      {displayCycleHeadline}
                    </div>
                    {(decisionDetailsExpanded ||
                      councilSectionView === "signals") && (
                      <>
                        <div className="text-[11px] opacity-90 mt-1 leading-relaxed">
                          {latestDecisionReason}
                        </div>

                        {/* 3-Domain Multi-Protocol Split Status Pill */}
                        <div className="grid grid-cols-3 gap-1 mt-2">
                          <button
                            type="button"
                            onClick={() => setActiveTab("dca")}
                            className="rounded-lg bg-white/80 hover:bg-white border border-black/10 px-1.5 py-1 text-left transition-colors"
                          >
                            <div className="text-[8px] font-extrabold uppercase opacity-70">
                              BTC Spot Vault
                            </div>
                            <div className="text-[9.5px] font-black truncate">
                              {latestModelDecision === "HOLD"
                                ? "Held Safe"
                                : "Executed"}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab("musd-vault")}
                            className="rounded-lg bg-white/80 hover:bg-white border border-black/10 px-1.5 py-1 text-left transition-colors"
                          >
                            <div className="text-[8px] font-extrabold uppercase opacity-70">
                              MUSD &amp; MEZO Yield
                            </div>
                            <div className="text-[9.5px] font-black text-emerald-800 truncate">
                              {hasEarnOrPoolAction
                                ? "Deployed"
                                : activeEarnRec.btcLowTriggerActive
                                  ? `${earnPrimaryVaultLabel} Ready`
                                  : earnPrimaryVaultLabel}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab("lending")}
                            className="rounded-lg bg-white/80 hover:bg-white border border-black/10 px-1.5 py-1 text-left transition-colors"
                          >
                            <div className="text-[8px] font-extrabold uppercase opacity-70">
                              Trove &amp; Policy
                            </div>
                            <div className="text-[9.5px] font-black text-sky-900 truncate">
                              {ecosystemSummary && ecosystemSummary.troveHf > 0
                                ? `HF ${ecosystemSummary.troveHf.toFixed(2)}`
                                : `${(guardrails.maxSingleTradeBps / 100).toFixed(1)}% Cap`}
                            </div>
                          </button>
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
                                    <span className="opacity-75">
                                      ({act.amountLabel})
                                    </span>
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
                                    <span className="opacity-75">
                                      ({act.amountLabel})
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  )}

                  {/* Inngest 1-Hour Cron + One-Shot 2-Minute Judge Trigger & Run Telemetry Bar */}
                  <div className="rounded-2xl bg-[#f3ede2] border border-[#e6dec8] px-3 py-2 mb-2 shrink-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold text-[#231f20]">
                        <Clock className="h-3.5 w-3.5 text-[#8b5cf6]" />
                        <span>
                          {inngestPaused
                            ? "Inngest Cron:"
                            : cronIntervalMode === "2m"
                              ? "2m Judge Trigger (→1h):"
                              : "Inngest 1h Cron:"}{" "}
                          <span
                            className={`font-mono ${inngestPaused ? "text-amber-700" : "text-[#7c3aed]"}`}
                          >
                            {inngestPaused
                              ? "PAUSED"
                              : formatCountdown(secondsLeft)}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isAiRunning}
                          onClick={() =>
                            runLiveAiCycle("NORMAL_DCA", undefined, "MANUAL_UI")
                          }
                          className={`rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase transition-colors ${isAiRunning
                            ? "bg-stone-300 text-stone-600 cursor-not-allowed"
                            : "bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-sm"
                            }`}
                          title="Run a live 5-agent multi-protocol cycle now (BTC Vault + MUSD/MEZO Earn + Policy + Trove Guard)"
                        >
                          {isAiRunning ? "Running..." : "⚡ Run Now"}
                        </button>
                        <button
                          type="button"
                          disabled={inngestPaused}
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
                          className={`rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase transition-colors ${inngestPaused
                            ? "bg-stone-200 text-stone-500 border border-stone-300 cursor-not-allowed"
                            : cronIntervalMode === "2m"
                              ? "bg-amber-400 text-amber-950 border border-amber-500"
                              : "bg-white text-[#57524e] border border-[#d6cbb9] hover:bg-stone-100"
                            }`}
                          title={
                            inngestPaused
                              ? "Inngest & auto-timer triggers paused via INNGEST_PAUSED env variable"
                              : "Switch to a 2-minute countdown for judging (automatically reverts to 1-hour after firing once)"
                          }
                        >
                          {inngestPaused
                            ? "⏸ Paused"
                            : cronIntervalMode === "2m"
                              ? "⚡ 2m (→1h)"
                              : "⏱ 2m"}
                        </button>
                        <button
                          onClick={() => setActiveTab("crew")}
                          className={`rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase ${neonConnected
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                            : "bg-purple-100 text-purple-900 border border-purple-200"
                            }`}
                          title="Neon Serverless Postgres Status"
                        >
                          {neonConnected ? "DB Live" : "Sync..."}
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
                            inngestTelemetry?.inngestMode === "PAUSED"
                              ? "text-stone-700 font-black"
                              : inngestTelemetry?.inngestMode === "CLOUD_SIGNED" ||
                                  inngestTelemetry?.inngestMode ===
                                    "DEV_SERVER_ONLINE"
                                ? "text-emerald-800 font-black"
                                : "text-amber-800 font-black"
                          }
                        >
                          {inngestTelemetry?.inngestMode === "PAUSED"
                            ? "Inngest Paused (ENV)"
                            : inngestTelemetry?.inngestMode === "CLOUD_SIGNED"
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
                  {councilSectionView !== "signals" && (
                  <div className="flex-1 min-h-[240px] rounded-2xl bg-[#f3ede2] border border-[#e6dec8] p-3 overflow-y-auto space-y-2.5 mb-2">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wider text-[#6e655d] pb-1.5 border-b border-[#e5dec9]">
                      <span className="inline-flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-[#7c3aed]" />
                        <span>Autonomous Council Deliberation</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCouncilModalAgentFilter("ALL");
                          setCouncilModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-white hover:bg-violet-50 border border-[#d6cbb9] px-2.5 py-0.5 text-[9.5px] font-black text-[#6d28d9] transition-colors"
                      >
                        <Maximize2 className="h-2.5 w-2.5" />
                        <span>Expand Full View</span>
                      </button>
                    </div>
                    <CouncilMessageList
                      messages={reasoningFeed}
                      density={councilSectionView === "feed" ? "comfortable" : "compact"}
                      isAiRunning={isAiRunning}
                      inngestPaused={inngestPaused}
                      showTurnIndex={councilSectionView === "feed"}
                    />
                  </div>
                  )}

                  {/* SOUNDWAVE (#05) LIVE NEWS TRENDS, FEAR & GREED & MARKET SIGNALS PANEL */}
                  {councilSectionView !== "feed" && (
                  <div
                    className={`rounded-2xl bg-white/95 border border-[#ded6c6] shrink-0 ${
                      councilSectionView === "signals"
                        ? "flex-1 min-h-0 overflow-y-auto p-3 space-y-2"
                        : soundwaveExpanded
                          ? "max-h-[210px] overflow-y-auto p-3 space-y-2"
                          : "p-2.5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#be185d] min-w-0">
                        <span className="h-2 w-2 rounded-full bg-[#ec4899] animate-ping shrink-0" />
                        <span className="truncate">
                          {soundwaveExpanded || councilSectionView === "signals"
                            ? "SOUNDWAVE (#05) LIVE NEWS & MARKET TRENDS"
                            : `SOUNDWAVE • F&G ${liveFearGreedIndex} • ${liveTrendDirection === "UPTREND" ? "📈 UP" : liveTrendDirection === "DOWNTREND" ? "📉 DOWN" : "↔️ RANGE"}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10.5px] font-black text-[#231f20]">
                          {liveBtcPriceUsd > 0
                            ? `$${liveBtcPriceUsd.toLocaleString()} (${liveBtcChange24h >= 0 ? "+" : ""
                            }${liveBtcChange24h}%)`
                            : "Syncing..."}
                        </span>
                        {councilSectionView === "split" && (
                          <button
                            type="button"
                            onClick={() => setSoundwaveExpanded((prev) => !prev)}
                            className="rounded-md bg-[#f7f4ed] hover:bg-[#efe9dc] border border-[#dfd6c5] px-1.5 py-0.5 text-[9px] font-black text-[#4a433d]"
                          >
                            {soundwaveExpanded ? "Hide ▴" : "News ▾"}
                          </button>
                        )}
                      </div>
                    </div>

                    {(soundwaveExpanded || councilSectionView === "signals") && (
                      <>
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

                    {/* Live BTC-Low Multi-Protocol Earn Routing Rule */}
                    <button
                      type="button"
                      onClick={() => setActiveTab("musd-vault")}
                      className={`w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-1 text-left text-[9.5px] font-extrabold border transition-colors ${activeEarnRec.btcLowTriggerActive
                        ? "bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900"
                        : "bg-[#f7f4ed] hover:bg-[#efe9dc] border-[#e5dec9] text-[#4a433d]"
                        }`}
                      title="Open Mezo Earn Vaults & Tigris Pools Router"
                    >
                      <span className="truncate">
                        {activeEarnRec.btcLowTriggerActive
                          ? `📉 BTC Low Trigger → Deploy MUSD to ${earnPrimaryVaultLabel} & MEZO to ${earnPrimaryPoolLabel}`
                          : `⚡ Balanced Yield Rule → ${earnPrimaryVaultLabel} + ${earnPrimaryPoolLabel}`}
                      </span>
                      <ArrowUpRight className="h-3 w-3 shrink-0" />
                    </button>

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
                      </>
                    )}
                  </div>
                  )}
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
          reasoningFeed={reasoningFeed}
          latestCycleHeadline={displayCycleHeadline}
          latestDecisionReason={latestDecisionReason}
          inngestPaused={inngestPaused}
          onOpenFullCommunication={() => {
            setCouncilModalAgentFilter("ALL");
            setCouncilModalOpen(true);
          }}
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      )}

      {/* =====================================================================
          3B. VIEW 2B: ON-CHAIN COUNCIL DEBATE ARENA & KEEPER BOUNTY BOARD
         ===================================================================== */}
      {activeTab === "arena" && (
        <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto">
            <DebateKeeperArenaPanel onNavigateTab={(tab) => setActiveTab(tab)} />
          </div>
        </div>
      )}

      {/* =====================================================================
          4. VIEW 3: BTC STRATEGY VAULT & POLICY GUARDRAILS (SIMPLE + PRO MODES)
         ===================================================================== */}
      {activeTab === "dca" && (
        <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto space-y-6">
            {(() => {
              const vaultTvlUsd = vaultTvlBtc * liveBtcPriceUsd;
              const userDepositedUsd = userDepositedBtc * liveBtcPriceUsd;
              const maxAllowedSliceBtc =
                (vaultTvlBtc * guardrails.maxSingleTradeBps) / 10000;
              const depositNum = parseFloat(depositInput) || 0;
              const depositUsd = depositNum * liveBtcPriceUsd;
              const draftSliceNum = parseFloat(newDcaSliceBtc) || 0;
              const draftSliceUsd = draftSliceNum * liveBtcPriceUsd;
              const draftSliceBps =
                vaultTvlBtc > 0 ? Math.round((draftSliceNum / vaultTvlBtc) * 10000) : 0;
              const draftExceedsCap =
                vaultTvlBtc > 0 && draftSliceNum > maxAllowedSliceBtc;
              const totalPlanBtc =
                draftSliceNum * (parseInt(newDcaTotalSlices, 10) || 0);
              const totalPlanUsd = totalPlanBtc * liveBtcPriceUsd;

              const STRATEGY_GOALS = [
                {
                  id: "TWAP-BTC-CORE",
                  friendly: "Steady BTC Auto-Save",
                  hint: "Buys Bitcoin gradually on your schedule",
                },
                {
                  id: "stBTC-MEZO-VAULT",
                  friendly: "Staked BTC Yield",
                  hint: "Targets staked BTC vault yield",
                },
                {
                  id: "upBTC-VAULT",
                  friendly: "Upside BTC Vault",
                  hint: "Allocates into upBTC yield vault",
                },
                {
                  id: "MUSD-RESERVE-BUF",
                  friendly: "Safety MUSD Buffer",
                  hint: "Builds a defensive stablecoin cushion",
                },
              ];

              const activeGoalMeta = STRATEGY_GOALS.find(
                (g) => g.id === newDcaAsset
              );

              return (
                <>
                  {/* Hero Banner with Simple / Pro Details Switcher */}
                  <div className="rounded-3xl bg-gradient-to-r from-[#161a26] via-[#1b2234] to-[#0f2922] text-white p-6 shadow-xl border border-white/10 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1.5 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-emerald-500 text-stone-950 font-black text-[10px] tracking-wider uppercase px-2.5 py-0.5">
                            BTC AUTO-PILOT VAULT
                          </Badge>
                          {btcVaultProMode ? (
                            <>
                              <Badge className="bg-violet-500/25 text-violet-200 border border-violet-400/30 font-bold text-[10px] uppercase px-2.5 py-0.5">
                                POLICYVAULT + MEZODCAENGINE
                              </Badge>
                              <Badge className="bg-amber-500/20 text-amber-200 border border-amber-400/30 font-bold text-[10px] uppercase px-2.5 py-0.5">
                                AUTO SELF-HEALING (RATCHET #03)
                              </Badge>
                            </>
                          ) : (
                            <Badge className="bg-white/10 text-emerald-200 border border-white/15 font-bold text-[10px] px-2.5 py-0.5">
                              Self-Custody · Withdraw Anytime
                            </Badge>
                          )}
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2.5">
                          <ShieldCheck className="h-7 w-7 text-emerald-400" />
                          {btcVaultProMode
                            ? "BTC Strategy Vault & Policy Guardrails"
                            : "Bitcoin Savings & Auto-Invest Vault"}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {btcVaultProMode ? (
                            <>
                              Custodies real native BTC in{" "}
                              <strong className="text-white">PolicyVault.sol</strong>, enforces mathematical position limits across{" "}
                              <strong className="text-emerald-300">
                                BTC TWAP Accumulation, Reserve Buffers, Basket Rebalancing &amp; BTC Yield Allocations
                              </strong>
                              , and coordinates MUSD &amp; MEZO yield routing.
                            </>
                          ) : (
                            <>
                              Deposit Bitcoin safely into your personal vault, set a comfort risk level, and automate recurring investments. Only{" "}
                              <strong className="text-white">your wallet</strong> can ever withdraw your BTC.
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Simple vs Pro Details Pill */}
                        <div className="inline-flex items-center rounded-xl bg-white/10 border border-white/15 p-0.5">
                          <button
                            type="button"
                            onClick={() => setBtcVaultProMode(false)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${!btcVaultProMode
                              ? "bg-white text-slate-950 shadow-sm"
                              : "text-slate-300 hover:text-white"
                              }`}
                          >
                            Simple
                          </button>
                          <button
                            type="button"
                            onClick={() => setBtcVaultProMode(true)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${btcVaultProMode
                              ? "bg-violet-500 text-white shadow-sm"
                              : "text-slate-300 hover:text-white"
                              }`}
                          >
                            Pro Details
                          </button>
                        </div>

                        <Button
                          size="sm"
                          onClick={() => setActiveTab("musd-vault")}
                          className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs shadow-md"
                        >
                          MUSD &amp; Earn
                          <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                        {btcVaultProMode && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActiveTab("lending")}
                            className="rounded-xl bg-white/10 hover:bg-white/20 text-white border-white/20 font-bold text-xs"
                          >
                            Trove Guard
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 4 Hero KPI Tiles */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                      <div className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          {btcVaultProMode ? "On-Chain Vault TVL" : "Total Vault Balance"}
                        </div>
                        <div className="text-lg font-black text-emerald-300 mt-0.5 tabular-nums">
                          {formatBtc(vaultTvlBtc)}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-300 mt-0.5 tabular-nums">
                          ≈ $
                          {vaultTvlUsd.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}{" "}
                          USD
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          {btcVaultProMode ? "Max Approved Slice Cap" : "Your Vault Deposit"}
                        </div>
                        <div className="text-lg font-black text-violet-300 mt-0.5 tabular-nums">
                          {btcVaultProMode
                            ? bpsToPercent(guardrails.maxSingleTradeBps)
                            : formatBtc(userDepositedBtc)}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-300 mt-0.5 tabular-nums">
                          {btcVaultProMode
                            ? `Max ${formatBtc(maxAllowedSliceBtc)} / tx`
                            : `≈ $${userDepositedUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} • Max ${bpsToPercent(guardrails.maxSingleTradeBps)}/trade`}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          {btcVaultProMode ? "On-Chain Throughput" : "Auto-Runs Completed"}
                        </div>
                        <div className="text-lg font-black text-amber-300 mt-0.5 tabular-nums">
                          {totalSlicesExecuted} Completed
                        </div>
                        <div className="text-[11px] font-semibold text-slate-300 mt-0.5">
                          {rectifiedCount} Auto-Adjusted Safely
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/10 border border-white/10 px-4 py-3">
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                          Vault Safety Status
                        </div>
                        <div
                          className={`text-lg font-black mt-0.5 ${guardrails.emergencyLock ? "text-rose-400" : "text-emerald-300"
                            }`}
                        >
                          {guardrails.emergencyLock ? "Paused (Locked)" : "Active & Protected"}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-300 mt-0.5 truncate">
                          {activeEarnRec.btcLowTriggerActive
                            ? `Dip → ${earnPrimaryVaultLabel} Yield`
                            : `${liveTrendDirection.replace("_", " ")} • BTC $${liveBtcPriceUsd.toLocaleString()}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Main 2-Column Workspace */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left 5 Cols: Unified Deposit/Withdraw + Safety Limits */}
                    <div className="lg:col-span-5 space-y-5">
                      {/* Card 1: Unified Deposit / Withdraw Wallet Card */}
                      <Card className="bg-white/95 border-white shadow-lg overflow-hidden">
                        <CardHeader className="pb-3 bg-gradient-to-r from-[#ecfdf5] via-[#f8fafc] to-[#f5f3ff] border-b border-stone-200/70">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-base font-black flex items-center gap-2 text-[#231f20]">
                              <Wallet className="h-4.5 w-4.5 text-emerald-700" />
                              1 · Your Vault Balance
                            </CardTitle>
                            <Badge
                              variant={guardrails.emergencyLock ? "destructive" : "emerald"}
                            >
                              {guardrails.emergencyLock ? "PAUSED" : "OPEN"}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs">
                            Only your connected wallet can withdraw deposited BTC.
                          </CardDescription>
                        </CardHeader>

                        <CardContent className="pt-4 space-y-3.5">
                          {/* Segmented Deposit | Withdraw Toggle */}
                          <div className="grid grid-cols-2 rounded-xl bg-[#f3ede2] p-1 border border-[#e5dec9]">
                            <button
                              type="button"
                              onClick={() => setBtcVaultTxTab("deposit")}
                              className={`py-2 rounded-lg text-xs font-black transition-all ${btcVaultTxTab === "deposit"
                                ? "bg-white text-[#231f20] shadow-sm"
                                : "text-stone-600 hover:text-[#231f20]"
                                }`}
                            >
                              Deposit BTC
                            </button>
                            <button
                              type="button"
                              onClick={() => setBtcVaultTxTab("withdraw")}
                              className={`py-2 rounded-lg text-xs font-black transition-all ${btcVaultTxTab === "withdraw"
                                ? "bg-white text-[#231f20] shadow-sm"
                                : "text-stone-600 hover:text-[#231f20]"
                                }`}
                            >
                              Withdraw BTC
                            </button>
                          </div>

                          <div className={`grid ${btcVaultProMode ? "grid-cols-2" : "grid-cols-1"} gap-2.5`}>
                            <div className="rounded-xl bg-[#f7f4ed] border border-[#e5dec9] p-3 flex items-center justify-between">
                              <div>
                                <div className="text-[10px] font-extrabold uppercase text-stone-500">
                                  Your Vault Balance
                                </div>
                                <div className="text-sm font-black text-emerald-800 mt-0.5 tabular-nums">
                                  {formatBtc(userDepositedBtc)}
                                </div>
                              </div>
                              <div className="text-xs font-bold text-stone-500 tabular-nums">
                                ≈ ${userDepositedUsd.toFixed(2)}
                              </div>
                            </div>

                            {btcVaultProMode && (
                              <div className="rounded-xl bg-[#f7f4ed] border border-[#e5dec9] p-3">
                                <div className="text-[10px] font-extrabold uppercase text-stone-500">
                                  Operator ({shortenHex(operatorAddress, 4)})
                                </div>
                                <div className="text-sm font-black text-[#231f20] mt-0.5 tabular-nums">
                                  {formatBtc(operatorBalanceBtc)}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Amount Input + Quick Chips */}
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span className="text-[11px] font-extrabold text-stone-600">
                                {btcVaultTxTab === "deposit" ? "Amount to Deposit" : "Amount to Withdraw"}
                              </span>
                              <div className="flex flex-wrap items-center gap-1">
                                {["0.00002", "0.00005", "0.0001"].map((amt) => (
                                  <button
                                    key={amt}
                                    type="button"
                                    onClick={() => setDepositInput(amt)}
                                    className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold border transition-colors ${depositInput === amt
                                      ? "bg-[#242331] text-white border-[#242331]"
                                      : "bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200"
                                      }`}
                                  >
                                    {amt}
                                  </button>
                                ))}
                                {btcVaultTxTab === "withdraw" && userDepositedBtc > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDepositInput(userDepositedBtc.toFixed(6))
                                    }
                                    className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  >
                                    Max
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="relative">
                              <input
                                type="number"
                                step="any"
                                min="0.00000001"
                                value={depositInput}
                                onChange={(e) => setDepositInput(e.target.value)}
                                className="w-full h-11 rounded-xl border border-[#d6cbb9] bg-white px-3.5 pr-16 text-sm font-mono font-black text-[#231f20]"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700">
                                BTC
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-semibold text-stone-500 px-0.5">
                              <span>
                                Estimated Value:{" "}
                                <strong className="text-[#231f20]">
                                  ≈ ${depositUsd.toFixed(2)} USD
                                </strong>
                              </span>
                              <span>Mezo Testnet BTC</span>
                            </div>
                          </div>

                          <Button
                            size="lg"
                            disabled={isTxPending}
                            className={`w-full h-11 rounded-xl font-black text-xs shadow-sm ${btcVaultTxTab === "deposit"
                              ? "bg-[#242331] hover:bg-[#38364a] text-white"
                              : "bg-emerald-700 hover:bg-emerald-800 text-white"
                              }`}
                            onClick={
                              btcVaultTxTab === "deposit"
                                ? handleVaultDeposit
                                : handleVaultWithdraw
                            }
                          >
                            <Wallet className="h-4 w-4 mr-1.5" />
                            {isTxPending
                              ? "Confirming Transaction..."
                              : btcVaultTxTab === "deposit"
                                ? `Deposit ${depositInput || "0"} BTC into Vault`
                                : `Withdraw ${depositInput || "0"} BTC to Wallet`}
                          </Button>

                          {btcVaultProMode && (
                            <div className="pt-1 flex items-center justify-between text-[10.5px] text-stone-500 border-t border-stone-200/80">
                              <span>PolicyVault Contract:</span>
                              <a
                                href={`https://explorer.test.mezo.org/address/${contractAddresses.policyVault}?tab=contract`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono font-bold text-[#7c3aed] underline inline-flex items-center gap-0.5"
                              >
                                {shortenHex(contractAddresses.policyVault, 6)}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Card 2: Plain-Language Safety Limits */}
                      <Card className="bg-white/95 border-white shadow-lg overflow-hidden">
                        <CardHeader className="pb-3 border-b border-stone-200/70">
                          <CardTitle className="text-base font-black flex items-center gap-2 text-[#231f20]">
                            <ShieldCheck className="h-4.5 w-4.5 text-[#7c3aed]" />
                            2 · Comfort &amp; Safety Rules
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Pick how cautiously AI agents can trade for you. Enforced automatically on-chain.
                          </CardDescription>
                        </CardHeader>

                        <CardContent className="pt-4 space-y-3.5 text-xs">
                          {/* 3 Visual Preset Cards */}
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              {
                                label: "Safe",
                                desc: "Small steps",
                                trade: 500,
                                conf: 8000,
                                dd: 300,
                              },
                              {
                                label: "Balanced",
                                desc: "Recommended",
                                trade: 1000,
                                conf: 7000,
                                dd: 500,
                              },
                              {
                                label: "Active",
                                desc: "Larger moves",
                                trade: 1500,
                                conf: 6500,
                                dd: 800,
                              },
                            ].map((p) => {
                              const isActive =
                                guardrails.maxSingleTradeBps === p.trade &&
                                guardrails.minConfidenceBps === p.conf;
                              return (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() =>
                                    setGuardrails((g) => ({
                                      ...g,
                                      maxSingleTradeBps: p.trade,
                                      minConfidenceBps: p.conf,
                                      maxDailyDrawdownBps: p.dd,
                                    }))
                                  }
                                  className={`p-2.5 rounded-xl border text-left transition-all ${isActive
                                    ? "bg-[#7c3aed] text-white border-[#7c3aed] shadow-sm"
                                    : "bg-[#faf7f2] hover:bg-stone-100 text-[#231f20] border-[#e5dec9]"
                                    }`}
                                >
                                  <div className="font-black text-xs">{p.label}</div>
                                  <div
                                    className={`text-[10px] mt-0.5 ${isActive ? "text-violet-100" : "text-stone-500"
                                      }`}
                                  >
                                    {p.desc} ({(p.trade / 100).toFixed(0)}%)
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Current Rule Summary */}
                          <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f7f4ed] border border-[#e5dec9] p-2.5 text-center">
                            <div>
                              <div className="text-[9.5px] font-bold uppercase text-stone-500">
                                Max / Trade
                              </div>
                              <div className="font-black text-[#7c3aed] mt-0.5">
                                {bpsToPercent(guardrails.maxSingleTradeBps)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9.5px] font-bold uppercase text-stone-500">
                                AI Consensus
                              </div>
                              <div className="font-black text-emerald-700 mt-0.5">
                                {bpsToPercent(guardrails.minConfidenceBps)}+
                              </div>
                            </div>
                            <div>
                              <div className="text-[9.5px] font-bold uppercase text-stone-500">
                                Daily Cap
                              </div>
                              <div className="font-black text-amber-700 mt-0.5">
                                {bpsToPercent(guardrails.maxDailyDrawdownBps)}
                              </div>
                            </div>
                          </div>

                          {/* Accordion for Custom Sliders */}
                          <button
                            type="button"
                            onClick={() => setBtcShowRuleSliders((v) => !v)}
                            className="w-full flex items-center justify-between text-[11px] font-bold text-[#6d28d9] hover:underline py-1"
                          >
                            <span>
                              {btcShowRuleSliders || btcVaultProMode
                                ? "Hide Custom Limit Sliders"
                                : "Customize Exact Limit Percentages"}
                            </span>
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${btcShowRuleSliders || btcVaultProMode ? "rotate-180" : ""
                                }`}
                            />
                          </button>

                          {(btcShowRuleSliders || btcVaultProMode) && (
                            <div className="space-y-3 pt-1 pb-1 border-t border-stone-200/70">
                              <div>
                                <div className="flex justify-between font-bold mb-1.5">
                                  <span>
                                    {btcVaultProMode
                                      ? "Max Single Slice (`maxSingleTradeBps`)"
                                      : "Max Amount Per Trade"}
                                  </span>
                                  <span className="text-[#7c3aed] font-black">
                                    {bpsToPercent(guardrails.maxSingleTradeBps)} (
                                    {formatBtc(maxAllowedSliceBtc)})
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
                                <div className="flex justify-between font-bold mb-1.5">
                                  <span>
                                    {btcVaultProMode
                                      ? "Min Council Consensus (`minConfidenceBps`)"
                                      : "Minimum AI Agreement Needed"}
                                  </span>
                                  <span className="text-emerald-700 font-black">
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
                                <div className="flex justify-between font-bold mb-1.5">
                                  <span>
                                    {btcVaultProMode
                                      ? "Max Daily Drawdown (`maxDailyDrawdownBps`)"
                                      : "Max Daily Loss Pause Limit"}
                                  </span>
                                  <span className="text-amber-700 font-black">
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
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-stone-200">
                            <span className="font-bold flex items-center gap-1.5">
                              {guardrails.emergencyLock ? (
                                <Lock className="h-4 w-4 text-red-600" />
                              ) : (
                                <Unlock className="h-4 w-4 text-emerald-600" />
                              )}
                              Emergency Pause Trading
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
                            className="w-full h-10 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-xs font-black shadow-sm"
                          >
                            {isTxPending
                              ? "Saving Limits..."
                              : btcVaultProMode
                                ? "Save Policy Guardrails On-Chain (updatePolicy)"
                                : "Save Safety Rules"}
                          </Button>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Right 7 Cols: Plain-English Auto-Invest Scheduler + Collapsible Activity */}
                    <div className="lg:col-span-7 space-y-5">
                      <Card className="bg-white/95 border-white shadow-lg overflow-hidden">
                        <CardHeader className="pb-3 bg-gradient-to-r from-[#fffbeb] via-[#faf7f2] to-[#f5f3ff] border-b border-stone-200/70">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <CardTitle className="text-lg font-black flex items-center gap-2 text-[#231f20]">
                                <Clock className="h-5 w-5 text-amber-500" />
                                3 · Auto-Invest Schedules
                              </CardTitle>
                              <CardDescription className="text-xs">
                                {btcVaultProMode ? (
                                  <>
                                    Executed on{" "}
                                    <a
                                      href={`https://explorer.test.mezo.org/address/${contractAddresses.dcaEngine}?tab=contract`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-mono font-bold text-[#7c3aed] underline inline-flex items-center gap-0.5"
                                    >
                                      MezoDCAEngine ({shortenHex(contractAddresses.dcaEngine, 5)})
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </a>{" "}
                                    — Bumblebee executes &amp; Ratchet auto-clamps oversized slices.
                                  </>
                                ) : (
                                  "Set a simple recurring plan. If a trade is ever too large for your safety limit, Ratchet automatically scales it down."
                                )}
                              </CardDescription>
                            </div>
                            <Badge className="bg-amber-100 text-amber-900 border border-amber-300 font-black text-[10px]">
                              {dcaSchedules.length} Active Plan{dcaSchedules.length === 1 ? "" : "s"}
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-4 space-y-4">
                          {/* Friendly Goal Builder */}
                          <div className="rounded-2xl bg-[#f7f4ed] p-4 border border-[#e5dec9] space-y-3.5">
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-black text-[#231f20] block">
                                Choose What Your Plan Targets
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {STRATEGY_GOALS.map((goal) => {
                                  const selected = newDcaAsset === goal.id;
                                  return (
                                    <button
                                      key={goal.id}
                                      type="button"
                                      onClick={() => setNewDcaAsset(goal.id)}
                                      className={`rounded-xl border p-2 text-left transition-all ${selected
                                        ? "bg-[#242331] text-white border-[#242331] shadow-sm"
                                        : "bg-white hover:bg-stone-50 text-[#231f20] border-[#dfd6c5]"
                                        }`}
                                    >
                                      <div className="text-[11px] font-black leading-tight">
                                        {goal.friendly}
                                      </div>
                                      <div
                                        className={`text-[9.5px] mt-0.5 leading-tight ${selected ? "text-slate-300" : "text-stone-500"
                                          }`}
                                      >
                                        {btcVaultProMode ? goal.id : goal.hint}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                              {btcVaultProMode && (
                                <div className="sm:col-span-4">
                                  <label className="text-[10px] font-bold text-stone-500 block mb-0.5">
                                    Strategy Target ID
                                  </label>
                                  <input
                                    value={newDcaAsset}
                                    onChange={(e) => setNewDcaAsset(e.target.value)}
                                    className="w-full h-9 rounded-xl border border-[#d6cbb9] bg-white px-2.5 text-xs font-bold"
                                  />
                                </div>
                              )}
                              <div className={btcVaultProMode ? "sm:col-span-3" : "sm:col-span-4"}>
                                <label className="text-[10.5px] font-bold text-stone-600 block mb-0.5">
                                  Amount Each Run (BTC)
                                </label>
                                <input
                                  type="number"
                                  step="any"
                                  value={newDcaSliceBtc}
                                  onChange={(e) => setNewDcaSliceBtc(e.target.value)}
                                  placeholder="0.00002"
                                  className="w-full h-9 rounded-xl border border-[#d6cbb9] bg-white px-2.5 text-xs font-mono font-bold"
                                />
                              </div>
                              <div className={btcVaultProMode ? "sm:col-span-3" : "sm:col-span-4"}>
                                <label className="text-[10.5px] font-bold text-stone-600 block mb-0.5">
                                  How Often
                                </label>
                                <select
                                  value={newDcaInterval}
                                  onChange={(e) => setNewDcaInterval(e.target.value)}
                                  className="w-full h-9 rounded-xl border border-[#d6cbb9] bg-white px-2 text-xs font-bold"
                                >
                                  <option value="Every 1h (TWAP)">Every 1 hour</option>
                                  <option value="Every 4h">Every 4 hours</option>
                                  <option value="Daily Epoch">Once a day</option>
                                </select>
                              </div>
                              <div className={btcVaultProMode ? "sm:col-span-2" : "sm:col-span-4"}>
                                <label className="text-[10.5px] font-bold text-stone-600 block mb-0.5">
                                  Number of Runs
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={newDcaTotalSlices}
                                  onChange={(e) => setNewDcaTotalSlices(e.target.value)}
                                  className="w-full h-9 rounded-xl border border-[#d6cbb9] bg-white px-2.5 text-xs font-mono font-bold"
                                />
                              </div>
                            </div>

                            {/* Plain-English Summary Strip */}
                            <div className="rounded-xl bg-white border border-[#e5dec9] px-3 py-2 text-[11px] text-[#38322d] flex flex-wrap items-center justify-between gap-2">
                              <span>
                                Plan:{" "}
                                <strong>
                                  {draftSliceNum || 0} BTC (≈ ${draftSliceUsd.toFixed(2)})
                                </strong>{" "}
                                {newDcaInterval === "Every 4h"
                                  ? "every 4 hours"
                                  : newDcaInterval === "Daily Epoch"
                                    ? "daily"
                                    : "hourly"}{" "}
                                · <strong>{newDcaTotalSlices || 0} runs</strong> (
                                {activeGoalMeta?.friendly || newDcaAsset})
                              </span>
                              <span className="font-bold text-stone-500">
                                Total ≈ ${totalPlanUsd.toFixed(2)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[11px] font-bold">
                                {vaultTvlBtc > 0 ? (
                                  draftExceedsCap ? (
                                    <span className="text-amber-700 flex items-center gap-1">
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                      Above your {bpsToPercent(guardrails.maxSingleTradeBps)} limit ({(draftSliceBps / 100).toFixed(1)}%) — Ratchet will auto-shrink it safely.
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 flex items-center gap-1">
                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                      Safe ({(draftSliceBps / 100).toFixed(1)}% per run — fits your {bpsToPercent(guardrails.maxSingleTradeBps)} limit)
                                    </span>
                                  )
                                ) : (
                                  <span className="text-stone-500">
                                    Deposit BTC on the left first to fund this plan.
                                  </span>
                                )}
                              </div>
                              <Button
                                onClick={handleCreateDcaSchedule}
                                disabled={isTxPending}
                                className="h-9 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-xs font-black px-4"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                {isTxPending ? "Creating..." : "Start Auto-Invest"}
                              </Button>
                            </div>
                          </div>

                          {/* Active Schedules List */}
                          {dcaSchedules.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-stone-300 bg-[#faf7f2] p-6 text-center text-xs text-stone-600">
                              No active schedules yet. Choose a goal above and click{" "}
                              <strong>Start Auto-Invest</strong>.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {dcaSchedules.map((sched) => {
                                const progressPct = Math.min(
                                  100,
                                  Math.round(
                                    (sched.executedSlices /
                                      Math.max(1, sched.totalSlices)) *
                                    100
                                  )
                                );
                                return (
                                  <div
                                    key={sched.id}
                                    className="rounded-2xl border border-[#e5dec9] bg-[#faf7f2] p-4 text-xs space-y-2.5 shadow-sm"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-[11px] font-black text-stone-500">
                                          #{sched.id}
                                        </span>
                                        <span className="font-black text-sm text-[#231f20]">
                                          {STRATEGY_GOALS.find((g) => g.id === sched.targetAsset)?.friendly || sched.strategyName}
                                        </span>
                                        {btcVaultProMode && (
                                          <span className="rounded-full bg-violet-100 border border-violet-200 px-2 py-0.5 font-mono text-[10px] font-black text-[#6d28d9]">
                                            {sched.targetAsset}
                                          </span>
                                        )}
                                      </div>
                                      <Badge
                                        variant={
                                          sched.status === "RECTIFIED"
                                            ? "emerald"
                                            : "secondary"
                                        }
                                      >
                                        {sched.status === "RECTIFIED"
                                          ? "Auto-Adjusted Safely"
                                          : sched.status}
                                      </Badge>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                      <div className="rounded-xl bg-white border border-[#ebe3d4] px-2.5 py-1.5">
                                        <div className="text-[9.5px] font-bold uppercase text-stone-500">
                                          Each Run
                                        </div>
                                        <div className="font-black text-[#231f20] mt-0.5 tabular-nums">
                                          {formatBtc(sched.sliceAmountBtc)}
                                        </div>
                                      </div>
                                      <div className="rounded-xl bg-white border border-[#ebe3d4] px-2.5 py-1.5">
                                        <div className="text-[9.5px] font-bold uppercase text-stone-500">
                                          Frequency
                                        </div>
                                        <div className="font-black text-[#231f20] mt-0.5">
                                          {sched.intervalLabel}
                                        </div>
                                      </div>
                                      <div className="rounded-xl bg-white border border-[#ebe3d4] px-2.5 py-1.5">
                                        <div className="text-[9.5px] font-bold uppercase text-stone-500">
                                          Invested So Far
                                        </div>
                                        <div className="font-black text-emerald-800 mt-0.5 tabular-nums">
                                          {formatBtc(sched.totalAccumulatedBtc)}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[10.5px] font-bold text-stone-600">
                                        <span>
                                          Progress: {sched.executedSlices} of{" "}
                                          {sched.totalSlices} runs
                                        </span>
                                        <span>{progressPct}%</span>
                                      </div>
                                      <div className="h-2 w-full rounded-full bg-stone-200 overflow-hidden">
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-violet-600 transition-all"
                                          style={{ width: `${progressPct}%` }}
                                        />
                                      </div>
                                    </div>

                                    {sched.lastRectificationNote && (
                                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] text-emerald-900 font-semibold flex items-center gap-1.5">
                                        <Wrench className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                        <span>{sched.lastRectificationNote}</span>
                                      </div>
                                    )}

                                    <div className="flex items-center justify-between gap-2 pt-0.5">
                                      <span className="text-[10.5px] font-bold text-stone-500">
                                        AI agents check market safety before every run.
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-[11px] shrink-0 rounded-lg"
                                        onClick={() => {
                                          setActiveTab("island");
                                          setRightCardCollapsed(false);
                                        }}
                                      >
                                        <Sparkles className="h-3 w-3 mr-1" />
                                        View AI Decision
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Collapsible Recent Vault Activity */}
                      <Card className="bg-white/95 border-white shadow-lg">
                        <CardHeader className="py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setBtcShowProofs((v) => !v)}
                              className="flex items-center gap-2 text-left"
                            >
                              <Activity className="h-4.5 w-4.5 text-emerald-600" />
                              <div>
                                <div className="text-sm font-black text-[#231f20]">
                                  Recent Vault Activity ({executionLedger.length})
                                </div>
                                <div className="text-[11px] text-stone-500 font-medium">
                                  {btcShowProofs || btcVaultProMode
                                    ? "Latest verified trades & safety adjustments"
                                    : "Click to view verified trade & safety history"}
                                </div>
                              </div>
                            </button>
                            <div className="flex items-center gap-2">
                              {btcVaultProMode && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setActiveTab("contracts")}
                                  className="rounded-xl text-xs font-black"
                                >
                                  Full Ledger
                                  <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setBtcShowProofs((v) => !v)}
                                className="rounded-xl text-xs font-bold"
                              >
                                {btcShowProofs || btcVaultProMode ? "Hide" : "Show"}
                                <ChevronDown
                                  className={`h-3.5 w-3.5 ml-1 transition-transform ${btcShowProofs || btcVaultProMode ? "rotate-180" : ""
                                    }`}
                                />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        {(btcShowProofs || btcVaultProMode) && (
                          <CardContent className="pb-4 space-y-2 text-xs border-t border-stone-100 mt-1 pt-3">
                            {executionLedger.length === 0 ? (
                              <div className="rounded-xl bg-[#faf7f2] border border-[#ebe3d4] px-3 py-3 text-stone-500 text-center">
                                No vault trades recorded yet.
                              </div>
                            ) : (
                              executionLedger.slice(0, 4).map((row) => (
                                <div
                                  key={row.id}
                                  className="rounded-xl bg-[#faf7f2] border border-[#e7dfd0] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono font-bold text-stone-500">
                                        #{row.id}
                                      </span>
                                      <strong className="text-[#231f20]">
                                        {row.agentName}
                                      </strong>
                                      <span className="font-mono font-bold text-[#6d28d9]">
                                        {STRATEGY_GOALS.find((g) => g.id === row.targetAsset)?.friendly || row.targetAsset}
                                      </span>
                                      <span className="text-stone-500">
                                        • {formatBtc(row.amountBtc)} ({row.vaultSharePercent}%)
                                      </span>
                                    </div>
                                    {row.rectificationSummary && (
                                      <div className="text-[10.5px] text-emerald-800 font-semibold mt-0.5 truncate max-w-md">
                                        {row.rectificationSummary}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge
                                      variant={
                                        row.wasRectified || row.passedPolicy
                                          ? "emerald"
                                          : "destructive"
                                      }
                                      className="text-[9.5px]"
                                    >
                                      {row.wasRectified
                                        ? "AUTO-ADJUSTED"
                                        : row.passedPolicy
                                          ? "VERIFIED"
                                          : "BLOCKED"}
                                    </Badge>
                                    {btcVaultProMode && (
                                      <span className="font-mono text-[10.5px] text-stone-500">
                                        {shortenHex(row.proofHash, 5)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </CardContent>
                        )}
                      </Card>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* =====================================================================
          5. VIEW 4: MEZO 31611 SMART CONTRACTS, AUDIT LEDGER & /MCP
         ===================================================================== */}
      {activeTab === "contracts" && (
        <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Group 1: Main Island Core Contracts (Editable + Explorer) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  key: "agentRegistry" as const,
                  title: "AgentRegistry.sol (ERC-8004)",
                  desc: "Registers Optimus Prime, Bumblebee, Ratchet, Ironhide & Soundwave + Council debate proofs.",
                },
                {
                  key: "policyVault" as const,
                  title: "PolicyVault.sol (BTC Guardrails)",
                  desc: "Enforces maxSingleTradeBps, maxDailyDrawdownBps & minConfidenceBps before BTC deployment.",
                },
                {
                  key: "dcaEngine" as const,
                  title: "MezoDCAEngine.sol (Vault + Rectifier)",
                  desc: "Executes scheduled BTC Vault allocations & Ratchet's on-chain self-healing rectifications.",
                },
              ].map((c) => (
                <Card key={c.key} className="bg-white/95 border-white shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black flex items-center justify-between gap-2">
                      <span className="truncate">{c.title}</span>
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

            {/* Group 2: Sub-Island Archipelago, MUSD Credit Council & Canonical Mezo Primitives */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="lg:col-span-7 bg-white/95 border-white shadow-md">
                <CardHeader className="pb-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge className="bg-[#7c3aed] text-white text-[10px] font-black uppercase">
                      11/11 Blockscout-Verified Contracts
                    </Badge>
                    <span className="text-[11px] font-bold text-stone-500">
                      Chain ID 31611 • Archipelago &amp; Credit Layer
                    </span>
                  </div>
                  <CardTitle className="text-base font-black pt-1">
                    Sub-Island Factory, MUSD LP Vault &amp; Credit Council
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    {
                      id: "mainMusdVault",
                      label: "MainMUSDVault.sol",
                      role: "MUSD LP pool w/ O(1) accrual & 25% reserve floor",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault,
                    },
                    {
                      id: "mainMezoVault",
                      label: "MainMEZOVault.sol",
                      role: "MEZO lock-tier coordination vault & MUSD fee-share yield",
                      addr: MAIN_MEZO_VAULT_ADDRESS,
                    },
                    {
                      id: "mezoGovernor",
                      label: "MezoCityGovernor.sol",
                      role: "MEZO-weighted island governance, timelock & island endorsements",
                      addr: MEZO_GOVERNOR_ADDRESS,
                    },
                    {
                      id: "mezoFeeSplitter",
                      label: "MezoCityFeeSplitter.sol",
                      role: "Routes credit, swap, clone, guard & SaaS MUSD fees across stakers/POL/insurance",
                      addr: MEZO_FEE_SPLITTER_ADDRESS,
                    },
                    {
                      id: "islandFactory",
                      label: "IslandFactory.sol (CREATE2)",
                      role: "Deploys EIP-1167 Sub-Island vaults",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.islandFactory,
                    },
                    {
                      id: "islandVaultImpl",
                      label: "IslandVault.sol (Impl)",
                      role: "Anti-spoof tracked BTC/MUSD & ProfitCheckpoint",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.islandVaultImpl,
                    },
                    {
                      id: "islandCreditCouncil",
                      label: "IslandCreditCouncil.sol",
                      role: "5-AI + deterministic MUSD underwriting router",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil,
                    },
                    {
                      id: "mezoSwapPool",
                      label: "MezoTestnetSwapPool.sol",
                      role: "PriceFeed-calibrated BTC <-> MUSD Sub-Island swaps",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.mezoSwapPool,
                    },
                  ].map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl bg-[#faf7f2] border border-[#e7dfd0] p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-[#231f20] truncate">
                          {item.label}
                        </span>
                        {item.addr && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => copyText(item.id, item.addr)}
                              className="p-1 rounded hover:bg-stone-200/70 text-stone-600"
                              title="Copy contract address"
                            >
                              {copiedKey === item.id ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            <a
                              href={`https://explorer.test.mezo.org/address/${item.addr}?tab=contract`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10.5px] font-bold text-[#7c3aed] hover:underline inline-flex items-center gap-0.5"
                            >
                              Explorer
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="text-[10.5px] text-stone-600">
                        {item.role}
                      </div>
                      <div className="font-mono text-[10.5px] text-stone-500 truncate">
                        {item.addr || "Configured via NEXT_PUBLIC_* env"}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="lg:col-span-5 bg-white/95 border-white shadow-md">
                <CardHeader className="pb-2.5">
                  <Badge className="w-fit bg-amber-500 text-white text-[10px] font-black uppercase">
                    Canonical Mezo L2 Primitives
                  </Badge>
                  <CardTitle className="text-base font-black pt-1">
                    MUSD, MEZO, veBTC, Trove &amp; Earn Integrations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  {[
                    { label: "MUSD Stablecoin", addr: MEZO_TESTNET_LENDING_ADDRESSES.musdToken },
                    { label: "MEZO Coordination Token", addr: MEZO_TESTNET_LENDING_ADDRESSES.mezoToken },
                    { label: "veBTC Governance", addr: MEZO_TESTNET_LENDING_ADDRESSES.veBtc },
                    { label: "BorrowerOperations (Trove)", addr: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations },
                    { label: "TroveManager (110% MCR)", addr: MEZO_TESTNET_LENDING_ADDRESSES.troveManager },
                    { label: "BorrowerOperationsSignatures (EIP-712)", addr: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperationsSignatures },
                    { label: "sMUSD Savings Vault", addr: MEZO_EARN_ADDRESSES.sMusdVault },
                    { label: "upMUSD Vault", addr: MEZO_EARN_ADDRESSES.upMusdVault },
                    { label: "Mezo Stability Pool", addr: MEZO_EARN_ADDRESSES.stabilityPool },
                    { label: "Tigris DEX Router", addr: MEZO_EARN_ADDRESSES.tigrisRouter },
                    { label: "Mezo PriceFeed Oracle", addr: MEZO_TESTNET_LENDING_ADDRESSES.priceFeed },
                  ].map((prim) => (
                    <div
                      key={prim.label}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[#f8f5f0] border border-[#e7dfd0] px-2.5 py-1.5"
                    >
                      <span className="font-bold text-[#231f20] truncate">
                        {prim.label}
                      </span>
                      <a
                        href={`https://explorer.test.mezo.org/address/${prim.addr}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[10.5px] font-bold text-[#7c3aed] hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        {shortenHex(prim.addr, 5)}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Live Audit Ledger & Interactive MCP / A2A Console */}
            <Card className="bg-white/95 border-white shadow-md">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-black">
                      Live On-Chain Execution &amp; MCP / A2A Inspector
                      (`PolicyVault.getRecentExecutions`)
                    </CardTitle>
                    <CardDescription>
                      Read directly from Mezo Testnet (Chain ID 31611, Block #
                      {rpcBlockNumber}) via viem &amp; JSON-RPC 2.0 `/api/mcp`.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
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
                    {(
                      [
                        { tool: "get_ecosystem_telemetry", label: "MCP: Ecosystem" },
                        { tool: "get_mezo_earn_opportunities", label: "MCP: Earn & Pools" },
                        { tool: "get_sub_island_leaderboard", label: "MCP: Sub-Islands" },
                        { tool: "check_policy_vault", label: "MCP: Policy Check" },
                      ] as const
                    ).map((m) => (
                      <Button
                        key={m.tool}
                        variant="secondary"
                        size="sm"
                        onClick={() => invokeMcpEndpoint(m.tool)}
                        disabled={isMcpLoading}
                      >
                        <RefreshCw
                          className={`h-3 w-3 mr-1 ${isMcpLoading ? "animate-spin" : ""}`}
                        />
                        {m.label}
                      </Button>
                    ))}
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
        <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto">
            <MainMusdVaultPanel
              onSelectIsland={(id) => {
                setSelectedIslandId(id);
                setActiveTab("island");
              }}
              onOpenMezoVault={() => setActiveTab("mezo-vault")}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          5A-1B. VIEW 4A-1B: MAIN ISLAND MEZO COORDINATION & YIELD VAULT
         ===================================================================== */}
      {activeTab === "mezo-vault" && (
        <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto">
            <MainMezoVaultPanel
              onOpenMusdEarn={() => setActiveTab("musd-vault")}
              onOpenLendingGuard={() => setActiveTab("lending")}
              onOpenLeaderboard={() => setActiveTab("leaderboard")}
              onOpenGovernance={() => setActiveTab("governance")}
            />
          </div>
        </div>
      )}

      {activeTab === "governance" && (
        <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto">
            <GovernanceTreasuryPanel
              onOpenMezoVault={() => setActiveTab("mezo-vault")}
              onOpenMusdEarn={() => setActiveTab("musd-vault")}
              onOpenLeaderboard={() => setActiveTab("leaderboard")}
              onEnterIsland={(islandId) => {
                setSelectedSatelliteIslandId(null);
                setSelectedIslandId(islandId);
                setActiveTab("island");
              }}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          5A-2. VIEW 4A-2: SUB-ISLAND YIELD LEADERBOARD & 1-CLICK CLONING
         ===================================================================== */}
      {activeTab === "leaderboard" && (
        <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto">
            <SubIslandLeaderboardPanel
              onEnterIsland={(islandId) => {
                setSelectedSatelliteIslandId(null);
                setSelectedIslandId(islandId);
                setActiveTab("island");
              }}
              onCloneTemplate={(tpl) => {
                setCloneTemplateDraft(tpl);
                setCreateIslandModalOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          5B. VIEW 4B: LENDING AGENT — MEZO GUARD (MEZO TESTNET 31611)
         ===================================================================== */}
      {activeTab === "lending" && (
        <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto">
            <MezoLendingGuardPanel
              onRecoverWithdrawClick={() => setActiveTab("dca")}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          6. VIEW 5: ARCHITECTURE DOCS & JUDGE VERIFICATION HUB
         ===================================================================== */}
      {activeTab === "docs" && (
        <ProtocolDocsPanel
          contractAddresses={contractAddresses}
          protocolHealthChecks={protocolHealthChecks}
          isCheckingHealth={isCheckingHealth}
          onRunHealthCheck={runProtocolHealthCheck}
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      )}

      <CreateIslandModal
        open={createIslandModalOpen}
        templateDraft={cloneTemplateDraft}
        onClose={() => {
          setCreateIslandModalOpen(false);
          setCloneTemplateDraft(null);
        }}
        onCreated={(island) => {
          setCustomIslands((prev) => [island, ...prev]);
          setSelectedIslandId(island.islandId);
          setActiveTab("island");
          fetchSubIslandDetails(island.islandId);
          void fetchCustomIslands();
          const clonedFrom = cloneTemplateDraft?.sourceName;
          setCloneTemplateDraft(null);
          showNotice(
            "success",
            clonedFrom
              ? `Sub-Island "${island.name}" Cloned & Seeded`
              : `Sub-Island "${island.name}" Deployed`,
            clonedFrom
              ? `Blueprint "${clonedFrom}" (vaults & autonomous agents) has been provisioned on your new Sub-Island!`
              : "Your empty Sub-Island is live! Design agents on the 3D Workshop Pedestal and build vaults."
          );
        }}
      />

      <CouncilCommunicationModal
        open={councilModalOpen}
        onClose={() => setCouncilModalOpen(false)}
        messages={reasoningFeed}
        isAiRunning={isAiRunning}
        inngestPaused={inngestPaused}
        headline={displayCycleHeadline}
        decisionReason={latestDecisionReason}
        decisionType={latestModelDecision}
        lastTxHash={lastTxHash}
        cycleActions={latestCycleActions}
        agentFilter={councilModalAgentFilter}
        onAgentFilterChange={setCouncilModalAgentFilter}
        onRunCycleNow={() =>
          runLiveAiCycle("NORMAL_DCA", undefined, "MANUAL_UI")
        }
      />
    </div>
  );
}
