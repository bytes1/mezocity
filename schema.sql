-- Neon Serverless Postgres Schema for Mezo Town (5 Indian Mythology Agents)
-- Automatically executed on startup by src/lib/neon-db.ts (CREATE TABLE IF NOT EXISTS)

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

CREATE INDEX IF NOT EXISTS idx_agent_messages_cycle_uid ON agent_messages(cycle_uid, turn_index);
CREATE INDEX IF NOT EXISTS idx_agent_cycles_created_at ON agent_cycles(created_at DESC);

