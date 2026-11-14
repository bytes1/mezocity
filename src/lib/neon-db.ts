import { neon } from "@neondatabase/serverless";
import {
  AgentReasoningLog,
  CyclePhase,
  MythicAgentName,
  NewsItemHeadline,
} from "./simulation-data";

export type CycleTriggerSource =
  | "INNGEST_HOURLY_CRON"
  | "INNGEST_EVENT"
  | "HOURLY_CRON"
  | "MANUAL_UI"
  | "AUTO_TIMER"
  | "AUTO_LOOP";

export type MainDecisionType =
  | "EXECUTE_DCA"
  | "RECTIFY_AND_EXECUTE"
  | "HOLD"
  | "TUNE_POLICY_GUARDRAILS"
  | "ANCHOR_COUNCIL_DEBATE"
  | "RECORD_STRATEGIC_ALLOCATION"
  | "DEPOSIT_MUSD_VAULT"
  | "WITHDRAW_MUSD_VAULT"
  | "DEPLOY_EARN_VAULT"
  | "DEPLOY_TIGRIS_POOL"
  | "RESCUE_TROVE"
  | "SWEEP_OVERDUE_LOAN";

export interface MainActionResult {
  type: MainDecisionType;
  label: string;
  agent: MythicAgentName;
  txHash?: string;
  blockNumber?: string;
  status: "EXECUTED" | "BLOCKED" | "SKIPPED";
  detail: string;
  amountLabel?: string;
}

export type MainRiskMode = "CONSERVATIVE" | "BALANCED" | "GROWTH";

export interface MainStrategyMandate {
  mandateId: string;
  riskMode: MainRiskMode;
  targetMusdYieldPct: number;
  autoTuneGuardrails: boolean;
  autoRescueTrove: boolean;
  autoSweepDefaults: boolean;
  autoAnchorDebates: boolean;
  autoMusdYield: boolean;
  customDirectiveText: string;
  updatedAt: string;
}

export const DEFAULT_MAIN_STRATEGY_MANDATE: MainStrategyMandate = {
  mandateId: "default-main",
  riskMode: "BALANCED",
  targetMusdYieldPct: 30,
  autoTuneGuardrails: true,
  autoRescueTrove: true,
  autoSweepDefaults: true,
  autoAnchorDebates: true,
  autoMusdYield: true,
  customDirectiveText: "",
  updatedAt: new Date(0).toISOString(),
};

export interface StoredCycleRecord {
  cycleUid: string;
  triggerSource: CycleTriggerSource;
  mode: "NORMAL_DCA" | "ERROR_RECTIFY";
  status: CyclePhase | "COMPLETED" | "FAILED";
  btcPriceUsd: number;
  btc24hChangePct: number;
  newsHeadlines: NewsItemHeadline[];
  vaultTvlBtc: number;
  proposedSliceBtc: number;
  finalSliceBtc: number;
  wasRectified: boolean;
  decision: "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD";
  headline: string;
  proofHash: string;
  txHash: string;
  blockedTxHash?: string;
  blockNumber: string;
  actions?: MainActionResult[];
  createdAt: string;
  updatedAt: string;
  messages: AgentReasoningLog[];
}

export interface InngestRunTelemetry {
  inngestMode: "CLOUD_SIGNED" | "DEV_SERVER_ONLINE" | "DEV_SERVER_OFFLINE";
  inngestEndpoint: string;
  totalCycles: number;
  inngestCronRuns: number;
  inngestEventRuns: number;
  directRuns: number;
  completedRuns: number;
  failedRuns: number;
  activeCycle: {
    cycleUid: string;
    triggerSource: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  lastCronRunAt: string | null;
  lastCronDecision: string | null;
  lastEventRunAt: string | null;
  lastRunAt: string | null;
  lastRunTriggerSource: string | null;
  lastRunStatus: string | null;
}

const LEGACY_AGENT_NAME_MAP: Record<string, MythicAgentName> = {
  Indra: "Optimus Prime",
  Kubera: "Bumblebee",
  Dhanvantari: "Ratchet",
  Sudarshana: "Ironhide",
  Narada: "Soundwave",
  Aura: "Optimus Prime",
  Kronos: "Bumblebee",
  Patch: "Ratchet",
  Sentinel: "Ironhide",
};

function normalizeSpeakerName(raw: unknown): AgentReasoningLog["speaker"] {
  const s = String(raw || "Optimus Prime");
  if (s === "You") return "You";
  return LEGACY_AGENT_NAME_MAP[s] || (s as MythicAgentName);
}

function normalizeReplyTo(raw: unknown): string | undefined {
  if (!raw) return undefined;
  const s = String(raw);
  return LEGACY_AGENT_NAME_MAP[s] || s;
}

let runtimeDatabaseUrl: string = process.env.DATABASE_URL || "";
let tablesInitializedForUrl: string | null = null;

export function setRuntimeDatabaseUrl(url?: string) {
  if (url && url.trim().startsWith("postgres")) {
    runtimeDatabaseUrl = url.trim();
  }
}

export function getActiveDatabaseUrl(customDbUrl?: string): string {
  const raw = (
    customDbUrl ||
    process.env.DATABASE_URL ||
    runtimeDatabaseUrl ||
    ""
  ).trim();
  if (!raw) return "";
  // Clean channel_binding=require for @neondatabase/serverless HTTP driver compatibility
  return raw
    .replace(/&channel_binding=require/gi, "")
    .replace(/\?channel_binding=require&?/gi, "?");
}

export async function ensureNeonTables(customDbUrl?: string): Promise<boolean> {
  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    return false;
  }
  if (tablesInitializedForUrl === dbUrl) {
    return true;
  }

