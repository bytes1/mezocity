import { inngest } from "./client";
import { executeAutonomousMythicCycle } from "@/lib/gemini-agents";

/**
 * Durable 1-Hour Autonomous AI Crew Cron + Event Workflow (Inngest v4)
 * Triggers automatically every hour (`0 * * * *`) OR when `mezo/cycle.requested` is sent.
 * Runs the 5 Transformers Agents:
 *   1. Soundwave (Live Crypto & Macro Signal Interceptor - gemini-3.5-flash-lite)
 *   2. Optimus Prime (Head Orchestrator & Commander - gemini-3.8-flash)
 *   3. Bumblebee (BTC DCA & Treasury Scout - gemini-3.8-flash)
 *   4. Ratchet (Chief Medical Officer & Self-Healing Rectifier - gemini-3.8-flash)
 *   5. Ironhide (PolicyVault Guardrail & Security Enforcer - gemini-3.5-flash-lite)
 * And settles the decision live on Mezo Testnet (Chain ID 31611) while persisting to Neon Postgres.
 */
export const hourlyAutonomousDcaCycle = inngest.createFunction(
  {
    id: "hourly-autonomous-mythic-dca-cycle",
    name: "Hourly 5-Agent Transformers News & DCA Cycle (Mezo Testnet 31611)",
    retries: 2,
    triggers: [{ cron: "0 * * * *" }, { event: "mezo/cycle.requested" }],
  },
  async ({ event, step }) => {
    const rawData = (event?.data || {}) as {
      scenario?: string;
      scheduleId?: number;
      cycleUid?: string;
      triggerSource?: "INNGEST_HOURLY_CRON" | "INNGEST_EVENT";
      geminiApiKey?: string;
      databaseUrl?: string;
      userDirective?: string;
    };
    const scenario =
      rawData.scenario === "INTENTIONAL_OVERFLOW"
        ? ("INTENTIONAL_OVERFLOW" as const)
        : ("NORMAL_DCA" as const);

    const scheduleId =
      rawData.scheduleId !== undefined ? Number(rawData.scheduleId) : undefined;
    const isCronTrigger = !event?.name || event.name === "inngest/scheduled.timer";
    const resolvedTriggerSource = isCronTrigger
      ? ("INNGEST_HOURLY_CRON" as const)
      : rawData.triggerSource || ("INNGEST_EVENT" as const);

    const cycleResult = await step.run(
      "run-5-mythic-agents-and-settle-mezo-31611",
      async () => {
        const res = await executeAutonomousMythicCycle({
          scenario,
          scheduleId,
          cycleUid: rawData.cycleUid,
          triggerSource: resolvedTriggerSource,
          geminiApiKey: rawData.geminiApiKey,
          databaseUrl: rawData.databaseUrl,
          userDirective: rawData.userDirective,
        });

        return {
          cycleId: res.cycleId,
          triggerSource: res.triggerSource,
          decision: res.decision,
          decisionReason: res.decisionReason,
          executedOnChain: res.executedOnChain,
          actions: res.actions,
          mandate: res.mandate,
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
