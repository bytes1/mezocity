"use client";

import React, { useEffect } from "react";
import {
  Activity,
  ExternalLink,
  MessageSquare,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import type { AgentReasoningLog } from "@/lib/simulation-data";
import type { MainActionResult } from "@/lib/neon-db";

export const COUNCIL_AGENT_ORDER = [
  "Soundwave",
  "Optimus Prime",
  "Bumblebee",
  "Ratchet",
  "Ironhide",
] as const;

export function getAgentSpeakerColor(speaker: string): string {
  switch (speaker) {
    case "Optimus Prime":
      return "#8b5cf6";
    case "Bumblebee":
      return "#f59e0b";
    case "Ratchet":
      return "#10b981";
    case "Soundwave":
      return "#ec4899";
    case "Ironhide":
      return "#3b82f6";
    default:
      return "#475569";
  }
}

export interface CouncilMessageListProps {
  messages: AgentReasoningLog[];
  density?: "compact" | "comfortable";
  isAiRunning?: boolean;
  inngestPaused?: boolean;
  agentFilter?: string;
  showTurnIndex?: boolean;
}

export function CouncilMessageList({
  messages,
  density = "compact",
  isAiRunning = false,
  inngestPaused = false,
  agentFilter = "ALL",
  showTurnIndex = false,
}: CouncilMessageListProps) {
  const councilMessages = messages.filter((item) => item.speaker !== "You");
  const visibleMessages =
    agentFilter === "ALL"
      ? councilMessages
      : councilMessages.filter(
          (item) =>
            item.speaker === agentFilter || item.replyTo === agentFilter
        );

  if (visibleMessages.length === 0) {
    return (
      <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center py-6 px-4 text-xs text-stone-600">
        <MessageSquare className="h-6 w-6 text-stone-400 mb-2" />
        <p className="font-bold text-[#231f20] mb-1 text-[13px]">
          {isAiRunning
            ? "Soundwave, Optimus Prime, Bumblebee, Ratchet & Ironhide are deliberating live market trends..."
            : councilMessages.length > 0 && agentFilter !== "ALL"
              ? `No turns matched ${agentFilter} in this cycle.`
              : inngestPaused
                ? "Inngest triggers are paused via INNGEST_PAUSED. Click Run Now to trigger a manual cycle."
                : "Waiting for next autonomous Inngest cycle (or click Run Now above)."}
        </p>
        <p className="text-[11.5px] text-stone-500 max-w-md leading-relaxed">
          The 5 Transformers autonomously analyze Bitcoin trends, Fear &amp;
          Greed, Earn Vault yields, and Trove collateral to balance{" "}
          <strong>BTC Strategy</strong>, <strong>MUSD/MEZO Yield</strong>, and{" "}
          <strong>Capital Defense</strong>.
        </p>
      </div>
    );
  }

  const isComfortable = density === "comfortable";

  return (
    <div className={isComfortable ? "space-y-3" : "space-y-2.5"}>
      {visibleMessages.map((item, idx) => {
        const accentColor = getAgentSpeakerColor(item.speaker);
        return (
          <article
            key={item.id}
            style={{ borderLeftWidth: "4px", borderLeftColor: accentColor }}
            className={`rounded-xl bg-white border border-[#e2d8c5] shadow-sm transition-colors ${
              isComfortable ? "p-4" : "p-3"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {showTurnIndex && (
                  <span className="rounded-md bg-stone-900 text-white px-1.5 py-0.5 text-[10px] font-black tabular-nums">
                    #{String(idx + 1).padStart(2, "0")}
                  </span>
                )}
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
                <strong
                  className={`font-black text-[#1f1c1a] ${
                    isComfortable ? "text-[14.5px]" : "text-[13px]"
                  }`}
                >
                  {item.speaker}
                </strong>
                {item.roleTag && isComfortable && (
                  <span className="text-[11px] font-bold text-[#6e655d]">
                    • {item.roleTag}
                  </span>
                )}
                {item.replyTo && (
                  <span className="rounded-md bg-purple-100 border border-purple-200 px-1.5 py-0.5 text-[10px] font-black text-[#6d28d9]">
                    → @{item.replyTo}
                  </span>
                )}
                <span className="text-[10.5px] font-semibold text-[#6e655d]">
                  ({item.aiModel})
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isComfortable && item.latencyMs !== undefined && (
                  <span className="text-[10px] font-mono text-stone-500">
                    {item.latencyMs}ms
                  </span>
                )}
                {isComfortable && item.timestamp && (
                  <span className="text-[10px] font-mono text-stone-500">
                    {item.timestamp}
                  </span>
                )}
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#f7f3eb] text-[#3d3630] border border-[#ded6c6]">
                  {item.badgeText}
                </span>
              </div>
            </div>

            <p
              className={`text-[#2c2723] whitespace-pre-wrap break-words ${
                isComfortable
                  ? "text-[13.5px] sm:text-[14px] leading-relaxed pl-1"
                  : "text-[12.5px] leading-relaxed pl-1"
              }`}
            >
              {item.text}
            </p>
          </article>
        );
      })}
    </div>
  );
}

export interface CouncilCommunicationModalProps {
  open: boolean;
  onClose: () => void;
  messages: AgentReasoningLog[];
  isAiRunning: boolean;
  inngestPaused: boolean;
  headline: string;
  decisionReason: string;
  decisionType: "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD";
  lastTxHash?: string | null;
  cycleActions: MainActionResult[];
  agentFilter: string;
  onAgentFilterChange: (agent: string) => void;
  onRunCycleNow: () => void;
}

export function CouncilCommunicationModal({
  open,
  onClose,
  messages,
  isAiRunning,
  inngestPaused,
  headline,
  decisionReason,
  decisionType,
  lastTxHash,
  cycleActions,
  agentFilter,
  onAgentFilterChange,
  onRunCycleNow,
}: CouncilCommunicationModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const councilMessages = messages.filter((m) => m.speaker !== "You");
  const filterOptions = [
    { key: "ALL", label: `All Agents (${councilMessages.length})` },
    ...COUNCIL_AGENT_ORDER.map((name) => ({
      key: name,
      label: `${name} (${
        councilMessages.filter((m) => m.speaker === name).length
      })`,
    })),
  ];

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 pointer-events-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Autonomous Council Communication Reader"
        className="w-full max-w-5xl h-[88vh] rounded-3xl bg-[#faf7f2] border-[3px] border-white shadow-[0_32px_90px_rgba(15,23,42,0.38)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-white border-b border-[#e5dccb] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#242331] px-3 py-1 text-[10.5px] font-black uppercase tracking-wider text-white">
              <span
                className={`h-2 w-2 rounded-full ${
                  isAiRunning ? "bg-amber-400 animate-ping" : "bg-emerald-400"
                }`}
              />
              <span>
                {isAiRunning
                  ? "Council Deliberating Live..."
                  : "5-Agent Council Communication"}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#f3ede2] border border-[#e1d7c4] px-2.5 py-1 text-[11px] font-extrabold text-[#3c352f]">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
              <span>Mezo Testnet 31611 • Full Transcript Reader</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isAiRunning}
              onClick={onRunCycleNow}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-black transition-colors ${
                isAiRunning
                  ? "bg-stone-200 text-stone-500 cursor-not-allowed"
                  : "bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-sm"
              }`}
            >
              <Play className="h-3 w-3" />
              <span>{isAiRunning ? "Deliberating..." : "Run New Cycle"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-[#f3ede2] hover:bg-[#e5dccb] border border-[#dfd5c3] flex items-center justify-center text-[#2c2723] transition-colors"
              title="Close Reader (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Decision Summary Strip */}
        <div className="px-5 py-3 bg-[#f5efe4] border-b border-[#e5dccb] space-y-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0 ${
                  decisionType === "RECTIFY_AND_EXECUTE"
                    ? "bg-emerald-600 text-white"
                    : decisionType === "EXECUTE_DCA"
                      ? "bg-[#7c3aed] text-white"
                      : "bg-teal-700 text-white"
                }`}
              >
                {decisionType}
              </span>
              <h2 className="text-sm sm:text-[15px] font-black text-[#1f1c1a]">
                {headline}
              </h2>
            </div>

            {lastTxHash && (
              <a
                href={`https://explorer.test.mezo.org/tx/${lastTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-white border border-stone-300 px-2.5 py-1 text-[11px] font-black text-[#231f20] hover:underline shrink-0"
              >
                <Activity className="h-3 w-3 text-emerald-700" />
                <span>Explorer TX</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <p className="text-xs sm:text-[13px] text-[#453e38] leading-relaxed">
            {decisionReason}
          </p>

          {cycleActions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {cycleActions.map((act, idx) => (
                <span
                  key={`${act.type}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#dfd5c3] px-2.5 py-0.5 text-[11px] font-bold text-[#2c2723]"
                >
                  <span>{act.agent}:</span>
                  <span>{act.label}</span>
                  {act.amountLabel && (
                    <span className="text-stone-500">({act.amountLabel})</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Agent Speaker Filter Bar */}
        <div className="px-5 py-2.5 bg-white border-b border-[#e5dccb] flex flex-wrap items-center gap-1.5 shrink-0">
          {filterOptions.map((opt) => {
            const active = agentFilter === opt.key;
            const dotColor =
              opt.key === "ALL" ? "#242331" : getAgentSpeakerColor(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onAgentFilterChange(opt.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold transition-colors border ${
                  active
                    ? "bg-[#242331] text-white border-[#242331]"
                    : "bg-[#f6f1e7] hover:bg-[#ebe3d3] text-[#3b342e] border-[#e2d8c5]"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: dotColor }}
                />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Full Spacious Deliberation Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <CouncilMessageList
            messages={messages}
            density="comfortable"
            isAiRunning={isAiRunning}
            inngestPaused={inngestPaused}
            agentFilter={agentFilter}
            showTurnIndex
          />
        </div>
      </div>
    </div>
  );
}