  try {
    const sql = neon(dbUrl);
    await sql`
      CREATE TABLE IF NOT EXISTS agent_cycles (
        cycle_uid TEXT PRIMARY KEY,
        trigger_source TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        btc_price_usd DOUBLE PRECISION DEFAULT 0,
        btc_24h_change_pct DOUBLE PRECISION DEFAULT 0,
        news_headlines_json TEXT DEFAULT '[]',
        vault_tvl_btc DOUBLE PRECISION DEFAULT 0,
        proposed_slice_btc DOUBLE PRECISION DEFAULT 0,
        final_slice_btc DOUBLE PRECISION DEFAULT 0,
        was_rectified BOOLEAN DEFAULT FALSE,
        decision TEXT DEFAULT 'EXECUTE_DCA',
        headline TEXT DEFAULT '',
        proof_hash TEXT DEFAULT '',
        tx_hash TEXT DEFAULT '',
        blocked_tx_hash TEXT DEFAULT '',
        block_number TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id SERIAL PRIMARY KEY,
        cycle_uid TEXT NOT NULL REFERENCES agent_cycles(cycle_uid) ON DELETE CASCADE,
        turn_index INTEGER NOT NULL,
        speaker TEXT NOT NULL,
        role_tag TEXT NOT NULL,
        ai_model TEXT NOT NULL,
        stance TEXT NOT NULL,
        reply_to TEXT DEFAULT '',
        message_text TEXT NOT NULL,
        badge_text TEXT NOT NULL,
        latency_ms INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS mezo_lending_guards (
        guard_id TEXT PRIMARY KEY,
        monitored_borrower TEXT NOT NULL,
        reserve_wallet TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ARMED',
        trigger_hf DOUBLE PRECISION NOT NULL DEFAULT 1.15,
        target_hf DOUBLE PRECISION NOT NULL DEFAULT 1.55,
        btc_reserve_share_pct INTEGER NOT NULL DEFAULT 20,
        rescues_gas_count INTEGER NOT NULL DEFAULT 5,
        collateral_btc DOUBLE PRECISION NOT NULL DEFAULT 0,
        debt_musd DOUBLE PRECISION NOT NULL DEFAULT 0,
        current_hf DOUBLE PRECISION NOT NULL DEFAULT 0,
        consecutive_breaches INTEGER NOT NULL DEFAULT 0,
        current_step INTEGER NOT NULL DEFAULT 1,
        daily_musd_cap DOUBLE PRECISION NOT NULL DEFAULT 0,
        daily_btc_cap DOUBLE PRECISION NOT NULL DEFAULT 0.05,
        session_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS mezo_lending_rescue_logs (
        id SERIAL PRIMARY KEY,
        guard_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        observed_hf DOUBLE PRECISION NOT NULL,
        restored_hf DOUBLE PRECISION NOT NULL,
        repay_musd DOUBLE PRECISION NOT NULL DEFAULT 0,
        supplied_btc DOUBLE PRECISION NOT NULL DEFAULT 0,
        allowance_reset BOOLEAN NOT NULL DEFAULT FALSE,
        tx_hash TEXT DEFAULT '',
        summary TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      ALTER TABLE agent_cycles
      ADD COLUMN IF NOT EXISTS decisions_json TEXT DEFAULT '[]';
    `;

    await sql`
      ALTER TABLE mezo_lending_guards
      ADD COLUMN IF NOT EXISTS delegated_sig_type TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS delegated_sig_hex TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS delegated_sig_amount_wei TEXT DEFAULT '0',
      ADD COLUMN IF NOT EXISTS delegated_sig_nonce INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delegated_sig_deadline BIGINT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delegated_sig_signer TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS delegated_sig_tx_hash TEXT DEFAULT '';
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS main_strategy_mandates (
        mandate_id TEXT PRIMARY KEY DEFAULT 'default-main',
        risk_mode TEXT NOT NULL DEFAULT 'BALANCED',
        target_musd_yield_pct INTEGER NOT NULL DEFAULT 30,
        auto_tune_guardrails BOOLEAN NOT NULL DEFAULT TRUE,
        auto_rescue_trove BOOLEAN NOT NULL DEFAULT TRUE,
        auto_sweep_defaults BOOLEAN NOT NULL DEFAULT TRUE,
        auto_anchor_debates BOOLEAN NOT NULL DEFAULT TRUE,
        auto_musd_yield BOOLEAN NOT NULL DEFAULT TRUE,
        custom_directive_text TEXT DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // Remove any previously seeded genesis/placeholder rows so only 100% real cycles exist
    await sql`
      DELETE FROM agent_cycles WHERE cycle_uid LIKE 'cycle-genesis-%';
    `;

    tablesInitializedForUrl = dbUrl;
    return true;
  } catch (err) {
    console.error("Neon Postgres initialization error:", err);
    return false;
  }
}

export async function createCycleInNeon(
  record: Omit<StoredCycleRecord, "messages" | "createdAt" | "updatedAt">,
  customDbUrl?: string
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    throw new Error("DATABASE_URL is not configured for Neon Serverless Postgres");
  }

  await ensureNeonTables(dbUrl);
  const sql = neon(dbUrl);
  await sql`
    INSERT INTO agent_cycles (
      cycle_uid,
      trigger_source,
      mode,
      status,
      btc_price_usd,
      btc_24h_change_pct,
      news_headlines_json,
      vault_tvl_btc,
      proposed_slice_btc,
      final_slice_btc,
      was_rectified,
      decision,
      headline,
      proof_hash,
      tx_hash,
      blocked_tx_hash,
      block_number,
      decisions_json
    ) VALUES (
      ${record.cycleUid},
      ${record.triggerSource},
      ${record.mode},
      ${record.status},
      ${record.btcPriceUsd},
      ${record.btc24hChangePct},
      ${JSON.stringify(record.newsHeadlines || [])},
      ${record.vaultTvlBtc},
      ${record.proposedSliceBtc},
      ${record.finalSliceBtc},
      ${record.wasRectified},
      ${record.decision},
      ${record.headline},
      ${record.proofHash},
      ${record.txHash},
      ${record.blockedTxHash || ""},
      ${record.blockNumber},
      ${JSON.stringify(record.actions || [])}
    )
    ON CONFLICT (cycle_uid) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = NOW();
  `;
}

export async function appendAgentTurnToNeon(
  params: {
    cycleUid: string;
    turnIndex: number;
    nextStatus: CyclePhase | "COMPLETED" | "FAILED";
    log: AgentReasoningLog;
    headline?: string;
    proposedSliceBtc?: number;
    finalSliceBtc?: number;
    wasRectified?: boolean;
    newsHeadlines?: NewsItemHeadline[];
  },
  customDbUrl?: string
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    throw new Error("DATABASE_URL is not configured for Neon Serverless Postgres");
  }

  await ensureNeonTables(dbUrl);
  const sql = neon(dbUrl);
  await sql`
    INSERT INTO agent_messages (
      cycle_uid,
      turn_index,
      speaker,
      role_tag,
      ai_model,
      stance,
      reply_to,
      message_text,
      badge_text,
      latency_ms
    ) VALUES (
      ${params.cycleUid},
      ${params.turnIndex},
      ${params.log.speaker},
      ${params.log.roleTag},
      ${params.log.aiModel},
      ${params.log.stance},
      ${params.log.replyTo || ""},
      ${params.log.text},
      ${params.log.badgeText},
      ${params.log.latencyMs || 0}
    );
  `;

  const serializedHeadlines =
    params.newsHeadlines && params.newsHeadlines.length > 0
      ? JSON.stringify(params.newsHeadlines)
      : null;

  await sql`
    UPDATE agent_cycles
    SET
      status = ${params.nextStatus},
      headline = COALESCE(${params.headline || null}, headline),
      news_headlines_json = COALESCE(${serializedHeadlines}, news_headlines_json),
      proposed_slice_btc = COALESCE(${
        params.proposedSliceBtc ?? null
      }, proposed_slice_btc),
      final_slice_btc = COALESCE(${
        params.finalSliceBtc ?? null
      }, final_slice_btc),
      was_rectified = COALESCE(${
        params.wasRectified ?? null
      }, was_rectified),
      updated_at = NOW()
    WHERE cycle_uid = ${params.cycleUid};
  `;
}

function parseStoredActionsJson(raw: unknown): MainActionResult[] {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? (parsed as MainActionResult[]) : [];
  } catch {
    return [];
  }
}

export async function finalizeCycleInNeon(
  params: {
    cycleUid: string;
    status: "COMPLETED" | "FAILED";
    decision: "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD";
    headline: string;
    finalSliceBtc: number;
    wasRectified: boolean;
    proofHash: string;
    txHash: string;
    blockedTxHash?: string;
    blockNumber: string;
    actions?: MainActionResult[];
  },
  customDbUrl?: string
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    throw new Error("DATABASE_URL is not configured for Neon Serverless Postgres");
  }

  await ensureNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const decisionsJson = JSON.stringify(params.actions || []);
  await sql`
    UPDATE agent_cycles
    SET
      status = ${params.status},
      decision = ${params.decision},
      headline = ${params.headline},
      final_slice_btc = ${params.finalSliceBtc},
      was_rectified = ${params.wasRectified},
      proof_hash = ${params.proofHash},
      tx_hash = ${params.txHash},
      blocked_tx_hash = ${params.blockedTxHash || ""},
      block_number = ${params.blockNumber},
      decisions_json = ${decisionsJson},
      updated_at = NOW()
    WHERE cycle_uid = ${params.cycleUid};
  `;
}

export async function getLatestCyclesFromNeon(
  limit = 6,
  customDbUrl?: string
): Promise<{
  neonConnected: boolean;
  latestCycle: StoredCycleRecord | null;
  history: StoredCycleRecord[];
}> {
  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    return {
      neonConnected: false,
      latestCycle: null,
      history: [],
    };
  }

  try {
    const ok = await ensureNeonTables(dbUrl);
    if (!ok) {
      return {
        neonConnected: false,
        latestCycle: null,
        history: [],
      };
    }

    const sql = neon(dbUrl);
    const cycleRows = await sql`
      SELECT *
      FROM agent_cycles
      ORDER BY created_at DESC
      LIMIT ${limit};
    `;

    if (!cycleRows || cycleRows.length === 0) {
      return {
        neonConnected: true,
        latestCycle: null,
        history: [],
      };
    }

    const cycleUids = cycleRows.map((r) => String(r.cycle_uid));
    const msgRows = await sql`
      SELECT *
      FROM agent_messages
      WHERE cycle_uid = ANY(${cycleUids})
      ORDER BY turn_index ASC, id ASC;
    `;

    const msgsByCycle = new Map<string, AgentReasoningLog[]>();
    for (const m of msgRows) {
      const uid = String(m.cycle_uid);
      const list = msgsByCycle.get(uid) || [];
      list.push({
        id: `neon-${m.id}`,
        speaker: normalizeSpeakerName(m.speaker),
        roleTag: String(m.role_tag || "Agent"),
        aiModel: String(m.ai_model || "gemini-3.8-flash"),
        stance: (m.stance as AgentReasoningLog["stance"]) || "HEAD",
        replyTo: normalizeReplyTo(m.reply_to),
        text: String(m.message_text || ""),
        timestamp: m.created_at
          ? new Date(String(m.created_at)).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : "",
        badgeText: String(m.badge_text || "Verified"),
        latencyMs: Number(m.latency_ms || 0),
      });
      msgsByCycle.set(uid, list);
    }

    const history: StoredCycleRecord[] = cycleRows.map((r) => {
      let parsedNews: NewsItemHeadline[] = [];
      try {
        parsedNews = JSON.parse(String(r.news_headlines_json || "[]"));
      } catch {
        parsedNews = [];
      }
      const uid = String(r.cycle_uid);
      return {
        cycleUid: uid,
        triggerSource:
          (r.trigger_source as StoredCycleRecord["triggerSource"]) ||
          "MANUAL_UI",
        mode: (r.mode as StoredCycleRecord["mode"]) || "NORMAL_DCA",
        status: (r.status as StoredCycleRecord["status"]) || "COMPLETED",
        btcPriceUsd: Number(r.btc_price_usd || 0),
        btc24hChangePct: Number(r.btc_24h_change_pct || 0),
        newsHeadlines: parsedNews,
        vaultTvlBtc: Number(r.vault_tvl_btc || 0),
        proposedSliceBtc: Number(r.proposed_slice_btc || 0),
        finalSliceBtc: Number(r.final_slice_btc || 0),
        wasRectified: Boolean(r.was_rectified),
        decision:
          (r.decision as StoredCycleRecord["decision"]) || "EXECUTE_DCA",
        headline: String(r.headline || ""),
        proofHash: String(r.proof_hash || ""),
        txHash: String(r.tx_hash || ""),
        blockedTxHash: r.blocked_tx_hash
          ? String(r.blocked_tx_hash)
          : undefined,
        blockNumber: String(r.block_number || ""),
        actions: parseStoredActionsJson(r.decisions_json),
        createdAt: String(r.created_at || ""),
        updatedAt: String(r.updated_at || ""),
        messages: msgsByCycle.get(uid) || [],
      };
    });

    return {
      neonConnected: true,
      latestCycle: history[0] || null,
      history,
    };
  } catch (err) {
    console.error("getLatestCyclesFromNeon error:", err);
    return {
      neonConnected: false,
      latestCycle: null,
      history: [],
    };
  }
}

export async function markCycleFailedInNeon(
  cycleUid: string,
  errorReason: string,
  customDbUrl?: string
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) return;
  try {
    await ensureNeonTables(dbUrl);
    const sql = neon(dbUrl);
    await sql`
      UPDATE agent_cycles
      SET
        status = 'FAILED',
        headline = ${`Cycle failed: ${errorReason.slice(0, 180)}`},
        updated_at = NOW()
      WHERE cycle_uid = ${cycleUid};
    `;
  } catch (err) {
    console.error("markCycleFailedInNeon error:", err);
  }
}

export async function getCycleByUidFromNeon(
  cycleUid: string,
  customDbUrl?: string
): Promise<StoredCycleRecord | null> {
  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres") || !cycleUid) return null;
  try {
    const ok = await ensureNeonTables(dbUrl);
    if (!ok) return null;
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT *
      FROM agent_cycles
      WHERE cycle_uid = ${cycleUid}
      LIMIT 1;
    `;
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    const msgRows = await sql`
      SELECT *
      FROM agent_messages
      WHERE cycle_uid = ${cycleUid}
      ORDER BY turn_index ASC, id ASC;
    `;
    let parsedNews: NewsItemHeadline[] = [];
    try {
      parsedNews = JSON.parse(String(r.news_headlines_json || "[]"));
    } catch {
      parsedNews = [];
    }
    return {
      cycleUid: String(r.cycle_uid),
      triggerSource:
        (r.trigger_source as CycleTriggerSource) || "MANUAL_UI",
      mode: (r.mode as StoredCycleRecord["mode"]) || "NORMAL_DCA",
      status: (r.status as StoredCycleRecord["status"]) || "COMPLETED",
      btcPriceUsd: Number(r.btc_price_usd || 0),
      btc24hChangePct: Number(r.btc_24h_change_pct || 0),
      newsHeadlines: parsedNews,
      vaultTvlBtc: Number(r.vault_tvl_btc || 0),
      proposedSliceBtc: Number(r.proposed_slice_btc || 0),
      finalSliceBtc: Number(r.final_slice_btc || 0),
      wasRectified: Boolean(r.was_rectified),
      decision:
        (r.decision as StoredCycleRecord["decision"]) || "EXECUTE_DCA",
      headline: String(r.headline || ""),
      proofHash: String(r.proof_hash || ""),
      txHash: String(r.tx_hash || ""),
      blockedTxHash: r.blocked_tx_hash ? String(r.blocked_tx_hash) : undefined,
      blockNumber: String(r.block_number || ""),
      actions: parseStoredActionsJson(r.decisions_json),
      createdAt: String(r.created_at || ""),
      updatedAt: String(r.updated_at || ""),
      messages: msgRows.map((m) => ({
        id: `neon-${m.id}`,
        speaker: normalizeSpeakerName(m.speaker),
        roleTag: String(m.role_tag || "Agent"),
        aiModel: String(m.ai_model || "gemini-3.8-flash"),
        stance: (m.stance as AgentReasoningLog["stance"]) || "HEAD",
        replyTo: normalizeReplyTo(m.reply_to),
        text: String(m.message_text || ""),
        timestamp: m.created_at
          ? new Date(String(m.created_at)).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : "",
        badgeText: String(m.badge_text || "Verified"),
        latencyMs: Number(m.latency_ms || 0),
      })),
    };
  } catch (err) {
    console.error("getCycleByUidFromNeon error:", err);
    return null;
  }
}

