import { neon } from "@neondatabase/serverless";
import {
  AgentReasoningLog,
  CyclePhase,
  MythicAgentName,
  NewsItemHeadline,
} from "./simulation-data";

export interface StoredCycleRecord {
  cycleUid: string;
  triggerSource: "HOURLY_CRON" | "MANUAL_UI" | "AUTO_LOOP";
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
  createdAt: string;
  updatedAt: string;
  messages: AgentReasoningLog[];
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
      block_number
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
      ${record.blockNumber}
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

  await sql`
    UPDATE agent_cycles
    SET
      status = ${params.nextStatus},
      headline = COALESCE(${params.headline || null}, headline),
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
        speaker: (m.speaker as AgentReasoningLog["speaker"]) || "Indra",
        roleTag: String(m.role_tag || "Agent"),
        aiModel: String(m.ai_model || "gemini-2.5-flash"),
        stance: (m.stance as AgentReasoningLog["stance"]) || "HEAD",
        replyTo: m.reply_to ? String(m.reply_to) : undefined,
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
