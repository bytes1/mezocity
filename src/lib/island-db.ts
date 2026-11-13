import { neon } from "@neondatabase/serverless";
import { getActiveDatabaseUrl } from "./neon-db";

export type IslandBiomeTheme = "meadow" | "basalt" | "sand" | "grid";
export type AgentChassisType = "bot" | "mech" | "rover" | "orb" | "guardian";
export type AgentHeadgearType = "antenna" | "crown" | "visor" | "halo" | "radar";
export type AgentSpecialty =
  | "MARKET_ANALYST"
  | "BTC_TRADER"
  | "MUSD_YIELD"
  | "RISK_AUDITOR"
  | "ARBITRAGE";

export interface CustomIslandRecord {
  islandId: string;
  chainIslandId: number | null;
  ownerAddress: string;
  operatorAddress: string;
  vaultAddress: string;
  name: string;
  description: string;
  biomeTheme: IslandBiomeTheme;
  seedBtc: number;
  seedMusd: number;
  seedTxHash: string;
  geminiConnected: boolean;
  geminiKeyLast4: string;
  geminiModel: string;
  status: string;
  createdAt: string;
  vaultCount?: number;
  agentCount?: number;
  latestProfitUsd?: number | null;
  latestCheckpointId?: number | null;
  latestLoanStatus?: string | null;
  latestApprovedMusd?: number | null;
  latestRequestedMusd?: number | null;
}

export interface CustomIslandVaultBuilding {
  id: number;
  islandId: string;
  plotIndex: number;
  assetType: "BTC" | "MUSD" | "MULTI_ASSET";
  vaultName: string;
  maxSingleTradeBps: number;
  maxDrawdownBps: number;
  txHash: string;
  createdAt: string;
}

export interface CustomIslandAgent {
  agentId: string;
  islandId: string;
  spawnSlotIndex: number;
  name: string;
  role: string;
  specialty: AgentSpecialty;
  systemPrompt: string;
  allowedAssets: string;
  chassis: AgentChassisType;
  primaryColor: string;
  secondaryColor: string;
  headgear: AgentHeadgearType;
  scaleFactor: number;
  lastOutput: string;
  active: boolean;
  createdAt: string;
}

export interface IslandCycleRecord {
  cycleUid: string;
  islandId: string;
  decision: string;
  swapDirection: "NONE" | "BTC_TO_MUSD" | "MUSD_TO_BTC";
  amountIn: number;
  amountOut: number;
  navUsd: number;
  netProfitUsd: number;
  roiBps: number;
  checkpointId: number | null;
  txHash: string;
  proofHash: string;
  transcript: Array<{
    speaker: string;
    role: string;
    stance: string;
    text: string;
  }>;
  createdAt: string;
}

export interface IslandLoanApplicationRecord {
  appId: string;
  chainAppId: number;
  islandId: string;
  checkpointId: number;
  provedProfitUsd: number;
  provedRoiBps: number;
  requestedMusd: number;
  approvedMusd: number;
  aprBps: number;
  termDays: number;
  purposeSummary: string;
  status: string;
  verdict: string;
  councilVerdictJson: Record<string, unknown>;
  disburseTxHash: string;
  repaidMusd: number;
  createdAt: string;
  updatedAt: string;
}

let islandTablesInitializedForUrl: string | null = null;

