export type CyclePhase =
  | "SCANNING"
  | "FACT_CHECKING"
  | "DEBATING"
  | "COUNCIL_VOTE"
  | "POLICY_CHECK"
  | "EXECUTING";

export interface IslandStation {
  id: string;
  name: string;
  subtitle: string;
  phase: CyclePhase;
  position: [number, number, number];
  color: string;
  roofColor: string;
  description: string;
}

export interface ClayAgent {
  id: number;
  erc8004Id: string;
  name: string;
  role: string;
  archetype: "scout" | "factchecker" | "bull" | "bear" | "council" | "sentinel" | "quant";
  color: string;
  accentColor: string;
  homeStationId: string;
  currentStationId: string;
  reputationBps: number;
  winRate: number;
  totalActions: number;
  statusText: string;
  speechBubble: string;
  operatorAddress: string;
  strategySpecHash: string;
  skills: string[];
}

export interface DebateMessage {
  id: string;
  speaker: "Pip" | "Hoot" | "Brutus" | "Bramble" | "Polly" | "Sentinel";
  roleTag: string;
  stance: "SIGNAL" | "FACT_CHECK" | "BULL" | "BEAR" | "COUNCIL" | "GUARDRAIL";
  text: string;
  timestamp: string;
  confidenceImpact?: string;
}

export interface PredictionMarketItem {
  id: number;
  ticker: string;
  question: string;
  category: string;
  councilYesPercent: number;
  marketYesPercent: number;
  edgePercent: number;
  positionSide: "YES" | "NO" | "LONG" | "REBALANCE";
  allocatedBtc: number;
  pnlBtc: number;
  volumeBtc: number;
  proofHash: string;
}

export interface PolicyGuardrails {
  maxSingleTradeBps: number; // e.g. 1000 = 10%
  maxDailyDrawdownBps: number; // e.g. 500 = 5%
  minConfidenceBps: number; // e.g. 7000 = 70%
  cooldownSeconds: number; // e.g. 15s
  emergencyLock: boolean;
}

export interface ExecutionAuditEntry {
  id: number;
  timestamp: string;
  agentName: string;
  erc8004Id: string;
  actionType: "LONG_POSITION" | "SHORT_POSITION" | "REBALANCE_BASKET" | "PREDICTION_BET" | "BTC_YIELD_ALLOCATION";
  marketTicker: string;
  amountBtc: number;
  vaultSharePercent: number;
  confidencePercent: number;
  passedPolicy: boolean;
  violationReason?: string;
  proofHash: string;
  txHash: string;
}

export const ISLAND_STATIONS: IslandStation[] = [
  {
    id: "lighthouse",
    name: "Signal Lighthouse",
    subtitle: "X, Web & Mezo Mempool Radar",
    phase: "SCANNING",
    position: [-5.2, 0.55, -3.4],
    color: "#f4e6d2",
    roofColor: "#e06d53",
    description:
      "Pip monitors real-time BTC L2 inflows, Mezo validator blocks, and social alpha streams to surface actionable market catalysts.",
  },
  {
    id: "observatory",
    name: "Hoot's Owl Observatory",
    subtitle: "Oracle & Fact-Check Dome",
    phase: "FACT_CHECKING",
    position: [4.8, 0.65, -3.6],
    color: "#e6dec8",
    roofColor: "#4b7f78",
    description:
      "Hoot cross-verifies Pip's signals against on-chain Mezo state, oracle price feeds, and historical liquidity depth before any debate begins.",
  },
  {
    id: "amphitheater",
    name: "Debate Amphitheater",
    subtitle: "Brutus (Bull) vs. Bramble (Bear)",
    phase: "DEBATING",
    position: [-4.4, 0.45, 2.8],
    color: "#eed9c4",
    roofColor: "#d98a3c",
    description:
      "Adversarial dialectic arena where Brutus argues upside momentum and Bramble stress-tests tail risks and drawdown scenarios.",
  },
  {
    id: "council",
    name: "Polly's Council Citadel",
    subtitle: "Consensus & Edge Synthesizer",
    phase: "COUNCIL_VOTE",
    position: [0, 0.8, -0.3],
    color: "#fbf0e1",
    roofColor: "#c85a32",
    description:
      "Central clay town hall where Polly weighs bull vs. bear arguments, computes Council probability vs. Market probability, and forms a strategy spec.",
  },
  {
    id: "vault",
    name: "4lpha Policy Vault Fortress",
    subtitle: "Verify-Then-Trust Guardrail Engine",
    phase: "POLICY_CHECK",
    position: [5.0, 0.6, 2.6],
    color: "#dfd7cc",
    roofColor: "#2d6a4f",
    description:
      "Immutable Mezo smart contract vault enforcing maxSingleTradeBps, maxDailyDrawdownBps, and minConfidenceBps before releasing BTC.",
  },
  {
    id: "dock",
    name: "Mezo 31611 Execution Dock",
    subtitle: "On-Chain Proof Anchor & DEX Pier",
    phase: "EXECUTING",
    position: [0.3, 0.35, 5.1],
    color: "#e8d5b7",
    roofColor: "#3d5a80",
    description:
      "Broadcasts policy-approved transactions and cryptographic reasoning proofs to Mezo Testnet (Chain ID: 31611).",
  },
];

