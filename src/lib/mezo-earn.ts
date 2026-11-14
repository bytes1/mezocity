import type { MainRiskMode } from "./neon-db";

export type EarnMarketRegime =
  | "BTC_DIP_ACCUMULATE"
  | "BTC_WEAK_YIELD_DEFENSE"
  | "BTC_BALANCED_YIELD";

export interface EarnWalletBalances {
  address: string;
  btc: number;
  musd: number;
  mezo: number;
  stMezo: number;
  mUsdc: number;
}

export interface EarnVaultTelemetry {
  id: "smusd" | "upmusd" | "stability-pool" | "upbtc" | "morpho-musdc" | "mblp";
  name: string;
  symbol: string;
  contractAddress: `0x${string}`;
  assetSymbol: "MUSD" | "BTC" | "mUSDC" | "MUSD + BTC";
  assetAddress: `0x${string}`;
  tvlNative: number;
  tvlUsd: number;
  sharePrice: number;
  totalSupply: number;
  yieldAngle: string;
  riskTier: "CONSERVATIVE" | "BALANCED" | "GROWTH";
  btcLowRole: string;
  interactionType: "SMUSD" | "ERC4626" | "STABILITY_POOL" | "MBLP";
  supportsWithdraw: boolean;
  userBalance: number;
  userAllowance: number;
  operatorBalance: number;
}

export interface EarnPoolTelemetry {
  id:
    | "pool-musd-btc"
    | "pool-musd-mezo"
    | "pool-musd-musdc"
    | "pool-mezo-stmezo"
    | "pool-mcbbtc-btc";
  name: string;
  symbol: string;
  poolAddress: `0x${string}`;
  gaugeAddress?: `0x${string}`;
  stable: boolean;
  token0Symbol: string;
  token0Address: `0x${string}`;
  token0Decimals: number;
  token1Symbol: string;
  token1Address: `0x${string}`;
  token1Decimals: number;
  reserve0: number;
  reserve1: number;
  tvlUsd: number;
  spotPriceToken1PerToken0: number;
  spotPriceToken0PerToken1: number;
  voterWeight: number;
  rewardTokenSymbol: string;
  userLpBalance: number;
  userGaugeStakedBalance: number;
  userEarnedReward: number;
  operatorLpBalance: number;
  operatorGaugeStakedBalance: number;
  yieldAngle: string;
  btcLowRole: string;
}

export interface EarnStrategyRecommendation {
  regime: EarnMarketRegime;
  btcLowTriggerActive: boolean;
  headline: string;
  rationale: string;
  primaryVaultId: "smusd" | "upmusd" | "stability-pool";
  primaryPoolId: "pool-musd-mezo" | "pool-musd-btc" | "pool-musd-musdc";
  musdAllocationPct: {
    sMusd: number;
    upMusd: number;
    stabilityPool: number;
    tigrisPools: number;
  };
  mezoAllocationPct: {
    musdMezoLp: number;
    mezoStMezoLp: number;
  };
  actionsSummary: string[];
}

export interface MezoEarnSnapshot {
  ok: boolean;
  chainId: 31611;
  btcPriceUsd: number;
  btc24hChangePct: number;
  mezoSpotUsd: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
  trendDirection: "UPTREND" | "DOWNTREND" | "RANGE_BOUND";
  sentimentLabel: "BULLISH" | "NEUTRAL" | "CAUTIOUS";
  riskMode: MainRiskMode;
  vaults: EarnVaultTelemetry[];
  pools: EarnPoolTelemetry[];
  operatorBalances: EarnWalletBalances;
  userBalances: EarnWalletBalances | null;
  recommendation: EarnStrategyRecommendation;
  fetchedAt: string;
}

/**
 * Pure deterministic regime evaluator shared between the UI Advisor & the 5-Agent Council.
 * Evaluates live BTC trend, 24h change, intraday range position, Fear & Greed, and Strategy Mandate
 * to decide how idle MUSD and MEZO should deploy into canonical Mezo Testnet Earn Vaults & Tigris Pools.
 */
