import {
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
} from "viem";
import {
  ERC4626_VAULT_ABI,
  MBLP_VAULT_ABI,
  MEZO_EARN_ADDRESSES,
  MUSD_ERC20_ABI,
  PRICE_FEED_ABI,
  SMUSD_SAVINGS_ABI,
  STABILITY_POOL_ABI,
  TIGRIS_GAUGE_ABI,
  TIGRIS_POOL_ABI,
  TIGRIS_ROUTER_ABI,
  VE_BTC_VOTER_ABI,
  extractEvmRevertReason,
} from "./mezo-chain";
import {
  classifyBtcEarnRegime,
  type EarnPoolTelemetry,
  type EarnVaultTelemetry,
  type EarnWalletBalances,
  type MezoEarnSnapshot,
} from "./mezo-earn";
import {
  getMezoOperatorWallet,
  getMezoPublicClient,
  withOperatorLock,
} from "./mezo-onchain-server";
import {
  DEFAULT_MAIN_STRATEGY_MANDATE,
  getMainStrategyMandateFromNeon,
} from "./neon-db";

const GAS_SAFETY_FLOOR_BTC = parseEther("0.015");

interface MarketMetricsQuick {
  btcPriceUsd: number;
  btc24hChangePct: number;
  rangePositionPct: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
  trendDirection: "UPTREND" | "DOWNTREND" | "RANGE_BOUND";
  sentimentLabel: "BULLISH" | "NEUTRAL" | "CAUTIOUS";
}

async function fetchQuickMarketMetrics(
  onChainBtcUsd: number
): Promise<MarketMetricsQuick> {
  let btcPriceUsd = onChainBtcUsd;
  let btc24hChangePct = 0;
  let rangePositionPct = 50;
  let fearGreedIndex = 50;
  let fearGreedLabel = "Neutral";

  await Promise.allSettled([
    (async () => {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
        { signal: AbortSignal.timeout(3500), cache: "no-store" }
      );
      if (!res.ok) return;
      const d = await res.json();
      const last = Number.parseFloat(d?.lastPrice || "0");
      const chg = Number.parseFloat(d?.priceChangePercent || "0");
      const hi = Number.parseFloat(d?.highPrice || "0");
      const lo = Number.parseFloat(d?.lowPrice || "0");
      if (last > 0 && btcPriceUsd <= 0) btcPriceUsd = Number(last.toFixed(2));
      if (Number.isFinite(chg)) btc24hChangePct = Number(chg.toFixed(2));
      if (hi > lo && last > 0) {
        rangePositionPct = Math.max(
          0,
          Math.min(100, Math.round(((last - lo) / (hi - lo)) * 100))
        );
      }
    })(),
    (async () => {
      const res = await fetch("https://api.alternative.me/fng/?limit=1", {
        signal: AbortSignal.timeout(3500),
        cache: "no-store",
      });
      if (!res.ok) return;
      const d = await res.json();
      const item = d?.data?.[0];
      if (item?.value) {
        fearGreedIndex = Number(item.value);
        fearGreedLabel = String(item.value_classification || "Neutral");
      }
    })(),
  ]);

  if (btcPriceUsd <= 0) btcPriceUsd = 78_000;

  const trendDirection: "UPTREND" | "DOWNTREND" | "RANGE_BOUND" =
    btc24hChangePct >= 1.25
      ? "UPTREND"
      : btc24hChangePct <= -1.25
      ? "DOWNTREND"
      : "RANGE_BOUND";

  const sentimentLabel: "BULLISH" | "NEUTRAL" | "CAUTIOUS" =
    fearGreedIndex >= 58 || btc24hChangePct >= 1.5
      ? "BULLISH"
      : fearGreedIndex <= 42 || btc24hChangePct <= -1.5
      ? "CAUTIOUS"
      : "NEUTRAL";

  return {
    btcPriceUsd,
    btc24hChangePct,
    rangePositionPct,
    fearGreedIndex,
    fearGreedLabel,
    trendDirection,
    sentimentLabel,
  };
}

async function readWalletTokenBalances(
  addr: `0x${string}`
): Promise<EarnWalletBalances> {
  const publicClient = getMezoPublicClient();
  const [btcW, musdW, mezoW, stMezoW, mUsdcW] = await Promise.all([
    publicClient.getBalance({ address: addr }).catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.musdToken,
        abi: MUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [addr],
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.mezoToken,
        abi: MUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [addr],
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.stMezoToken,
        abi: MUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [addr],
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.mUsdcToken,
        abi: MUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [addr],
      })
      .catch(() => 0n),
  ]);

  return {
    address: addr,
    btc: Number(formatEther(btcW)),
    musd: Number(formatEther(musdW as bigint)),
    mezo: Number(formatEther(mezoW as bigint)),
    stMezo: Number(formatEther(stMezoW as bigint)),
    mUsdc: Number(formatUnits(mUsdcW as bigint, 6)),
  };
}

/**
 * Reads all verified canonical Mezo Testnet (31611) Earn Vaults & Tigris AMM Pools
 * plus AI BTC-Low Market Regime recommendation and wallet balances.
 */