export async function checkInngestEndpointStatus(): Promise<{
  mode: InngestRunTelemetry["inngestMode"];
  endpoint: string;
}> {
  if (process.env.INNGEST_SIGNING_KEY && process.env.INNGEST_EVENT_KEY) {
    return {
      mode: "CLOUD_SIGNED",
      endpoint: "https://inn.gs (Inngest Cloud)",
    };
  }

  const devBaseUrl = (
    process.env.INNGEST_BASE_URL || "http://127.0.0.1:8288"
  ).replace(/\/$/, "");
  try {
    const res = await fetch(`${devBaseUrl}/dev`, {
      signal: AbortSignal.timeout(700),
      cache: "no-store",
    });
    if (res.ok || res.status < 500) {
      return {
        mode: "DEV_SERVER_ONLINE",
        endpoint: devBaseUrl,
      };
    }
  } catch {
    // Dev server unreachable
  }

  return {
    mode: "DEV_SERVER_OFFLINE",
    endpoint: devBaseUrl,
  };
}

export async function getInngestRunTelemetry(
  customDbUrl?: string
): Promise<InngestRunTelemetry> {
  const endpointInfo = await checkInngestEndpointStatus();
  const emptyTelemetry: InngestRunTelemetry = {
    inngestMode: endpointInfo.mode,
    inngestEndpoint: endpointInfo.endpoint,
    totalCycles: 0,
    inngestCronRuns: 0,
    inngestEventRuns: 0,
    directRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    activeCycle: null,
    lastCronRunAt: null,
    lastCronDecision: null,
    lastEventRunAt: null,
    lastRunAt: null,
    lastRunTriggerSource: null,
    lastRunStatus: null,
  };

  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) return emptyTelemetry;

  try {
    const ok = await ensureNeonTables(dbUrl);
    if (!ok) return emptyTelemetry;
    const sql = neon(dbUrl);

    const [aggRows, lastCronRows, lastEventRows, lastAnyRows, activeRows] =
      await Promise.all([
        sql`
          SELECT
            COUNT(*)::int AS total_cycles,
            COUNT(*) FILTER (WHERE trigger_source IN ('INNGEST_HOURLY_CRON', 'HOURLY_CRON'))::int AS cron_runs,
            COUNT(*) FILTER (WHERE trigger_source = 'INNGEST_EVENT')::int AS event_runs,
            COUNT(*) FILTER (WHERE trigger_source IN ('MANUAL_UI', 'AUTO_TIMER', 'AUTO_LOOP'))::int AS direct_runs,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_runs,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_runs
          FROM agent_cycles;
        `,
        sql`
          SELECT created_at, decision
          FROM agent_cycles
          WHERE trigger_source IN ('INNGEST_HOURLY_CRON', 'HOURLY_CRON')
          ORDER BY created_at DESC
          LIMIT 1;
        `,
        sql`
          SELECT created_at
          FROM agent_cycles
          WHERE trigger_source = 'INNGEST_EVENT'
          ORDER BY created_at DESC
          LIMIT 1;
        `,
        sql`
          SELECT created_at, trigger_source, status
          FROM agent_cycles
          ORDER BY created_at DESC
          LIMIT 1;
        `,
        sql`
          SELECT cycle_uid, trigger_source, status, created_at, updated_at
          FROM agent_cycles
          WHERE status NOT IN ('COMPLETED', 'FAILED')
            AND updated_at > NOW() - INTERVAL '10 minutes'
          ORDER BY updated_at DESC
          LIMIT 1;
        `,
      ]);

    const agg = aggRows[0] || {};
    const lastCron = lastCronRows[0];
    const lastEvent = lastEventRows[0];
    const lastAny = lastAnyRows[0];
    const active = activeRows[0];

    return {
      inngestMode: endpointInfo.mode,
      inngestEndpoint: endpointInfo.endpoint,
      totalCycles: Number(agg.total_cycles || 0),
      inngestCronRuns: Number(agg.cron_runs || 0),
      inngestEventRuns: Number(agg.event_runs || 0),
      directRuns: Number(agg.direct_runs || 0),
      completedRuns: Number(agg.completed_runs || 0),
      failedRuns: Number(agg.failed_runs || 0),
      activeCycle: active
        ? {
            cycleUid: String(active.cycle_uid),
            triggerSource: String(active.trigger_source),
            status: String(active.status),
            createdAt: String(active.created_at),
            updatedAt: String(active.updated_at),
          }
        : null,
      lastCronRunAt: lastCron?.created_at ? String(lastCron.created_at) : null,
      lastCronDecision: lastCron?.decision ? String(lastCron.decision) : null,
      lastEventRunAt: lastEvent?.created_at
        ? String(lastEvent.created_at)
        : null,
      lastRunAt: lastAny?.created_at ? String(lastAny.created_at) : null,
      lastRunTriggerSource: lastAny?.trigger_source
        ? String(lastAny.trigger_source)
        : null,
      lastRunStatus: lastAny?.status ? String(lastAny.status) : null,
    };
  } catch (err) {
    console.error("getInngestRunTelemetry error:", err);
    return emptyTelemetry;
  }
}

