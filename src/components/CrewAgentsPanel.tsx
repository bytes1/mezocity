"use client";

import React, { useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Coins,
  Cpu,
  Lock,
  Maximize2,
  MessageSquare,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CouncilMessageList } from "@/components/CouncilCommunicationView";
import type {
  AgentReasoningLog,
  ClayAgent,
  MythicAgentName,
} from "@/lib/simulation-data";

export interface CrewAgentsPanelProps {
  agents: ClayAgent[];
  currentPhase: string;
  isAiRunning: boolean;
  btcPriceUsd?: number;
  vaultTvlBtc: number;
  reasoningFeed?: AgentReasoningLog[];
  latestCycleHeadline?: string;
  latestDecisionReason?: string;
  inngestPaused?: boolean;
  onOpenFullCommunication?: () => void;
  onNavigateTab: (tab: "dca" | "musd-vault" | "lending" | "contracts" | "arena") => void;
}

interface AgentOperationalSpec {
  title: string;
  tierLabel: string;
  summary: string;
  standbyStatus: string;
  stepNumber: string;
  stepShort: string;
  stepPhases: string[];
  stepHandoff: string;
  responsibilities: [string, string, string];
  securityBoundary: string;
  capabilities: [string, string, string];
  moduleScope: string;
  destinationLabel: string;
  destinationTab: "dca" | "musd-vault" | "lending" | "contracts";
  icon: "cpu" | "activity" | "coins" | "wrench" | "shield";
}