export async function readMezoEarnSnapshot(options?: {
  userAddress?: string;
  marketOverride?: Partial<MarketMetricsQuick>;
}): Promise<MezoEarnSnapshot> {
  const publicClient = getMezoPublicClient();
  const userAddressRaw = (options?.userAddress || "").trim();
  const hasValidUser = /^0x[0-9a-fA-F]{40}$/.test(userAddressRaw);
  const userAddr = hasValidUser ? (userAddressRaw as `0x${string}`) : null;

  let operatorAddr: `0x${string}` | null = null;
  try {
    operatorAddr = getMezoOperatorWallet().account.address;
  } catch {
    operatorAddr = null;
  }

  const [priceW, mandate] = await Promise.all([
    publicClient
      .readContract({
        address: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
        abi: PRICE_FEED_ABI,
        functionName: "fetchPrice",
      })
      .catch(() => 0n),
    getMainStrategyMandateFromNeon().catch(() => ({
      ...DEFAULT_MAIN_STRATEGY_MANDATE,
    })),
  ]);

  const onChainBtcUsd = Number(formatEther((priceW as bigint) || 0n));
  const quickMarket = await fetchQuickMarketMetrics(onChainBtcUsd);
  const market: MarketMetricsQuick = {
    ...quickMarket,
    ...options?.marketOverride,
  };

  // Vault reads + Pool reads + Wallet reads in parallel
  const [
    sMusdSupplyW,
    sMusdYieldIdxW,
    spTotalMusdW,
    spTotalCollW,
    upMusdAssetsW,
    upMusdSupplyW,
    upBtcAssetsW,
    morphoAssetsW,
    mbLpSupplyW,
    mbLpPpsW,
    opBalances,
    userBalances,
  ] = await Promise.all([
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.sMusdVault,
        abi: SMUSD_SAVINGS_ABI,
        functionName: "totalSupply",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.sMusdVault,
        abi: SMUSD_SAVINGS_ABI,
        functionName: "yieldIndex",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.stabilityPool,
        abi: STABILITY_POOL_ABI,
        functionName: "getTotalMUSDDeposits",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.stabilityPool,
        abi: STABILITY_POOL_ABI,
        functionName: "getCollateralBalance",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.upMusdVault,
        abi: ERC4626_VAULT_ABI,
        functionName: "totalAssets",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.upMusdVault,
        abi: ERC4626_VAULT_ABI,
        functionName: "totalSupply",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.upBtcVault,
        abi: ERC4626_VAULT_ABI,
        functionName: "totalAssets",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.morphoBtcMusdcVault,
        abi: ERC4626_VAULT_ABI,
        functionName: "totalAssets",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.mbLpVault,
        abi: MBLP_VAULT_ABI,
        functionName: "totalSupply",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: MEZO_EARN_ADDRESSES.mbLpVault,
        abi: MBLP_VAULT_ABI,
        functionName: "pricePerShare",
      })
      .catch(() => 0n),
    operatorAddr
      ? readWalletTokenBalances(operatorAddr)
      : Promise.resolve<EarnWalletBalances>({
          address: "",
          btc: 0,
          musd: 0,
          mezo: 0,
          stMezo: 0,
          mUsdc: 0,
        }),
    userAddr ? readWalletTokenBalances(userAddr) : Promise.resolve(null),
  ]);

  // User & Operator vault position balances
  const readVaultUserPos = async (
    target: `0x${string}` | null
  ): Promise<{
    sMusd: number;
    sMusdAllow: number;
    spDeposit: number;
    upMusd: number;
    upMusdAllow: number;
    upBtc: number;
    upBtcAllow: number;
    morpho: number;
    mbLp: number;
  }> => {
    if (!target) {
      return {
        sMusd: 0,
        sMusdAllow: 0,
        spDeposit: 0,
        upMusd: 0,
        upMusdAllow: 0,
        upBtc: 0,
        upBtcAllow: 0,
        morpho: 0,
        mbLp: 0,
      };
    }
    const [smB, smA, spD, umB, umA, ubB, ubA, moB, mbB] = await Promise.all([
      publicClient
        .readContract({
          address: MEZO_EARN_ADDRESSES.sMusdVault,
          abi: SMUSD_SAVINGS_ABI,
          functionName: "balanceOf",
          args: [target],
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: MEZO_EARN_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "allowance",
          args: [target, MEZO_EARN_ADDRESSES.sMusdVault],
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: MEZO_EARN_ADDRESSES.stabilityPool,
          abi: STABILITY_POOL_ABI,
          functionName: "getCompoundedMUSDDeposit",
          args: [target],
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: MEZO_EARN_ADDRESSES.upMusdVault,
          abi: ERC4626_VAULT_ABI,
          functionName: "balanceOf",
          args: [target],
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: MEZO_EARN_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "allowance",
          args: [target, MEZO_EARN_ADDRESSES.upMusdVault],
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: MEZO_EARN_ADDRESSES.upBtcVault,
          abi: ERC4626_VAULT_ABI,
          functionName: "balanceOf",
          args: [target],
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: MEZO_EARN_ADDRESSES.btcToken,
          abi: MUSD_ERC20_ABI,
          functionName: "allowance",
          args: [target, MEZO_EARN_ADDRESSES.upBtcVault],
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: MEZO_EARN_ADDRESSES.morphoBtcMusdcVault,
          abi: ERC4626_VAULT_ABI,
          functionName: "balanceOf",
          args: [target],
        })
        .catch(() => 0n),
      publicClient
        .readContract({
          address: MEZO_EARN_ADDRESSES.mbLpVault,
          abi: MBLP_VAULT_ABI,
          functionName: "balanceOf",
          args: [target],
        })
        .catch(() => 0n),
    ]);
    return {
      sMusd: Number(formatEther(smB as bigint)),
      sMusdAllow: Number(formatEther(smA as bigint)),
      spDeposit: Number(formatEther(spD as bigint)),
      upMusd: Number(formatEther(umB as bigint)),
      upMusdAllow: Number(formatEther(umA as bigint)),
      upBtc: Number(formatEther(ubB as bigint)),
      upBtcAllow: Number(formatEther(ubA as bigint)),
      morpho: Number(formatUnits(moB as bigint, 6)),
      mbLp: Number(formatEther(mbB as bigint)),
    };
  };

  const [opVaultPos, userVaultPos] = await Promise.all([
    readVaultUserPos(operatorAddr),
    readVaultUserPos(userAddr),
  ]);

  // Read live Tigris Pools reserves & gauge weights
  const poolSpecs: Array<{
    id: EarnPoolTelemetry["id"];
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
    rewardTokenSymbol: string;
    yieldAngle: string;
    btcLowRole: string;
  }> = [
    {
      id: "pool-musd-mezo",
      name: "Tigris vAMM-MUSD/MEZO",
      symbol: "vAMM-MUSD/MEZO",
      poolAddress: MEZO_EARN_ADDRESSES.poolMusdMezo,
      stable: false,
      token0Symbol: "MUSD",
      token0Address: MEZO_EARN_ADDRESSES.musdToken,
      token0Decimals: 18,
      token1Symbol: "MEZO",
      token1Address: MEZO_EARN_ADDRESSES.mezoToken,
      token1Decimals: 18,
      rewardTokenSymbol: "Swap Fees",
      yieldAngle: "Primary MUSD + MEZO volatile AMM pool — collects 0.3% swap fees on MEZO volume.",
      btcLowRole: "Deploy both idle MUSD and MEZO here when BTC trends sideways/low.",
    },
    {
      id: "pool-musd-btc",
      name: "Tigris vAMM-MUSD/BTC",
      symbol: "vAMM-MUSD/BTC",
      poolAddress: MEZO_EARN_ADDRESSES.poolMusdBtc,
      gaugeAddress: MEZO_EARN_ADDRESSES.gaugeMusdBtc,
      stable: false,
      token0Symbol: "MUSD",
      token0Address: MEZO_EARN_ADDRESSES.musdToken,
      token0Decimals: 18,
      token1Symbol: "BTC",
      token1Address: MEZO_EARN_ADDRESSES.btcToken,
      token1Decimals: 18,
      rewardTokenSymbol: "BTC (VeBTC Gauge)",
      yieldAngle: "Flagship MUSD/BTC pool with active VeBTC Gauge earning BTC rewards.",
      btcLowRole: "Optimal LP entry during BTC dips: earns fees + BTC gauge + rebalances into cheap BTC.",
    },
    {
      id: "pool-musd-musdc",
      name: "Tigris sAMM-MUSD/mUSDC",
      symbol: "sAMM-MUSD/mUSDC",
      poolAddress: MEZO_EARN_ADDRESSES.poolMusdMusdc,
      gaugeAddress: MEZO_EARN_ADDRESSES.gaugeMusdMusdc,
      stable: true,
      token0Symbol: "MUSD",
      token0Address: MEZO_EARN_ADDRESSES.musdToken,
      token0Decimals: 18,
      token1Symbol: "mUSDC",
      token1Address: MEZO_EARN_ADDRESSES.mUsdcToken,
      token1Decimals: 6,
      rewardTokenSymbol: "BTC (VeBTC Gauge)",
      yieldAngle: "Stablecoin sAMM curve with highest VeBTC Voter weight earning BTC incentives.",
      btcLowRole: "Low-IL stable MUSD sanctuary when BTC volatility spikes.",
    },
    {
      id: "pool-mezo-stmezo",
      name: "Tigris vAMM-MEZO/stMEZO",
      symbol: "vAMM-MEZO/stMEZO",
      poolAddress: MEZO_EARN_ADDRESSES.poolMezoStMezo,
      stable: false,
      token0Symbol: "MEZO",
      token0Address: MEZO_EARN_ADDRESSES.mezoToken,
      token0Decimals: 18,
      token1Symbol: "stMEZO",
      token1Address: MEZO_EARN_ADDRESSES.stMezoToken,
      token1Decimals: 18,
      rewardTokenSymbol: "Swap Fees + Staked Yield",
      yieldAngle: "MEZO / Lockless Staked MEZO correlated pair with minimal divergence risk.",
      btcLowRole: "Put idle MEZO to work alongside staked stMEZO without USD impermanent loss.",
    },
    {
      id: "pool-mcbbtc-btc",
      name: "Tigris sAMM-mcbBTC/BTC",
      symbol: "sAMM-mcbBTC/BTC",
      poolAddress: MEZO_EARN_ADDRESSES.poolMcbBtcBtc,
      gaugeAddress: MEZO_EARN_ADDRESSES.gaugeMcbBtcBtc,
      stable: true,
      token0Symbol: "mcbBTC",
      token0Address: MEZO_EARN_ADDRESSES.mcbBtcToken,
      token0Decimals: 8,
      token1Symbol: "BTC",
      token1Address: MEZO_EARN_ADDRESSES.btcToken,
      token1Decimals: 18,
      rewardTokenSymbol: "BTC (VeBTC Gauge)",
      yieldAngle: "Correlated BTC LST stable pool staked into VeBTC Gauge.",
      btcLowRole: "Earn pure BTC-on-BTC LP fees while holding BTC long-term.",
    },
  ];

  const poolTelemetryList: EarnPoolTelemetry[] = await Promise.all(
    poolSpecs.map(async (spec) => {
      const [r0W, r1W, wW, opLpW, userLpW, opGaugeW, userGaugeW, userEarnedW] =
        await Promise.all([
          publicClient
            .readContract({
              address: spec.poolAddress,
              abi: TIGRIS_POOL_ABI,
              functionName: "reserve0",
            })
            .catch(() => 0n),
          publicClient
            .readContract({
              address: spec.poolAddress,
              abi: TIGRIS_POOL_ABI,
              functionName: "reserve1",
            })
            .catch(() => 0n),
          spec.gaugeAddress
            ? publicClient
                .readContract({
                  address: MEZO_EARN_ADDRESSES.veBtcVoter,
                  abi: VE_BTC_VOTER_ABI,
                  functionName: "weights",
                  args: [spec.poolAddress],
                })
                .catch(() => 0n)
            : Promise.resolve(0n),
          operatorAddr
            ? publicClient
                .readContract({
                  address: spec.poolAddress,
                  abi: TIGRIS_POOL_ABI,
                  functionName: "balanceOf",
                  args: [operatorAddr],
                })
                .catch(() => 0n)
            : Promise.resolve(0n),
          userAddr
            ? publicClient
                .readContract({
                  address: spec.poolAddress,
                  abi: TIGRIS_POOL_ABI,
                  functionName: "balanceOf",
                  args: [userAddr],
                })
                .catch(() => 0n)
            : Promise.resolve(0n),
          spec.gaugeAddress && operatorAddr
            ? publicClient
                .readContract({
                  address: spec.gaugeAddress,
                  abi: TIGRIS_GAUGE_ABI,
                  functionName: "balanceOf",
                  args: [operatorAddr],
                })
                .catch(() => 0n)
            : Promise.resolve(0n),
          spec.gaugeAddress && userAddr
            ? publicClient
                .readContract({
                  address: spec.gaugeAddress,
                  abi: TIGRIS_GAUGE_ABI,
                  functionName: "balanceOf",
                  args: [userAddr],
                })
                .catch(() => 0n)
            : Promise.resolve(0n),
          spec.gaugeAddress && userAddr
            ? publicClient
                .readContract({
                  address: spec.gaugeAddress,
                  abi: TIGRIS_GAUGE_ABI,
                  functionName: "earned",
                  args: [userAddr],
                })
                .catch(() => 0n)
            : Promise.resolve(0n),
        ]);

      const reserve0 = Number(formatUnits(r0W as bigint, spec.token0Decimals));
      const reserve1 = Number(formatUnits(r1W as bigint, spec.token1Decimals));
      const spot1Per0 = reserve0 > 0 ? reserve1 / reserve0 : 0;
      const spot0Per1 = reserve1 > 0 ? reserve0 / reserve1 : 0;

      let tvlUsd = 0;
      if (spec.token0Symbol === "MUSD") {
        tvlUsd = reserve0 * 2;
      } else if (spec.token1Symbol === "BTC") {
        tvlUsd = reserve1 * market.btcPriceUsd * 2;
      }

      return {
        ...spec,
        reserve0,
        reserve1,
        tvlUsd,
        spotPriceToken1PerToken0: spot1Per0,
        spotPriceToken0PerToken1: spot0Per1,
        voterWeight: Number(formatEther((wW as bigint) || 0n)),
        userLpBalance: Number(formatEther((userLpW as bigint) || 0n)),
        userGaugeStakedBalance: Number(formatEther((userGaugeW as bigint) || 0n)),
        userEarnedReward: Number(formatEther((userEarnedW as bigint) || 0n)),
        operatorLpBalance: Number(formatEther((opLpW as bigint) || 0n)),
        operatorGaugeStakedBalance: Number(formatEther((opGaugeW as bigint) || 0n)),
      };
    })
  );

  const musdMezoPool = poolTelemetryList.find((p) => p.id === "pool-musd-mezo");
  const mezoSpotUsd = musdMezoPool?.spotPriceToken0PerToken1 || 8.82;
  // Re-estimate MEZO/stMEZO TVL using implied MEZO price
  for (const p of poolTelemetryList) {
    if (p.id === "pool-mezo-stmezo" && p.reserve0 > 0) {
      p.tvlUsd = p.reserve0 * mezoSpotUsd * 2;
    }
  }

  const sMusdTotal = Number(formatEther((sMusdSupplyW as bigint) || 0n));
  const spTotalMusd = Number(formatEther((spTotalMusdW as bigint) || 0n));
  const spTotalBtc = Number(formatEther((spTotalCollW as bigint) || 0n));
  const upMusdAssets = Number(formatEther((upMusdAssetsW as bigint) || 0n));
  const upMusdSupply = Number(formatEther((upMusdSupplyW as bigint) || 0n));
  const upBtcAssets = Number(formatEther((upBtcAssetsW as bigint) || 0n));
  const morphoAssets = Number(formatUnits((morphoAssetsW as bigint) || 0n, 6));
  const mbLpSupply = Number(formatEther((mbLpSupplyW as bigint) || 0n));
  const mbLpPps = Number(formatEther((mbLpPpsW as bigint) || 0n));

  const vaults: EarnVaultTelemetry[] = [
    {
      id: "smusd",
      name: "sMUSD Savings Vault",
      symbol: "sMUSD",
      contractAddress: MEZO_EARN_ADDRESSES.sMusdVault,
      assetSymbol: "MUSD",
      assetAddress: MEZO_EARN_ADDRESSES.musdToken,
      tvlNative: sMusdTotal,
      tvlUsd: sMusdTotal,
      sharePrice: 1.0,
      totalSupply: sMusdTotal,
      yieldAngle: `Native MUSDSavingsRate protocol yield (yieldIndex ${Number(formatEther((sMusdYieldIdxW as bigint) || 0n)).toFixed(2)}).`,
      riskTier: "CONSERVATIVE",
      btcLowRole: "Primary defensive park for MUSD when BTC trend weakens; accrues continuous MUSD yield.",
      interactionType: "SMUSD",
      supportsWithdraw: true,
      userBalance: userVaultPos.sMusd,
      userAllowance: userVaultPos.sMusdAllow,
      operatorBalance: opVaultPos.sMusd,
    },
    {
      id: "upmusd",
      name: "Upshift MUSD Vault",
      symbol: "upMUSD",
      contractAddress: MEZO_EARN_ADDRESSES.upMusdVault,
      assetSymbol: "MUSD",
      assetAddress: MEZO_EARN_ADDRESSES.musdToken,
      tvlNative: upMusdAssets,
      tvlUsd: upMusdAssets,
      sharePrice: upMusdSupply > 0 ? upMusdAssets / upMusdSupply : 1.0,
      totalSupply: upMusdSupply,
      yieldAngle: "Curated ERC-4626 MUSD Yield Vault with institutional liquidity deployment.",
      riskTier: "CONSERVATIVE",
      btcLowRole: "High-TVL ERC-4626 MUSD yield destination during risk-off / BTC low cycles.",
      interactionType: "ERC4626",
      supportsWithdraw: false,
      userBalance: userVaultPos.upMusd,
      userAllowance: userVaultPos.upMusdAllow,
      operatorBalance: opVaultPos.upMusd,
    },
    {
      id: "stability-pool",
      name: "Mezo StabilityPool",
      symbol: "SP-MUSD",
      contractAddress: MEZO_EARN_ADDRESSES.stabilityPool,
      assetSymbol: "MUSD",
      assetAddress: MEZO_EARN_ADDRESSES.musdToken,
      tvlNative: spTotalMusd,
      tvlUsd: spTotalMusd + spTotalBtc * market.btcPriceUsd,
      sharePrice: 1.0,
      totalSupply: spTotalMusd,
      yieldAngle: `Absorbs Trove liquidations & distributes BTC collateral (~${spTotalBtc.toFixed(4)} BTC pool balance).`,
      riskTier: "BALANCED",
      btcLowRole: "Best asymmetric BTC-dip vault: idle MUSD automatically buys liquidated BTC at ~10% discount.",
      interactionType: "STABILITY_POOL",
      supportsWithdraw: true,
      userBalance: userVaultPos.spDeposit,
      userAllowance: 0,
      operatorBalance: opVaultPos.spDeposit,
    },
    {
      id: "upbtc",
      name: "Upshift Mezo Bitcoin Vault",
      symbol: "upBTC",
      contractAddress: MEZO_EARN_ADDRESSES.upBtcVault,
      assetSymbol: "BTC",
      assetAddress: MEZO_EARN_ADDRESSES.btcToken,
      tvlNative: upBtcAssets,
      tvlUsd: upBtcAssets * market.btcPriceUsd,
      sharePrice: 1.0,
      totalSupply: upBtcAssets,
      yieldAngle: "Canonical ERC-4626 BTC yield vault for productive Bitcoin treasury reserves.",
      riskTier: "GROWTH",
      btcLowRole: "Compounds native BTC yield once accumulated during dips.",
      interactionType: "ERC4626",
      supportsWithdraw: false,
      userBalance: userVaultPos.upBtc,
      userAllowance: userVaultPos.upBtcAllow,
      operatorBalance: opVaultPos.upBtc,
    },
    {
      id: "mblp",
      name: "Mezo BTC LP Vault",
      symbol: "mbLP",
      contractAddress: MEZO_EARN_ADDRESSES.mbLpVault,
      assetSymbol: "MUSD + BTC",
      assetAddress: MEZO_EARN_ADDRESSES.musdToken,
      tvlNative: mbLpSupply,
      tvlUsd: mbLpSupply * (mbLpPps || 1),
      sharePrice: mbLpPps || 1,
      totalSupply: mbLpSupply,
      yieldAngle: "Managed MUSD/BTC LP vault paired with Tigris vAMM-MUSD/BTC & BTC Gauge rewards.",
      riskTier: "GROWTH",
      btcLowRole: "Automated dual-asset MUSD + BTC LP compounding.",
      interactionType: "MBLP",
      supportsWithdraw: true,
      userBalance: userVaultPos.mbLp,
      userAllowance: 0,
      operatorBalance: 0,
    },
    {
      id: "morpho-musdc",
      name: "Morpho BTC-mUSDC Vault",
      symbol: "mUSDC-v2",
      contractAddress: MEZO_EARN_ADDRESSES.morphoBtcMusdcVault,
      assetSymbol: "mUSDC",
      assetAddress: MEZO_EARN_ADDRESSES.mUsdcToken,
      tvlNative: morphoAssets,
      tvlUsd: morphoAssets,
      sharePrice: 1.0,
      totalSupply: morphoAssets,
      yieldAngle: "Morpho VaultV2 lending market backed by BTC collateral borrowers.",
      riskTier: "CONSERVATIVE",
      btcLowRole: "Stable mUSDC lending yield complementary to MUSD vaults.",
      interactionType: "ERC4626",
      supportsWithdraw: true,
      userBalance: userVaultPos.morpho,
      userAllowance: 0,
      operatorBalance: 0,
    },
  ];

  const recommendation = classifyBtcEarnRegime({
    btcPriceUsd: market.btcPriceUsd,
    btc24hChangePct: market.btc24hChangePct,
    rangePositionPct: market.rangePositionPct,
    fearGreedIndex: market.fearGreedIndex,
    trendDirection: market.trendDirection,
    sentimentLabel: market.sentimentLabel,
    riskMode: mandate.riskMode,
  });

  return {
    ok: true,
    chainId: 31611,
    btcPriceUsd: market.btcPriceUsd,
    btc24hChangePct: market.btc24hChangePct,
    mezoSpotUsd,
    fearGreedIndex: market.fearGreedIndex,
    fearGreedLabel: market.fearGreedLabel,
    trendDirection: market.trendDirection,
    sentimentLabel: market.sentimentLabel,
    riskMode: mandate.riskMode,
    vaults,
    pools: poolTelemetryList,
    operatorBalances: opBalances,
    userBalances,
    recommendation,
    fetchedAt: new Date().toISOString(),
  };
}

