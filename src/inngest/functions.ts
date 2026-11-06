import { inngest } from "./client";
import { executeAutonomousMythicCycle } from "@/lib/gemini-agents";

/**
 * Durable 1-Hour Autonomous AI Crew Cron + Event Workflow (Inngest v4)
 * Triggers automatically every hour (`0 * * * *`) OR when `mezo/cycle.requested` is sent.
 * Runs the 5 Indian Mythology Agents:
 *   1. Narada (News Capturing Sage - gemini-2.5-flash-lite)
 *   2. Indra (Head Orchestrator - gemini-2.5-flash)
 *   3. Kubera (BTC DCA & Treasury - gemini-2.5-flash)
 *   4. Dhanvantari (Self-Healing Rectifier - gemini-2.5-flash)
 *   5. Sudarshana (PolicyVault Guardrail Auditor - gemini-2.5-flash-lite)
 * And settles the decision live on Mezo Testnet (Chain ID 31611) while persisting to Neon Postgres.
 */
export const hourlyAutonomousDcaCycle = inngest.createFunction(
  {
    id: "hourly-autonomous-mythic-dca-cycle",
    name: "Hourly 5-Agent Indian Mythology News & DCA Cycle (Mezo Testnet 31611)",
    retries: 2,
    triggers: [{ cron: "0 * * * *" }, { event: "mezo/cycle.requested" }],
  },
  async ({ event, step }) => {
    const rawData = (event?.data || {}) as {
      scenario?: string;
      scheduleId?: number;
    };
    const scenario =
      rawData.scenario === "INTENTIONAL_OVERFLOW"
        ? ("INTENTIONAL_OVERFLOW" as const)
        : ("NORMAL_DCA" as const);

    const scheduleId =
      rawData.scheduleId !== undefined ? Number(rawData.scheduleId) : undefined;

    const cycleResult = await step.run(
      "run-5-mythic-agents-and-settle-mezo-31611",
      async () => {
        const res = await executeAutonomousMythicCycle({
          scenario,
          scheduleId,
          triggerSource: event?.name
            ? "MANUAL_UI"
            : "INNGEST_HOURLY_CRON",
        });

        return {
          cycleId: res.cycleId,
          triggerSource: res.triggerSource,
          decision: res.decision,
          decisionReason: res.decisionReason,
          executedOnChain: res.executedOnChain,
          scenario: res.scenario,
          btcPriceUsd: res.market.btcPriceUsd,
          sentiment: res.market.sentimentLabel,
          headlinesCount: res.market.newsHeadlines.length,
          proposedSliceBtc: res.proposedSliceBtc,
          executedSliceBtc: res.executedSliceBtc,
          wasRectified: res.wasRectified,
          primaryTxHash: res.primaryTxHash,
          explorerUrl: res.explorerUrl,
          neonPersisted: res.neonPersisted,
          turns: res.agentThoughts.map((t) => ({
            agent: t.agentName,
            replyTo: t.replyToAgent,
            model: t.model,
            thought: t.thought,
          })),
        };
      }
    );

    return cycleResult;
  }
);