export async function ensureIslandNeonTables(
  customDbUrl?: string
): Promise<boolean> {
  const dbUrl = getActiveDatabaseUrl(customDbUrl);
  if (!dbUrl || !dbUrl.startsWith("postgres")) return false;
  if (islandTablesInitializedForUrl === dbUrl) return true;

  try {
    const sql = neon(dbUrl);

    await sql`
      CREATE TABLE IF NOT EXISTS custom_islands (
        island_id TEXT PRIMARY KEY,
        chain_island_id BIGINT,
        owner_address TEXT NOT NULL,
        operator_address TEXT NOT NULL,
        vault_address TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        biome_theme TEXT NOT NULL DEFAULT 'meadow',
        seed_btc DOUBLE PRECISION NOT NULL DEFAULT 0,
        seed_musd DOUBLE PRECISION NOT NULL DEFAULT 0,
        seed_tx_hash TEXT DEFAULT '',
        encrypted_gemini_key TEXT DEFAULT '',
        gemini_iv TEXT DEFAULT '',
        gemini_auth_tag TEXT DEFAULT '',
        gemini_key_last4 TEXT DEFAULT '',
        gemini_model TEXT DEFAULT 'gemini-2.5-flash',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS custom_island_vaults (
        id SERIAL PRIMARY KEY,
        island_id TEXT NOT NULL REFERENCES custom_islands(island_id) ON DELETE CASCADE,
        plot_index INTEGER NOT NULL,
        asset_type TEXT NOT NULL,
        vault_name TEXT NOT NULL,
        max_single_trade_bps INTEGER NOT NULL DEFAULT 2500,
        max_drawdown_bps INTEGER NOT NULL DEFAULT 1000,
        tx_hash TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(island_id, plot_index)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS custom_island_agents (
        agent_id TEXT PRIMARY KEY,
        island_id TEXT NOT NULL REFERENCES custom_islands(island_id) ON DELETE CASCADE,
        spawn_slot_index INTEGER NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        specialty TEXT NOT NULL DEFAULT 'BTC_TRADER',
        system_prompt TEXT NOT NULL,
        allowed_assets TEXT NOT NULL DEFAULT 'BTC,MUSD',
        chassis TEXT NOT NULL DEFAULT 'bot',
        primary_color TEXT NOT NULL DEFAULT '#6366f1',
        secondary_color TEXT NOT NULL DEFAULT '#f59e0b',
        headgear TEXT NOT NULL DEFAULT 'antenna',
        scale_factor DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        last_output TEXT DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(island_id, spawn_slot_index)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS island_cycles (
        cycle_uid TEXT PRIMARY KEY,
        island_id TEXT NOT NULL REFERENCES custom_islands(island_id) ON DELETE CASCADE,
        decision TEXT NOT NULL,
        swap_direction TEXT DEFAULT 'NONE',
        amount_in DOUBLE PRECISION DEFAULT 0,
        amount_out DOUBLE PRECISION DEFAULT 0,
        nav_usd DOUBLE PRECISION DEFAULT 0,
        net_profit_usd DOUBLE PRECISION DEFAULT 0,
        roi_bps INTEGER DEFAULT 0,
        checkpoint_id INTEGER,
        tx_hash TEXT DEFAULT '',
        proof_hash TEXT DEFAULT '',
        transcript_json TEXT DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS island_loan_applications (
        app_id TEXT PRIMARY KEY,
        chain_app_id INTEGER DEFAULT 0,
        island_id TEXT NOT NULL REFERENCES custom_islands(island_id) ON DELETE CASCADE,
        checkpoint_id INTEGER NOT NULL DEFAULT 0,
        proved_profit_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        proved_roi_bps INTEGER NOT NULL DEFAULT 0,
        requested_musd DOUBLE PRECISION NOT NULL,
        approved_musd DOUBLE PRECISION NOT NULL DEFAULT 0,
        apr_bps INTEGER NOT NULL DEFAULT 0,
        term_days INTEGER NOT NULL DEFAULT 30,
        purpose_summary TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PENDING_COUNCIL',
        verdict TEXT DEFAULT 'NONE',
        council_verdict_json TEXT DEFAULT '{}',
        disburse_tx_hash TEXT DEFAULT '',
        repaid_musd DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS island_auth_nonces (
        nonce TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        island_id TEXT NOT NULL,
        action TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed BOOLEAN NOT NULL DEFAULT FALSE
      );
    `;

    islandTablesInitializedForUrl = dbUrl;
    return true;
  } catch (err) {
    console.error("ensureIslandNeonTables error:", err);
    return false;
  }
}