const AGENT_SPECS: Record<MythicAgentName, AgentOperationalSpec> = {
  Soundwave: {
    title: "Market Data & Macro Signal Engine",
    tierLabel: "Signal Ingestion",
    summary:
      "Ingests real-time Bitcoin price action, 24h volatility metrics, and macro news before every allocation decision.",
    standbyStatus:
      "Continuously tracks BTC/USD spot range, Fear & Greed sentiment, and incoming macro headlines.",
    stepNumber: "01",
    stepShort: "Market Ingestion",
    stepPhases: ["NEWS_SCANNING"],
    stepHandoff: "Feeds verified BTC price, volatility & sentiment context.",
    responsibilities: [
      "Pulls live BTC/USD spot price, 24h high/low range, and Fear & Greed market positioning.",
      "Classifies breaking Bitcoin and macro headlines into bullish, neutral, or cautious signals.",
      "Supplies structured volatility context to Optimus Prime prior to any sizing calculation.",
    ],
    securityBoundary:
      "Read-only telemetry agent — has zero custody or transaction-signing permissions.",
    capabilities: ["BTC Spot Feeds", "Volatility Scoring", "Macro Sentiment"],
    moduleScope: "Market Telemetry",
    destinationLabel: "Contract Registry",
    destinationTab: "contracts",
    icon: "activity",
  },
  "Optimus Prime": {
    title: "Multi-Protocol Strategist & Policy Coordinator",
    tierLabel: "Orchestrator",
    summary:
      "Synthesizes Soundwave signals with PolicyVault limits to coordinate BTC Vaults, Mezo Earn Vaults (sMUSD/upMUSD/StabilityPool), Tigris Pools, and Trove Defense.",
    standbyStatus:
      "Evaluating live BTC regime, MUSD/MEZO Earn APYs, and PolicyVault guardrails before routing capital.",
    stepNumber: "02",
    stepShort: "Multi-Protocol Plan",
    stepPhases: ["HEAD_PLANNING"],
    stepHandoff: "Coordinates BTC Vault, MUSD/MEZO Earn & Trove Defense legs.",
    responsibilities: [
      "Combines Soundwave's live BTC regime with PolicyVault caps to balance BTC exposure vs defensive yield.",
      "Routes idle MUSD & MEZO into Earn Vaults & Tigris Pools automatically when BTC trends weak or dips.",
      "Coordinates weighted multi-agent consensus and anchors verifiable debates on AgentRegistry.sol.",
    ],
    securityBoundary:
      "Authorization & routing only — never holds user wallet private keys or bypasses vault limits.",
    capabilities: ["Weighted Consensus", "Regime Routing", "Yield + Risk"],
    moduleScope: "Multi-Protocol Strategy",
    destinationLabel: "Open BTC Vault",
    destinationTab: "dca",
    icon: "cpu",
  },
  Bumblebee: {
    title: "Capital, BTC Vault & Mezo Earn Router",
    tierLabel: "Allocation & Yield",
    summary:
      "Executes policy-fenced BTC Strategy Vault positions alongside MUSD & MEZO deployments into sMUSD, upMUSD, StabilityPool & Tigris Pools.",
    standbyStatus:
      "Calibrating BTC Strategy sizing alongside BTC-low MUSD/MEZO routing across Mezo Earn Vaults & Tigris Pools.",
    stepNumber: "03",
    stepShort: "Yield & Allocation",
    stepPhases: ["DCA_SCHEDULING"],
    stepHandoff: "Routes BTC Vault allocations and MUSD/MEZO Earn legs.",
    responsibilities: [
      "Deploys MUSD into sMUSD, upMUSD & StabilityPool and MEZO/MUSD into Tigris AMM + VeBTC Gauges.",
      "Sizes policy-bounded BTC Strategy Vault slices when bullish/neutral catalysts pass confidence floors.",
      "Rebalances MainMUSDVault liquidity to serve verified Sub-Island Builder Credit demand.",
    ],
    securityBoundary:
      "Constrained by PolicyVault maxSingleTradeBps, drawdown caps, and deterministic router quotes.",
    capabilities: ["Mezo Earn Vaults", "Tigris LP", "BTC Strategy"],
    moduleScope: "Mezo Earn & BTC Vault",
    destinationLabel: "Open MUSD & Earn",
    destinationTab: "musd-vault",
    icon: "coins",
  },
  Ratchet: {
    title: "Self-Healing & Cross-Protocol Recovery Engine",
    tierLabel: "Self-Healing",
    summary:
      "Intercepts policy blocks or reverts, clamps oversized BTC/vault payloads to safe caps, and validates Trove & Yield solvency.",
    standbyStatus:
      "Monitoring execution pipeline for policy cap violations, slippage shifts, and solvency recovery needs.",
    stepNumber: "04",
    stepShort: "Fault Recovery",
    stepPhases: ["ERROR_RECTIFYING"],
    stepHandoff: "Diagnoses reverts & clamps oversized payloads cleanly.",
    responsibilities: [
      "Catches blocked transactions triggered by single-trade caps, slippage spikes, or stale allowances.",
      "Rescales oversized BTC or allocation parameters back within PolicyVault-approved ceilings.",
      "Verifies MUSD Trove health headroom & Sub-Island credit solvency before final settlement.",
    ],
    securityBoundary:
      "Downward-clamping only — can reduce order size to pass rules, never relax or override locks.",
    capabilities: ["Revert Diagnosis", "Payload Clamping", "Solvency Check"],
    moduleScope: "Execution Rectifier",
    destinationLabel: "Inspect Guardrails",
    destinationTab: "dca",
    icon: "wrench",
  },
  Ironhide: {
    title: "PolicyVault Enforcer & MUSD Collateral Guard",
    tierLabel: "Risk & Liquidation Defense",
    summary:
      "Enforces hard smart-contract risk limits and continuously monitors Mezo MUSD Trove health near 110% MCR.",
    standbyStatus:
      "Auditing PolicyVault constraints and tracking Mezo MUSD Trove Health Factor via finalized oracle reads.",
    stepNumber: "05",
    stepShort: "Risk & MUSD Guard",
    stepPhases: ["POLICY_AUDIT", "ONCHAIN_SETTLEMENT"],
    stepHandoff: "Validates vault caps & protects MUSD Trove collateral ratio.",
    responsibilities: [
      "Enforces non-negotiable PolicyVault caps: max single-trade bps, daily drawdown, and emergency pause.",
      "Reads finalized PriceFeed & TroveManager contracts to monitor your Mezo MUSD Trove Health Factor.",
      "Coordinates your funded Dedicated Guard Reserve Wallet to defend collateral before 110% MCR.",
    ],
    securityBoundary:
      "Zero access to main borrower wallet key — operates only via read verification or separate reserve.",
    capabilities: ["Vault Enforcement", "MUSD Trove Watch", "Reserve Defense"],
    moduleScope: "MUSD Lending & PolicyVault",
    destinationLabel: "Open MUSD Guard",
    destinationTab: "lending",
    icon: "shield",
  },
};

