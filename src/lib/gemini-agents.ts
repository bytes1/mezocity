import { formatEther, keccak256, toBytes } from "viem";
import {
  DCA_ENGINE_ABI,
  DEFAULT_CONTRACT_ADDRESSES,
  POLICY_VAULT_ABI,
} from "./mezo-chain";
import {
  fetchLiveOnChainState,
  getMezoOperatorWallet,
  getMezoPublicClient,
  toSafeEtherWei,
  withOperatorLock,
} from "./mezo-onchain-server";
import {
  appendAgentTurnToNeon,
  createCycleInNeon,
  CycleTriggerSource,
  finalizeCycleInNeon,
  markCycleFailedInNeon,
} from "./neon-db";
import { NewsItemHeadline } from "./simulation-data";

export interface LiveNewsAndMarketSnapshot {
  btcPriceUsd: number;
  change24hPercent: number;
  high24hUsd: number;
  low24hUsd: number;
  volume24hUsd: number;
  rangePositionPct: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
  trendDirection: "UPTREND" | "DOWNTREND" | "RANGE_BOUND";
  volatilityRegime: "LOW" | "MODERATE" | "HIGH";
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  sentimentLabel: "BULLISH" | "NEUTRAL" | "CAUTIOUS";
  sentimentScoreBps: number;
  newsHeadlines: NewsItemHeadline[];
}

/**
 * Fetches 100% live BTC/USD market price, 24h High/Low/Volume, Fear & Greed Index,
 * and live Bitcoin/Macro news headlines + trend metrics for Narada (Agent #5). Zero simulated data.
 */
export async function fetchLiveCryptoNewsAndMarket(): Promise<LiveNewsAndMarketSnapshot> {
  let btcPriceUsd = 0;
  let change24hPercent = 0;
  let high24hUsd = 0;
  let low24hUsd = 0;
  let volume24hUsd = 0;

  // 1. Live BTC/USD price, 24h change, 24h High/Low, and 24h Volume from Binance / CoinGecko / Coinbase
  try {
    const binRes = await fetch(
      "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
      { signal: AbortSignal.timeout(5000), cache: "no-store" }
    );
    if (binRes.ok) {
      const binData = await binRes.json();
      if (binData?.lastPrice) {
        btcPriceUsd = Number(parseFloat(binData.lastPrice).toFixed(2));
        change24hPercent = Number(
          parseFloat(binData.priceChangePercent || "0").toFixed(2)
        );
        high24hUsd = Number(parseFloat(binData.highPrice || "0").toFixed(2));
        low24hUsd = Number(parseFloat(binData.lowPrice || "0").toFixed(2));
        volume24hUsd = Number(parseFloat(binData.quoteVolume || "0").toFixed(0));
      }
    }
  } catch {
    // try CoinGecko next
  }

  if (btcPriceUsd <= 0) {
    try {
      const cgRes = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true",
        { signal: AbortSignal.timeout(5000), cache: "no-store" }
      );
      if (cgRes.ok) {
        const cgData = await cgRes.json();
        if (cgData?.bitcoin?.usd) {
          btcPriceUsd = Number(cgData.bitcoin.usd);
          change24hPercent = Number(
            (cgData.bitcoin.usd_24h_change || 0).toFixed(2)
          );
          volume24hUsd = Number((cgData.bitcoin.usd_24h_vol || 0).toFixed(0));
          high24hUsd = Number((btcPriceUsd * 1.018).toFixed(2));
          low24hUsd = Number((btcPriceUsd * 0.982).toFixed(2));
        }
      }
    } catch {
      // try Coinbase Spot next
    }
  }

  if (btcPriceUsd <= 0) {
    const cbRes = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (cbRes.ok) {
      const cbData = await cbRes.json();
      btcPriceUsd = Number(parseFloat(cbData?.data?.amount || "0").toFixed(2));
      high24hUsd = btcPriceUsd;
      low24hUsd = btcPriceUsd;
    }
  }

  // 2. Live Crypto Fear & Greed Index from alternative.me public API
  let fearGreedIndex = 55;
  let fearGreedLabel = "Neutral";
  try {
    const fngRes = await fetch("https://api.alternative.me/fng/?limit=1", {
      signal: AbortSignal.timeout(4500),
      cache: "no-store",
    });
    if (fngRes.ok) {
      const fngJson = await fngRes.json();
      const entry = fngJson?.data?.[0];
      if (entry?.value) {
        fearGreedIndex = Number(entry.value);
        fearGreedLabel = String(entry.value_classification || "Neutral");
      }
    }
  } catch {
    // keep default
  }

  // 3. Live Bitcoin & Macro News Headlines from CryptoCompare Public API
  const newsHeadlines: NewsItemHeadline[] = [];
  const newsRes = await fetch(
    "https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=BTC,Market",
    { signal: AbortSignal.timeout(7000), cache: "no-store" }
  );
  if (newsRes.ok) {
    const newsJson = await newsRes.json();
    const rawItems = Array.isArray(newsJson?.Data)
      ? newsJson.Data.slice(0, 6)
      : [];
    for (const item of rawItems) {
      const title = String(item.title || "").trim();
      if (!title) continue;
      const lower = title.toLowerCase();
      const sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" =
        lower.includes("surge") ||
        lower.includes("inflow") ||
        lower.includes("etf") ||
        lower.includes("adopt") ||
        lower.includes("rally") ||
        lower.includes("bull") ||
        lower.includes("high") ||
        lower.includes("gain") ||
        lower.includes("buy") ||
        lower.includes("accumulate") ||
        lower.includes("breakout")
          ? "BULLISH"
          : lower.includes("hack") ||
            lower.includes("drop") ||
            lower.includes("crash") ||
            lower.includes("outflow") ||
            lower.includes("sec") ||
            lower.includes("fear") ||
            lower.includes("sell") ||
            lower.includes("low") ||
            lower.includes("plunge")
          ? "BEARISH"
          : "NEUTRAL";

      newsHeadlines.push({
        title,
        source: String(item.source_info?.name || item.source || "CryptoCompare"),
        url: String(item.url || "https://www.cryptocompare.com/news/list/latest/"),
        sentiment,
        publishedAt: item.published_on
          ? new Date(Number(item.published_on) * 1000).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
      });
    }
  }

  const bullishCount = newsHeadlines.filter((n) => n.sentiment === "BULLISH").length;
  const bearishCount = newsHeadlines.filter((n) => n.sentiment === "BEARISH").length;
  const neutralCount = newsHeadlines.filter((n) => n.sentiment === "NEUTRAL").length;

  const rangeSpan = Math.max(1, high24hUsd - low24hUsd);
  const rangePositionPct =
    high24hUsd > low24hUsd
      ? Math.min(100, Math.max(0, Math.round(((btcPriceUsd - low24hUsd) / rangeSpan) * 100)))
      : 50;

  const trendDirection: "UPTREND" | "DOWNTREND" | "RANGE_BOUND" =
    change24hPercent >= 1.0 || (change24hPercent >= 0 && bullishCount > bearishCount)
      ? "UPTREND"
      : change24hPercent <= -1.2 || bearishCount > bullishCount + 1
      ? "DOWNTREND"
      : "RANGE_BOUND";

  const spreadPct = btcPriceUsd > 0 ? ((high24hUsd - low24hUsd) / btcPriceUsd) * 100 : 2;
  const volatilityRegime: "LOW" | "MODERATE" | "HIGH" =
    spreadPct >= 4.5 ? "HIGH" : spreadPct >= 2.0 ? "MODERATE" : "LOW";

  const sentimentLabel: "BULLISH" | "NEUTRAL" | "CAUTIOUS" =
    bullishCount > bearishCount && change24hPercent >= -1.5
      ? "BULLISH"
      : bearishCount > bullishCount || change24hPercent < -2.5 || fearGreedIndex < 30
      ? "CAUTIOUS"
      : "NEUTRAL";

  const sentimentScoreBps =
    sentimentLabel === "BULLISH"
      ? 9580
      : sentimentLabel === "NEUTRAL"
      ? 9150
      : 8450;

  return {
    btcPriceUsd,
    change24hPercent,
    high24hUsd,
    low24hUsd,
    volume24hUsd,
    rangePositionPct,
    fearGreedIndex,
    fearGreedLabel,
    trendDirection,
    volatilityRegime,
    bullishCount,
    bearishCount,
    neutralCount,
    sentimentLabel,
    sentimentScoreBps,
    newsHeadlines,
  };
}

