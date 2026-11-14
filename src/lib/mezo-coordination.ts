import type {
  AgentChassisType,
  AgentHeadgearType,
  AgentSpecialty,
  IslandBiomeTheme,
} from "./island-db";

/**
 * Official MEZO ERC-20 precompile, Tigris Testnet VeBTC, and VeMEZO addresses on Mezo Testnet (Chain ID: 31611).
 * Verified live via RPC + mezo-org/tigris deployments/testnet.
 */
export const MEZO_TOKEN_ADDRESS =
  "0x7B7c000000000000000000000000000000000001" as `0x${string}`;
export const VEBTC_TOKEN_ADDRESS =
  "0xB63fcCd03521Cf21907627bd7fA465C129479231" as `0x${string}`;
export const VEBTC_VOTER_ADDRESS =
  "0x72F8dd7F44fFa19E45955aa20A5486E8EB255738" as `0x${string}`;
export const VEMEZO_TOKEN_ADDRESS =
  "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b" as `0x${string}`;

/** 1 veBTC / locked BTC converts to 25,000 MEZO-equivalent coordination points (0.02 veBTC = Citadel Council 500 pts). */
export const VEBTC_TO_MEZO_WEIGHT = 25_000;

export interface MezoCoordinationSignals {
  mezoBalance: number;
  veBtcVotingPower?: number;
  veBtcLockedBtc?: number;
  veBtcNftCount?: number;
  veMezoLockedAmount?: number;
  veMezoNftCount?: number;
}

export interface MezoCoordinationProfile {
  mezoBalance: number;
  veBtcVotingPower: number;
  veBtcLockedBtc: number;
  veBtcNftCount: number;
  veMezoLockedAmount: number;
  veMezoNftCount: number;
  veBtcBoostPoints: number;
  effectiveScore: number;
  boostedByVeBtc: boolean;
  boostSourceLabel: string;
  tier: MezoCoordinationTier;
}

export type MezoCoordinationTierId =
  | "NONE"
  | "SUPPORTER"
  | "ALLIANCE"
  | "CITADEL_COUNCIL";

export interface MezoCoordinationTier {
  tierId: MezoCoordinationTierId;
  label: string;
  shortLabel: string;
  minMezoRequired: number;
  aprDiscountBps: number;
  effectiveMinAprBps: number;
  priorityBoostPct: number;
  badgeClasses: string;
  crestHex: string;
}

export const MEZO_COORDINATION_TIERS: readonly MezoCoordinationTier[] = [
  {
    tierId: "CITADEL_COUNCIL",
    label: "Citadel Council",
    shortLabel: "Council",
    minMezoRequired: 500,
    aprDiscountBps: 200,
    effectiveMinAprBps: 300, // Matches IslandCreditCouncil.sol minAprBps = 300
    priorityBoostPct: 40,
    badgeClasses: "bg-amber-100 text-amber-900 border-amber-300",
    crestHex: "#f59e0b",
  },
  {
    tierId: "ALLIANCE",
    label: "Mezo Alliance",
    shortLabel: "Alliance",
    minMezoRequired: 100,
    aprDiscountBps: 125,
    effectiveMinAprBps: 375,
    priorityBoostPct: 25,
    badgeClasses: "bg-violet-100 text-violet-900 border-violet-300",
    crestHex: "#8b5cf6",
  },
  {
    tierId: "SUPPORTER",
    label: "Mezo Supporter",
    shortLabel: "Supporter",
    minMezoRequired: 10,
    aprDiscountBps: 50,
    effectiveMinAprBps: 450,
    priorityBoostPct: 10,
    badgeClasses: "bg-emerald-100 text-emerald-900 border-emerald-300",
    crestHex: "#10b981",
  },
  {
    tierId: "NONE",
    label: "Standard Tier",
    shortLabel: "Standard",
    minMezoRequired: 0,
    aprDiscountBps: 0,
    effectiveMinAprBps: 500,
    priorityBoostPct: 0,
    badgeClasses: "bg-stone-100 text-stone-700 border-stone-300",
    crestHex: "#64748b",
  },
] as const;