const WORKFLOW_ORDER: MythicAgentName[] = [
  "Soundwave",
  "Optimus Prime",
  "Bumblebee",
  "Ratchet",
  "Ironhide",
];

const SPECIALIST_ORDER: MythicAgentName[] = [
  "Soundwave",
  "Bumblebee",
  "Ratchet",
  "Ironhide",
];

function renderAgentIcon(icon: AgentOperationalSpec["icon"], className: string) {
  switch (icon) {
    case "cpu":
      return <Cpu className={className} />;
    case "activity":
      return <Activity className={className} />;
    case "coins":
      return <Coins className={className} />;
    case "wrench":
      return <Wrench className={className} />;
    case "shield":
      return <ShieldCheck className={className} />;
  }
}

function resolveOperationalOutput(
  agent: ClayAgent,
  standbyStatus: string
): string {
  const raw = (agent.speechBubble || "").trim();
  if (
    !raw ||
    raw.startsWith("Syncing live from AgentRegistry") ||
    raw.startsWith("Initializing")
  ) {
    return standbyStatus;
  }
  return raw;
}

function formatSystemStatus(currentPhase: string, isAiRunning: boolean): string {
  if (!isAiRunning) return "Autonomous Monitoring Active";
  switch (currentPhase) {
    case "NEWS_SCANNING":
      return "Stage 1/5 · Soundwave Ingesting Market Data";
    case "HEAD_PLANNING":
      return "Stage 2/5 · Optimus Authorizing Strategy";
    case "DCA_SCHEDULING":
      return "Stage 3/5 · Bumblebee Routing Capital & Earn";
    case "ERROR_RECTIFYING":
      return "Stage 4/5 · Ratchet Rectifying Constraints";
    case "POLICY_AUDIT":
      return "Stage 5/5 · Ironhide Auditing Policy Caps";
    case "ONCHAIN_SETTLEMENT":
      return "Stage 5/5 · Finalizing On-Chain State";
    default:
      return "Autonomous Evaluation Active";
  }
}