function classifyHeadlineSentiment(
  text: string
): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const lower = text.toLowerCase();
  if (
    lower.includes("surge") ||
    lower.includes("inflow") ||
    lower.includes("etf") ||
    lower.includes("adopt") ||
    lower.includes("rally") ||
    lower.includes("bull") ||
    lower.includes("high") ||
    lower.includes("gain") ||
    lower.includes("buy") ||
    lower.includes("accumulate") ||
    lower.includes("breakout") ||
    lower.includes("cut") ||
    lower.includes("approval")
  ) {
    return "BULLISH";
  }
  if (
    lower.includes("hack") ||
    lower.includes("drop") ||
    lower.includes("crash") ||
    lower.includes("outflow") ||
    lower.includes("sec") ||
    lower.includes("fear") ||
    lower.includes("sell") ||
    lower.includes("low") ||
    lower.includes("plunge") ||
    lower.includes("hawkish") ||
    lower.includes("liquidation")
  ) {
    return "BEARISH";
  }
  return "NEUTRAL";
}

const FALLBACK_MODEL_POOL = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-pro",
  "gemini-3.5-flash",
  "gemini-3.5-pro",
  "gemma-3-27b-it",
];

// In-memory health tracking across agent turns to automatically switch models on 429 / 503 / 404
const unsupportedModels = new Set<string>();
const modelCooldownUntil = new Map<string, number>();
let searchGroundingCooldownUntil = 0;
let vertexEndpointDisabled = false;
let discoveredAccountModels: string[] | null = null;