export const INITIAL_AGENTS: ClayAgent[] = [
  {
    id: 1,
    erc8004Id: "ERC8004-MEZO #01",
    name: "Polly",
    role: "Council Chair & Lead Strategist",
    archetype: "council",
    color: "#e06d53",
    accentColor: "#f7b267",
    homeStationId: "council",
    currentStationId: "council",
    reputationBps: 9640,
    winRate: 74.8,
    totalActions: 142,
    statusText: "Synthesizing Council vs. Market edge (+17.0% delta)",
    speechBubble: "Council consensus: 79% YES vs 62% Market!",
    operatorAddress: "0x3161100000000000000000000000000000000001",
    strategySpecHash: "0x8f4e2c9b11d4a7e3b98104a55f23c10d9a7b8e213f4c6a8d9e0b1a2c3d4e5f01",
    skills: ["council-synthesis", "kelly-sizing", "a2a-coordinator"],
  },
  {
    id: 2,
    erc8004Id: "ERC8004-MEZO #02",
    name: "Pip",
    role: "Signal Scout & Mempool Listener",
    archetype: "scout",
    color: "#4ea8de",
    accentColor: "#90e0ef",
    homeStationId: "lighthouse",
    currentStationId: "lighthouse",
    reputationBps: 9280,
    winRate: 71.2,
    totalActions: 318,
    statusText: "Detected +420 tBTC inflow into Mezo Testnet bridge",
    speechBubble: "New signal! Mezo bridge velocity +38%!",
    operatorAddress: "0x3161100000000000000000000000000000000002",
    strategySpecHash: "0x2a7c91e04b82d6f13e9c84a70b15f32d8c6e4a197b3d5f801e2a4c6b8d0f1a02",
    skills: ["x-stream-ingest", "mezo-mempool-watch", "sentiment-parser"],
  },
  {
    id: 3,
    erc8004Id: "ERC8004-MEZO #03",
    name: "Hoot",
    role: "On-Chain Fact-Checker & Verifier",
    archetype: "factchecker",
    color: "#52b788",
    accentColor: "#b7e4c7",
    homeStationId: "observatory",
    currentStationId: "observatory",
    reputationBps: 9810,
    winRate: 82.4,
    totalActions: 276,
    statusText: "Verified RPC block #1,482,910 & oracle finality",
    speechBubble: "Fact-check PASSED: On-chain liquidity verified.",
    operatorAddress: "0x3161100000000000000000000000000000000003",
    strategySpecHash: "0x5d1b83a97c40e2f61a8b93c47d02e5f19a3b7c846e2d0f1a3c5b7d9e0f2a4b03",
    skills: ["oracle-attestation", "sybil-filter", "proof-anchoring"],
  },
  {
    id: 4,
    erc8004Id: "ERC8004-MEZO #04",
    name: "Brutus",
    role: "Bull Thesis & Momentum Advocate",
    archetype: "bull",
    color: "#f4a261",
    accentColor: "#e9c46a",
    homeStationId: "amphitheater",
    currentStationId: "amphitheater",
    reputationBps: 9120,
    winRate: 68.9,
    totalActions: 195,
    statusText: "Arguing LONG BTC-MEZO yield expansion thesis",
    speechBubble: "BTC L2 TVL velocity supports 8.5% vault allocation!",
    operatorAddress: "0x3161100000000000000000000000000000000004",
    strategySpecHash: "0x7c3e92f16a84b0d52e1f73c98a40d6b21f5e8a394c7b0d2e1f3a5c7b9d0e2f04",
    skills: ["momentum-breakout", "funding-rate-alpha", "bull-dialectic"],
  },
  {
    id: 5,
    erc8004Id: "ERC8004-MEZO #05",
    name: "Bramble",
    role: "Bear Contrarian & Tail-Risk Auditor",
    archetype: "bear",
    color: "#9d4edd",
    accentColor: "#e0aaff",
    homeStationId: "amphitheater",
    currentStationId: "amphitheater",
    reputationBps: 9350,
    winRate: 73.1,
    totalActions: 195,
    statusText: "Capping exposure to 7.5% to protect daily drawdown",
    speechBubble: "Trim size from 12% -> 7.5% to respect vault cap!",
    operatorAddress: "0x3161100000000000000000000000000000000005",
    strategySpecHash: "0x9e1a44c82b70d3f56a9c12e84b03f7d15c8a2e693b4d0f1e2a4c6b8d0f1a3c05",
    skills: ["var-stress-test", "slippage-guard", "contrarian-audit"],
  },
  {
    id: 6,
    erc8004Id: "ERC8004-MEZO #06",
    name: "Sentinel",
    role: "Policy Vault Guardrail Enforcer",
    archetype: "sentinel",
    color: "#2a9d8f",
    accentColor: "#80ed99",
    homeStationId: "vault",
    currentStationId: "vault",
    reputationBps: 9950,
    winRate: 99.5,
    totalActions: 410,
    statusText: "Enforcing 10% Max Trade / 5% Max Drawdown / 70% Min Conf",
    speechBubble: "Guardrails armed: Verify first, then trust.",
    operatorAddress: "0x3161100000000000000000000000000000000006",
    strategySpecHash: "0x1b6d90e34c72a8f15d3e82b94a01c6f28d4e7a931b5c0d2e4f6a8b0c1d3e5f06",
    skills: ["policy-vault-check", "drawdown-circuit-breaker", "erc8004-auth"],
  },
  {
    id: 7,
    erc8004Id: "ERC8004-MEZO #07",
    name: "SatoshiQuant",
    role: "Mezo BTC Rebalancer & Proof Executor",
    archetype: "quant",
    color: "#e76f51",
    accentColor: "#f4a261",
    homeStationId: "dock",
    currentStationId: "dock",
    reputationBps: 9490,
    winRate: 76.4,
    totalActions: 229,
    statusText: "Anchoring execution proofs to Mezo Testnet 31611",
    speechBubble: "Ready at Pier 31611 for atomic BTC settlement.",
    operatorAddress: "0x3161100000000000000000000000000000000007",
    strategySpecHash: "0x4f8a21c69d30e7b42a5f91c83e04d7b16a9c3e582b7d0f1a3c5e7b9d0f2a4c07",
    skills: ["btc-18dec-router", "atomic-rebalance", "proof-broadcaster"],
  },
];