function mapIslandRow(r: Record<string, unknown>): CustomIslandRecord {
  return {
    islandId: String(r.island_id),
    chainIslandId:
      r.chain_island_id !== null && r.chain_island_id !== undefined
        ? Number(r.chain_island_id)
        : null,
    ownerAddress: String(r.owner_address || ""),
    operatorAddress: String(r.operator_address || ""),
    vaultAddress: String(r.vault_address || ""),
    name: String(r.name || ""),
    description: String(r.description || ""),
    biomeTheme: (String(r.biome_theme || "meadow") as IslandBiomeTheme),
    seedBtc: Number(r.seed_btc || 0),
    seedMusd: Number(r.seed_musd || 0),
    seedTxHash: String(r.seed_tx_hash || ""),
    geminiConnected: Boolean(String(r.encrypted_gemini_key || "").trim()),
    geminiKeyLast4: String(r.gemini_key_last4 || ""),
    geminiModel: String(r.gemini_model || "gemini-2.5-flash"),
    status: String(r.status || "ACTIVE"),
    createdAt: r.created_at
      ? new Date(String(r.created_at)).toISOString()
      : new Date().toISOString(),
    vaultCount:
      r.vault_count !== null && r.vault_count !== undefined
        ? Number(r.vault_count)
        : 0,
    agentCount:
      r.agent_count !== null && r.agent_count !== undefined
        ? Number(r.agent_count)
        : 0,
    latestProfitUsd:
      r.latest_profit_usd !== null && r.latest_profit_usd !== undefined
        ? Number(r.latest_profit_usd)
        : null,
    latestCheckpointId:
      r.latest_checkpoint_id !== null && r.latest_checkpoint_id !== undefined
        ? Number(r.latest_checkpoint_id)
        : null,
    latestLoanStatus:
      r.latest_loan_status !== null && r.latest_loan_status !== undefined
        ? String(r.latest_loan_status)
        : null,
    latestApprovedMusd:
      r.latest_approved_musd !== null && r.latest_approved_musd !== undefined
        ? Number(r.latest_approved_musd)
        : null,
    latestRequestedMusd:
      r.latest_requested_musd !== null && r.latest_requested_musd !== undefined
        ? Number(r.latest_requested_musd)
        : null,
  };
}

export async function listCustomIslandsFromNeon(
  ownerAddress?: string
): Promise<CustomIslandRecord[]> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return [];
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);

  const rows = ownerAddress
    ? await sql`
        SELECT
          ci.*,
          COALESCE(v.vault_count, 0) AS vault_count,
          COALESCE(a.agent_count, 0) AS agent_count,
          lc.net_profit_usd AS latest_profit_usd,
          lc.checkpoint_id AS latest_checkpoint_id,
          ll.status AS latest_loan_status,
          ll.approved_musd AS latest_approved_musd,
          ll.requested_musd AS latest_requested_musd
        FROM custom_islands ci
        LEFT JOIN (
          SELECT island_id, COUNT(*)::int AS vault_count
          FROM custom_island_vaults
          GROUP BY island_id
        ) v ON v.island_id = ci.island_id
        LEFT JOIN (
          SELECT island_id, COUNT(*)::int AS agent_count
          FROM custom_island_agents
          WHERE active = TRUE
          GROUP BY island_id
        ) a ON a.island_id = ci.island_id
        LEFT JOIN LATERAL (
          SELECT net_profit_usd, checkpoint_id
          FROM island_cycles ic
          WHERE ic.island_id = ci.island_id
          ORDER BY ic.created_at DESC
          LIMIT 1
        ) lc ON TRUE
        LEFT JOIN LATERAL (
          SELECT status, approved_musd, requested_musd
          FROM island_loan_applications ila
          WHERE ila.island_id = ci.island_id
          ORDER BY ila.created_at DESC
          LIMIT 1
        ) ll ON TRUE
        WHERE LOWER(ci.owner_address) = LOWER(${ownerAddress})
        ORDER BY ci.created_at DESC;
      `
    : await sql`
        SELECT
          ci.*,
          COALESCE(v.vault_count, 0) AS vault_count,
          COALESCE(a.agent_count, 0) AS agent_count,
          lc.net_profit_usd AS latest_profit_usd,
          lc.checkpoint_id AS latest_checkpoint_id,
          ll.status AS latest_loan_status,
          ll.approved_musd AS latest_approved_musd,
          ll.requested_musd AS latest_requested_musd
        FROM custom_islands ci
        LEFT JOIN (
          SELECT island_id, COUNT(*)::int AS vault_count
          FROM custom_island_vaults
          GROUP BY island_id
        ) v ON v.island_id = ci.island_id
        LEFT JOIN (
          SELECT island_id, COUNT(*)::int AS agent_count
          FROM custom_island_agents
          WHERE active = TRUE
          GROUP BY island_id
        ) a ON a.island_id = ci.island_id
        LEFT JOIN LATERAL (
          SELECT net_profit_usd, checkpoint_id
          FROM island_cycles ic
          WHERE ic.island_id = ci.island_id
          ORDER BY ic.created_at DESC
          LIMIT 1
        ) lc ON TRUE
        LEFT JOIN LATERAL (
          SELECT status, approved_musd, requested_musd
          FROM island_loan_applications ila
          WHERE ila.island_id = ci.island_id
          ORDER BY ila.created_at DESC
          LIMIT 1
        ) ll ON TRUE
        ORDER BY ci.created_at DESC
        LIMIT 50;
      `;

  return (rows as Record<string, unknown>[]).map(mapIslandRow);
}