export function resolveMezoCoordinationProfile(
  input?: number | Partial<MezoCoordinationSignals>
): MezoCoordinationProfile {
  const sig: Partial<MezoCoordinationSignals> =
    typeof input === "number" ? { mezoBalance: input } : input || {};

  const safeNum = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0;

  const mezoBalance = safeNum(sig.mezoBalance);
  const veBtcVotingPower = safeNum(sig.veBtcVotingPower);
  const veBtcLockedBtc = safeNum(sig.veBtcLockedBtc);
  const veBtcNftCount = Math.floor(safeNum(sig.veBtcNftCount));
  const veMezoLockedAmount = safeNum(sig.veMezoLockedAmount);
  const veMezoNftCount = Math.floor(safeNum(sig.veMezoNftCount));

  const veBtcBasis = Math.max(veBtcVotingPower, veBtcLockedBtc);
  const veBtcBoostPoints = veBtcBasis * VEBTC_TO_MEZO_WEIGHT;
  const effectiveScore = Number(
    (mezoBalance + veBtcBoostPoints + veMezoLockedAmount).toFixed(2)
  );
  const boostedByVeBtc = veBtcBasis > 0 || veMezoLockedAmount > 0;

  const boostParts: string[] = [];
  if (mezoBalance > 0) boostParts.push(`${mezoBalance.toFixed(1)} MEZO`);
  if (veBtcBasis > 0) boostParts.push(`${veBtcVotingPower.toFixed(4)} veBTC`);
  if (veMezoLockedAmount > 0)
    boostParts.push(`${veMezoLockedAmount.toFixed(1)} veMEZO`);
  const boostSourceLabel =
    boostParts.length > 0 ? boostParts.join(" + ") : "0 MEZO / 0 veBTC";

  let tier = MEZO_COORDINATION_TIERS[MEZO_COORDINATION_TIERS.length - 1];
  for (const candidate of MEZO_COORDINATION_TIERS) {
    if (effectiveScore >= candidate.minMezoRequired) {
      tier = candidate;
      break;
    }
  }

  return {
    mezoBalance,
    veBtcVotingPower,
    veBtcLockedBtc,
    veBtcNftCount,
    veMezoLockedAmount,
    veMezoNftCount,
    veBtcBoostPoints: Number(veBtcBoostPoints.toFixed(2)),
    effectiveScore,
    boostedByVeBtc,
    boostSourceLabel,
    tier,
  };
}

export function resolveMezoCoordinationTier(
  input: number | Partial<MezoCoordinationSignals>
): MezoCoordinationTier {
  return resolveMezoCoordinationProfile(input).tier;
}

export interface IslandCloneTemplate {
  templateId: string;
  sourceName: string;
  sourceType: "LIVE_ISLAND" | "CURATED_STARTER";
  suggestedName: string;
  description: string;
  biomeTheme: IslandBiomeTheme;
  suggestedSeedBtc: string;
  suggestedSeedMusd: string;
  vaultTemplates: Array<{
    plotIndex: number;
    assetType: "BTC" | "MUSD" | "MULTI_ASSET";
    vaultName: string;
    maxSingleTradeBps: number;
    maxDrawdownBps: number;
  }>;
  agentTemplates: Array<{
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
  }>;
}

