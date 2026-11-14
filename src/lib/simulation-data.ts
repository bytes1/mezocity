export type CyclePhase =
  | "NEWS_SCANNING"
  | "HEAD_PLANNING"
  | "DCA_SCHEDULING"
  | "POLICY_AUDIT"
  | "ERROR_RECTIFYING"
  | "ONCHAIN_SETTLEMENT";

export type TransformerAgentName =
  | "Optimus Prime"
  | "Soundwave"
  | "Bumblebee"
  | "Ratchet"
  | "Ironhide";

export type MythicAgentName = TransformerAgentName;

export interface IslandStation {
  id: string;
  name: string;
  subtitle: string;
  phase: CyclePhase;
  position: [number, number, number];
  color: string;
  roofColor: string;
  timerText?: string;
  description: string;
}

export interface ClayAgent {
  id: number;
  erc8004Id: string;
  name: TransformerAgentName;
  role: string;
  archetype: "head" | "dca" | "rectifier" | "sentinel" | "news";
  aiModelName: string;
  aiModelId: string;
  aiProviderBadge: string;
  weightPercent: number;
  color: string;
  accentColor: string;
  homeStationId: string;
  currentStationId: string;
  reputationBps: number;
  successRate: number;
  totalActions: number;
  statusText: string;
  speechBubble: string;
  operatorAddress: string;
  strategySpecHash: string;
  skills: string[];
}

export interface AgentReasoningLog {
  id: string;
  speaker: MythicAgentName | "You";
  roleTag: string;
  aiModel: string;
  stance: "NEWS" | "HEAD" | "DCA" | "RECTIFIER" | "GUARDRAIL" | "USER";
  replyTo?: string;
  text: string;
  timestamp: string;
  badgeText: string;
  badgeTone?: "purple" | "amber" | "emerald" | "blue" | "red" | "pink";
  latencyMs?: number;
}

export interface NewsItemHeadline {
  title: string;
  source: string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  publishedAt: string;
  url?: string;
}

export interface DCAScheduleItem {
  id: number;
  strategyName: string;
  targetAsset: string;
  sliceAmountBtc: number;
  intervalLabel: string;
  intervalSeconds: number;
  executedSlices: number;
  totalSlices: number;
  maxSlippageBps: number;
  nextRunCountdown: string;
  status: "ACTIVE" | "RECTIFIED" | "PAUSED" | "COMPLETED";
  lastRectificationNote?: string;
  totalAccumulatedBtc: number;
  avgEntryScore: number;
}

export interface PolicyGuardrails {
  maxSingleTradeBps: number; // e.g. 1000 = 10%
  maxDailyDrawdownBps: number; // e.g. 500 = 5%
  minConfidenceBps: number; // e.g. 7000 = 70%
  cooldownSeconds: number; // e.g. 0s
  emergencyLock: boolean;
}

export interface ExecutionAuditEntry {
  id: number;
  timestamp: string;
  agentName: string;
  aiModelUsed: string;
  erc8004Id: string;
  actionType:
  | "DCA_SLICE_EXECUTION"
  | "AUTO_ERROR_RECTIFICATION"
  | "GUARDRAIL_INTERCEPTION"
  | "POLICY_BLOCKED_ATTEMPT"
  | "VAULT_REBALANCE";
  targetAsset: string;
  amountBtc: number;
  vaultSharePercent: number;
  confidencePercent: number;
  passedPolicy: boolean;
  wasRectified?: boolean;
  violationReason?: string;
  rectificationSummary?: string;
  proofHash: string;
  txHash: string;
}

export const ISLAND_STATIONS: IslandStation[] = [
  {
    id: "head_citadel",
    name: "Optimus Prime's Mezo Citadel",
    subtitle: "Head Orchestrator & Matrix Nexus",
    phase: "HEAD_PLANNING",
    position: [0, 0.55, 0],
    color: "#e2d9f3",
    roofColor: "#7c5cbf",
    description:
      "Central 4-tower Mezo astrolabe plaza where Optimus Prime (Head Commander) synthesizes Soundwave's intel and leads the Cybertronian crew.",
  },
  {
    id: "lighthouse_beacon",
    name: "Soundwave News Observatory",
    subtitle: "Live Crypto & Macro Signal Interceptor",
    phase: "NEWS_SCANNING",
    position: [0.3, 0.55, -5.2],
    color: "#e9d8fd",
    roofColor: "#ec4899",
    description:
      "Signal telemetry tower where Soundwave intercepts live Bitcoin & macro news feeds every hour.",
  },
  {
    id: "dca_piggy",
    name: "Bumblebee Capital & Earn Forge",
    subtitle: "BTC Vault & MUSD/MEZO Yield Router",
    phase: "DCA_SCHEDULING",
    position: [-5.1, 0.55, 0.5],
    color: "#f7cb5c",
    roofColor: "#e09f3e",
    timerText: "00:59:59",
    description:
      "Golden treasury forge where Bumblebee allocates BTC Strategy Vault positions and rotates idle MUSD & MEZO into Mezo Earn Vaults and Tigris Pools.",
  },
  {
    id: "rectifier_lab",
    name: "Ratchet Healer Lab",
    subtitle: "Chief Medical Officer & Revert Rectifier",
    phase: "ERROR_RECTIFYING",
    position: [-4.2, 0.55, 3.8],
    color: "#d4dce6",
    roofColor: "#10b981",
    description:
      "Diagnostic med-bay where Ratchet intercepts reverted or oversized transactions and heals them on-chain.",
  },
  {
    id: "policy_fortress",
    name: "Ironhide Policy Fortress",
    subtitle: "Verify-Then-Trust Smart Contract Gate",
    phase: "POLICY_AUDIT",
    position: [4.9, 0.55, 1.2],
    color: "#cfe7ff",
    roofColor: "#3b82f6",
    description:
      "Enforces PolicyVault.sol mathematical guardrails (maxSingleTradeBps, maxDailyDrawdownBps, minConfidenceBps).",
  },
];