export interface StoredLendingGuardConfig {
  guardId: string;
  monitoredBorrower: string;
  reserveWallet: string;
  status: "PREVIEW" | "ARMED" | "PAUSED" | "RETIRED" | "RECOVERED";
  triggerHf: number;
  targetHf: number;
  btcReserveSharePct: number;
  rescuesGasCount: number;
  collateralBtc: number;
  debtMusd: number;
  currentHf: number;
  consecutiveBreaches: number;
  currentStep: number;
  dailyMusdCap: number;
  dailyBtcCap: number;
  sessionExpiresAt: string;
  delegatedSigType?: "REPAY_MUSD" | "ADD_COLL" | "";
  delegatedSigHex?: string;
  delegatedSigAmountWei?: string;
  delegatedSigNonce?: number;
  delegatedSigDeadline?: number;
  delegatedSigSigner?: string;
  delegatedSigTxHash?: string;
  updatedAt: string;
}

export interface StoredLendingRescueLog {
  id: number;
  guardId: string;
  stepNumber: number;
  actionType:
    | "OBSERVATION"
    | "BORROW_MUSD"
    | "REPAY_DEBT"
    | "SUPPLY_COLLATERAL"
    | "CLAIM_REWARDS"
    | "CLAIM_THEN_REPAY"
    | "REFUSAL"
    | "ARMED"
    | "PAUSED"
    | "RECOVERED";
  observedHf: number;
  restoredHf: number;
  repayMusd: number;
  suppliedBtc: number;
  allowanceReset: boolean;
  txHash: string;
  summary: string;
  createdAt: string;
}