export const INITIAL_DEBATE_FEED: DebateMessage[] = [
  {
    id: "msg-1",
    speaker: "Pip",
    roleTag: "Signal Scout • Lighthouse",
    stance: "SIGNAL",
    text: "Detected a 38.4% surge in active Mezo Testnet BTC Vault deposits over the last 4 hours alongside rising Bitcoin L2 social velocity on X.",
    timestamp: "18s ago",
    confidenceImpact: "+12% Signal Strength",
  },
  {
    id: "msg-2",
    speaker: "Hoot",
    roleTag: "Fact Checker • Observatory",
    stance: "FACT_CHECK",
    text: "Cross-checked Mezo RPC (Chain ID 31611): 94.2% of inflow comes from unique non-sybil wallets with >0.15 tBTC. Signal is authentic.",
    timestamp: "14s ago",
    confidenceImpact: "Verified On-Chain",
  },
  {
    id: "msg-3",
    speaker: "Brutus",
    roleTag: "Bull Advocate • Amphitheater",
    stance: "BULL",
    text: "Market prices Mezo BTC Fi TVL breakout at only 62% YES. With verified organic inflows, fair probability is ~81%. Proposing a 9.5% Vault allocation.",
    timestamp: "9s ago",
    confidenceImpact: "Proposes 9.5% Size",
  },
  {
    id: "msg-4",
    speaker: "Bramble",
    roleTag: "Bear Auditor • Amphitheater",
    stance: "BEAR",
    text: "Counter-point: US macro CPI print in 36h could spike BTC volatility. Cap single-trade allocation at 7.5% of PolicyVault so we stay well below the 10% guardrail.",
    timestamp: "5s ago",
    confidenceImpact: "Trims Size to 7.5%",
  },
  {
    id: "msg-5",
    speaker: "Polly",
    roleTag: "Council Chair • Citadel",
    stance: "COUNCIL",
    text: "Council Consensus locked at 79.0% Confidence (+17.0% edge vs Market). Sizing set to 0.90 BTC (7.2% of Vault). Forwarding to Sentinel's PolicyVault.",
    timestamp: "2s ago",
    confidenceImpact: "79.0% Confidence",
  },
  {
    id: "msg-6",
    speaker: "Sentinel",
    roleTag: "Guardrail Enforcer • PolicyVault",
    stance: "GUARDRAIL",
    text: "Policy Check PASSED: Size 7.2% <= 10.0% maxSingleTradeBps | Confidence 79.0% >= 70.0% minConfidenceBps | Drawdown 0.8% <= 5.0% cap.",
    timestamp: "Just now",
    confidenceImpact: "VERIFIED_OK",
  },
];