/**
 * The 5 Transformers Autonomous AI Agents powered by Google Gemini (gemini-3.8-flash / gemini-3.5-flash-lite):
 * 1. Optimus Prime (Head Orchestrator)
 * 2. Bumblebee     (Autonomous BTC DCA Agent)
 * 3. Ratchet       (Chief Medical Officer & Self-Healing Rectifier Agent)
 * 4. Ironhide      (PolicyVault Guardrail & Security Enforcer)
 * 5. Soundwave     (Live Crypto & Macro Signal Interceptor)
 */
export const INITIAL_AGENTS: ClayAgent[] = [
  {
    id: 1,
    erc8004Id: "ERC8004-MEZO #01",
    name: "Optimus Prime",
    role: "Head Orchestrator & Prime Commander",
    archetype: "head",
    aiModelName: "gemini-3.8-flash",
    aiModelId: "gemini-3.8-flash",
    aiProviderBadge: "Gemini AI • gemini-3.8-flash",
    weightPercent: 25,
    color: "#8b5cf6",
    accentColor: "#c4b5fd",
    homeStationId: "head_citadel",
    currentStationId: "head_citadel",
    reputationBps: 0,
    successRate: 0,
    totalActions: 0,
    statusText: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    speechBubble: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    operatorAddress: "",
    strategySpecHash: "",
    skills: [
      "prime-orchestration",
      "news-to-strategy-synthesis",
      "gemini-flash-planner",
    ],
  },
  {
    id: 2,
    erc8004Id: "ERC8004-MEZO #02",
    name: "Bumblebee",
    role: "Capital, BTC Vault & Earn Allocation Engine",
    archetype: "dca",
    aiModelName: "gemini-3.8-flash",
    aiModelId: "gemini-3.8-flash",
    aiProviderBadge: "Gemini AI • gemini-3.8-flash",
    weightPercent: 25,
    color: "#f59e0b",
    accentColor: "#fde68a",
    homeStationId: "dca_piggy",
    currentStationId: "dca_piggy",
    reputationBps: 0,
    successRate: 0,
    totalActions: 0,
    statusText: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    speechBubble: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    operatorAddress: "",
    strategySpecHash: "",
    skills: ["btc-strategy-vault", "mezo-earn-yield-router", "tigris-pool-allocator"],
  },
  {
    id: 3,
    erc8004Id: "ERC8004-MEZO #03",
    name: "Ratchet",
    role: "Chief Medical Officer & Self-Healing Rectifier",
    archetype: "rectifier",
    aiModelName: "gemini-3.8-flash",
    aiModelId: "gemini-3.8-flash",
    aiProviderBadge: "Gemini AI • gemini-3.8-flash",
    weightPercent: 20,
    color: "#10b981",
    accentColor: "#6ee7b7",
    homeStationId: "rectifier_lab",
    currentStationId: "rectifier_lab",
    reputationBps: 0,
    successRate: 0,
    totalActions: 0,
    statusText: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    speechBubble: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    operatorAddress: "",
    strategySpecHash: "",
    skills: [
      "revert-med-bay",
      "auto-slice-resizer",
      "rectifyAndExecuteDCASlice",
    ],
  },
  {
    id: 4,
    erc8004Id: "ERC8004-MEZO #04",
    name: "Ironhide",
    role: "PolicyVault Guardrail & Security Enforcer",
    archetype: "sentinel",
    aiModelName: "gemini-3.5-flash-lite",
    aiModelId: "gemini-3.5-flash-lite",
    aiProviderBadge: "Gemini AI • gemini-3.5-flash-lite",
    weightPercent: 15,
    color: "#3b82f6",
    accentColor: "#93c5fd",
    homeStationId: "policy_fortress",
    currentStationId: "policy_fortress",
    reputationBps: 0,
    successRate: 0,
    totalActions: 0,
    statusText: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    speechBubble: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    operatorAddress: "",
    strategySpecHash: "",
    skills: [
      "policy-vault-gate",
      "drawdown-circuit-breaker",
      "onchain-proof-anchor",
    ],
  },
  {
    id: 5,
    erc8004Id: "ERC8004-MEZO #05",
    name: "Soundwave",
    role: "Live Crypto & Macro Signal Interceptor",
    archetype: "news",
    aiModelName: "gemini-3.5-flash-lite",
    aiModelId: "gemini-3.5-flash-lite",
    aiProviderBadge: "Gemini AI • gemini-3.5-flash-lite",
    weightPercent: 15,
    color: "#ec4899",
    accentColor: "#f9a8d4",
    homeStationId: "lighthouse_beacon",
    currentStationId: "lighthouse_beacon",
    reputationBps: 0,
    successRate: 0,
    totalActions: 0,
    statusText: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    speechBubble: "Syncing live from AgentRegistry.sol on Mezo 31611...",
    operatorAddress: "",
    strategySpecHash: "",
    skills: [
      "live-news-ingestion",
      "macro-sentiment-scoring",
      "btc-catalyst-detector",
    ],
  },
];

export const INITIAL_REASONING_FEED: AgentReasoningLog[] = [];

export const INITIAL_DCA_SCHEDULES: DCAScheduleItem[] = [];
export const INITIAL_EXECUTION_LEDGER: ExecutionAuditEntry[] = [];