export async function clearSyntheticLendingGuardsInNeon(
  guardId = "singleton-mezo-guard"
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return;
  try {
    await ensureNeonTables(dbUrl);
    const sql = neon(dbUrl);

    // Check if there is any real borrow transaction backing this guard
    const realBorrowLogs = await sql`
      SELECT id FROM mezo_lending_rescue_logs
      WHERE guard_id = ${guardId}
        AND tx_hash IS NOT NULL
        AND tx_hash <> ''
        AND (action_type = 'BORROW_MUSD' OR summary ILIKE '%Borrowed%' OR summary ILIKE '%openTrove%')
      LIMIT 1;
    `;

    const hasRealBorrowTx = realBorrowLogs && realBorrowLogs.length > 0;

    if (!hasRealBorrowTx) {
      // Remove synthetic placeholder logs that have no tx_hash and reference old seeded 1.44 HF or 0x7F4e9B...
      await sql`
        DELETE FROM mezo_lending_rescue_logs
        WHERE guard_id = ${guardId}
          AND (tx_hash IS NULL OR tx_hash = '')
          AND (
            observed_hf = 1.44
            OR restored_hf = 1.44
            OR summary ILIKE '%HF 1.44%'
            OR summary ILIKE '%0x7F4e9B21%'
          );
      `;

      // Delete or reset any old seeded row with monitored_borrower = '0x7F4e9B21C8a4D82910E3b5119E82c7d9104A2B19' or debt_musd = 8200
      await sql`
        DELETE FROM mezo_lending_guards
        WHERE guard_id = ${guardId}
          AND (
            LOWER(monitored_borrower) = LOWER('0x7F4e9B21C8a4D82910E3b5119E82c7d9104A2B19')
            OR debt_musd = 8200
          );
      `;
    }
  } catch (err) {
    console.error("clearSyntheticLendingGuardsInNeon error:", err);
  }
}