export async function getCustomIslandById(
  islandId: string
): Promise<CustomIslandRecord | null> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return null;
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const rows = await sql`
    SELECT * FROM custom_islands WHERE island_id = ${islandId} LIMIT 1;
  `;
  const row = (rows as Record<string, unknown>[])[0];
  return row ? mapIslandRow(row) : null;
}

export async function upsertCustomIslandInNeon(params: {
  islandId: string;
  chainIslandId: number | null;
  ownerAddress: string;
  operatorAddress: string;
  vaultAddress: string;
  name: string;
  description?: string;
  biomeTheme: IslandBiomeTheme;
  seedBtc: number;
  seedMusd: number;
  seedTxHash?: string;
}): Promise<CustomIslandRecord> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    throw new Error("DATABASE_URL is required to persist custom islands.");
  }
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);

  const rows = await sql`
    INSERT INTO custom_islands (
      island_id,
      chain_island_id,
      owner_address,
      operator_address,
      vault_address,
      name,
      description,
      biome_theme,
      seed_btc,
      seed_musd,
      seed_tx_hash
    ) VALUES (
      ${params.islandId},
      ${params.chainIslandId},
      ${params.ownerAddress},
      ${params.operatorAddress},
      ${params.vaultAddress},
      ${params.name},
      ${params.description || ""},
      ${params.biomeTheme},
      ${params.seedBtc},
      ${params.seedMusd},
      ${params.seedTxHash || ""}
    )
    ON CONFLICT (vault_address) DO UPDATE SET
      chain_island_id = COALESCE(EXCLUDED.chain_island_id, custom_islands.chain_island_id),
      name = EXCLUDED.name,
      description = CASE
        WHEN EXCLUDED.description <> '' THEN EXCLUDED.description
        ELSE custom_islands.description
      END
    RETURNING *;
  `;
  return mapIslandRow((rows as Record<string, unknown>[])[0]);
}

export async function saveEncryptedGeminiKeyForIsland(params: {
  islandId: string;
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
  last4: string;
  model: string;
}): Promise<void> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    throw new Error("DATABASE_URL is not configured.");
  }
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  await sql`
    UPDATE custom_islands
    SET
      encrypted_gemini_key = ${params.ciphertextB64},
      gemini_iv = ${params.ivB64},
      gemini_auth_tag = ${params.authTagB64},
      gemini_key_last4 = ${params.last4},
      gemini_model = ${params.model}
    WHERE island_id = ${params.islandId};
  `;
}

export async function getEncryptedGeminiKeyPayloadServerOnly(islandId: string): Promise<{
  ownerAddress: string;
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
  model: string;
} | null> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return null;
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const rows = await sql`
    SELECT owner_address, encrypted_gemini_key, gemini_iv, gemini_auth_tag, gemini_model
    FROM custom_islands
    WHERE island_id = ${islandId}
    LIMIT 1;
  `;
  const r = (rows as Record<string, unknown>[])[0];
  if (!r || !r.encrypted_gemini_key) return null;
  return {
    ownerAddress: String(r.owner_address),
    ciphertextB64: String(r.encrypted_gemini_key),
    ivB64: String(r.gemini_iv),
    authTagB64: String(r.gemini_auth_tag),
    model: String(r.gemini_model || "gemini-2.5-flash"),
  };
}