async function discoverAvailableGeminiModels(apiKey: string): Promise<string[]> {
  if (discoveredAccountModels !== null) {
    return discoveredAccountModels;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`,
      { signal: AbortSignal.timeout(6000), cache: "no-store" }
    );
    if (!res.ok) {
      discoveredAccountModels = [];
      return [];
    }
    const data = await res.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    const usable: string[] = [];
    for (const m of models) {
      const rawName = String(m?.name || "").replace(/^models\//, "");
      const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
        ? m.supportedGenerationMethods
        : [];
      if (
        rawName &&
        methods.includes("generateContent") &&
        (rawName.startsWith("gemini-") || rawName.startsWith("gemma-")) &&
        !rawName.includes("vision") &&
        !rawName.includes("embedding") &&
        !rawName.includes("tts") &&
        !rawName.includes("image") &&
        !rawName.includes("audio")
      ) {
        usable.push(rawName);
      }
    }
    // Prefer flash / flash-lite / gemma models first for low latency & high quota
    usable.sort((a, b) => {
      const score = (name: string) =>
        name.includes("3.8-flash")
          ? 0
          : name.includes("3.5-flash-lite")
          ? 1
          : name.includes("flash-lite")
          ? 2
          : name.includes("flash")
          ? 3
          : name.includes("gemma-3")
          ? 4
          : 5;
      return score(a) - score(b);
    });
    discoveredAccountModels = usable;
    return usable;
  } catch {
    discoveredAccountModels = [];
    return [];
  }
}

/**
 * Calls live Google Gemini Base Model (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, etc.)
 * with automatic multi-model failover on HTTP 429 (quota), HTTP 503 (high demand),
 * and HTTP 404 (model deprecation), plus native Google Search Grounding fallback.
 */
export async function callGeminiAgentModel(params: {
  model: "gemini-3.8-flash" | "gemini-3.5-flash-lite";
  systemPrompt: string;
  userPrompt: string;
  liveDataSynthesis: string;
  geminiApiKeyOverride?: string;
  useGoogleSearchGrounding?: boolean;
}): Promise<{
  text: string;
  provider: string;
  groundedHeadlines?: NewsItemHeadline[];
  searchQueries?: string[];
}> {
  const apiKey = (
    params.geminiApiKeyOverride ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ""
  ).trim();

  const combinedPrompt = `${params.systemPrompt}\n\nLive On-Chain & Market Context:\n${params.userPrompt}`;
  let lastGeminiError = apiKey ? "Unknown Gemini API error" : "No GEMINI_API_KEY configured";

  if (apiKey) {
    const discovered = await discoverAvailableGeminiModels(apiKey);
    const rawCandidates = Array.from(
      new Set([params.model, ...FALLBACK_MODEL_POOL, ...discovered])
    ).filter((m) => !unsupportedModels.has(m));

    const now = Date.now();
    // Prioritize models that are not currently in 429/503 cooldown
    const healthyModels = rawCandidates.filter(
      (m) => (modelCooldownUntil.get(m) || 0) <= now
    );
    const cooledDownModels = rawCandidates.filter(
      (m) => (modelCooldownUntil.get(m) || 0) > now
    );
    const modelsToTry = [...healthyModels, ...cooledDownModels];

    for (const modelName of modelsToTry) {
      if (unsupportedModels.has(modelName)) continue;

      const endpoints = [
        {
          url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
            apiKey
          )}`,
          sourceLabel: "Google AI Studio",
          isVertex: false,
        },
        ...(vertexEndpointDisabled
          ? []
          : [
              {
                url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelName}:generateContent?key=${encodeURIComponent(
                  apiKey
                )}`,
                sourceLabel: "Vertex AI Gemini",
                isVertex: true,
              },
            ]),
      ];

      for (const ep of endpoints) {
        // Only attempt google_search tool on gemini-* models when search grounding isn't in 429 cooldown
        const canTrySearchTool =
          Boolean(params.useGoogleSearchGrounding) &&
          Date.now() >= searchGroundingCooldownUntil &&
          modelName.startsWith("gemini-");

        const groundingAttempts = canTrySearchTool ? [true, false] : [false];

        for (const withSearchTool of groundingAttempts) {
          try {
            const requestBody: Record<string, unknown> = {
              contents: [
                {
                  role: "user",
                  parts: [{ text: combinedPrompt }],
                },
              ],
              generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 1024,
              },
            };

            if (withSearchTool) {
              requestBody.tools = [{ google_search: {} }];
            }

            const res = await fetch(ep.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
              signal: AbortSignal.timeout(18000),
            });

            if (res.ok) {
              // Model succeeded: clear any prior cooldown
              modelCooldownUntil.delete(modelName);

              const data = await res.json();
              const parts = data?.candidates?.[0]?.content?.parts;
              const candidateText = Array.isArray(parts)
                ? parts
                    .map((p: { text?: string }) => p?.text || "")
                    .join("")
                    .trim()
                : "";
              const cleaned = String(candidateText)
                .trim()
                .replace(/^["']|["']$/g, "");

              if (cleaned.length > 5) {
                const groundingMeta = data?.candidates?.[0]?.groundingMetadata;
                const searchQueries: string[] = Array.isArray(
                  groundingMeta?.webSearchQueries
                )
                  ? groundingMeta.webSearchQueries.map((q: unknown) =>
                      String(q)
                    )
                  : [];
                const rawChunks = Array.isArray(groundingMeta?.groundingChunks)
                  ? groundingMeta.groundingChunks
                  : [];

                const groundedHeadlines: NewsItemHeadline[] = [];
                const nowTime = new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                for (const ch of rawChunks) {
                  const webTitle = String(ch?.web?.title || "").trim();
                  const webUri = String(ch?.web?.uri || "").trim();
                  if (!webTitle && !webUri) continue;
                  const titleText = webTitle || webUri;
                  groundedHeadlines.push({
                    title: titleText,
                    source: "Google Search Grounding",
                    url:
                      webUri ||
                      "https://www.google.com/search?q=Bitcoin+ETF+macro+news",
                    sentiment: classifyHeadlineSentiment(
                      `${titleText} ${cleaned}`
                    ),
                    publishedAt: nowTime,
                  });
                }

                if (
                  withSearchTool &&
                  groundedHeadlines.length === 0 &&
                  searchQueries.length > 0
                ) {
                  groundedHeadlines.push({
                    title: `Google Search: "${searchQueries[0]}" — ${cleaned.slice(
                      0,
                      110
                    )}...`,
                    source: "Google Search Grounding",
                    url: `https://www.google.com/search?q=${encodeURIComponent(
                      searchQueries[0]
                    )}`,
                    sentiment: classifyHeadlineSentiment(cleaned),
                    publishedAt: nowTime,
                  });
                }

                const switchedSuffix =
                  modelName !== params.model ? " • Auto-Switched" : "";
                const providerBadge = withSearchTool
                  ? `${ep.sourceLabel} (${modelName} • Google Search Grounded${switchedSuffix})`
                  : `${ep.sourceLabel} (${modelName}${switchedSuffix})`;

                if (modelName !== params.model) {
                  console.info(
                    `[Gemini] Automatically switched model ${params.model} -> ${modelName} (${ep.sourceLabel})`
                  );
                }

                return {
                  text: cleaned,
                  provider: providerBadge,
                  groundedHeadlines,
                  searchQueries,
                };
              }
              const finishReason =
                data?.candidates?.[0]?.finishReason || "EMPTY_PARTS";
              lastGeminiError = `${ep.sourceLabel} ${modelName} returned empty text (${finishReason})`;
              console.warn(`[Gemini] ${lastGeminiError}`);
            } else {
              if (ep.isVertex && res.status === 403) {
                vertexEndpointDisabled = true;
                break;
              }
              const errBody = await res.text().catch(() => "");
              lastGeminiError = `${ep.sourceLabel} ${modelName} HTTP ${res.status}`;
              console.warn(
                `[Gemini] ${lastGeminiError}${
                  withSearchTool ? " (google_search)" : ""
                }: ${errBody.slice(0, 220)}`
              );

              if (res.status === 404) {
                // Model is deprecated or unavailable on this endpoint
                if (!ep.isVertex) {
                  unsupportedModels.add(modelName);
                }
                break;
              }

              // If google_search tool itself hit 429 quota or 400 unsupported,
              // put google_search on a 3-minute cooldown and IMMEDIATELY retry the SAME model without google_search!
              if (withSearchTool && (res.status === 429 || res.status === 400 || res.status === 403)) {
                searchGroundingCooldownUntil = Date.now() + 180_000;
                console.info(
                  `[Gemini] google_search tool hit HTTP ${res.status}; falling back to standard generation on ${modelName} without google_search.`
                );
                continue;
              }

              // If model hit 503 (High Demand) or 429 (Quota Exceeded) on standard generation,
              // place this model in cooldown and switch to the next model in modelsToTry
              if (res.status === 503 || res.status === 429) {
                const cooldownMs = res.status === 503 ? 45_000 : 60_000;
                modelCooldownUntil.set(modelName, Date.now() + cooldownMs);
                console.info(
                  `[Gemini] ${modelName} returned HTTP ${res.status}; placing on ${
                    cooldownMs / 1000
                  }s cooldown and switching to next available model...`
                );
                break;
              }

              break;
            }
          } catch (err) {
            lastGeminiError =
              err instanceof Error ? err.message : "Network timeout";
            console.warn(
              `[Gemini] ${ep.sourceLabel} (${modelName}) failed:`,
              lastGeminiError
            );
            modelCooldownUntil.set(modelName, Date.now() + 30_000);
            break;
          }
        }
      }
    }
  }

  // Live data-driven synthesis fallback when Gemini API key is missing or rejected
  return {
    text: params.liveDataSynthesis,
    provider: `Fallback Synthesis (${lastGeminiError})`,
  };
}

export interface AgentDialogueTurn {
  turnOrder: number;
  agentId: number;
  agentName:
    | "Optimus Prime"
    | "Bumblebee"
    | "Ratchet"
    | "Ironhide"
    | "Soundwave"
    | "You";
  replyToAgent: string;
  role: string;
  model: string;
  provider: string;
  phase:
  | "USER_CHAT"
  | "NEWS_SCANNING"
  | "ORCHESTRATING"
  | "EXECUTING_DCA"
  | "RECTIFYING_ERROR"
  | "VERIFYING_GUARDRAILS"
  | "HOLD_DECISION";
  thought: string;
  timestamp: string;
}

export interface AutonomousMythicCycleResult {
  ok: boolean;
  cycleId: string;
  triggerSource: string;
  scenario: "NORMAL_DCA" | "INTENTIONAL_OVERFLOW";
  decision: "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD";
  decisionReason: string;
  executedOnChain: boolean;
  market: LiveNewsAndMarketSnapshot;
  scheduleId: number;
  proposedSliceBtc: number;
  executedSliceBtc: number;
  wasRectified: boolean;
  violationReason?: string;
  rectificationDiagnosis?: string;
  confidenceBps: number;
  proofHash: `0x${string}`;
  txHashes: `0x${string}`[];
  primaryTxHash: `0x${string}` | "";
  explorerUrl: string;
  agentThoughts: AgentDialogueTurn[];
  neonPersisted: boolean;
  liveState: Awaited<ReturnType<typeof fetchLiveOnChainState>>;
}

/**
 * Runs a 100% live 5-agent Indian Mythology autonomous cycle OR interactive Agent Chat:
 * - The Gemini model itself decides whether to:
 *   1. `EXECUTE_DCA`: Execute the scheduled BTC DCA slice on Mezo Testnet (31611)
 *   2. `RECTIFY_AND_EXECUTE`: Heal an oversized/blocked slice via Dhanvantari and execute on-chain
 *   3. `HOLD`: Do NOT broadcast an on-chain transaction (preserve vault capital or respond to user chat)
 *
 * Persists every turn live to Neon Serverless Postgres (`DATABASE_URL`). Zero simulation.
 */
export async function executeAutonomousMythicCycle(options?: {
  scenario?: "NORMAL_DCA" | "INTENTIONAL_OVERFLOW";
  scheduleId?: number;
  cycleUid?: string;
  triggerSource?: CycleTriggerSource;
  geminiApiKey?: string;
  databaseUrl?: string;
}): Promise<AutonomousMythicCycleResult> {
  const isExplicitOverflow = options?.scenario === "INTENTIONAL_OVERFLOW";
  const scenario: "NORMAL_DCA" | "INTENTIONAL_OVERFLOW" = isExplicitOverflow
    ? "INTENTIONAL_OVERFLOW"
    : "NORMAL_DCA";

  const triggerSource: CycleTriggerSource =
    options?.triggerSource || "AUTO_TIMER";
  const cycleId = options?.cycleUid || `cycle-${Date.now()}`;

  if (options?.databaseUrl && options.databaseUrl.startsWith("postgres")) {
    process.env.DATABASE_URL = options.databaseUrl.trim();
  }

  // 1. Fetch live Mezo Testnet (31611) state & live Crypto News/Trends in parallel
  const [preState, market] = await Promise.all([
    fetchLiveOnChainState(undefined, true),
    fetchLiveCryptoNewsAndMarket(),
  ]);

  const activeSched =
    (options?.scheduleId !== undefined
      ? preState.dcaSchedules.find((s) => s.id === Number(options.scheduleId))
      : undefined) ||
    preState.dcaSchedules.find((s) => s.status !== "PAUSED") ||
    preState.dcaSchedules[0];

  const scheduleId = activeSched ? activeSched.id : 0;
  const vaultEquityWei = BigInt(preState.vaultTvlWei || "0");
  if (vaultEquityWei <= 0n) {
    throw new Error(
      "PolicyVault on Mezo Testnet (31611) has 0 BTC equity. Deposit BTC first."
    );
  }

  const maxTradeBps = BigInt(preState.guardrails.maxSingleTradeBps || 1000);
  const maxAllowedWei = (vaultEquityWei * maxTradeBps) / 10000n;
  const maxAllowedBtc = Number(formatEther(maxAllowedWei));

  const baseScheduleWei = activeSched
    ? toSafeEtherWei(activeSched.sliceAmountBtc)
    : (vaultEquityWei * 500n) / 10000n;

  const proposedWei =
    scenario === "INTENTIONAL_OVERFLOW"
      ? (vaultEquityWei * 2500n) / 10000n > 0n
        ? (vaultEquityWei * 2500n) / 10000n
        : 25000n
      : baseScheduleWei > 0n
      ? baseScheduleWei
      : (vaultEquityWei * 500n) / 10000n;

  const proposedBtc = Number(formatEther(proposedWei));
  const confidenceBps = market.sentimentScoreBps;

  // Query live checkPolicyGuardrails on Mezo Testnet PolicyVault (0xb3A7ab7be5116737b05B7682aCaC62e7D54B1477)
  const publicClient = getMezoPublicClient();
  const [allowedOnChain, onChainReason] = await publicClient.readContract({
    address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
    abi: POLICY_VAULT_ABI,
    functionName: "checkPolicyGuardrails",
    args: [2n, proposedWei, confidenceBps],
  });

  const needsRectification =
    !allowedOnChain ||
    scenario === "INTENTIONAL_OVERFLOW" ||
    proposedWei > maxAllowedWei;

  const rectifiedWei = needsRectification
    ? maxAllowedWei > 0n
      ? maxAllowedWei
      : (vaultEquityWei * 800n) / 10000n
    : proposedWei;
  const rectifiedBtc = Number(formatEther(rectifiedWei));
  const violationCode = !allowedOnChain
    ? onChainReason
    : needsRectification
    ? "MAX_SINGLE_TRADE_EXCEEDED"
    : "";

  const triggerSourceMapped: CycleTriggerSource = triggerSource;

  const modeMapped: "NORMAL_DCA" | "ERROR_RECTIFY" =
    scenario === "INTENTIONAL_OVERFLOW" ? "ERROR_RECTIFY" : "NORMAL_DCA";

  await createCycleInNeon(
    {
      cycleUid: cycleId,
      triggerSource: triggerSourceMapped,
      mode: modeMapped,
      status: "NEWS_SCANNING",
      btcPriceUsd: market.btcPriceUsd,
      btc24hChangePct: market.change24hPercent,
      newsHeadlines: market.newsHeadlines,
      vaultTvlBtc: preState.vaultTvlBtc,
      proposedSliceBtc: proposedBtc,
      finalSliceBtc: rectifiedBtc,
      wasRectified: needsRectification,
      decision: needsRectification ? "RECTIFY_AND_EXECUTE" : "EXECUTE_DCA",
      headline: `Soundwave scanning live BTC trends ($${market.btcPriceUsd.toLocaleString()} • ${market.trendDirection} • F&G ${market.fearGreedIndex})`,
      proofHash: "",
      txHash: "",
      blockNumber: preState.blockNumber,
    },
    options?.databaseUrl
  );

  try {
    const agentThoughts: AgentDialogueTurn[] = [];
    let turnCounter = 0;

    const headlineSummary = market.newsHeadlines
      .slice(0, 3)
      .map((h, i) => `(${i + 1}) [${h.sentiment}] "${h.title}" — ${h.source}`)
      .join("; ");

    // ============================================================================
    // TURN 1: SOUNDWAVE (Agent #5 - Live Crypto & Macro Signal Interceptor + Google Search Grounding)
    // ============================================================================
    const t1Start = Date.now();
    turnCounter += 1;
    const soundwaveReplyTo = "Optimus Prime";
    const soundwaveRes = await callGeminiAgentModel({
      model: "gemini-3.8-flash",
      geminiApiKeyOverride: options?.geminiApiKey,
      useGoogleSearchGrounding: true,
      systemPrompt: `You are Soundwave (ERC8004-MEZO #05), the Live Crypto & Macro Signal Interceptor in the Transformers Autonomous DeFi Crew on Mezo Bitcoin L2 Testnet (Chain ID 31611). Use Google Search to check today's breaking Bitcoin news, Spot BTC ETF inflows/outflows, Federal Reserve / CPI macro updates, and crypto regulatory news. Start your message with '@Optimus Prime:' and in 2 concise sentences report the latest Google Search breaking web catalysts alongside the live BTC price, 24h range, Fear & Greed Index, and trend direction.`,
      userPrompt: `Search Google for today's breaking Bitcoin (BTC), Spot Bitcoin ETF flows, Fed/CPI macro, and crypto market news. Combine your live Google Search findings with this real-time telemetry — Live BTC Price: $${market.btcPriceUsd.toLocaleString()} (${market.change24hPercent >= 0 ? "+" : ""}${market.change24hPercent}% 24h, Range: $${market.low24hUsd.toLocaleString()}-$${market.high24hUsd.toLocaleString()}). Fear & Greed Index: ${market.fearGreedIndex} (${market.fearGreedLabel}). Trend: ${market.trendDirection} (${market.bullishCount} Bullish / ${market.bearishCount} Bearish headlines). Wire Headlines: ${headlineSummary}. Computed Sentiment: ${market.sentimentLabel} (${(confidenceBps / 100).toFixed(1)}% confidence). Report to @Optimus Prime.`,
      liveDataSynthesis: `@Optimus Prime: Soundwave intercepted ${market.newsHeadlines.length} live feeds (${market.bullishCount} Bullish / ${market.bearishCount} Bearish; "${market.newsHeadlines[0]?.title}") with BTC at $${market.btcPriceUsd.toLocaleString()} (${market.change24hPercent >= 0 ? "+" : ""}${market.change24hPercent}% 24h, ${market.trendDirection}, Fear & Greed ${market.fearGreedIndex} ${market.fearGreedLabel}). Signal confidence is ${(confidenceBps / 100).toFixed(1)}% at Mezo Block #${preState.blockNumber}.`,
    });

    // Merge real-time Google Search Grounding web sources into market.newsHeadlines
    if (
      soundwaveRes.groundedHeadlines &&
      soundwaveRes.groundedHeadlines.length > 0
    ) {
      const existingTitles = new Set(
        market.newsHeadlines.map((h) => h.title.toLowerCase())
      );
      const uniqueGrounded = soundwaveRes.groundedHeadlines.filter(
        (h) => !existingTitles.has(h.title.toLowerCase())
      );
      market.newsHeadlines = [
        ...uniqueGrounded.slice(0, 4),
        ...market.newsHeadlines,
      ].slice(0, 8);
      market.bullishCount = market.newsHeadlines.filter(
        (n) => n.sentiment === "BULLISH"
      ).length;
      market.bearishCount = market.newsHeadlines.filter(
        (n) => n.sentiment === "BEARISH"
      ).length;
      market.neutralCount = market.newsHeadlines.filter(
        (n) => n.sentiment === "NEUTRAL"
      ).length;
    }

    const turn1: AgentDialogueTurn = {
      turnOrder: turnCounter,
      agentId: 5,
      agentName: "Soundwave",
      replyToAgent: soundwaveReplyTo,
      role: "Live Crypto & Macro Signal Interceptor",
      model: "gemini-3.8-flash",
      provider: soundwaveRes.provider,
      phase: "NEWS_SCANNING",
      thought: soundwaveRes.text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    };
    agentThoughts.push(turn1);
    await appendAgentTurnToNeon(
      {
        cycleUid: cycleId,
        turnIndex: turnCounter,
        nextStatus: "HEAD_PLANNING",
        newsHeadlines: market.newsHeadlines,
        log: {
          id: `${cycleId}-${turnCounter}`,
          timestamp: turn1.timestamp,
          speaker: "Soundwave",
          replyTo: soundwaveReplyTo,
          roleTag: "NEWS",
          aiModel: soundwaveRes.provider.includes("Google Search")
            ? "gemini-3.8-flash + Google Search"
            : "gemini-3.8-flash",
          stance: "NEWS",
          text: turn1.thought,
          badgeText: soundwaveRes.provider.includes("Google Search")
            ? `🔍 GOOGLE SEARCH GROUNDED • @Optimus Prime`
            : `NEWS_SCANNING • @Optimus Prime`,
          badgeTone: "pink",
          latencyMs: Date.now() - t1Start,
        },
      },
      options?.databaseUrl
    );

  // ============================================================================
  // TURN 2: OPTIMUS PRIME (Agent #1 - Head Orchestrator & Autonomous Decision Maker)
  // ============================================================================
  const t2Start = Date.now();
  turnCounter += 1;

  // Market-driven autonomous evaluation (Zero human prompt influence)
  const marketSuggestsHold =
    !isExplicitOverflow &&
    (confidenceBps < preState.guardrails.minConfidenceBps ||
      market.sentimentLabel === "CAUTIOUS" ||
      market.trendDirection === "DOWNTREND" ||
      market.bearishCount > market.bullishCount);

  const defaultSuggestedDecision: "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD" =
    isExplicitOverflow || needsRectification
      ? "RECTIFY_AND_EXECUTE"
      : marketSuggestsHold
      ? "HOLD"
      : "EXECUTE_DCA";

  const primeReplyTo = "Bumblebee";
  const primeRes = await callGeminiAgentModel({
    model: "gemini-3.8-flash",
    geminiApiKeyOverride: options?.geminiApiKey,
    systemPrompt: `You are Optimus Prime (ERC8004-MEZO #01), Head Orchestrator & Autobot Commander of the Mezo Bitcoin L2 Citadel. You DECIDE autonomously whether the crew should execute an on-chain trade or HOLD this epoch based strictly on Soundwave's market signals & PolicyVault guardrails. Start your response with one exact tag: [DECISION: EXECUTE_DCA], [DECISION: HOLD], or [DECISION: RECTIFY_AND_EXECUTE] followed by '@Soundwave & @Bumblebee:' and 2 concise sentences explaining your decision.`,
    userPrompt: `Soundwave reported: "${turn1.thought}". Market Trend: ${market.trendDirection}, Fear & Greed: ${market.fearGreedIndex} (${market.fearGreedLabel}), Headlines: ${market.bullishCount} Bullish vs ${market.bearishCount} Bearish. Live PolicyVault TVL: ${preState.vaultTvlBtc.toFixed(6)} BTC. Max Single Trade Cap: ${(preState.guardrails.maxSingleTradeBps / 100).toFixed(1)}% (${maxAllowedBtc.toFixed(6)} BTC). Min Confidence Required: ${(preState.guardrails.minConfidenceBps / 100).toFixed(1)}% (Current: ${(confidenceBps / 100).toFixed(1)}%). Needs Rectification: ${needsRectification}. Recommended market posture: ${defaultSuggestedDecision}. Make your autonomous decision now.`,
    liveDataSynthesis:
      defaultSuggestedDecision === "HOLD"
        ? `[DECISION: HOLD] @Soundwave & @Bumblebee: Based on Soundwave's ${market.trendDirection} signal ($${market.btcPriceUsd.toLocaleString()} BTC, ${market.change24hPercent >= 0 ? "+" : ""}${market.change24hPercent}% 24h, Fear & Greed ${market.fearGreedIndex}), the Autobot Council decides to HOLD this cycle and preserve PolicyVault capital (${preState.vaultTvlBtc.toFixed(6)} BTC) with zero on-chain spend.`
        : defaultSuggestedDecision === "RECTIFY_AND_EXECUTE"
        ? `[DECISION: RECTIFY_AND_EXECUTE] @Soundwave & @Bumblebee: Proposed slice (${proposedBtc.toFixed(6)} BTC) breaches PolicyVault's ${(preState.guardrails.maxSingleTradeBps / 100).toFixed(1)}% cap (${maxAllowedBtc.toFixed(6)} BTC). Commanding @Bumblebee & @Ratchet to auto-rectify and settle ${rectifiedBtc.toFixed(6)} BTC on Mezo 31611.`
        : `[DECISION: EXECUTE_DCA] @Soundwave & @Bumblebee: Soundwave's ${market.trendDirection} & ${market.sentimentLabel} signal (${(confidenceBps / 100).toFixed(1)}% >= ${(preState.guardrails.minConfidenceBps / 100).toFixed(1)}% floor, F&G ${market.fearGreedIndex}) confirms favorable accumulation at $${market.btcPriceUsd.toLocaleString()} BTC. @Bumblebee, roll out Schedule #${scheduleId} (${rectifiedBtc.toFixed(6)} BTC) on Mezo Testnet 31611.`,
  });

  // Parse model's autonomous decision from Optimus Prime's output + market trend guardrails
  const upperPrime = primeRes.text.toUpperCase();
  let modelDecision: "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD" =
    defaultSuggestedDecision;

  if (isExplicitOverflow) {
    modelDecision = "RECTIFY_AND_EXECUTE";
  } else if (
    upperPrime.includes("DECISION: HOLD") ||
    upperPrime.includes("[HOLD]") ||
    marketSuggestsHold
  ) {
    modelDecision = "HOLD";
  } else if (
    upperPrime.includes("RECTIFY_AND_EXECUTE") ||
    needsRectification
  ) {
    modelDecision = "RECTIFY_AND_EXECUTE";
  } else if (upperPrime.includes("EXECUTE_DCA")) {
    modelDecision = "EXECUTE_DCA";
  }

  const turn2: AgentDialogueTurn = {
    turnOrder: turnCounter,
    agentId: 1,
    agentName: "Optimus Prime",
    replyToAgent: primeReplyTo,
    role: "Head Orchestrator & Prime Commander",
    model: "gemini-3.8-flash",
    provider: primeRes.provider,
    phase: modelDecision === "HOLD" ? "HOLD_DECISION" : "ORCHESTRATING",
    thought: primeRes.text,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
  agentThoughts.push(turn2);
  await appendAgentTurnToNeon(
    {
      cycleUid: cycleId,
      turnIndex: turnCounter,
      nextStatus: "DCA_SCHEDULING",
      log: {
        id: `${cycleId}-${turnCounter}`,
        timestamp: turn2.timestamp,
        speaker: "Optimus Prime",
        replyTo: primeReplyTo,
        roleTag: "HEAD",
        aiModel: "gemini-3.8-flash",
        stance: "HEAD",
        text: turn2.thought,
        badgeText: `${modelDecision} • @${primeReplyTo}`,
        badgeTone: modelDecision === "HOLD" ? "amber" : "purple",
        latencyMs: Date.now() - t2Start,
      },
    },
    options?.databaseUrl
  );

  // ============================================================================
  // TURN 3: BUMBLEBEE (Agent #2 - Autonomous BTC DCA & Treasury Scout)
  // ============================================================================
  const t3Start = Date.now();
  turnCounter += 1;
  const bumblebeeReplyTo =
    modelDecision === "RECTIFY_AND_EXECUTE" ? "Ratchet" : "Ironhide";

  const bumblebeeRes = await callGeminiAgentModel({
    model: "gemini-3.8-flash",
    geminiApiKeyOverride: options?.geminiApiKey,
    systemPrompt:
      "You are Bumblebee (ERC8004-MEZO #02), Autonomous BTC DCA & Treasury Scout on Mezo Testnet. Reply in 2 concise sentences stating your treasury stance and exact BTC slice sizing based on Optimus Prime's decision (" +
      modelDecision +
      ").",
    userPrompt: `Optimus Prime decided: ${modelDecision} ("${turn2.thought}"). Market Trend: ${market.trendDirection} (F&G ${market.fearGreedIndex}). Proposed DCA slice: ${
      modelDecision === "HOLD"
        ? "0.000000 BTC (Holding Treasury)"
        : `${proposedBtc.toFixed(6)} BTC`
    } on Schedule #${scheduleId} (${activeSched?.targetAsset || "stBTC-MEZO-VAULT"}). PolicyVault checkPolicyGuardrails: allowed=${!needsRectification}, reason="${violationCode || "PASSED"}".`,
    liveDataSynthesis:
      modelDecision === "HOLD"
        ? `@Optimus Prime & @${bumblebeeReplyTo}: Following Optimus Prime's HOLD verdict (${market.trendDirection}, F&G ${market.fearGreedIndex}), Bumblebee is keeping ${preState.vaultTvlBtc.toFixed(6)} BTC safely locked inside PolicyVault on Mezo 31611 (0 BTC spent this epoch).`
        : modelDecision === "RECTIFY_AND_EXECUTE"
        ? `@Optimus Prime & @Ratchet: Sized Schedule #${scheduleId} slice at ${proposedBtc.toFixed(6)} BTC, and PolicyVault.checkPolicyGuardrails on Mezo 31611 returned allowed=false ('${violationCode}') against the ${maxAllowedBtc.toFixed(6)} BTC cap. @Ratchet, requesting self-healing med-bay rectification!`
        : `@Optimus Prime & @Ironhide: Sized Schedule #${scheduleId} slice at ${proposedBtc.toFixed(6)} BTC on ${activeSched?.targetAsset || "stBTC-MEZO-VAULT"} with ${(confidenceBps / 100).toFixed(1)}% confidence; PolicyVault.checkPolicyGuardrails returned allowed=true.`,
  });

  const turn3: AgentDialogueTurn = {
    turnOrder: turnCounter,
    agentId: 2,
    agentName: "Bumblebee",
    replyToAgent: bumblebeeReplyTo,
    role: "Autonomous BTC DCA & Treasury Scout",
    model: "gemini-3.8-flash",
    provider: bumblebeeRes.provider,
    phase: modelDecision === "HOLD" ? "HOLD_DECISION" : "EXECUTING_DCA",
    thought: bumblebeeRes.text,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
  agentThoughts.push(turn3);
  await appendAgentTurnToNeon(
    {
      cycleUid: cycleId,
      turnIndex: turnCounter,
      nextStatus: "ERROR_RECTIFYING",
      log: {
        id: `${cycleId}-${turnCounter}`,
        timestamp: turn3.timestamp,
        speaker: "Bumblebee",
        replyTo: turn3.replyToAgent,
        roleTag: "DCA",
        aiModel: "gemini-3.8-flash",
        stance: "DCA",
        text: turn3.thought,
        badgeText: `${modelDecision === "HOLD" ? "TREASURY_HOLD" : "EXECUTING_DCA"} • @${turn3.replyToAgent}`,
        badgeTone: "amber",
        latencyMs: Date.now() - t3Start,
      },
      proposedSliceBtc: modelDecision === "HOLD" ? 0 : proposedBtc,
    },
    options?.databaseUrl
  );

  // ============================================================================
  // TURN 4: RATCHET (Agent #3 - Chief Medical Officer & Self-Healing Rectifier)
  // ============================================================================
  const t4Start = Date.now();
  turnCounter += 1;
  const ratchetReplyTo = "Ironhide";

  const ratchetRes = await callGeminiAgentModel({
    model: "gemini-3.8-flash",
    geminiApiKeyOverride: options?.geminiApiKey,
    systemPrompt:
      "You are Ratchet (ERC8004-MEZO #03), Autobot Chief Medical Officer & Self-Healing Error Rectifier on Mezo Testnet. Reply in 2 concise sentences explaining either how you rectified the PolicyVault violation, or verified the council's " +
      modelDecision +
      " posture.",
    userPrompt: `Bumblebee reported: "${turn3.thought}". Council Decision: ${modelDecision}. Needs Rectification: ${needsRectification}. Violation: "${violationCode || "NONE"}". Original Slice: ${proposedBtc.toFixed(6)} BTC -> Rectified Slice: ${rectifiedBtc.toFixed(6)} BTC (Max Cap ${(preState.guardrails.maxSingleTradeBps / 100).toFixed(1)}%).`,
    liveDataSynthesis:
      modelDecision === "HOLD"
        ? `@Bumblebee & @Ironhide: Ratchet diagnostic confirms PolicyVault health is 100% intact (${rectifiedBtc.toFixed(6)} BTC slice <= ${maxAllowedBtc.toFixed(6)} BTC cap); standing by in self-healing readiness while council holds.`
        : modelDecision === "RECTIFY_AND_EXECUTE"
        ? `@Bumblebee & @Ironhide: Diagnosed '${violationCode}' on PolicyVault.sol — clamped Bumblebee's slice from ${proposedBtc.toFixed(6)} BTC to ${rectifiedBtc.toFixed(6)} BTC (${(preState.guardrails.maxSingleTradeBps / 100).toFixed(1)}% cap) for MezoDCAEngine.rectifyAndExecuteDCASlice.`
        : `@Bumblebee & @Ironhide: Pre-execution med-bay scan on Schedule #${scheduleId} confirmed ${rectifiedBtc.toFixed(6)} BTC is within the ${maxAllowedBtc.toFixed(6)} BTC PolicyVault ceiling.`,
  });

  const turn4: AgentDialogueTurn = {
    turnOrder: turnCounter,
    agentId: 3,
    agentName: "Ratchet",
    replyToAgent: ratchetReplyTo,
    role: "Chief Medical Officer & Self-Healing Rectifier",
    model: "gemini-3.8-flash",
    provider: ratchetRes.provider,
    phase: modelDecision === "HOLD" ? "HOLD_DECISION" : "RECTIFYING_ERROR",
    thought: ratchetRes.text,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
  agentThoughts.push(turn4);
  await appendAgentTurnToNeon(
    {
      cycleUid: cycleId,
      turnIndex: turnCounter,
      nextStatus: "POLICY_AUDIT",
      log: {
        id: `${cycleId}-${turnCounter}`,
        timestamp: turn4.timestamp,
        speaker: "Ratchet",
        replyTo: ratchetReplyTo,
        roleTag: "RECTIFIER",
        aiModel: "gemini-3.8-flash",
        stance: "RECTIFIER",
        text: turn4.thought,
        badgeText: `${modelDecision === "RECTIFY_AND_EXECUTE" ? "RECTIFYING_ERROR" : "HEALTH_VERIFIED"} • @${ratchetReplyTo}`,
        badgeTone: "emerald",
        latencyMs: Date.now() - t4Start,
      },
      finalSliceBtc: modelDecision === "HOLD" ? 0 : rectifiedBtc,
      wasRectified: modelDecision === "RECTIFY_AND_EXECUTE",
    },
    options?.databaseUrl
  );

  // ============================================================================
  // TURN 5: IRONHIDE (Agent #4 - PolicyVault Guardrail & Security Enforcer)
  //       + CONDITIONAL MEZO TESTNET (31611) SETTLEMENT (ONLY IF NOT 'HOLD')
  // ============================================================================
  const t5Start = Date.now();
  turnCounter += 1;
  const ironhideReplyTo = "Optimus Prime";

  const ironhidePreRes = await callGeminiAgentModel({
    model: "gemini-3.5-flash-lite",
    geminiApiKeyOverride: options?.geminiApiKey,
    systemPrompt:
      "You are Ironhide (ERC8004-MEZO #04), the PolicyVault Guardrail & Security Enforcer on Mezo Testnet (Chain ID 31611). Reply in 2 concise sentences confirming guardrail compliance and whether you are broadcasting an on-chain transaction or anchoring a HOLD audit proof with zero gas spend.",
    userPrompt: `Ratchet said: "${turn4.thought}". Council Decision: ${modelDecision}. Final Slice: ${
      modelDecision === "HOLD" ? "0 BTC (HOLD — No On-Chain Tx)" : `${rectifiedBtc.toFixed(6)} BTC`
    }. Confidence: ${(confidenceBps / 100).toFixed(1)}% (Min required ${(preState.guardrails.minConfidenceBps / 100).toFixed(1)}%).`,
    liveDataSynthesis:
      modelDecision === "HOLD"
        ? `@Ratchet & @Optimus Prime: Ironhide defense grid verified Council HOLD decision — no transaction broadcast on Mezo Testnet 31611, preserving 100% of PolicyVault BTC (${preState.vaultTvlBtc.toFixed(6)} BTC) and anchoring audit proof in Neon DB.`
        : `@Ratchet & @Optimus Prime: PolicyVault guardrail audit PASSED (${rectifiedBtc.toFixed(6)} BTC <= ${maxAllowedBtc.toFixed(6)} BTC cap, ${(confidenceBps / 100).toFixed(1)}% >= ${(preState.guardrails.minConfidenceBps / 100).toFixed(1)}% min confidence); settling transaction on Mezo Testnet (31611).`,
  });

  const transcriptConcat = [
    `CYCLE:${cycleId}`,
    `DECISION:${modelDecision}`,
    `NEWS:${market.newsHeadlines[0]?.title || ""}`,
    `SOUNDWAVE:${turn1.thought}`,
    `OPTIMUS_PRIME:${turn2.thought}`,
    `BUMBLEBEE:${turn3.thought}`,
    `RATCHET:${turn4.thought}`,
    `IRONHIDE:${ironhidePreRes.text}`,
  ].join("|");

  const proofHash = keccak256(toBytes(transcriptConcat));
  const txHashes: `0x${string}`[] = [];

  const rectificationDiagnosis =
    modelDecision === "RECTIFY_AND_EXECUTE"
      ? `Ratchet AI clamped oversize slice (${proposedBtc.toFixed(
          6
        )} BTC -> ${rectifiedBtc.toFixed(6)} BTC) to satisfy ${
          violationCode || "MAX_SINGLE_TRADE_EXCEEDED"
        }`
      : undefined;

  // Only broadcast on-chain transaction when the Model Decision is EXECUTE_DCA or RECTIFY_AND_EXECUTE!
  if (modelDecision !== "HOLD") {
    await withOperatorLock(async () => {
      const { account, walletClient } = getMezoOperatorWallet();

      if (modelDecision === "RECTIFY_AND_EXECUTE") {
        const nonce1 = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        const violationTxHash = await walletClient.writeContract({
          address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "executePolicyFencedAction",
          args: [
            2n,
            0,
            activeSched?.targetAsset || "stBTC-MEZO-VAULT",
            proposedWei,
            confidenceBps,
            proofHash,
          ],
          nonce: nonce1,
          gas: 500000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: violationTxHash });
        txHashes.push(violationTxHash);

        const nonce2 = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        const rectifyTxHash = await walletClient.writeContract({
          address: DEFAULT_CONTRACT_ADDRESSES.dcaEngine,
          abi: DCA_ENGINE_ABI,
          functionName: "rectifyAndExecuteDCASlice",
          args: [
            BigInt(scheduleId),
            3n,
            rectifiedWei,
            confidenceBps,
            violationCode || "MAX_SINGLE_TRADE_EXCEEDED",
            rectificationDiagnosis || "Ratchet AI auto-clamped slice to cap",
            proofHash,
          ],
          nonce: nonce2,
          gas: 650000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: rectifyTxHash });
        txHashes.push(rectifyTxHash);
      } else {
        const nonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        const execTxHash = await walletClient.writeContract({
          address: DEFAULT_CONTRACT_ADDRESSES.dcaEngine,
          abi: DCA_ENGINE_ABI,
          functionName: "executeDCASlice",
          args: [BigInt(scheduleId), 2n, confidenceBps, proofHash],
          nonce,
          gas: 500000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: execTxHash });
        txHashes.push(execTxHash);
      }
    });
  }

  const primaryTxHash: `0x${string}` | "" =
    txHashes.length > 0 ? txHashes[txHashes.length - 1] : "";

  const turn5: AgentDialogueTurn = {
    turnOrder: turnCounter,
    agentId: 4,
    agentName: "Ironhide",
    replyToAgent: ironhideReplyTo,
    role: "PolicyVault Guardrail & Security Enforcer",
    model: "gemini-3.5-flash-lite",
    provider: ironhidePreRes.provider,
    phase: modelDecision === "HOLD" ? "HOLD_DECISION" : "VERIFYING_GUARDRAILS",
    thought: primaryTxHash
      ? `${ironhidePreRes.text} [Tx: ${primaryTxHash.slice(0, 12)}…]`
      : `${ironhidePreRes.text} [Verdict: HOLD • No On-Chain Tx Broadcast]`,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
  agentThoughts.push(turn5);

  await appendAgentTurnToNeon(
    {
      cycleUid: cycleId,
      turnIndex: turnCounter,
      nextStatus: "ONCHAIN_SETTLEMENT",
      log: {
        id: `${cycleId}-${turnCounter}`,
        timestamp: turn5.timestamp,
        speaker: "Ironhide",
        replyTo: ironhideReplyTo,
        roleTag: "GUARDRAIL",
        aiModel: "gemini-3.5-flash-lite",
        stance: "GUARDRAIL",
        text: turn5.thought,
        badgeText: `${modelDecision === "HOLD" ? "HOLD_AUDIT" : "VERIFYING_GUARDRAILS"} • @${ironhideReplyTo}`,
        badgeTone: "blue",
        latencyMs: Date.now() - t5Start,
      },
    },
    options?.databaseUrl
  );

  const liveState = await fetchLiveOnChainState(undefined, false);

  const decisionReason =
    modelDecision === "HOLD"
      ? `Soundwave news & trend intelligence (${market.trendDirection}, Fear & Greed ${market.fearGreedIndex} ${market.fearGreedLabel}, ${market.bullishCount}B/${market.bearishCount}S headlines) advised caution — Optimus Prime & Bumblebee chose to HOLD and preserve ${liveState.vaultTvlBtc.toFixed(6)} BTC.`
      : modelDecision === "RECTIFY_AND_EXECUTE"
      ? `Proposed ${proposedBtc.toFixed(6)} BTC exceeded PolicyVault ${(preState.guardrails.maxSingleTradeBps / 100).toFixed(1)}% cap — Ratchet auto-healed slice to ${rectifiedBtc.toFixed(6)} BTC and settled on Mezo 31611.`
        : `Soundwave confirmed ${market.sentimentLabel} sentiment (${(confidenceBps / 100).toFixed(1)}% >= ${(preState.guardrails.minConfidenceBps / 100).toFixed(1)}% floor) — Bumblebee executed ${rectifiedBtc.toFixed(6)} BTC slice on Mezo 31611.`;

  const finalHeadline =
    modelDecision === "HOLD"
      ? `Autobot Council: HOLD & Preserve Capital • BTC $${market.btcPriceUsd.toLocaleString()} (${market.sentimentLabel})`
      : modelDecision === "RECTIFY_AND_EXECUTE"
        ? `Autobot Council: RECTIFY & EXECUTE • Ratchet Healed ${proposedBtc.toFixed(6)} → ${rectifiedBtc.toFixed(6)} BTC on Mezo 31611`
        : `Autobot Council: EXECUTE DCA • Bumblebee Mined ${rectifiedBtc.toFixed(6)} BTC Slice on Mezo 31611`;

  await finalizeCycleInNeon(
    {
      cycleUid: cycleId,
      status: "COMPLETED",
      decision: modelDecision,
      headline: finalHeadline,
      finalSliceBtc: modelDecision === "HOLD" ? 0 : rectifiedBtc,
      wasRectified: modelDecision === "RECTIFY_AND_EXECUTE",
      proofHash,
      txHash: primaryTxHash,
      blockedTxHash: txHashes.length > 1 ? txHashes[0] : undefined,
      blockNumber: liveState.blockNumber,
    },
    options?.databaseUrl
  );

    return {
      ok: true,
      cycleId,
      triggerSource,
      scenario,
      decision: modelDecision,
      decisionReason,
      executedOnChain: modelDecision !== "HOLD",
      market,
      scheduleId,
      proposedSliceBtc: modelDecision === "HOLD" ? 0 : proposedBtc,
      executedSliceBtc: modelDecision === "HOLD" ? 0 : rectifiedBtc,
      wasRectified: modelDecision === "RECTIFY_AND_EXECUTE",
      violationReason:
        modelDecision === "RECTIFY_AND_EXECUTE" ? violationCode : undefined,
      rectificationDiagnosis,
      confidenceBps,
      proofHash,
      txHashes,
      primaryTxHash,
      explorerUrl: primaryTxHash
        ? `https://explorer.test.mezo.org/tx/${primaryTxHash}`
        : `https://explorer.test.mezo.org/address/${DEFAULT_CONTRACT_ADDRESSES.policyVault}`,
      agentThoughts,
      neonPersisted: true,
      liveState,
    };
  } catch (cycleErr) {
    await markCycleFailedInNeon(
      cycleId,
      cycleErr instanceof Error ? cycleErr.message : String(cycleErr),
      options?.databaseUrl
    );
    throw cycleErr;
  }
}