export const STARTER_STRATEGY_TEMPLATES: IslandCloneTemplate[] = [
  {
    templateId: "starter-musd-carry",
    sourceName: "Citadel MUSD Carry Blueprint",
    sourceType: "CURATED_STARTER",
    suggestedName: "Citadel MUSD Carry Isle",
    description:
      "Conservative BTC-backed MUSD treasury rotation capturing oracle swings with tight single-trade guardrails.",
    biomeTheme: "meadow",
    suggestedSeedBtc: "0.0002",
    suggestedSeedMusd: "15",
    vaultTemplates: [
      {
        plotIndex: 1,
        assetType: "MUSD",
        vaultName: "MUSD Reserve Vault",
        maxSingleTradeBps: 2000,
        maxDrawdownBps: 600,
      },
      {
        plotIndex: 2,
        assetType: "MULTI_ASSET",
        vaultName: "BTC-MUSD Carry Pool",
        maxSingleTradeBps: 2500,
        maxDrawdownBps: 800,
      },
    ],
    agentTemplates: [
      {
        spawnSlotIndex: 1,
        name: "Carry Prime",
        role: "MUSD Yield Strategist",
        specialty: "MUSD_YIELD",
        systemPrompt:
          "Maintain healthy MUSD reserve cushions above 45%, rotate BTC spikes into MUSD, and anchor profit checkpoints cleanly.",
        allowedAssets: "BTC,MUSD",
        chassis: "guardian",
        primaryColor: "#059669",
        secondaryColor: "#fbbf24",
        headgear: "crown",
        scaleFactor: 1.05,
      },
      {
        spawnSlotIndex: 2,
        name: "Aegis Auditor",
        role: "Drawdown & Credit Risk Guard",
        specialty: "RISK_AUDITOR",
        systemPrompt:
          "Audit every swap against 6% max drawdown and block oversized trades during HIGH volatility.",
        allowedAssets: "BTC,MUSD",
        chassis: "orb",
        primaryColor: "#0ea5e9",
        secondaryColor: "#e2e8f0",
        headgear: "halo",
        scaleFactor: 0.95,
      },
    ],
  },
  {
    templateId: "starter-grid-arb",
    sourceName: "CyberGrid Oracle Arbitrage",
    sourceType: "CURATED_STARTER",
    suggestedName: "CyberGrid Arb Isle",
    description:
      "High-cadence BTC <-> MUSD spread capture on MezoTestnetSwapPool calibrated against PriceFeed.",
    biomeTheme: "grid",
    suggestedSeedBtc: "0.0003",
    suggestedSeedMusd: "10",
    vaultTemplates: [
      {
        plotIndex: 1,
        assetType: "MULTI_ASSET",
        vaultName: "Oracle Arb Matrix",
        maxSingleTradeBps: 3000,
        maxDrawdownBps: 900,
      },
    ],
    agentTemplates: [
      {
        spawnSlotIndex: 1,
        name: "Vector Nine",
        role: "Swap Pool Arbitrageur",
        specialty: "ARBITRAGE",
        systemPrompt:
          "Compare 24h BTC range extremes with MezoTestnetSwapPool effective price; scale 15-25% swaps on clear mean-reversion bands.",
        allowedAssets: "BTC,MUSD",
        chassis: "rover",
        primaryColor: "#06b6d4",
        secondaryColor: "#6366f1",
        headgear: "radar",
        scaleFactor: 1.0,
      },
      {
        spawnSlotIndex: 2,
        name: "Pulse Telemetry",
        role: "Macro Sentiment Scanner",
        specialty: "MARKET_ANALYST",
        systemPrompt:
          "Synthesize Fear & Greed extremes and trend velocity before authorizing BTC or MUSD rebalancing.",
        allowedAssets: "BTC,MUSD",
        chassis: "bot",
        primaryColor: "#8b5cf6",
        secondaryColor: "#22d3ee",
        headgear: "visor",
        scaleFactor: 0.96,
      },
    ],
  },
  {
    templateId: "starter-basalt-dip",
    sourceName: "Obsidian BTC Dip Engine",
    sourceType: "CURATED_STARTER",
    suggestedName: "Obsidian Dip Isle",
    description:
      "Systematic MUSD dry-powder deployment into BTC dips with automated checkpoint sealing for Credit Council leverage.",
    biomeTheme: "basalt",
    suggestedSeedBtc: "0.0002",
    suggestedSeedMusd: "20",
    vaultTemplates: [
      {
        plotIndex: 1,
        assetType: "BTC",
        vaultName: "Obsidian BTC Vault",
        maxSingleTradeBps: 2500,
        maxDrawdownBps: 1000,
      },
      {
        plotIndex: 2,
        assetType: "MUSD",
        vaultName: "MUSD Dry Powder",
        maxSingleTradeBps: 2500,
        maxDrawdownBps: 750,
      },
    ],
    agentTemplates: [
      {
        spawnSlotIndex: 1,
        name: "Magma Trader",
        role: "BTC Dip Execution Core",
        specialty: "BTC_TRADER",
        systemPrompt:
          "Convert MUSD dry powder into BTC when 24h range position < 35% and Fear & Greed softens; realize MUSD profits above 75%.",
        allowedAssets: "BTC,MUSD",
        chassis: "mech",
        primaryColor: "#f97316",
        secondaryColor: "#1e293b",
        headgear: "antenna",
        scaleFactor: 1.08,
      },
    ],
  },
];