export async function listIslandVaultBuildings(
  islandId: string
): Promise<CustomIslandVaultBuilding[]> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return [];
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const rows = await sql`
    SELECT * FROM custom_island_vaults
    WHERE island_id = ${islandId}
    ORDER BY plot_index ASC;
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    islandId: String(r.island_id),
    plotIndex: Number(r.plot_index),
    assetType: String(r.asset_type) as "BTC" | "MUSD" | "MULTI_ASSET",
    vaultName: String(r.vault_name),
    maxSingleTradeBps: Number(r.max_single_trade_bps || 2500),
    maxDrawdownBps: Number(r.max_drawdown_bps || 1000),
    txHash: String(r.tx_hash || ""),
    createdAt: r.created_at
      ? new Date(String(r.created_at)).toISOString()
      : new Date().toISOString(),
  }));
}

export async function createIslandVaultBuildingInNeon(params: {
  islandId: string;
  plotIndex: number;
  assetType: "BTC" | "MUSD" | "MULTI_ASSET";
  vaultName: string;
  maxSingleTradeBps: number;
  maxDrawdownBps: number;
  txHash?: string;
}): Promise<CustomIslandVaultBuilding> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    throw new Error("DATABASE_URL is not configured.");
  }
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const rows = await sql`
    INSERT INTO custom_island_vaults (
      island_id,
      plot_index,
      asset_type,
      vault_name,
      max_single_trade_bps,
      max_drawdown_bps,
      tx_hash
    ) VALUES (
      ${params.islandId},
      ${params.plotIndex},
      ${params.assetType},
      ${params.vaultName},
      ${params.maxSingleTradeBps},
      ${params.maxDrawdownBps},
      ${params.txHash || ""}
    )
    RETURNING *;
  `;
  const r = (rows as Record<string, unknown>[])[0];
  return {
    id: Number(r.id),
    islandId: String(r.island_id),
    plotIndex: Number(r.plot_index),
    assetType: String(r.asset_type) as "BTC" | "MUSD" | "MULTI_ASSET",
    vaultName: String(r.vault_name),
    maxSingleTradeBps: Number(r.max_single_trade_bps || 2500),
    maxDrawdownBps: Number(r.max_drawdown_bps || 1000),
    txHash: String(r.tx_hash || ""),
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

export async function listCustomIslandAgents(
  islandId: string
): Promise<CustomIslandAgent[]> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return [];
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const rows = await sql`
    SELECT * FROM custom_island_agents
    WHERE island_id = ${islandId}
    ORDER BY spawn_slot_index ASC;
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    agentId: String(r.agent_id),
    islandId: String(r.island_id),
    spawnSlotIndex: Number(r.spawn_slot_index),
    name: String(r.name),
    role: String(r.role),
    specialty: String(r.specialty || "BTC_TRADER") as AgentSpecialty,
    systemPrompt: String(r.system_prompt || ""),
    allowedAssets: String(r.allowed_assets || "BTC,MUSD"),
    chassis: String(r.chassis || "bot") as AgentChassisType,
    primaryColor: String(r.primary_color || "#6366f1"),
    secondaryColor: String(r.secondary_color || "#f59e0b"),
    headgear: String(r.headgear || "antenna") as AgentHeadgearType,
    scaleFactor: Number(r.scale_factor || 1),
    lastOutput: String(r.last_output || ""),
    active: Boolean(r.active),
    createdAt: r.created_at
      ? new Date(String(r.created_at)).toISOString()
      : new Date().toISOString(),
  }));
}