export const INITIAL_PREDICTION_MARKETS: PredictionMarketItem[] = [
  {
    id: 1,
    ticker: "MEZO-TVL-15K",
    question: "Will Mezo BTC Policy Vaults surpass 15,000 BTC staked this quarter?",
    category: "Mezo Ecosystem",
    councilYesPercent: 79,
    marketYesPercent: 62,
    edgePercent: 17,
    positionSide: "YES",
    allocatedBtc: 0.9,
    pnlBtc: 0.142,
    volumeBtc: 48.5,
    proofHash: "0x91c4f8a20b7e31d56a82c9e04f1b7d32a6e8c901",
  },
  {
    id: 2,
    ticker: "BTC-105K-FRI",
    question: "Will BTC/USD settle above $105,000 before Friday 16:00 UTC expiry?",
    category: "Macro BTC",
    councilYesPercent: 74,
    marketYesPercent: 59,
    edgePercent: 15,
    positionSide: "LONG",
    allocatedBtc: 0.85,
    pnlBtc: 0.096,
    volumeBtc: 112.4,
    proofHash: "0x4e7b12d93a80c5f61e2b84d79a30c6f18e4b7a23",
  },
  {
    id: 3,
    ticker: "ERC8004-AGENTS-500",
    question: "Will >500 autonomous ERC-8004 agents anchor proofs on Mezo Testnet this month?",
    category: "4lpha Agentic",
    councilYesPercent: 83,
    marketYesPercent: 68,
    edgePercent: 15,
    positionSide: "YES",
    allocatedBtc: 0.65,
    pnlBtc: 0.088,
    volumeBtc: 29.8,
    proofHash: "0x7a3d90c15e82b4f60d1a83c94e20b7f15d6a8c34",
  },
  {
    id: 4,
    ticker: "MEZO-BTC-YIELD-BASKET",
    question: "4lpha Policy-Fenced BTC Yield & Liquidity Rebalance Basket (Auto-Compounding)",
    category: "4lpha Strategy Vault",
    councilYesPercent: 86,
    marketYesPercent: 71,
    edgePercent: 15,
    positionSide: "REBALANCE",
    allocatedBtc: 1.1,
    pnlBtc: 0.194,
    volumeBtc: 84.2,
    proofHash: "0x3c8e41a92b70d5f63a1e84c97b20f6d14c9a7e45",
  },
];