export async function quoteTigrisSwapServer(params: {
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  stable: boolean;
  amountInWei: bigint;
  viaMusdHop?: boolean;
}): Promise<{ amountOutWei: bigint; routes: Array<{ from: `0x${string}`; to: `0x${string}`; stable: boolean; factory: `0x${string}` }> }> {
  const publicClient = getMezoPublicClient();
  const factory = MEZO_EARN_ADDRESSES.tigrisPoolFactory;
  const musd = MEZO_EARN_ADDRESSES.musdToken;

  const routes =
    params.viaMusdHop &&
    params.fromToken.toLowerCase() !== musd.toLowerCase() &&
    params.toToken.toLowerCase() !== musd.toLowerCase()
      ? [
          { from: params.fromToken, to: musd, stable: false, factory },
          { from: musd, to: params.toToken, stable: params.stable, factory },
        ]
      : [{ from: params.fromToken, to: params.toToken, stable: params.stable, factory }];

  const amounts = (await publicClient.readContract({
    address: MEZO_EARN_ADDRESSES.tigrisRouter,
    abi: TIGRIS_ROUTER_ABI,
    functionName: "getAmountsOut",
    args: [params.amountInWei, routes],
  })) as readonly bigint[];

  return {
    amountOutWei: amounts[amounts.length - 1] ?? 0n,
    routes,
  };
}