export async function getLendingGuardStateFromNeon(
  guardId = "singleton-mezo-guard"
): Promise<{
  guard: StoredLendingGuardConfig | null;
  logs: StoredLendingRescueLog[];
}> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    return { guard: null, logs: [] };
  }
  try {
    const ok = await ensureNeonTables(dbUrl);
    if (!ok) return { guard: null, logs: [] };

    await clearSyntheticLendingGuardsInNeon(guardId);

    const sql = neon(dbUrl);

    const [guardRows, logRows] = await Promise.all([
      sql`
        SELECT * FROM mezo_lending_guards
        WHERE guard_id = ${guardId}
        LIMIT 1;
      `,
      sql`
        SELECT * FROM mezo_lending_rescue_logs
        WHERE guard_id = ${guardId}
        ORDER BY id DESC
        LIMIT 25;
      `,
    ]);

    const g = guardRows[0];
    const guard: StoredLendingGuardConfig | null = g
      ? {
          guardId: String(g.guard_id),
          monitoredBorrower: String(g.monitored_borrower),
          reserveWallet: String(g.reserve_wallet),
          status: (g.status as StoredLendingGuardConfig["status"]) || "ARMED",
          triggerHf:
            g.trigger_hf !== null && g.trigger_hf !== undefined
              ? Number(g.trigger_hf)
              : 1.15,
          targetHf:
            g.target_hf !== null && g.target_hf !== undefined
              ? Number(g.target_hf)
              : 1.55,
          btcReserveSharePct:
            g.btc_reserve_share_pct !== null &&
            g.btc_reserve_share_pct !== undefined
              ? Number(g.btc_reserve_share_pct)
              : 20,
          rescuesGasCount:
            g.rescues_gas_count !== null && g.rescues_gas_count !== undefined
              ? Number(g.rescues_gas_count)
              : 5,
          collateralBtc:
            g.collateral_btc !== null && g.collateral_btc !== undefined
              ? Number(g.collateral_btc)
              : 0,
          debtMusd:
            g.debt_musd !== null && g.debt_musd !== undefined
              ? Number(g.debt_musd)
              : 0,
          currentHf:
            g.current_hf !== null && g.current_hf !== undefined
              ? Number(g.current_hf)
              : 0,
          consecutiveBreaches:
            g.consecutive_breaches !== null &&
            g.consecutive_breaches !== undefined
              ? Number(g.consecutive_breaches)
              : 0,
          currentStep:
            g.current_step !== null && g.current_step !== undefined
              ? Number(g.current_step)
              : 1,
          dailyMusdCap:
            g.daily_musd_cap !== null && g.daily_musd_cap !== undefined
              ? Number(g.daily_musd_cap)
              : 0,
          dailyBtcCap:
            g.daily_btc_cap !== null && g.daily_btc_cap !== undefined
              ? Number(g.daily_btc_cap)
              : 0.05,
          sessionExpiresAt: g.session_expires_at
            ? new Date(g.session_expires_at).toISOString()
            : new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
          delegatedSigType:
            (String(g.delegated_sig_type || "") as StoredLendingGuardConfig["delegatedSigType"]) || "",
          delegatedSigHex: String(g.delegated_sig_hex || ""),
          delegatedSigAmountWei: String(g.delegated_sig_amount_wei || "0"),
          delegatedSigNonce:
            g.delegated_sig_nonce !== null && g.delegated_sig_nonce !== undefined
              ? Number(g.delegated_sig_nonce)
              : 0,
          delegatedSigDeadline:
            g.delegated_sig_deadline !== null && g.delegated_sig_deadline !== undefined
              ? Number(g.delegated_sig_deadline)
              : 0,
          delegatedSigSigner: String(g.delegated_sig_signer || ""),
          delegatedSigTxHash: String(g.delegated_sig_tx_hash || ""),
          updatedAt: g.updated_at
            ? new Date(g.updated_at).toISOString()
            : new Date().toISOString(),
        }
      : null;

    const logs: StoredLendingRescueLog[] = logRows.map((r) => ({
      id: Number(r.id),
      guardId: String(r.guard_id),
      stepNumber:
        r.step_number !== null && r.step_number !== undefined
          ? Number(r.step_number)
          : 1,
      actionType:
        (r.action_type as StoredLendingRescueLog["actionType"]) || "OBSERVATION",
      observedHf:
        r.observed_hf !== null && r.observed_hf !== undefined
          ? Number(r.observed_hf)
          : 0,
      restoredHf:
        r.restored_hf !== null && r.restored_hf !== undefined
          ? Number(r.restored_hf)
          : 0,
      repayMusd:
        r.repay_musd !== null && r.repay_musd !== undefined
          ? Number(r.repay_musd)
          : 0,
      suppliedBtc:
        r.supplied_btc !== null && r.supplied_btc !== undefined
          ? Number(r.supplied_btc)
          : 0,
      allowanceReset: Boolean(r.allowance_reset),
      txHash: String(r.tx_hash || ""),
      summary: String(r.summary || ""),
      createdAt: r.created_at
        ? new Date(r.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
    }));

    return { guard, logs };
  } catch (err) {
    console.error("getLendingGuardStateFromNeon error:", err);
    return { guard: null, logs: [] };
  }
}