export function classifyBtcEarnRegime(input: {
  btcPriceUsd: number;
  btc24hChangePct: number;
  rangePositionPct?: number;
  fearGreedIndex: number;
  trendDirection: "UPTREND" | "DOWNTREND" | "RANGE_BOUND";
  sentimentLabel: "BULLISH" | "NEUTRAL" | "CAUTIOUS";
  riskMode: MainRiskMode;
}): EarnStrategyRecommendation {
  const rangePos = input.rangePositionPct ?? 50;
  const isDipZone =
    input.btc24hChangePct <= -1.5 ||
    input.fearGreedIndex <= 40 ||
    rangePos <= 35 ||
    (input.trendDirection === "DOWNTREND" && input.riskMode === "GROWTH");

  if (isDipZone) {
    return {
      regime: "BTC_DIP_ACCUMULATE",
      btcLowTriggerActive: true,
      headline: `BTC Low / Dip Zone Detected (${input.btc24hChangePct >= 0 ? "+" : ""}${input.btc24hChangePct.toFixed(2)}% 24h • F&G ${input.fearGreedIndex}) — Deploy MUSD & MEZO`,
      rationale:
        "BTC is trading in a discounted dip/fear zone. Model deploys MUSD into Liquity StabilityPool (captures liquidated BTC collateral at ~10% discount) + sMUSD/upMUSD yield + vAMM-MUSD/BTC LP & swaps MUSD/MEZO into Tigris vAMM-MUSD/MEZO LP to earn swap fees while BTC stabilizes.",
      primaryVaultId: "stability-pool",
      primaryPoolId: "pool-musd-btc",
      musdAllocationPct: {
        sMusd: 20,
        upMusd: 15,
        stabilityPool: 35,
        tigrisPools: 30,
      },
      mezoAllocationPct: {
        musdMezoLp: 65,
        mezoStMezoLp: 35,
      },
      actionsSummary: [
        "Deposit MUSD -> StabilityPool (liquidated BTC capture)",
        "Add MUSD + BTC -> vAMM-MUSD/BTC Tigris LP (VeBTC BTC gauge)",
        "Deploy MEZO + MUSD -> vAMM-MUSD/MEZO LP",
      ],
    };
  }

  const isWeakBtc =
    input.trendDirection === "DOWNTREND" ||
    input.sentimentLabel === "CAUTIOUS" ||
    (input.fearGreedIndex < 48 && input.riskMode !== "GROWTH");

  if (isWeakBtc) {
    return {
      regime: "BTC_WEAK_YIELD_DEFENSE",
      btcLowTriggerActive: true,
      headline: `BTC Weak / Risk-Off (${input.trendDirection} • F&G ${input.fearGreedIndex}) — Rotate MUSD & MEZO to Yield`,
      rationale:
        "BTC momentum is soft; PolicyVault pauses aggressive spot BTC exposure while autonomous agents rotate idle MUSD into sMUSD (MUSDSavingsRate), upMUSD Vault, and sAMM-MUSD/mUSDC stable liquidity, plus pair MEZO into vAMM-MUSD/MEZO.",
      primaryVaultId: "smusd",
      primaryPoolId: "pool-musd-mezo",
      musdAllocationPct: {
        sMusd: 40,
        upMusd: 30,
        stabilityPool: 15,
        tigrisPools: 15,
      },
      mezoAllocationPct: {
        musdMezoLp: 70,
        mezoStMezoLp: 30,
      },
      actionsSummary: [
        "Stake MUSD -> sMUSD (MUSDSavingsRate yield accrual)",
        "Deposit MUSD -> upMUSD Vault (ERC-4626 MUSD yield)",
        "Provide MUSD + MEZO -> vAMM-MUSD/MEZO Tigris LP",
      ],
    };
  }

  return {
    regime: "BTC_BALANCED_YIELD",
    btcLowTriggerActive: false,
    headline: `BTC Constructive (${input.trendDirection} • F&G ${input.fearGreedIndex}) — Dual BTC Vault & Multi-Venue Earn`,
    rationale:
      "BTC trend and macro confidence support active BTC Vault strategies alongside steady MUSD/MEZO yield compounding across upMUSD, sMUSD, and incentivized Tigris LP gauges.",
    primaryVaultId: "upmusd",
    primaryPoolId: "pool-musd-mezo",
    musdAllocationPct: {
      sMusd: 25,
      upMusd: 35,
      stabilityPool: 15,
      tigrisPools: 25,
    },
    mezoAllocationPct: {
      musdMezoLp: 60,
      mezoStMezoLp: 40,
    },
    actionsSummary: [
      "Compound MUSD -> upMUSD Vault & sMUSD",
      "Farm BTC Gauge -> sAMM-MUSD/mUSDC & vAMM-MUSD/BTC",
      "Compound MEZO -> vAMM-MUSD/MEZO & vAMM-MEZO/stMEZO",
    ],
  };
}