async function ensureExactApproval(params: {
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
  amountWei: bigint;
  nextNonce: () => Promise<number>;
}): Promise<`0x${string}` | undefined> {
  const publicClient = getMezoPublicClient();
  const { account, walletClient } = getMezoOperatorWallet();
  const allowance = (await publicClient.readContract({
    address: params.tokenAddress,
    abi: MUSD_ERC20_ABI,
    functionName: "allowance",
    args: [account.address, params.spender],
  })) as bigint;

  if (allowance >= params.amountWei) return undefined;

  await publicClient.simulateContract({
    account: account.address,
    address: params.tokenAddress,
    abi: MUSD_ERC20_ABI,
    functionName: "approve",
    args: [params.spender, params.amountWei],
  });
  const nonce = await params.nextNonce();
  const txHash = await walletClient.writeContract({
    address: params.tokenAddress,
    abi: MUSD_ERC20_ABI,
    functionName: "approve",
    args: [params.spender, params.amountWei],
    nonce,
    gas: 110000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export type AgentEarnTarget =
  | "smusd"
  | "upmusd"
  | "stability-pool"
  | "pool-musd-mezo"
  | "pool-musd-btc"
  | "pool-musd-musdc";

export interface AgentEarnExecutionResult {
  ok: boolean;
  venueId: AgentEarnTarget;
  venueLabel: string;
  txHashes: `0x${string}`[];
  primaryTxHash?: `0x${string}`;
  amountLabel: string;
  detail: string;
  bootstrappedFromBtc: boolean;
}

/**
 * Executes an autonomous Operator deployment of MUSD / MEZO into a canonical Mezo Earn Vault
 * or Tigris Pool on Testnet (31611). If the Operator holds 0 MUSD/MEZO but >= 0.02 BTC, it
 * safely converts a bounded 0.0001 BTC slice via Tigris Router first, keeping >= 0.015 BTC for gas.
 */
export async function executeOperatorEarnInvestment(params: {
  venueId: AgentEarnTarget;
  musdAmount?: number;
  skipLock?: boolean;
}): Promise<AgentEarnExecutionResult> {
  const runner = async (): Promise<AgentEarnExecutionResult> => {
    const publicClient = getMezoPublicClient();
    const { account, walletClient } = getMezoOperatorWallet();
    const txHashes: `0x${string}`[] = [];
    const nextNonce = () =>
      publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });

    const nativeBtcWei = await publicClient.getBalance({ address: account.address });
    let opMusdWei = (await publicClient.readContract({
      address: MEZO_EARN_ADDRESSES.musdToken,
      abi: MUSD_ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint;
    let opMezoWei = (await publicClient.readContract({
      address: MEZO_EARN_ADDRESSES.mezoToken,
      abi: MUSD_ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint;

    let bootstrappedFromBtc = false;
    const minDesiredMusdWei = parseEther(
      String(Math.max(2, Math.min(15, params.musdAmount ?? 4)))
    );

    // Bounded BTC -> MUSD swap if Operator has BTC buffer but insufficient MUSD
    if (opMusdWei < minDesiredMusdWei && nativeBtcWei > GAS_SAFETY_FLOOR_BTC + parseEther("0.0002")) {
      const swapBtcWei = parseEther("0.00012"); // ~$9 MUSD at pool rate, < 0.3% of 0.049 BTC
      const { amountOutWei, routes } = await quoteTigrisSwapServer({
        fromToken: MEZO_EARN_ADDRESSES.btcToken,
        toToken: MEZO_EARN_ADDRESSES.musdToken,
        stable: false,
        amountInWei: swapBtcWei,
      });
      if (amountOutWei > parseEther("1")) {
        await ensureExactApproval({
          tokenAddress: MEZO_EARN_ADDRESSES.btcToken,
          spender: MEZO_EARN_ADDRESSES.tigrisRouter,
          amountWei: swapBtcWei,
          nextNonce,
        });
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
        const minOut = (amountOutWei * 95n) / 100n;
        await publicClient.simulateContract({
          account: account.address,
          address: MEZO_EARN_ADDRESSES.tigrisRouter,
          abi: TIGRIS_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [swapBtcWei, minOut, routes, account.address, deadline],
        });
        const nonce = await nextNonce();
        const swapTx = await walletClient.writeContract({
          address: MEZO_EARN_ADDRESSES.tigrisRouter,
          abi: TIGRIS_ROUTER_ABI,
          functionName: "swapExactTokensForTokens",
          args: [swapBtcWei, minOut, routes, account.address, deadline],
          nonce,
          gas: 320000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: swapTx });
        txHashes.push(swapTx);
        bootstrappedFromBtc = true;

        opMusdWei = (await publicClient.readContract({
          address: MEZO_EARN_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "balanceOf",
          args: [account.address],
        })) as bigint;
      }
    }

    // 1. Canonical MUSD Earn Vaults (sMUSD / upMUSD / StabilityPool)
    if (
      params.venueId === "smusd" ||
      params.venueId === "upmusd" ||
      params.venueId === "stability-pool"
    ) {
      if (opMusdWei < parseEther("0.5")) {
        throw new Error(
          "Operator has < 0.5 MUSD and insufficient BTC buffer above 0.015 BTC safety floor."
        );
      }
      const deployWei =
        opMusdWei > minDesiredMusdWei ? minDesiredMusdWei : (opMusdWei * 80n) / 100n;
      const deployFormatted = Number(formatEther(deployWei)).toFixed(2);

      if (params.venueId === "smusd") {
        await ensureExactApproval({
          tokenAddress: MEZO_EARN_ADDRESSES.musdToken,
          spender: MEZO_EARN_ADDRESSES.sMusdVault,
          amountWei: deployWei,
          nextNonce,
        });
        await publicClient.simulateContract({
          account: account.address,
          address: MEZO_EARN_ADDRESSES.sMusdVault,
          abi: SMUSD_SAVINGS_ABI,
          functionName: "deposit",
          args: [deployWei],
        });
        const nonce = await nextNonce();
        const depTx = await walletClient.writeContract({
          address: MEZO_EARN_ADDRESSES.sMusdVault,
          abi: SMUSD_SAVINGS_ABI,
          functionName: "deposit",
          args: [deployWei],
          nonce,
          gas: 280000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: depTx });
        txHashes.push(depTx);
        return {
          ok: true,
          venueId: "smusd",
          venueLabel: "sMUSD Savings Vault",
          txHashes,
          primaryTxHash: depTx,
          amountLabel: `${deployFormatted} MUSD`,
          detail: `Staked ${deployFormatted} MUSD into canonical sMUSD Savings Vault on Mezo 31611${bootstrappedFromBtc ? " (sourced via Tigris BTC->MUSD)" : ""}.`,
          bootstrappedFromBtc,
        };
      }

      if (params.venueId === "upmusd") {
        await ensureExactApproval({
          tokenAddress: MEZO_EARN_ADDRESSES.musdToken,
          spender: MEZO_EARN_ADDRESSES.upMusdVault,
          amountWei: deployWei,
          nextNonce,
        });
        await publicClient.simulateContract({
          account: account.address,
          address: MEZO_EARN_ADDRESSES.upMusdVault,
          abi: ERC4626_VAULT_ABI,
          functionName: "deposit",
          args: [deployWei, account.address],
        });
        const nonce = await nextNonce();
        const depTx = await walletClient.writeContract({
          address: MEZO_EARN_ADDRESSES.upMusdVault,
          abi: ERC4626_VAULT_ABI,
          functionName: "deposit",
          args: [deployWei, account.address],
          nonce,
          gas: 320000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: depTx });
        txHashes.push(depTx);
        return {
          ok: true,
          venueId: "upmusd",
          venueLabel: "Upshift MUSD Vault (upMUSD)",
          txHashes,
          primaryTxHash: depTx,
          amountLabel: `${deployFormatted} MUSD`,
          detail: `Deposited ${deployFormatted} MUSD into canonical upMUSD ERC-4626 Vault on Mezo 31611${bootstrappedFromBtc ? " (sourced via Tigris BTC->MUSD)" : ""}.`,
          bootstrappedFromBtc,
        };
      }

      // StabilityPool (no ERC20 approve needed; transfers internally)
      await publicClient.simulateContract({
        account: account.address,
        address: MEZO_EARN_ADDRESSES.stabilityPool,
        abi: STABILITY_POOL_ABI,
        functionName: "provideToSP",
        args: [deployWei],
      });
      const nonce = await nextNonce();
      const spTx = await walletClient.writeContract({
        address: MEZO_EARN_ADDRESSES.stabilityPool,
        abi: STABILITY_POOL_ABI,
        functionName: "provideToSP",
        args: [deployWei],
        nonce,
        gas: 350000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: spTx });
      txHashes.push(spTx);
      return {
        ok: true,
        venueId: "stability-pool",
        venueLabel: "Mezo StabilityPool",
        txHashes,
        primaryTxHash: spTx,
        amountLabel: `${deployFormatted} MUSD`,
        detail: `Deployed ${deployFormatted} MUSD into Liquity StabilityPool to capture discounted BTC liquidations${bootstrappedFromBtc ? " (sourced via Tigris BTC->MUSD)" : ""}.`,
        bootstrappedFromBtc,
      };
    }

    // 2. Tigris AMM Pools: vAMM-MUSD/MEZO
    if (params.venueId === "pool-musd-mezo") {
      if (opMezoWei < parseEther("0.1") && opMusdWei >= parseEther("2")) {
        const swapMusdForMezo = (opMusdWei * 45n) / 100n;
        const { amountOutWei, routes } = await quoteTigrisSwapServer({
          fromToken: MEZO_EARN_ADDRESSES.musdToken,
          toToken: MEZO_EARN_ADDRESSES.mezoToken,
          stable: false,
          amountInWei: swapMusdForMezo,
        });
        if (amountOutWei > 0n) {
          await ensureExactApproval({
            tokenAddress: MEZO_EARN_ADDRESSES.musdToken,
            spender: MEZO_EARN_ADDRESSES.tigrisRouter,
            amountWei: swapMusdForMezo,
            nextNonce,
          });
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
          await publicClient.simulateContract({
            account: account.address,
            address: MEZO_EARN_ADDRESSES.tigrisRouter,
            abi: TIGRIS_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [
              swapMusdForMezo,
              (amountOutWei * 94n) / 100n,
              routes,
              account.address,
              deadline,
            ],
          });
          const sNonce = await nextNonce();
          const sTx = await walletClient.writeContract({
            address: MEZO_EARN_ADDRESSES.tigrisRouter,
            abi: TIGRIS_ROUTER_ABI,
            functionName: "swapExactTokensForTokens",
            args: [
              swapMusdForMezo,
              (amountOutWei * 94n) / 100n,
              routes,
              account.address,
              deadline,
            ],
            nonce: sNonce,
            gas: 320000n,
          });
          await publicClient.waitForTransactionReceipt({ hash: sTx });
          txHashes.push(sTx);

          [opMusdWei, opMezoWei] = (await Promise.all([
            publicClient.readContract({
              address: MEZO_EARN_ADDRESSES.musdToken,
              abi: MUSD_ERC20_ABI,
              functionName: "balanceOf",
              args: [account.address],
            }),
            publicClient.readContract({
              address: MEZO_EARN_ADDRESSES.mezoToken,
              abi: MUSD_ERC20_ABI,
              functionName: "balanceOf",
              args: [account.address],
            }),
          ])) as [bigint, bigint];
        }
      }

      if (opMusdWei <= 0n || opMezoWei <= 0n) {
        throw new Error("Operator needs both MUSD & MEZO balances for vAMM-MUSD/MEZO LP.");
      }

      const [quotedA, quotedB] = (await publicClient.readContract({
        address: MEZO_EARN_ADDRESSES.tigrisRouter,
        abi: TIGRIS_ROUTER_ABI,
        functionName: "quoteAddLiquidity",
        args: [
          MEZO_EARN_ADDRESSES.musdToken,
          MEZO_EARN_ADDRESSES.mezoToken,
          false,
          MEZO_EARN_ADDRESSES.tigrisPoolFactory,
          opMusdWei,
          opMezoWei,
        ],
      })) as [bigint, bigint, bigint];

      await ensureExactApproval({
        tokenAddress: MEZO_EARN_ADDRESSES.musdToken,
        spender: MEZO_EARN_ADDRESSES.tigrisRouter,
        amountWei: quotedA,
        nextNonce,
      });
      await ensureExactApproval({
        tokenAddress: MEZO_EARN_ADDRESSES.mezoToken,
        spender: MEZO_EARN_ADDRESSES.tigrisRouter,
        amountWei: quotedB,
        nextNonce,
      });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      await publicClient.simulateContract({
        account: account.address,
        address: MEZO_EARN_ADDRESSES.tigrisRouter,
        abi: TIGRIS_ROUTER_ABI,
        functionName: "addLiquidity",
        args: [
          MEZO_EARN_ADDRESSES.musdToken,
          MEZO_EARN_ADDRESSES.mezoToken,
          false,
          quotedA,
          quotedB,
          (quotedA * 95n) / 100n,
          (quotedB * 95n) / 100n,
          account.address,
          deadline,
        ],
      });
      const lpNonce = await nextNonce();
      const lpTx = await walletClient.writeContract({
        address: MEZO_EARN_ADDRESSES.tigrisRouter,
        abi: TIGRIS_ROUTER_ABI,
        functionName: "addLiquidity",
        args: [
          MEZO_EARN_ADDRESSES.musdToken,
          MEZO_EARN_ADDRESSES.mezoToken,
          false,
          quotedA,
          quotedB,
          (quotedA * 95n) / 100n,
          (quotedB * 95n) / 100n,
          account.address,
          deadline,
        ],
        nonce: lpNonce,
        gas: 400000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: lpTx });
      txHashes.push(lpTx);

      const aStr = Number(formatEther(quotedA)).toFixed(2);
      const bStr = Number(formatEther(quotedB)).toFixed(3);
      return {
        ok: true,
        venueId: "pool-musd-mezo",
        venueLabel: "Tigris vAMM-MUSD/MEZO LP",
        txHashes,
        primaryTxHash: lpTx,
        amountLabel: `${aStr} MUSD + ${bStr} MEZO`,
        detail: `Deployed ${aStr} MUSD + ${bStr} MEZO into Tigris vAMM-MUSD/MEZO pool on Mezo 31611.`,
        bootstrappedFromBtc,
      };
    }

    // 3. Tigris vAMM-MUSD/BTC (or sAMM-MUSD/mUSDC)
    if (params.venueId === "pool-musd-btc") {
      const desiredMusd =
        opMusdWei > minDesiredMusdWei ? minDesiredMusdWei : opMusdWei;
      const desiredBtc =
        nativeBtcWei > GAS_SAFETY_FLOOR_BTC + parseEther("0.0001")
          ? parseEther("0.0001")
          : 0n;
      if (desiredMusd <= 0n || desiredBtc <= 0n) {
        throw new Error("Insufficient MUSD/BTC margin above gas safety floor.");
      }

      const [quotedA, quotedB] = (await publicClient.readContract({
        address: MEZO_EARN_ADDRESSES.tigrisRouter,
        abi: TIGRIS_ROUTER_ABI,
        functionName: "quoteAddLiquidity",
        args: [
          MEZO_EARN_ADDRESSES.musdToken,
          MEZO_EARN_ADDRESSES.btcToken,
          false,
          MEZO_EARN_ADDRESSES.tigrisPoolFactory,
          desiredMusd,
          desiredBtc,
        ],
      })) as [bigint, bigint, bigint];

      await ensureExactApproval({
        tokenAddress: MEZO_EARN_ADDRESSES.musdToken,
        spender: MEZO_EARN_ADDRESSES.tigrisRouter,
        amountWei: quotedA,
        nextNonce,
      });
      await ensureExactApproval({
        tokenAddress: MEZO_EARN_ADDRESSES.btcToken,
        spender: MEZO_EARN_ADDRESSES.tigrisRouter,
        amountWei: quotedB,
        nextNonce,
      });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      await publicClient.simulateContract({
        account: account.address,
        address: MEZO_EARN_ADDRESSES.tigrisRouter,
        abi: TIGRIS_ROUTER_ABI,
        functionName: "addLiquidity",
        args: [
          MEZO_EARN_ADDRESSES.musdToken,
          MEZO_EARN_ADDRESSES.btcToken,
          false,
          quotedA,
          quotedB,
          (quotedA * 95n) / 100n,
          (quotedB * 95n) / 100n,
          account.address,
          deadline,
        ],
      });
      const lpNonce = await nextNonce();
      const lpTx = await walletClient.writeContract({
        address: MEZO_EARN_ADDRESSES.tigrisRouter,
        abi: TIGRIS_ROUTER_ABI,
        functionName: "addLiquidity",
        args: [
          MEZO_EARN_ADDRESSES.musdToken,
          MEZO_EARN_ADDRESSES.btcToken,
          false,
          quotedA,
          quotedB,
          (quotedA * 95n) / 100n,
          (quotedB * 95n) / 100n,
          account.address,
          deadline,
        ],
        nonce: lpNonce,
        gas: 420000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: lpTx });
      txHashes.push(lpTx);

      // Stake LP in VeBTC Gauge if LP > 0
      const lpBal = (await publicClient.readContract({
        address: MEZO_EARN_ADDRESSES.poolMusdBtc,
        abi: TIGRIS_POOL_ABI,
        functionName: "balanceOf",
        args: [account.address],
      })) as bigint;
      if (lpBal > 0n) {
        await ensureExactApproval({
          tokenAddress: MEZO_EARN_ADDRESSES.poolMusdBtc,
          spender: MEZO_EARN_ADDRESSES.gaugeMusdBtc,
          amountWei: lpBal,
          nextNonce,
        });
        await publicClient.simulateContract({
          account: account.address,
          address: MEZO_EARN_ADDRESSES.gaugeMusdBtc,
          abi: TIGRIS_GAUGE_ABI,
          functionName: "deposit",
          args: [lpBal],
        });
        const gNonce = await nextNonce();
        const gTx = await walletClient.writeContract({
          address: MEZO_EARN_ADDRESSES.gaugeMusdBtc,
          abi: TIGRIS_GAUGE_ABI,
          functionName: "deposit",
          args: [lpBal],
          nonce: gNonce,
          gas: 300000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: gTx });
        txHashes.push(gTx);
      }

      const aStr = Number(formatEther(quotedA)).toFixed(2);
      const bStr = Number(formatEther(quotedB)).toFixed(6);
      return {
        ok: true,
        venueId: "pool-musd-btc",
        venueLabel: "vAMM-MUSD/BTC LP + Gauge",
        txHashes,
        primaryTxHash: lpTx,
        amountLabel: `${aStr} MUSD + ${bStr} BTC`,
        detail: `Added ${aStr} MUSD + ${bStr} BTC to Tigris vAMM-MUSD/BTC & staked LP into VeBTC Gauge.`,
        bootstrappedFromBtc,
      };
    }

    // sAMM-MUSD/mUSDC
    const halfMusd = (opMusdWei * 48n) / 100n;
    const { amountOutWei, routes } = await quoteTigrisSwapServer({
      fromToken: MEZO_EARN_ADDRESSES.musdToken,
      toToken: MEZO_EARN_ADDRESSES.mUsdcToken,
      stable: true,
      amountInWei: halfMusd,
    });
    if (amountOutWei <= 0n) {
      throw new Error("Insufficient mUSDC swap output in sAMM-MUSD/mUSDC.");
    }
    await ensureExactApproval({
      tokenAddress: MEZO_EARN_ADDRESSES.musdToken,
      spender: MEZO_EARN_ADDRESSES.tigrisRouter,
      amountWei: halfMusd,
      nextNonce,
    });
    const dl = BigInt(Math.floor(Date.now() / 1000) + 900);
    const sNonce = await nextNonce();
    const sTx = await walletClient.writeContract({
      address: MEZO_EARN_ADDRESSES.tigrisRouter,
      abi: TIGRIS_ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [halfMusd, (amountOutWei * 94n) / 100n, routes, account.address, dl],
      nonce: sNonce,
      gas: 320000n,
    });
    await publicClient.waitForTransactionReceipt({ hash: sTx });
    txHashes.push(sTx);

    const [mBal, uBal] = (await Promise.all([
      publicClient.readContract({
        address: MEZO_EARN_ADDRESSES.musdToken,
        abi: MUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      }),
      publicClient.readContract({
        address: MEZO_EARN_ADDRESSES.mUsdcToken,
        abi: MUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      }),
    ])) as [bigint, bigint];

    const [qA, qB] = (await publicClient.readContract({
      address: MEZO_EARN_ADDRESSES.tigrisRouter,
      abi: TIGRIS_ROUTER_ABI,
      functionName: "quoteAddLiquidity",
      args: [
        MEZO_EARN_ADDRESSES.musdToken,
        MEZO_EARN_ADDRESSES.mUsdcToken,
        true,
        MEZO_EARN_ADDRESSES.tigrisPoolFactory,
        mBal,
        uBal,
      ],
    })) as [bigint, bigint, bigint];

    await ensureExactApproval({
      tokenAddress: MEZO_EARN_ADDRESSES.musdToken,
      spender: MEZO_EARN_ADDRESSES.tigrisRouter,
      amountWei: qA,
      nextNonce,
    });
    await ensureExactApproval({
      tokenAddress: MEZO_EARN_ADDRESSES.mUsdcToken,
      spender: MEZO_EARN_ADDRESSES.tigrisRouter,
      amountWei: qB,
      nextNonce,
    });

    const lpNonce = await nextNonce();
    const lpTx = await walletClient.writeContract({
      address: MEZO_EARN_ADDRESSES.tigrisRouter,
      abi: TIGRIS_ROUTER_ABI,
      functionName: "addLiquidity",
      args: [
        MEZO_EARN_ADDRESSES.musdToken,
        MEZO_EARN_ADDRESSES.mUsdcToken,
        true,
        qA,
        qB,
        (qA * 94n) / 100n,
        (qB * 94n) / 100n,
        account.address,
        dl,
      ],
      nonce: lpNonce,
      gas: 420000n,
    });
    await publicClient.waitForTransactionReceipt({ hash: lpTx });
    txHashes.push(lpTx);

    return {
      ok: true,
      venueId: "pool-musd-musdc",
      venueLabel: "sAMM-MUSD/mUSDC Stable LP",
      txHashes,
      primaryTxHash: lpTx,
      amountLabel: `${Number(formatEther(qA)).toFixed(2)} MUSD + ${Number(formatUnits(qB, 6)).toFixed(2)} mUSDC`,
      detail: `Added stable MUSD + mUSDC liquidity on Tigris sAMM (Mezo 31611).`,
      bootstrappedFromBtc,
    };
  };

  try {
    return params.skipLock ? await runner() : await withOperatorLock(runner);
  } catch (err) {
    throw new Error(extractEvmRevertReason(err));
  }
}

export { parseUnits };