export async function upsertLendingGuardInNeon(
  config: Omit<StoredLendingGuardConfig, "updatedAt">
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return;
  try {
    await ensureNeonTables(dbUrl);
    const sql = neon(dbUrl);
    await sql`
      INSERT INTO mezo_lending_guards (
        guard_id,
        monitored_borrower,
        reserve_wallet,
        status,
        trigger_hf,
        target_hf,
        btc_reserve_share_pct,
        rescues_gas_count,
        collateral_btc,
        debt_musd,
        current_hf,
        consecutive_breaches,
        current_step,
        daily_musd_cap,
        daily_btc_cap,
        session_expires_at,
        updated_at
      ) VALUES (
        ${config.guardId},
        ${config.monitoredBorrower},
        ${config.reserveWallet},
        ${config.status},
        ${config.triggerHf},
        ${config.targetHf},
        ${config.btcReserveSharePct},
        ${config.rescuesGasCount},
        ${config.collateralBtc},
        ${config.debtMusd},
        ${config.currentHf},
        ${config.consecutiveBreaches},
        ${config.currentStep},
        ${config.dailyMusdCap},
        ${config.dailyBtcCap},
        ${config.sessionExpiresAt},
        NOW()
      )
      ON CONFLICT (guard_id) DO UPDATE SET
        monitored_borrower = EXCLUDED.monitored_borrower,
        reserve_wallet = EXCLUDED.reserve_wallet,
        status = EXCLUDED.status,
        trigger_hf = EXCLUDED.trigger_hf,
        target_hf = EXCLUDED.target_hf,
        btc_reserve_share_pct = EXCLUDED.btc_reserve_share_pct,
        rescues_gas_count = EXCLUDED.rescues_gas_count,
        collateral_btc = EXCLUDED.collateral_btc,
        debt_musd = EXCLUDED.debt_musd,
        current_hf = EXCLUDED.current_hf,
        consecutive_breaches = EXCLUDED.consecutive_breaches,
        current_step = EXCLUDED.current_step,
        daily_musd_cap = EXCLUDED.daily_musd_cap,
        daily_btc_cap = EXCLUDED.daily_btc_cap,
        session_expires_at = EXCLUDED.session_expires_at,
        updated_at = NOW();
    `;
  } catch (err) {
    console.error("upsertLendingGuardInNeon error:", err);
  }
}

export async function updateLendingGuardEip712PermitInNeon(params: {
  guardId?: string;
  sigType: "REPAY_MUSD" | "ADD_COLL" | "";
  sigHex: string;
  amountWei: string;
  nonce: number;
  deadline: number;
  signer: string;
  txHash?: string;
}): Promise<void> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return;
  try {
    await ensureNeonTables(dbUrl);
    const sql = neon(dbUrl);
    const guardId = params.guardId || "singleton-mezo-guard";
    await sql`
      UPDATE mezo_lending_guards
      SET
        delegated_sig_type = ${params.sigType},
        delegated_sig_hex = ${params.sigHex},
        delegated_sig_amount_wei = ${params.amountWei},
        delegated_sig_nonce = ${params.nonce},
        delegated_sig_deadline = ${params.deadline},
        delegated_sig_signer = ${params.signer},
        delegated_sig_tx_hash = COALESCE(NULLIF(${params.txHash || ""}, ''), delegated_sig_tx_hash),
        updated_at = NOW()
      WHERE guard_id = ${guardId};
    `;
  } catch (err) {
    console.error("updateLendingGuardEip712PermitInNeon error:", err);
  }
}

export async function appendLendingRescueLogInNeon(
  entry: Omit<StoredLendingRescueLog, "id" | "createdAt">
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return;
  try {
    await ensureNeonTables(dbUrl);
    const sql = neon(dbUrl);
    await sql`
      INSERT INTO mezo_lending_rescue_logs (
        guard_id,
        step_number,
        action_type,
        observed_hf,
        restored_hf,
        repay_musd,
        supplied_btc,
        allowance_reset,
        tx_hash,
        summary
      ) VALUES (
        ${entry.guardId},
        ${entry.stepNumber},
        ${entry.actionType},
        ${entry.observedHf},
        ${entry.restoredHf},
        ${entry.repayMusd},
        ${entry.suppliedBtc},
        ${entry.allowanceReset},
        ${entry.txHash},
        ${entry.summary}
      );
    `;
  } catch (err) {
    console.error("appendLendingRescueLogInNeon error:", err);
  }
}