export function CrewAgentsPanel({
  agents,
  currentPhase,
  isAiRunning,
  btcPriceUsd,
  vaultTvlBtc,
  reasoningFeed = [],
  latestCycleHeadline,
  latestDecisionReason,
  inngestPaused = false,
  onOpenFullCommunication,
  onNavigateTab,
}: CrewAgentsPanelProps) {
  const [selectedStageAgent, setSelectedStageAgent] =
    useState<MythicAgentName | null>(null);

  const agentByName = new Map<MythicAgentName, ClayAgent>();
  for (const ag of agents) {
    agentByName.set(ag.name, ag);
  }

  const commander = agentByName.get("Optimus Prime");
  const commanderSpec = AGENT_SPECS["Optimus Prime"];
  const totalActions = agents.reduce((sum, ag) => sum + (ag.totalActions || 0), 0);

  return (
    <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-14 px-4 sm:px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Executive System Header */}
        <Card className="border-slate-800/80 bg-gradient-to-br from-[#0f172a] via-[#172036] to-[#111827] text-white shadow-xl overflow-hidden">
          <CardHeader className="pb-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="space-y-2.5 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-slate-800 text-slate-200 border border-slate-700 font-semibold">
                    <Bot className="h-3.5 w-3.5 mr-1.5 text-violet-400" />
                    Multi-Agent Execution Architecture
                  </Badge>
                  <Badge
                    className={
                      isAiRunning
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    }
                  >
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    {formatSystemStatus(currentPhase, isAiRunning)}
                  </Badge>
                  <Badge className="bg-white/10 text-slate-300 border border-white/15 font-medium">
                    Mezo Testnet · Chain 31611
                  </Badge>
                </div>

                <CardTitle className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  Agent Responsibilities & Security Boundaries
                </CardTitle>

                <CardDescription className="text-sm text-slate-300 leading-relaxed">
                  Autonomous BTC Vault strategy, MUSD &amp; MEZO Earn Vaults
                  (sMUSD, upMUSD, StabilityPool), Tigris AMM Pools, and MUSD
                  Trove liquidation defense are divided across five specialized
                  agents — keeping every capital movement transparent and
                  bounded by smart contracts.
                </CardDescription>
              </div>
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigateTab("arena")}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-emerald-400 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg hover:brightness-105 transition-all"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Open Debate Arena &amp; Keepers</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Operational Metrics Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-5 mt-5 border-t border-white/10">
              <div className="rounded-xl bg-white/5 px-4 py-3 border border-white/10">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Active Agents
                </div>
                <div className="text-lg font-black text-white mt-0.5">
                  {agents.length} / 5 Operational
                </div>
              </div>
              <div className="rounded-xl bg-white/5 px-4 py-3 border border-white/10">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  PolicyVault TVL
                </div>
                <div className="text-lg font-black text-emerald-300 mt-0.5">
                  {vaultTvlBtc.toFixed(5)} BTC
                </div>
              </div>
              <div className="rounded-xl bg-white/5 px-4 py-3 border border-white/10">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  BTC Oracle Reference
                </div>
                <div className="text-lg font-black text-amber-200 mt-0.5">
                  {btcPriceUsd && btcPriceUsd > 0
                    ? `$${btcPriceUsd.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}`
                    : "Live Feed Active"}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 px-4 py-3 border border-white/10">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Verified Actions
                </div>
                <div className="text-lg font-black text-violet-300 mt-0.5">
                  {totalActions.toLocaleString()} Recorded
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* 5-Stage Decision Pipeline */}
        <Card className="bg-white/95 border-[#e2d8c8] shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-black text-slate-900">
                  5-Stage Execution & Risk Pipeline
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Select a stage to highlight the responsible agent and inspect its execution scope.
                </CardDescription>
              </div>
              {selectedStageAgent && (
                <button
                  type="button"
                  onClick={() => setSelectedStageAgent(null)}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 underline"
                >
                  Reset highlight
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {WORKFLOW_ORDER.map((name, idx) => {
                const ag = agentByName.get(name);
                const spec = AGENT_SPECS[name];
                const isLivePhase =
                  isAiRunning && spec.stepPhases.includes(currentPhase);
                const isSelected = selectedStageAgent === name;
                const accent = ag?.color || "#6366f1";

                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      setSelectedStageAgent((prev) =>
                        prev === name ? null : name
                      )
                    }
                    className={`text-left rounded-xl p-3.5 border transition-all ${
                      isLivePhase || isSelected
                        ? "bg-white border-slate-900 shadow-md ring-2 ring-slate-900/15 -translate-y-0.5"
                        : "bg-slate-50/80 border-slate-200 hover:bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className="inline-flex items-center justify-center h-6 px-2 rounded-md text-[11px] font-black text-white"
                        style={{ backgroundColor: accent }}
                      >
                        {spec.stepNumber}
                      </span>
                      {isLivePhase ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                          Active
                        </span>
                      ) : idx < WORKFLOW_ORDER.length - 1 ? (
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400 hidden lg:block" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                      )}
                    </div>
                    <div className="font-black text-sm text-slate-900">
                      {name}
                    </div>
                    <div className="text-[11px] font-bold text-slate-600 mb-1">
                      {spec.stepShort}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {spec.stepHandoff}
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Live 5-Agent Council Communication Transcript */}
        <Card className="bg-[#faf7f2] border-[#e2d8c8] shadow-md">
          <CardHeader className="pb-3 border-b border-[#e5dccb]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-violet-600" />
                  <span>Live 5-Agent Council Communication</span>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  {latestCycleHeadline ||
                    "Full readable agent-to-agent deliberation stream from the latest autonomous council cycle."}
                </CardDescription>
              </div>
              {onOpenFullCommunication && (
                <button
                  type="button"
                  onClick={onOpenFullCommunication}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#242331] hover:bg-[#353347] text-white px-3.5 py-1.5 text-xs font-black shadow-sm transition-colors"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Full-Screen Reader</span>
                </button>
              )}
            </div>
            {latestDecisionReason && (
              <p className="text-xs text-slate-700 bg-white border border-[#e5dccb] rounded-xl px-3.5 py-2.5 mt-2 leading-relaxed">
                {latestDecisionReason}
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            <CouncilMessageList
              messages={reasoningFeed}
              density="comfortable"
              isAiRunning={isAiRunning}
              inngestPaused={inngestPaused}
              agentFilter={selectedStageAgent || "ALL"}
              showTurnIndex
            />
          </CardContent>
        </Card>

        {/* Lead Coordinator Card — Optimus Prime */}
        {commander && (
          <Card
            className={`bg-white/95 border-[#e2d8c8] shadow-md overflow-hidden transition-all ${
              selectedStageAgent === "Optimus Prime" ||
              (isAiRunning && commanderSpec.stepPhases.includes(currentPhase))
                ? "ring-2 ring-slate-900 shadow-xl"
                : ""
            }`}
          >
            <div
              className="h-1.5 w-full"
              style={{ backgroundColor: commander.color || "#8b5cf6" }}
            />
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Mandates & Boundaries */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0"
                        style={{ backgroundColor: commander.color || "#8b5cf6" }}
                      >
                        {renderAgentIcon(commanderSpec.icon, "h-5 w-5")}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-black text-slate-900">
                            {commander.name}
                          </h3>
                          <Badge className="bg-violet-100 text-violet-900 border border-violet-200">
                            {commanderSpec.tierLabel}
                          </Badge>
                        </div>
                        <p className="text-xs font-bold text-slate-600 mt-0.5">
                          {commanderSpec.title} · {commander.aiProviderBadge}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {commanderSpec.capabilities.map((cap) => (
                        <Badge
                          key={cap}
                          variant="outline"
                          className="text-[11px] font-semibold bg-slate-50 border-slate-200 text-slate-700"
                        >
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <p className="text-sm font-medium text-slate-700 leading-relaxed">
                    {commanderSpec.summary}
                  </p>

                  <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-4 space-y-2.5">
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Operational Responsibilities
                    </div>
                    <ul className="space-y-2">
                      {commanderSpec.responsibilities.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 leading-snug"
                        >
                          <CheckCircle2 className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/80 px-3.5 py-2.5 text-xs text-emerald-950 flex items-start gap-2">
                      <Lock className="h-3.5 w-3.5 text-emerald-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-emerald-900">
                          Custody & Permission Boundary
                        </span>
                        <span className="text-emerald-800">
                          {commanderSpec.securityBoundary}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-100/80 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-700">
                      <span className="font-bold block text-slate-900">
                        Latest Operational Output
                      </span>
                      <span>
                        {resolveOperationalOutput(
                          commander,
                          commanderSpec.standbyStatus
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Standing & Scope */}
                <div className="lg:col-span-4 rounded-xl bg-slate-50 border border-slate-200 p-5 space-y-3.5">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Verification & Standing
                  </div>

                  <div className="space-y-2.5">
                    <div className="rounded-lg bg-white p-3 border border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">
                        Reliability Score
                      </span>
                      <span className="text-sm font-black text-emerald-700">
                        {(commander.reputationBps / 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="rounded-lg bg-white p-3 border border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">
                        Consensus Weight
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        {commander.weightPercent}%
                      </span>
                    </div>
                    <div className="rounded-lg bg-white p-3 border border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">
                        Verified Actions
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        {commander.totalActions}
                      </span>
                    </div>
                    <div className="rounded-lg bg-white p-3 border border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">
                        System Scope
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {commanderSpec.moduleScope}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigateTab(commanderSpec.destinationTab)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 transition-colors"
                  >
                    <span>Open {commanderSpec.destinationLabel}</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Balanced 2x2 Specialist Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SPECIALIST_ORDER.map((name) => {
            const ag = agentByName.get(name);
            if (!ag) return null;
            const spec = AGENT_SPECS[name];
            const isHighlighted =
              selectedStageAgent === name ||
              (isAiRunning && spec.stepPhases.includes(currentPhase));

            return (
              <Card
                key={ag.id}
                className={`bg-white/95 border-[#e2d8c8] shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col ${
                  isHighlighted ? "ring-2 ring-slate-900 shadow-xl" : ""
                }`}
              >
                <div
                  className="h-1.5 w-full"
                  style={{ backgroundColor: ag.color }}
                />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0"
                        style={{ backgroundColor: ag.color }}
                      >
                        {renderAgentIcon(spec.icon, "h-5 w-5")}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-lg font-black text-slate-900">
                            {ag.name}
                          </CardTitle>
                          <Badge
                            variant="outline"
                            className="text-[11px] bg-slate-50 border-slate-200 text-slate-700"
                          >
                            {spec.tierLabel}
                          </Badge>
                        </div>
                        <div className="text-xs font-bold text-slate-600 mt-0.5">
                          {spec.title}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold bg-slate-50 border-slate-200 text-slate-700"
                      >
                        {ag.weightPercent}% consensus
                      </Badge>
                      <div className="text-[10px] font-semibold text-slate-400 mt-1">
                        {ag.aiProviderBadge}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 flex-1 flex flex-col justify-between pt-0">
                  <div className="space-y-3">
                    <p className="text-xs sm:text-sm font-medium text-slate-700 leading-relaxed">
                      {spec.summary}
                    </p>

                    <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3.5 space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        What {ag.name} Does
                      </div>
                      <ul className="space-y-1.5">
                        {spec.responsibilities.map((item) => (
                          <li
                            key={item}
                            className="flex items-start gap-2 text-xs text-slate-800 leading-snug"
                          >
                            <CheckCircle2
                              className="h-3.5 w-3.5 shrink-0 mt-0.5"
                              style={{ color: ag.color }}
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/80 px-3.5 py-2 text-xs text-emerald-900 flex items-start gap-2">
                      <Lock className="h-3.5 w-3.5 text-emerald-700 shrink-0 mt-0.5" />
                      <span>{spec.securityBoundary}</span>
                    </div>

                    <div className="rounded-xl bg-slate-100/80 border border-slate-200 px-3.5 py-2 text-xs text-slate-700">
                      <span className="font-bold text-slate-900 mr-1">
                        Status:
                      </span>
                      <span>
                        {resolveOperationalOutput(ag, spec.standbyStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2.5 border-t border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {spec.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200/80"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] font-bold text-slate-500">
                        <span className="text-emerald-700">
                          {(ag.reputationBps / 100).toFixed(1)}% trust
                        </span>{" "}
                        · {ag.totalActions} actions
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <span className="text-slate-500 font-semibold">
                        Scope:{" "}
                        <span className="text-slate-800">{spec.moduleScope}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigateTab(spec.destinationTab)}
                        className="inline-flex items-center gap-1 font-bold text-slate-800 hover:text-slate-950 underline underline-offset-2"
                      >
                        <span>{spec.destinationLabel}</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
