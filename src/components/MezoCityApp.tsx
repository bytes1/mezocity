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
} from "lucide-react";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  parseEther,
} from "viem";
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
  NewsItemHeadline,
  PolicyGuardrails,
} from "@/lib/simulation-data";
import {
  DCA_ENGINE_ABI,
  DEFAULT_CONTRACT_ADDRESSES,
  MEZO_TESTNET_PARAMS,
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

const ClayIslandScene = dynamic(
  () =>
    import("@/components/island/ClayIslandScene").then(
      (mod) => mod.ClayIslandScene
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff] text-[#231f20]">
        <div className="h-12 w-12 rounded-full bg-[#8b5cf6] animate-bounce flex items-center justify-center text-white font-black shadow-lg mb-3">
          4α
        </div>
        <p className="text-sm font-bold tracking-tight">
          Loading Mezo Town Clay Island (Chain ID: 31611)...
        </p>
      </div>
    ),
  }
);

export function MezoCityApp() {
  // Active Top Navigation View
  const [activeTab, setActiveTab] = useState<
    "island" | "crew" | "dca" | "contracts" | "docs"
  >("island");

  // 4 Real AI Agents State (Aura, Kronos, Patch, Sentinel) synced from AgentRegistry.sol
  const [agents, setAgents] = useState<ClayAgent[]>(INITIAL_AGENTS);
  const [currentPhase, setCurrentPhase] =
    useState<CyclePhase>("HEAD_PLANNING");
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(1);
  const [selectedStationId, setSelectedStationId] =
    useState<string | null>("head_citadel");
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
    "Syncing live 5-Agent Indian Mythology Crew & PolicyVault.sol on Mezo Testnet (31611)..."
  );
  const [latestModelDecision, setLatestModelDecision] = useState<
    "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD"
  >("HOLD");
  const [latestDecisionReason, setLatestDecisionReason] = useState<string>(
    "Indra & the Deva Council autonomously evaluate Narada's live news and PolicyVault guardrails each cycle to decide: EXECUTE, RECTIFY, or HOLD."
  );
  const [chatTargetAgent, setChatTargetAgent] = useState<
    "Council" | "Indra" | "Narada" | "Kubera" | "Dhanvantari" | "Sudarshana"
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

  // Google Gemini Base Model & Neon Serverless Postgres Cloud DB Configuration
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [neonDatabaseUrl, setNeonDatabaseUrl] = useState<string>("");
  const [neonConnected, setNeonConnected] = useState<boolean>(false);
  const [geminiConfiguredOnServer, setGeminiConfiguredOnServer] =
    useState<boolean>(false);

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

  // Wallet & Mezo Testnet RPC State
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [hasMetaMaskConnected, setHasMetaMaskConnected] =
    useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
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

          if (data.geminiConfigured !== undefined) {
            setGeminiConfiguredOnServer(Boolean(data.geminiConfigured));
          }

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
              if (latestNeonCycle.txHash) {
                setLastTxHash(latestNeonCycle.txHash);
              }
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

  // Move the 5 Indian Mythology agents on the 3D Island based on active phase
  const moveAgentsForCycle = useCallback(
    (mode: "NORMAL_DCA" | "ERROR_RECTIFY") => {
      // Step 1: Narada captures live crypto/macro news at Lighthouse Observatory & reports to Indra
      setCurrentPhase("NEWS_SCANNING");
      setAgents((prev) =>
        prev.map((a) => ({
          ...a,
          currentStationId:
            a.name === "Narada" || a.name === "Indra"
              ? "lighthouse_beacon"
              : a.homeStationId,
        }))
      );

      // Step 2: Indra orchestrates at the Mezo Command Citadel
      setTimeout(() => {
        setCurrentPhase("HEAD_PLANNING");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId:
              a.name === "Indra" || a.name === "Narada"
                ? "head_citadel"
                : a.homeStationId,
          }))
        );
      }, 800);

      // Step 3: Kubera sizes BTC DCA slice at the Golden Piggy Vault
      setTimeout(() => {
        setCurrentPhase("DCA_SCHEDULING");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId:
              a.name === "Indra" || a.name === "Kubera"
                ? "dca_piggy"
                : a.homeStationId,
          }))
        );
      }, 1700);

      if (mode === "ERROR_RECTIFY") {
        // Step 4: Dhanvantari heals the PolicyVault violation at the Rectifier Lab
        setTimeout(() => {
          setCurrentPhase("ERROR_RECTIFYING");
          setVaultAlertState("BLOCKED");
          setAgents((prev) =>
            prev.map((a) => ({
              ...a,
              currentStationId:
                a.name === "Dhanvantari" ||
                a.name === "Kubera" ||
                a.name === "Indra"
                  ? "rectifier_lab"
                  : a.homeStationId,
            }))
          );
        }, 2600);
      }

      // Step 5: Sudarshana verifies guardrails at Policy Fortress
      setTimeout(() => {
        setCurrentPhase("POLICY_AUDIT");
        setVaultAlertState(mode === "ERROR_RECTIFY" ? "RECTIFIED" : "PASSED");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId:
              a.name === "Sudarshana" || a.name === "Dhanvantari"
                ? "policy_fortress"
                : a.homeStationId,
          }))
        );
      }, 3600);

      setTimeout(() => {
        setCurrentPhase("ONCHAIN_SETTLEMENT");
        setVaultAlertState("NORMAL");
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            currentStationId: a.homeStationId,
          }))
        );
      }, 5200);
    },
    []
  );

  // Trigger Autonomous 5-Agent Indian Mythology Gemini Decision Cycle OR Agent Chat
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
      setIsAiRunning(true);
      setActionsMenuOpen(false);
      moveAgentsForCycle(mode);

      const activeSched = dcaSchedules[0];
      setHeadlineSpeech(
        messageText
          ? `💬 @${chatTargetAgent} & Deva Council analyzing your message & deciding action...`
          : "🤖 Narada, Indra, Kubera, Dhanvantari & Sudarshana deliberating autonomous decision..."
      );

      try {
        const res = await fetch("/api/ai-agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario:
              mode === "ERROR_RECTIFY" ? "INTENTIONAL_OVERFLOW" : "NORMAL_DCA",
            scheduleId: activeSched !== undefined ? activeSched.id : 0,
            triggerSource: messageText ? "USER_CHAT" : triggerSource,
            userChatMessage: messageText || undefined,
            targetAgent: chatTargetAgent,
            geminiApiKey: geminiApiKey || undefined,
            databaseUrl: neonDatabaseUrl || undefined,
            emitInngestEvent: true,
          }),
        });

        const data = await res.json();
        if (!data.ok) {
          throw new Error(data.error || "Autonomous agent cycle failed");
        }

        if (data.liveState) {
          applyOnChainState(data.liveState as LiveOnChainState);
        }

        if (data.neonPersisted !== undefined) {
          setNeonConnected(Boolean(data.neonPersisted));
        }

        if (data.decision) {
          setLatestModelDecision(data.decision);
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
            Narada: "NEWS",
            Indra: "HEAD",
            Kubera: "DCA",
            Dhanvantari: "RECTIFIER",
            Sudarshana: "GUARDRAIL",
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
                t.agentName === "Narada"
                  ? "pink"
                  : t.agentName === "Indra" || t.agentName === "You"
                  ? "purple"
                  : t.agentName === "Kubera"
                  ? "amber"
                  : t.agentName === "Dhanvantari"
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
            `⏸️ Council Verdict: HOLD — Preserved PolicyVault BTC (Zero gas spent on Mezo 31611)`
          );
          showNotice(
            "info",
            "Autonomous Verdict: HOLD (No Transaction Broadcast)",
            data.decisionReason ||
              "Indra & Kubera decided not to execute a trade this cycle, preserving PolicyVault BTC."
          );
        } else if (data.wasRectified || data.decision === "RECTIFY_AND_EXECUTE") {
          setLatestCycleHeadline(
            `Model Decision: RECTIFY & EXECUTE • Healed ${initBtcStr} → ${finalBtcStr} BTC by Dhanvantari AI`
          );
          setLatestActionBadge({
            text: `Healed On-Chain: ${initBtcStr} → ${finalBtcStr} BTC`,
            edge: `Dhanvantari Clamped (<=Cap)`,
            amount: `${finalBtcStr} BTC`,
            wasRectified: true,
          });
          setHeadlineSpeech(
            `✅ Dhanvantari AI rectified ${
              data.violationReason || "MAX_SINGLE_TRADE_EXCEEDED"
            } on Mezo 31611 (Tx: ${shortenHex(primaryTx || "", 4)})`
          );
          showNotice(
            "success",
            "Autonomous Verdict: RECTIFY & EXECUTE (Mezo 31611)",
            `PolicyVault intercepted ${initBtcStr} BTC, then Dhanvantari executed rectified ${finalBtcStr} BTC slice on-chain!`,
            primaryTx
          );
        } else {
          setLatestCycleHeadline(
            `Model Decision: EXECUTE DCA • Kubera Mined ${finalBtcStr} BTC Slice on Mezo 31611`
          );
          setLatestActionBadge({
            text: `Executed ${finalBtcStr} BTC Slice`,
            edge: `Sudarshana Verified`,
            amount: `${finalBtcStr} BTC`,
            wasRectified: false,
          });
          setHeadlineSpeech(
            `✅ Mined ${finalBtcStr} BTC DCA slice on Mezo 31611 (Tx: ${shortenHex(
              primaryTx || "",
              4
            )})`
          );
          showNotice(
            "success",
            `Autonomous Verdict: EXECUTE DCA (${finalBtcStr} BTC)`,
            `5 Indian Mythology Agents settled on Mezo Testnet (31611).`,
            primaryTx
          );
        }

        setCustomDirective("");
      } catch (e) {
        showNotice(
          "error",
          "Mezo Testnet Execution Error",
          e instanceof Error ? e.message : "Failed to execute cycle"
        );
      } finally {
        setIsAiRunning(false);
      }
    },
    [
      guardrails.emergencyLock,
      dcaSchedules,
      customDirective,
      chatTargetAgent,
      liveBtcPriceUsd,
      geminiApiKey,
      neonDatabaseUrl,
      moveAgentsForCycle,
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

  // Connect & Switch to Mezo Testnet (Chain ID: 31611 / 0x7b7b)
  const connectMezoWallet = async () => {
    setIsConnecting(true);
    try {
      const eth = (
        window as unknown as {
          ethereum?: {
            request: (args: {
              method: string;
              params?: unknown[];
            }) => Promise<unknown>;
          };
        }
      ).ethereum;

      if (!eth) {
        setWalletAddress(operatorAddress);
        setHasMetaMaskConnected(false);
        showNotice(
          "info",
          "Connected to On-Chain Operator Wallet (Mezo 31611)",
          `Using deployed operator ${shortenHex(
            operatorAddress,
            6
          )} on Mezo Testnet.`
        );
        setIsConnecting(false);
        return;
      }

      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as string[];

      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: MEZO_TESTNET_PARAMS.chainId }],
        });
      } catch (switchErr: unknown) {
        const errObj = switchErr as { code?: number };
        if (errObj?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [MEZO_TESTNET_PARAMS],
          });
        }
      }

      const connectedAddr = accounts[0] || operatorAddress;
      setWalletAddress(connectedAddr);
      setHasMetaMaskConnected(Boolean(accounts[0]));
      showNotice(
        "success",
        "Connected to Mezo Testnet (Chain ID: 31611)",
        `Active wallet ${shortenHex(connectedAddr, 6)}`
      );
      setTimeout(() => refreshOnChainState(true), 400);
    } catch (err) {
      showNotice(
        "error",
        "Wallet Connection Error",
        err instanceof Error ? err.message : "Could not connect wallet"
      );
    } finally {
      setIsConnecting(false);
    }
  };

  // Real On-Chain Deposit into PolicyVault.sol (0xb3A7ab7be5116737b05B7682aCaC62e7D54B1477)
  const handleVaultDeposit = async () => {
    const amount = parseFloat(depositInput);
    if (isNaN(amount) || amount <= 0) return;

    setIsTxPending(true);
    try {
      const eth = (window as unknown as { ethereum?: unknown }).ethereum;
      if (eth && hasMetaMaskConnected && walletAddress && userWalletBalanceBtc >= amount) {
        const publicClient = createPublicClient({
          chain: mezoTestnet,
          transport: http("https://rpc.test.mezo.org"),
        });
        const walletClient = createWalletClient({
          chain: mezoTestnet,
          transport: custom(eth as Parameters<typeof custom>[0]),
        });
        const hash = await walletClient.writeContract({
          address: contractAddresses.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "deposit",
          account: walletAddress as `0x${string}`,
          value: parseEther(amount.toFixed(18)),
          gas: 300000n,
        });
        await publicClient.waitForTransactionReceipt({ hash });
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
      const eth = (window as unknown as { ethereum?: unknown }).ethereum;
      if (eth && hasMetaMaskConnected && walletAddress && userDepositedBtc >= amount) {
        const publicClient = createPublicClient({
          chain: mezoTestnet,
          transport: http("https://rpc.test.mezo.org"),
        });
        const walletClient = createWalletClient({
          chain: mezoTestnet,
          transport: custom(eth as Parameters<typeof custom>[0]),
        });
        const hash = await walletClient.writeContract({
          address: contractAddresses.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "withdraw",
          account: walletAddress as `0x${string}`,
          args: [parseEther(amount.toFixed(18))],
          gas: 300000n,
        });
        await publicClient.waitForTransactionReceipt({ hash });
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
      const eth = (window as unknown as { ethereum?: unknown }).ethereum;
      if (eth && hasMetaMaskConnected && walletAddress && userWalletBalanceBtc > 0.00001) {
        const publicClient = createPublicClient({
          chain: mezoTestnet,
          transport: http("https://rpc.test.mezo.org"),
        });
        const walletClient = createWalletClient({
          chain: mezoTestnet,
          transport: custom(eth as Parameters<typeof custom>[0]),
        });
        const hash = await walletClient.writeContract({
          address: contractAddresses.dcaEngine,
          abi: DCA_ENGINE_ABI,
          functionName: "createDCASchedule",
          account: walletAddress as `0x${string}`,
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
        await publicClient.waitForTransactionReceipt({ hash });
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
                  <strong className="font-black">Mezo</strong>{" "}
                  <span className="font-normal text-[#524c48]">Town</span>
                </span>
              </button>

              {[
                { id: "island" as const, label: "Island" },
                { id: "crew" as const, label: "Crew (5 AI)" },
                { id: "dca" as const, label: "DCA & Vault" },
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
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                    activeTab === nav.id
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

            {/* Yellow Live Chain Pill */}
            <button
              onClick={connectMezoWallet}
              disabled={isConnecting}
              className="flex items-center gap-2 rounded-full bg-[#fde896] hover:bg-[#fce078] px-3.5 py-2 text-xs font-extrabold text-[#5c4308] shadow-[0_8px_20px_rgba(35,31,32,0.08)] border border-[#fef4c9] transition-all"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
              <span>
                {walletAddress
                  ? `Mezo 31611 • ${shortenHex(walletAddress, 4)}`
                  : `Live Operator • ${shortenHex(operatorAddress, 4)}`}
              </span>
            </button>

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
                        Narada news + 24h trends drive autonomous decisions
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

          {/* 4 Pastel KPI Cards on Top-Left */}
          {activeTab === "island" && (
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
                  {latestModelDecision === "HOLD"
                    ? "Capital preserved (No Tx)"
                    : `${rectifiedCount} auto-rectified fixes`}
                </div>
              </div>

              {/* Card 3: Soft Butter-Yellow Indian Mythology Gemini AI Crew Card */}
              <div
                onClick={() => setActiveTab("crew")}
                className="cursor-pointer rounded-2xl bg-[#fdeaa6]/95 border-2 border-white/90 px-4 py-2.5 shadow-[0_10px_25px_rgba(35,31,32,0.08)] min-w-[165px] hover:scale-[1.02] transition-transform"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#6e5111]">
                  MYTHIC AI CREW
                </div>
                <div className="text-lg font-black text-[#231f20] leading-tight mt-0.5">
                  5 Devas{" "}
                  <span className="text-xs font-bold text-[#785a16]">
                    / Gemini 2.5
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-[#6e5111] mt-0.5">
                  {neonConnected ? "Neon Cloud DB Live" : "Inngest 1h Cron Armed"}
                </div>
              </div>

              {/* Card 4: Soft Rose-Pink Narada Live News & BTC Feed Card */}
              <div
                onClick={() => {
                  setSelectedAgentId(5);
                  setChatTargetAgent("Narada");
                }}
                className="cursor-pointer rounded-2xl bg-[#fbd5e5]/95 border-2 border-white/90 px-4 py-2.5 shadow-[0_10px_25px_rgba(35,31,32,0.08)] min-w-[165px] hover:scale-[1.02] transition-transform"
              >
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#831843]">
                  NARADA NEWS SAGE
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
        <div className="z-50 fixed bottom-5 left-5 max-w-md w-full pointer-events-auto">
          <div
            className={`rounded-2xl border-2 px-4 py-3 shadow-2xl flex items-start justify-between gap-3 ${
              toastBanner.type === "error"
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
         ===================================================================== */}
      {activeTab === "island" && (
        <div className="relative w-full h-full">
          {/* Center 3D Clay Island Scene */}
          <div className="absolute inset-0 z-0">
            <ClayIslandScene
              agents={agents}
              currentPhase={currentPhase}
              selectedAgentId={selectedAgentId}
              onSelectAgent={(id) => {
                setSelectedAgentId(id);
                const found = agents.find((a) => a.id === id);
                if (found) setChatTargetAgent(found.name);
              }}
              selectedStationId={selectedStationId}
              onSelectStation={(id) => setSelectedStationId(id)}
              vaultAlertState={vaultAlertState}
              headlineSpeech={headlineSpeech}
              dcaCountdown={formatCountdown(secondsLeft)}
            />
          </div>

          {/* RIGHT FLOATING TALL CARD */}
          <aside className="z-30 absolute top-4 right-4 bottom-4 w-[410px] max-w-[92vw] flex flex-col pointer-events-none">
            <div className="pointer-events-auto flex flex-col max-h-full rounded-[28px] bg-[#faf7f2]/96 border-[3px] border-white shadow-[0_20px_50px_rgba(35,31,32,0.16)] p-4 overflow-hidden backdrop-blur-md">
              {/* Card Top Pill Header */}
              <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#242331] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isAiRunning || isChainSyncing
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
                      className={`h-3.5 w-3.5 ${
                        isChainSyncing ? "animate-spin" : ""
                      }`}
                    />
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
                  {/* HIGHLIGHTED AUTONOMOUS MODEL DECISION BANNER */}
                  <div
                    className={`rounded-2xl border-2 p-2.5 mb-2.5 shrink-0 transition-all ${
                      latestModelDecision === "HOLD"
                        ? "bg-amber-50/95 border-amber-300 text-amber-950"
                        : latestModelDecision === "RECTIFY_AND_EXECUTE"
                        ? "bg-emerald-50/95 border-emerald-400 text-emerald-950"
                        : "bg-purple-50/95 border-[#8b5cf6] text-[#1f1c1a]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          latestModelDecision === "HOLD"
                            ? "bg-amber-400 text-amber-950"
                            : latestModelDecision === "RECTIFY_AND_EXECUTE"
                            ? "bg-emerald-600 text-white"
                            : "bg-[#8b5cf6] text-white"
                        }`}
                      >
                        {latestModelDecision === "HOLD"
                          ? "⏸️ MODEL DECISION: HOLD (NO TX)"
                          : latestModelDecision === "RECTIFY_AND_EXECUTE"
                          ? "🩺 MODEL DECISION: AUTO-RECTIFY & EXECUTE"
                          : "🟢 MODEL DECISION: EXECUTE DCA SLICE"}
                      </span>

                      {latestModelDecision !== "HOLD" && lastTxHash ? (
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
                  </div>

                  {/* Inngest 1-Hour Cron + One-Shot 2-Minute Judge Trigger & Neon Cloud DB Status Bar */}
                  <div className="rounded-2xl bg-[#f3ede2] border border-[#e6dec8] px-3 py-2 mb-2 shrink-0 flex items-center justify-between gap-2">
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
                        className={`rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase transition-colors ${
                          cronIntervalMode === "2m"
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
                        className={`rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase ${
                          neonConnected
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                            : "bg-purple-100 text-purple-900 border border-purple-200"
                        }`}
                        title="Neon Serverless Postgres Status"
                      >
                        {neonConnected ? "Neon DB Live" : "Syncing DB..."}
                      </button>
                    </div>
                  </div>

                  {/* Scrollable 5-Agent Indian Mythology Autonomous Deliberation Stream */}
                  <div className="flex-1 min-h-[155px] rounded-2xl bg-[#f3ede2] border border-[#e6dec8] p-3 overflow-y-auto space-y-2.5 mb-2">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-[#6e655d] pb-1 border-b border-[#e5dec9]">
                      <span>🤖 Agent-to-Agent Council Chat</span>
                      <span>5 Devas • Zero Human Influence</span>
                    </div>
                    {reasoningFeed.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center py-6 px-2 text-xs text-stone-600">
                        <p className="font-bold text-[#231f20] mb-1">
                          {isAiRunning
                            ? "Narada, Indra, Kubera, Dhanvantari & Sudarshana are deliberating live market trends..."
                            : "Waiting for next autonomous Inngest cycle (or switch to 2m Judge Trigger above)."}
                        </p>
                        <p className="text-[11px] text-stone-500">
                          The 5 agents autonomously analyze live Bitcoin trends, Fear & Greed, and news headlines below to decide: <strong>HOLD</strong>, <strong>EXECUTE DCA</strong>, or <strong>RECTIFY</strong>.
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
                                      item.speaker === "Indra"
                                        ? "#8b5cf6"
                                        : item.speaker === "Kubera"
                                        ? "#f59e0b"
                                        : item.speaker === "Dhanvantari"
                                        ? "#10b981"
                                        : item.speaker === "Narada"
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

                  {/* NARADA (#05) LIVE NEWS TRENDS, FEAR & GREED & MARKET SIGNALS PANEL */}
                  <div className="rounded-2xl bg-white/95 border border-[#ded6c6] p-3 shrink-0 space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#be185d]">
                        <span className="h-2 w-2 rounded-full bg-[#ec4899] animate-ping" />
                        <span>NARADA (#05) LIVE NEWS & MARKET TRENDS</span>
                      </div>
                      <span className="text-[10.5px] font-black text-[#231f20]">
                        {liveBtcPriceUsd > 0
                          ? `$${liveBtcPriceUsd.toLocaleString()} (${
                              liveBtcChange24h >= 0 ? "+" : ""
                            }${liveBtcChange24h}%)`
                          : "Syncing..."}
                      </span>
                    </div>

                    {/* 3 Live Market Trend Badges: Trend Direction, Fear & Greed, Volatility */}
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div
                        className={`rounded-xl px-2 py-1 border text-[10px] font-extrabold ${
                          liveTrendDirection === "UPTREND"
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
                              • {n.title}{" "}
                              <span className="text-[9px] text-stone-400 font-normal">
                                ({n.source})
                              </span>
                            </span>
                            <span
                              className={`shrink-0 rounded px-1 py-0.2 text-[8.5px] font-black uppercase ${
                                n.sentiment === "BULLISH"
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
          3. VIEW 2: THE 5 INDIAN MYTHOLOGY AI AGENTS, GEMINI 2.5 & NEON CLOUD DB
         ===================================================================== */}
      {activeTab === "crew" && (
        <div className="h-full overflow-y-auto pt-24 pb-12 px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
          <div className="max-w-6xl mx-auto space-y-6">
            <Card className="bg-white/95 border-white">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="default" className="bg-[#8b5cf6]">
                        Registered on AgentRegistry.sol (
                        {shortenHex(contractAddresses.agentRegistry, 6)})
                      </Badge>
                      <Badge variant="emerald">
                        Google Gemini Base Models (gemini-2.5-flash & lite)
                      </Badge>
                      <Badge variant="outline">
                        Inngest Hourly Cron (`0 * * * *`) + Neon Postgres
                      </Badge>
                    </div>
                    <CardTitle className="text-2xl font-black">
                      5 Indian Mythology Autonomous DeFi Agents (Gemini + Inngest + Neon Cloud DB)
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Every 1 hour (or on-demand), <strong>Narada</strong> captures live Bitcoin & macro news,{" "}
                      <strong>Indra</strong> sets the strategy directive, <strong>Kubera</strong> sizes the BTC DCA slice,{" "}
                      <strong>Dhanvantari</strong> heals any PolicyVault revert, and <strong>Sudarshana</strong> anchors the transaction on Mezo Testnet (31611) while streaming every turn to{" "}
                      <strong>Neon Serverless Postgres</strong>.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        setActiveTab("island");
                        setRightCardCollapsed(false);
                      }}
                      className="bg-[#8b5cf6] hover:bg-[#7c3aed]"
                    >
                      <Sparkles className="h-4 w-4" /> View Council & Live Trends
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl bg-[#f7f4ed] p-4 border border-[#e5dec9]">
                  <div>
                    <label className="text-xs font-extrabold text-[#3d3732] flex items-center justify-between mb-1">
                      <span>Google Gemini API Key (`GEMINI_API_KEY`)</span>
                      <span className="text-[10px] text-emerald-700 font-bold">
                        {geminiConfiguredOnServer || geminiApiKey
                          ? "✓ Gemini Active (gemini-2.5-flash / lite)"
                          : "Uses .env GEMINI_API_KEY or paste here"}
                      </span>
                    </label>
                    <input
                      type="password"
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder="AIzaSy... (Google AI Studio / Gemini Pro Plan Key)"
                      className="w-full h-9 rounded-xl border border-[#d6cbb9] bg-white px-3 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-extrabold text-[#3d3732] flex items-center justify-between mb-1">
                      <span>Neon Serverless Postgres URL (`DATABASE_URL`)</span>
                      <span className="text-[10px] text-purple-700 font-bold">
                        {neonConnected
                          ? "✓ Connected to Neon Cloud Postgres"
                          : "Auto-creates agent_cycles & agent_messages tables"}
                      </span>
                    </label>
                    <input
                      type="password"
                      value={neonDatabaseUrl}
                      onChange={(e) => setNeonDatabaseUrl(e.target.value)}
                      placeholder="postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require"
                      className="w-full h-9 rounded-xl border border-[#d6cbb9] bg-white px-3 text-xs font-mono"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* The 4 Agent Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {agents.map((ag) => (
                <Card key={ag.id} className="bg-white/95 border-white">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-5 w-5 rounded-full border-2 border-white shadow"
                          style={{ backgroundColor: ag.color }}
                        />
                        <div>
                          <CardTitle className="text-lg font-black">
                            {ag.name} — {ag.role}
                          </CardTitle>
                          <div className="text-xs font-bold text-[#7c3aed]">
                            {ag.aiProviderBadge}
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary">{ag.erc8004Id}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="rounded-xl bg-[#f7f4ed] p-3 border border-[#e5dec9] italic text-[#38322d]">
                      “{ag.speechBubble}”
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-stone-100 p-2">
                        <div className="text-[10px] text-stone-500 font-bold">
                          REPUTATION
                        </div>
                        <div className="text-sm font-black text-emerald-700">
                          {(ag.reputationBps / 100).toFixed(2)}%
                        </div>
                      </div>
                      <div className="rounded-xl bg-stone-100 p-2">
                        <div className="text-[10px] text-stone-500 font-bold">
                          WEIGHT
                        </div>
                        <div className="text-sm font-black text-[#231f20]">
                          {ag.weightPercent}%
                        </div>
                      </div>
                      <div className="rounded-xl bg-stone-100 p-2">
                        <div className="text-[10px] text-stone-500 font-bold">
                          ON-CHAIN ACTIONS
                        </div>
                        <div className="text-sm font-black text-[#231f20]">
                          {ag.totalActions}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-stone-500 font-mono">
                      <span>Operator: {shortenHex(ag.operatorAddress, 6)}</span>
                      <span>Spec: {shortenHex(ag.strategySpecHash, 6)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ag.skills.map((sk) => (
                        <Badge key={sk} variant="outline">
                          {sk}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
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
                            🤖 Autonomous Execution: Indra & Kubera decide each cycle (`EXECUTE`, `HOLD`, or `RECTIFY`) from live news & market trends
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
                        className={`h-3.5 w-3.5 ${
                          isMcpLoading ? "animate-spin" : ""
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
                  Mezo Town: Autonomous 4-Agent BTC DCA & Self-Healing Policy
                  Vaults
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
    </div>
  );
}