export async function upsertCustomIslandAgentInNeon(
  agent: Omit<CustomIslandAgent, "createdAt" | "lastOutput"> & { lastOutput?: string }
): Promise<CustomIslandAgent> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) {
    throw new Error("DATABASE_URL is not configured.");
  }
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const rows = await sql`
    INSERT INTO custom_island_agents (
      agent_id,
      island_id,
      spawn_slot_index,
      name,
      role,
      specialty,
      system_prompt,
      allowed_assets,
      chassis,
      primary_color,
      secondary_color,
      headgear,
      scale_factor,
      last_output,
      active
    ) VALUES (
      ${agent.agentId},
      ${agent.islandId},
      ${agent.spawnSlotIndex},
      ${agent.name},
      ${agent.role},
      ${agent.specialty},
      ${agent.systemPrompt},
      ${agent.allowedAssets},
      ${agent.chassis},
      ${agent.primaryColor},
      ${agent.secondaryColor},
      ${agent.headgear},
      ${agent.scaleFactor},
      ${agent.lastOutput || ""},
      ${agent.active}
    )
    ON CONFLICT (agent_id) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      specialty = EXCLUDED.specialty,
      system_prompt = EXCLUDED.system_prompt,
      allowed_assets = EXCLUDED.allowed_assets,
      chassis = EXCLUDED.chassis,
      primary_color = EXCLUDED.primary_color,
      secondary_color = EXCLUDED.secondary_color,
      headgear = EXCLUDED.headgear,
      scale_factor = EXCLUDED.scale_factor,
      active = EXCLUDED.active
    RETURNING *;
  `;
  const r = (rows as Record<string, unknown>[])[0];
  return {
    agentId: String(r.agent_id),
    islandId: String(r.island_id),
    spawnSlotIndex: Number(r.spawn_slot_index),
    name: String(r.name),
    role: String(r.role),
    specialty: String(r.specialty) as AgentSpecialty,
    systemPrompt: String(r.system_prompt),
    allowedAssets: String(r.allowed_assets),
    chassis: String(r.chassis) as AgentChassisType,
    primaryColor: String(r.primary_color),
    secondaryColor: String(r.secondary_color),
    headgear: String(r.headgear) as AgentHeadgearType,
    scaleFactor: Number(r.scale_factor),
    lastOutput: String(r.last_output || ""),
    active: Boolean(r.active),
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

export async function updateCustomAgentOutputs(
  islandId: string,
  outputs: Array<{ agentId: string; lastOutput: string }>
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return;
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  for (const item of outputs) {
    await sql`
      UPDATE custom_island_agents
      SET last_output = ${item.lastOutput}
      WHERE island_id = ${islandId} AND agent_id = ${item.agentId};
    `;
  }
}

export async function appendIslandCycleInNeon(
  cycle: Omit<IslandCycleRecord, "createdAt">
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return;
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  await sql`
    INSERT INTO island_cycles (
      cycle_uid,
      island_id,
      decision,
      swap_direction,
      amount_in,
      amount_out,
      nav_usd,
      net_profit_usd,
      roi_bps,
      checkpoint_id,
      tx_hash,
      proof_hash,
      transcript_json
    ) VALUES (
      ${cycle.cycleUid},
      ${cycle.islandId},
      ${cycle.decision},
      ${cycle.swapDirection},
      ${cycle.amountIn},
      ${cycle.amountOut},
      ${cycle.navUsd},
      ${cycle.netProfitUsd},
      ${cycle.roiBps},
      ${cycle.checkpointId},
      ${cycle.txHash},
      ${cycle.proofHash},
      ${JSON.stringify(cycle.transcript || [])}
    );
  `;
}

export async function listIslandCyclesFromNeon(
  islandId: string,
  limit = 15
): Promise<IslandCycleRecord[]> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return [];
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const rows = await sql`
    SELECT * FROM island_cycles
    WHERE island_id = ${islandId}
    ORDER BY created_at DESC
    LIMIT ${limit};
  `;
  return (rows as Record<string, unknown>[]).map((r) => {
    let transcript: IslandCycleRecord["transcript"] = [];
    try {
      transcript = JSON.parse(String(r.transcript_json || "[]"));
    } catch {
      transcript = [];
    }
    return {
      cycleUid: String(r.cycle_uid),
      islandId: String(r.island_id),
      decision: String(r.decision),
      swapDirection: String(r.swap_direction || "NONE") as IslandCycleRecord["swapDirection"],
      amountIn: Number(r.amount_in || 0),
      amountOut: Number(r.amount_out || 0),
      navUsd: Number(r.nav_usd || 0),
      netProfitUsd: Number(r.net_profit_usd || 0),
      roiBps: Number(r.roi_bps || 0),
      checkpointId:
        r.checkpoint_id !== null && r.checkpoint_id !== undefined
          ? Number(r.checkpoint_id)
          : null,
      txHash: String(r.tx_hash || ""),
      proofHash: String(r.proof_hash || ""),
      transcript,
      createdAt: new Date(String(r.created_at)).toISOString(),
    };
  });
}