function normalizeRiskMode(raw: unknown): MainRiskMode {
  const upper = String(raw || "BALANCED").toUpperCase();
  if (upper === "CONSERVATIVE" || upper === "GROWTH") {
    return upper;
  }
  return "BALANCED";
}

function rowToMainStrategyMandate(row: Record<string, unknown>): MainStrategyMandate {
  return {
    mandateId: String(row.mandate_id || "default-main"),
    riskMode: normalizeRiskMode(row.risk_mode),
    targetMusdYieldPct: Math.min(80, Math.max(0, Number(row.target_musd_yield_pct ?? 30))),
    autoTuneGuardrails: Boolean(row.auto_tune_guardrails ?? true),
    autoRescueTrove: Boolean(row.auto_rescue_trove ?? true),
    autoSweepDefaults: Boolean(row.auto_sweep_defaults ?? true),
    autoAnchorDebates: Boolean(row.auto_anchor_debates ?? true),
    autoMusdYield: Boolean(row.auto_musd_yield ?? true),
    customDirectiveText: String(row.custom_directive_text || ""),
    updatedAt: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
  };
}

export async function getMainStrategyMandateFromNeon(
  customDbUrl?: string
): Promise<MainStrategyMandate> {
  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    return { ...DEFAULT_MAIN_STRATEGY_MANDATE };
  }
  try {
    const ok = await ensureNeonTables(dbUrl);
    if (!ok) return { ...DEFAULT_MAIN_STRATEGY_MANDATE };
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT *
      FROM main_strategy_mandates
      WHERE mandate_id = 'default-main'
      LIMIT 1;
    `;
    if (rows && rows.length > 0) {
      return rowToMainStrategyMandate(rows[0] as Record<string, unknown>);
    }
    await sql`
      INSERT INTO main_strategy_mandates (mandate_id)
      VALUES ('default-main')
      ON CONFLICT (mandate_id) DO NOTHING;
    `;
    return { ...DEFAULT_MAIN_STRATEGY_MANDATE, updatedAt: new Date().toISOString() };
  } catch (err) {
    console.error("getMainStrategyMandateFromNeon error:", err);
    return { ...DEFAULT_MAIN_STRATEGY_MANDATE };
  }
}

export async function upsertMainStrategyMandateInNeon(
  patch: Partial<Omit<MainStrategyMandate, "mandateId" | "updatedAt">>,
  customDbUrl?: string
): Promise<MainStrategyMandate> {
  const current = await getMainStrategyMandateFromNeon(customDbUrl);
  const next: MainStrategyMandate = {
    mandateId: "default-main",
    riskMode: normalizeRiskMode(patch.riskMode ?? current.riskMode),
    targetMusdYieldPct: Math.min(
      80,
      Math.max(0, Math.round(Number(patch.targetMusdYieldPct ?? current.targetMusdYieldPct)))
    ),
    autoTuneGuardrails:
      patch.autoTuneGuardrails !== undefined
        ? Boolean(patch.autoTuneGuardrails)
        : current.autoTuneGuardrails,
    autoRescueTrove:
      patch.autoRescueTrove !== undefined
        ? Boolean(patch.autoRescueTrove)
        : current.autoRescueTrove,
    autoSweepDefaults:
      patch.autoSweepDefaults !== undefined
        ? Boolean(patch.autoSweepDefaults)
        : current.autoSweepDefaults,
    autoAnchorDebates:
      patch.autoAnchorDebates !== undefined
        ? Boolean(patch.autoAnchorDebates)
        : current.autoAnchorDebates,
    autoMusdYield:
      patch.autoMusdYield !== undefined ? Boolean(patch.autoMusdYield) : current.autoMusdYield,
    customDirectiveText:
      patch.customDirectiveText !== undefined
        ? String(patch.customDirectiveText).trim().slice(0, 280)
        : current.customDirectiveText,
    updatedAt: new Date().toISOString(),
  };

  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    return next;
  }

  try {
    await ensureNeonTables(dbUrl);
    const sql = neon(dbUrl);
    await sql`
      INSERT INTO main_strategy_mandates (
        mandate_id,
        risk_mode,
        target_musd_yield_pct,
        auto_tune_guardrails,
        auto_rescue_trove,
        auto_sweep_defaults,
        auto_anchor_debates,
        auto_musd_yield,
        custom_directive_text,
        updated_at
      ) VALUES (
        'default-main',
        ${next.riskMode},
        ${next.targetMusdYieldPct},
        ${next.autoTuneGuardrails},
        ${next.autoRescueTrove},
        ${next.autoSweepDefaults},
        ${next.autoAnchorDebates},
        ${next.autoMusdYield},
        ${next.customDirectiveText},
        NOW()
      )
      ON CONFLICT (mandate_id) DO UPDATE SET
        risk_mode = EXCLUDED.risk_mode,
        target_musd_yield_pct = EXCLUDED.target_musd_yield_pct,
        auto_tune_guardrails = EXCLUDED.auto_tune_guardrails,
        auto_rescue_trove = EXCLUDED.auto_rescue_trove,
        auto_sweep_defaults = EXCLUDED.auto_sweep_defaults,
        auto_anchor_debates = EXCLUDED.auto_anchor_debates,
        auto_musd_yield = EXCLUDED.auto_musd_yield,
        custom_directive_text = EXCLUDED.custom_directive_text,
        updated_at = NOW();
    `;
  } catch (err) {
    console.error("upsertMainStrategyMandateInNeon error:", err);
  }

  return next;
}