export const INITIAL_EXECUTION_LEDGER: ExecutionAuditEntry[] = [
  {
    id: 104,
    timestamp: "Just now",
    agentName: "Polly",
    erc8004Id: "ERC8004-MEZO #01",
    actionType: "PREDICTION_BET",
    marketTicker: "MEZO-TVL-15K",
    amountBtc: 0.9,
    vaultSharePercent: 7.2,
    confidencePercent: 79.0,
    passedPolicy: true,
    proofHash: "0x91c4f8a20b7e31d56a82c9e04f1b7d32a6e8c901",
    txHash: "0x7b7b9e41c82a30d5f61e84b92a01c7f38d5e9a12",
  },
  {
    id: 103,
    timestamp: "4 mins ago",
    agentName: "Brutus",
    erc8004Id: "ERC8004-MEZO #04",
    actionType: "LONG_POSITION",
    marketTicker: "BTC-LEVERAGE-SWING",
    amountBtc: 2.4,
    vaultSharePercent: 19.2,
    confidencePercent: 81.0,
    passedPolicy: false,
    violationReason: "MAX_TRADE_EXCEEDED: 19.2% exceeds 10.0% maxSingleTradeBps guardrail",
    proofHash: "0x5f2a81c49d30e7b16a4f92c83e01d6b27a8c4e19",
    txHash: "0x7b7b00deadbeef31611blocked0192837465abcd",
  },
  {
    id: 102,
    timestamp: "11 mins ago",
    agentName: "SatoshiQuant",
    erc8004Id: "ERC8004-MEZO #07",
    actionType: "REBALANCE_BASKET",
    marketTicker: "MEZO-BTC-YIELD-BASKET",
    amountBtc: 1.1,
    vaultSharePercent: 8.8,
    confidencePercent: 86.0,
    passedPolicy: true,
    proofHash: "0x3c8e41a92b70d5f63a1e84c97b20f6d14c9a7e45",
    txHash: "0x7b7b4c8e91a20b7d35f61e84c92a03f7d16c8a23",
  },
  {
    id: 101,
    timestamp: "19 mins ago",
    agentName: "Pip",
    erc8004Id: "ERC8004-MEZO #02",
    actionType: "PREDICTION_BET",
    marketTicker: "ALT-MEME-IMPULSE",
    amountBtc: 0.5,
    vaultSharePercent: 4.0,
    confidencePercent: 58.5,
    passedPolicy: false,
    violationReason: "LOW_CONFIDENCE: 58.5% Council score below 70.0% minConfidenceBps guardrail",
    proofHash: "0x8d1e42a93c70b5f62e1a84c95b30d7f18e4a6c90",
    txHash: "0x7b7b00deadbeef31611blocked9988776655fedc",
  },
];

export const SCENARIO_ROUND_TEMPLATES = [
  {
    ticker: "MEZO-VALIDATOR-APR",
    question: "Will Mezo Testnet PoA Validator staking yield outperform 8.2% APY this epoch?",
    category: "Mezo Staking",
    pipSignal: "Pip: Mezo block finality tightened to 1.8s with +19% fee burn across BTC L2 vaults.",
    hootCheck: "Hoot: Verified on explorer.test.mezo.org — validator epoch reward pool up 14.6%.",
    brutusBull: "Brutus: Strong fee generation! Let's allocate 8.0% of the BTC Vault into the YES pool.",
    brambleBear: "Bramble: Epoch difficulty adjusts in 48h; keep allocation at 6.4% (0.80 BTC) for safety.",
    pollyVerdict: "Polly: Council votes 82.0% YES vs 65.0% Market (+17% edge). Dispatching 0.80 BTC order.",
    councilYes: 82,
    marketYes: 65,
    amountBtc: 0.8,
    actionType: "BTC_YIELD_ALLOCATION" as const,
  },
  {
    ticker: "BTC-L2-DOMINANCE",
    question: "Will Bitcoin L2 total bridged BTC cross 185,000 BTC before month-end?",
    category: "Bitcoin L2",
    pipSignal: "Pip: Institutional custody flows into native BTC wrappers jumped +3,400 BTC today.",
    hootCheck: "Hoot: Proof-of-Reserve merkle roots confirmed across 6 major BTC bridge contracts.",
    brutusBull: "Brutus: Momentum is parabolic. Recommending a 9.0%LONG allocation on BTC-L2 index.",
    brambleBear: "Bramble: Funding rates are slightly elevated; trim entry to 7.6% (0.95 BTC) to respect VaR.",
    pollyVerdict: "Polly: Council consensus 77.5% YES vs 61.0% Market. Executing 0.95 BTC via PolicyVault.",
    councilYes: 78,
    marketYes: 61,
    amountBtc: 0.95,
    actionType: "LONG_POSITION" as const,
  },
  {
    ticker: "4LPHA-MCP-CALLS-1M",
    question: "Will 4lpha A2A /mcp agent skill invocations on Mezo exceed 1,000,000 calls?",
    category: "4lpha Agentic",
    pipSignal: "Pip: 42 new autonomous agents registered on ERC-8004 registry in the last 6 hours.",
    hootCheck: "Hoot: All 42 agent cards resolve valid .well-known/agent-card.json schemas.",
    brutusBull: "Brutus: A2A network effect is compounding rapidly. High-conviction 8.4% position.",
    brambleBear: "Bramble: Approved at 6.8% (0.85 BTC) with strict 5% daily drawdown stop anchored.",
    pollyVerdict: "Polly: Council locks 84.0% confidence. Routing 0.85 BTC with cryptographic reasoning proof.",
    councilYes: 84,
    marketYes: 69,
    amountBtc: 0.85,
    actionType: "REBALANCE_BASKET" as const,
  },
];