export async function upsertLoanApplicationInNeon(
  app: Omit<IslandLoanApplicationRecord, "createdAt" | "updatedAt">
): Promise<void> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return;
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  await sql`
    INSERT INTO island_loan_applications (
      app_id,
      chain_app_id,
      island_id,
      checkpoint_id,
      proved_profit_usd,
      proved_roi_bps,
      requested_musd,
      approved_musd,
      apr_bps,
      term_days,
      purpose_summary,
      status,
      verdict,
      council_verdict_json,
      disburse_tx_hash,
      repaid_musd
    ) VALUES (
      ${app.appId},
      ${app.chainAppId},
      ${app.islandId},
      ${app.checkpointId},
      ${app.provedProfitUsd},
      ${app.provedRoiBps},
      ${app.requestedMusd},
      ${app.approvedMusd},
      ${app.aprBps},
      ${app.termDays},
      ${app.purposeSummary},
      ${app.status},
      ${app.verdict},
      ${JSON.stringify(app.councilVerdictJson || {})},
      ${app.disburseTxHash},
      ${app.repaidMusd}
    )
    ON CONFLICT (app_id) DO UPDATE SET
      status = EXCLUDED.status,
      verdict = EXCLUDED.verdict,
      approved_musd = EXCLUDED.approved_musd,
      apr_bps = EXCLUDED.apr_bps,
      council_verdict_json = EXCLUDED.council_verdict_json,
      disburse_tx_hash = CASE
        WHEN EXCLUDED.disburse_tx_hash <> '' THEN EXCLUDED.disburse_tx_hash
        ELSE island_loan_applications.disburse_tx_hash
      END,
      repaid_musd = GREATEST(EXCLUDED.repaid_musd, island_loan_applications.repaid_musd),
      updated_at = NOW();
  `;
}

export async function listLoanApplicationsFromNeon(
  islandId?: string
): Promise<IslandLoanApplicationRecord[]> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return [];
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const rows = islandId
    ? await sql`
        SELECT * FROM island_loan_applications
        WHERE island_id = ${islandId}
        ORDER BY created_at DESC;
      `
    : await sql`
        SELECT * FROM island_loan_applications
        ORDER BY created_at DESC
        LIMIT 50;
      `;

  return (rows as Record<string, unknown>[]).map((r) => {
    let parsedJson: Record<string, unknown> = {};
    try {
      parsedJson = JSON.parse(String(r.council_verdict_json || "{}"));
    } catch {
      parsedJson = {};
    }
    return {
      appId: String(r.app_id),
      chainAppId: Number(r.chain_app_id || 0),
      islandId: String(r.island_id),
      checkpointId: Number(r.checkpoint_id || 0),
      provedProfitUsd: Number(r.proved_profit_usd || 0),
      provedRoiBps: Number(r.proved_roi_bps || 0),
      requestedMusd: Number(r.requested_musd || 0),
      approvedMusd: Number(r.approved_musd || 0),
      aprBps: Number(r.apr_bps || 0),
      termDays: Number(r.term_days || 30),
      purposeSummary: String(r.purpose_summary || ""),
      status: String(r.status || "PENDING_COUNCIL"),
      verdict: String(r.verdict || "NONE"),
      councilVerdictJson: parsedJson,
      disburseTxHash: String(r.disburse_tx_hash || ""),
      repaidMusd: Number(r.repaid_musd || 0),
      createdAt: new Date(String(r.created_at)).toISOString(),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
    };
  });
}

export async function issueSingleUseAuthNonce(params: {
  nonce: string;
  walletAddress: string;
  islandId: string;
  action: string;
}): Promise<void> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return;
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  await sql`
    INSERT INTO island_auth_nonces (nonce, wallet_address, island_id, action, expires_at, consumed)
    VALUES (
      ${params.nonce},
      ${params.walletAddress.toLowerCase()},
      ${params.islandId},
      ${params.action},
      NOW() + INTERVAL '5 minutes',
      FALSE
    );
  `;
}

export async function consumeSingleUseAuthNonce(params: {
  nonce: string;
  walletAddress: string;
  islandId: string;
  action: string;
}): Promise<boolean> {
  const dbUrl = getActiveDatabaseUrl();
  if (!dbUrl || !dbUrl.startsWith("postgres")) return false;
  await ensureIslandNeonTables(dbUrl);
  const sql = neon(dbUrl);
  const rows = await sql`
    UPDATE island_auth_nonces
    SET consumed = TRUE
    WHERE nonce = ${params.nonce}
      AND wallet_address = ${params.walletAddress.toLowerCase()}
      AND island_id = ${params.islandId}
      AND action = ${params.action}
      AND consumed = FALSE
      AND expires_at > NOW()
    RETURNING nonce;
  `;
  return Array.isArray(rows) && rows.length === 1;
}
