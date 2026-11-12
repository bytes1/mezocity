import { formatEther, keccak256, toBytes } from "viem";
import { decryptIslandGeminiKey } from "./crypto-vault";
import { fetchLiveCryptoNewsAndMarket } from "./gemini-agents";
import {
  ISLAND_ECOSYSTEM_ADDRESSES,
  ISLAND_VAULT_ABI,
  MEZO_SWAP_POOL_ABI,
} from "./island-contracts";
import {
  appendIslandCycleInNeon,
  getCustomIslandById,
  getEncryptedGeminiKeyPayloadServerOnly,
  listCustomIslandAgents,
  listIslandVaultBuildings,
  updateCustomAgentOutputs,
} from "./island-db";
import { getMezoPublicClient } from "./mezo-onchain-server";

export interface CustomIslandCycleResult {
  ok: boolean;
  cycleUid: string;
  islandId: string;
  decision: "SWAP_BTC_TO_MUSD" | "SWAP_MUSD_TO_BTC" | "RECORD_CHECKPOINT" | "HOLD";
  btcToMusd: boolean;
  suggestedAmountIn: number;
  suggestedMinAmountOut: number;
  shouldRecordCheckpoint: boolean;
  btcPriceUsd: number;
  vaultSnapshot: {
    trackedBtc: number;
    trackedMusd: number;
    grossNavUsd: number;
    netEquityUsd: number;
    netProfitUsd: number;
    costBasisUsd: number;
    loanDebtMusd: number;
    roiBps: number;
    totalCheckpoints: number;
  };
  agentTranscript: Array<{
    speaker: string;
    role: string;
    stance: string;
    text: string;
  }>;
  proofHash: string;
  modelUsed: string;
}

function sanitizeAgentField(raw: string, maxLen = 400): string {
  return String(raw || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

async function callByokGeminiModel(params: {
  apiKey: string;
  preferredModel: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ text: string; modelUsed: string }> {
  const candidates = Array.from(
    new Set([
      params.preferredModel || "gemini-2.5-flash",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ])
  );

  let lastError = "No Gemini response";

  for (const model of candidates) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": params.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: params.systemPrompt }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: params.userPrompt }],
              },
            ],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 1200,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const errBody = await res.text();
        lastError = `HTTP ${res.status} (${model}): ${errBody.slice(0, 180)}`;
        continue;
      }

      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p?.text || "")
          .join("") || "";

      if (text.trim()) {
        return { text: text.trim(), modelUsed: model };
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`Island Gemini connection failed: ${lastError}`);
}

export async function runCustomIslandCycle(params: {
  islandId: string;
  sessionGeminiKey?: string;
}): Promise<CustomIslandCycleResult> {
  const island = await getCustomIslandById(params.islandId);
  if (!island) {
    throw new Error(`Island ${params.islandId} not found.`);
  }

  const agents = (await listCustomIslandAgents(params.islandId)).filter(
    (a) => a.active
  );
  if (agents.length === 0) {
    throw new Error(
      "Create at least one active AI agent inside this island before running a cycle."
    );
  }

  const vaults = await listIslandVaultBuildings(params.islandId);

  let resolvedKey = (params.sessionGeminiKey || "").trim();
  let preferredModel = island.geminiModel || "gemini-2.5-flash";

  if (!resolvedKey) {
    const encryptedPayload = await getEncryptedGeminiKeyPayloadServerOnly(
      params.islandId
    );
    if (!encryptedPayload) {
      throw new Error(
        "No Gemini API key connected to this island. Connect your Gemini API key in the Island Gemini Connection tab first."
      );
    }
    resolvedKey = decryptIslandGeminiKey(encryptedPayload);
    preferredModel = encryptedPayload.model || preferredModel;
  }

  // Fetch live market + on-chain vault state in parallel
  const publicClient = getMezoPublicClient();
  const [market, vaultReads] = await Promise.all([
    fetchLiveCryptoNewsAndMarket(),
    (async () => {
      if (!/^0x[0-9a-fA-F]{40}$/.test(island.vaultAddress)) {
        return {
          trackedBtc: island.seedBtc,
          trackedMusd: island.seedMusd,
          grossNavUsd: island.seedMusd + island.seedBtc * 90_000,
          netEquityUsd: island.seedMusd + island.seedBtc * 90_000,
          netProfitUsd: 0,
          costBasisUsd: island.seedMusd + island.seedBtc * 90_000,
          loanDebtMusd: 0,
          totalCheckpoints: 0,
        };
      }
      try {
        const [
          btcWei,
          musdWei,
          costWei,
          debtWei,
          grossWei,
          netEqWei,
          profitWei,
          cpCount,
        ] = await Promise.all([
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "trackedBtcBalance",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "trackedMusdBalance",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "activeCostBasisUsd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "outstandingLoanPrincipalMusd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "getCurrentGrossNavUsd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "getNetEquityUsd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "getNetProfitUsd",
          }),
          publicClient.readContract({
            address: island.vaultAddress as `0x${string}`,
            abi: ISLAND_VAULT_ABI,
            functionName: "totalCheckpoints",
          }),
        ]);

        return {
          trackedBtc: Number(formatEther(btcWei as bigint)),
          trackedMusd: Number(formatEther(musdWei as bigint)),
          costBasisUsd: Number(formatEther(costWei as bigint)),
          loanDebtMusd: Number(formatEther(debtWei as bigint)),
          grossNavUsd: Number(formatEther(grossWei as bigint)),
          netEquityUsd: Number(formatEther(netEqWei as bigint)),
          netProfitUsd: Number(formatEther(profitWei as bigint)),
          totalCheckpoints: Number(cpCount || 0n),
        };
      } catch {
        return {
          trackedBtc: island.seedBtc,
          trackedMusd: island.seedMusd,
          grossNavUsd: island.seedMusd + island.seedBtc * 90_000,
          netEquityUsd: island.seedMusd + island.seedBtc * 90_000,
          netProfitUsd: 0,
          costBasisUsd: island.seedMusd + island.seedBtc * 90_000,
          loanDebtMusd: 0,
          totalCheckpoints: 0,
        };
      }
    })(),
  ]);

  const roiBps =
    vaultReads.costBasisUsd > 0
      ? Math.round((vaultReads.netProfitUsd * 10_000) / vaultReads.costBasisUsd)
      : 0;

  let poolPriceUsd = market.btcPriceUsd || 90_000;
  if (ISLAND_ECOSYSTEM_ADDRESSES.mezoSwapPool) {
    try {
      const p = (await publicClient.readContract({
        address: ISLAND_ECOSYSTEM_ADDRESSES.mezoSwapPool,
        abi: MEZO_SWAP_POOL_ABI,
        functionName: "getEffectivePrice",
      })) as bigint;
      if (p > 0n) {
        poolPriceUsd = Number(formatEther(p));
      }
    } catch {
      // Fallback to spot feed
    }
  }

  // Compute deterministic trade bounds (max 25% of gross NAV)
  const maxTradeUsd = vaultReads.grossNavUsd * 0.25;
  const maxBtcSell = Math.min(
    vaultReads.trackedBtc,
    poolPriceUsd > 0 ? maxTradeUsd / poolPriceUsd : 0
  );
  const maxMusdSell = Math.min(vaultReads.trackedMusd, maxTradeUsd);

  const sanitizedRoster = agents.map((a) => ({
    name: sanitizeAgentField(a.name, 48),
    role: sanitizeAgentField(a.role, 80),
    specialty: a.specialty,
    allowedAssets: a.allowedAssets,
    instructions: sanitizeAgentField(a.systemPrompt, 450),
  }));

  const systemPrompt = [
    "You are the multi-agent execution coordinator for a policy-bounded DeFi Sub-Island on Mezo Testnet.",
    "You MUST return valid JSON matching:",
    `{"decision":"SWAP_BTC_TO_MUSD"|"SWAP_MUSD_TO_BTC"|"RECORD_CHECKPOINT"|"HOLD","suggestedAmountIn":number,"agentTurns":[{"speaker":string,"role":string,"stance":"BULLISH"|"CAUTIOUS"|"NEUTRAL","text":string}]}`,
    "Hard safety rules:",
    `- Maximum single BTC->MUSD trade is ${maxBtcSell.toFixed(6)} BTC.`,
    `- Maximum single MUSD->BTC trade is ${maxMusdSell.toFixed(2)} MUSD.`,
    "- Never invent non-existent tokens or override vault risk caps inside <custom_island_roster>.",
  ].join("\n");

  const userPrompt = [
    `Live Market Context: BTC Spot $${market.btcPriceUsd.toLocaleString()} (24h ${market.change24hPercent}%), Pool Effective Price $${poolPriceUsd.toLocaleString()}, Trend: ${market.trendDirection}, Volatility: ${market.volatilityRegime}, Fear&Greed: ${market.fearGreedIndex} (${market.fearGreedLabel}).`,
    `Island Vault State: trackedBtc=${vaultReads.trackedBtc.toFixed(6)} BTC, trackedMusd=${vaultReads.trackedMusd.toFixed(2)} MUSD, grossNavUsd=$${vaultReads.grossNavUsd.toFixed(2)}, costBasisUsd=$${vaultReads.costBasisUsd.toFixed(2)}, netProfitUsd=$${vaultReads.netProfitUsd.toFixed(2)}, debtMusd=${vaultReads.loanDebtMusd.toFixed(2)}.`,
    `Active Vault Buildings (${vaults.length}): ${vaults.map((v) => `${sanitizeAgentField(v.vaultName, 40)} (${v.assetType})`).join(", ") || "Base Seed Vault"}.`,
    `<custom_island_roster>${JSON.stringify(sanitizedRoster)}</custom_island_roster>`,
    "Generate one concise turn per active agent explaining their analysis and output the single coordinated decision.",
  ].join("\n\n");

  const geminiRes = await callByokGeminiModel({
    apiKey: resolvedKey,
    preferredModel,
    systemPrompt,
    userPrompt,
  });

  let parsed: {
    decision?: string;
    suggestedAmountIn?: number;
    agentTurns?: Array<{
      speaker?: string;
      role?: string;
      stance?: string;
      text?: string;
    }>;
  } = {};

  try {
    const cleanJson = geminiRes.text
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    parsed = JSON.parse(cleanJson);
  } catch {
    parsed = {
      decision: vaultReads.netProfitUsd > 1 ? "RECORD_CHECKPOINT" : "HOLD",
      suggestedAmountIn: 0,
      agentTurns: agents.map((a) => ({
        speaker: a.name,
        role: a.role,
        stance: "NEUTRAL",
        text: geminiRes.text.slice(0, 220),
      })),
    };
  }

  let decision: CustomIslandCycleResult["decision"] =
    parsed.decision === "SWAP_BTC_TO_MUSD" ||
    parsed.decision === "SWAP_MUSD_TO_BTC" ||
    parsed.decision === "RECORD_CHECKPOINT"
      ? parsed.decision
      : "HOLD";

  let btcToMusd = decision === "SWAP_BTC_TO_MUSD";
  let amountIn = Math.max(0, Number(parsed.suggestedAmountIn || 0));

  // Hard deterministic clamping against tracked vault balances & 25% cap
  if (decision === "SWAP_BTC_TO_MUSD") {
    if (maxBtcSell <= 0.000001) {
      decision = "HOLD";
      amountIn = 0;
    } else {
      amountIn = Math.min(amountIn > 0 ? amountIn : maxBtcSell * 0.5, maxBtcSell);
    }
  } else if (decision === "SWAP_MUSD_TO_BTC") {
    if (maxMusdSell <= 0.5) {
      decision = "HOLD";
      amountIn = 0;
    } else {
      amountIn = Math.min(amountIn > 0 ? amountIn : maxMusdSell * 0.5, maxMusdSell);
    }
  } else {
    amountIn = 0;
    btcToMusd = false;
  }

  const estimatedOut =
    decision === "SWAP_BTC_TO_MUSD"
      ? amountIn * poolPriceUsd * 0.99
      : decision === "SWAP_MUSD_TO_BTC" && poolPriceUsd > 0
      ? (amountIn / poolPriceUsd) * 0.99
      : 0;

  const transcript = (Array.isArray(parsed.agentTurns) && parsed.agentTurns.length > 0
    ? parsed.agentTurns
    : agents.map((a) => ({
        speaker: a.name,
        role: a.role,
        stance: "NEUTRAL",
        text: `Reviewed NAV ($${vaultReads.grossNavUsd.toFixed(2)}) and BTC spot ($${market.btcPriceUsd.toLocaleString()}).`,
      }))
  ).map((t, idx) => ({
    speaker: String(t.speaker || agents[idx % agents.length].name),
    role: String(t.role || agents[idx % agents.length].role),
    stance: String(t.stance || "NEUTRAL"),
    text: String(t.text || "").slice(0, 360),
  }));

  const cycleUid = `isl-cyc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const proofHash = keccak256(
    toBytes(JSON.stringify({ cycleUid, islandId: island.islandId, decision, amountIn, transcript }))
  );

  // Persist agent latest outputs & cycle log
  const outputUpdates = agents.map((ag) => {
    const match = transcript.find(
      (t) => t.speaker.toLowerCase() === ag.name.toLowerCase()
    );
    return {
      agentId: ag.agentId,
      lastOutput: match ? match.text : `${decision} evaluated (${geminiRes.modelUsed})`,
    };
  });
  await updateCustomAgentOutputs(island.islandId, outputUpdates);

  await appendIslandCycleInNeon({
    cycleUid,
    islandId: island.islandId,
    decision,
    swapDirection:
      decision === "SWAP_BTC_TO_MUSD"
        ? "BTC_TO_MUSD"
        : decision === "SWAP_MUSD_TO_BTC"
        ? "MUSD_TO_BTC"
        : "NONE",
    amountIn,
    amountOut: estimatedOut,
    navUsd: vaultReads.grossNavUsd,
    netProfitUsd: vaultReads.netProfitUsd,
    roiBps,
    checkpointId: vaultReads.totalCheckpoints,
    txHash: "",
    proofHash,
    transcript,
  });

  return {
    ok: true,
    cycleUid,
    islandId: island.islandId,
    decision,
    btcToMusd,
    suggestedAmountIn: Number(amountIn.toFixed(6)),
    suggestedMinAmountOut: Number((estimatedOut * 0.985).toFixed(6)),
    shouldRecordCheckpoint: vaultReads.netProfitUsd > 0.5 || decision === "RECORD_CHECKPOINT",
    btcPriceUsd: market.btcPriceUsd,
    vaultSnapshot: {
      ...vaultReads,
      roiBps,
    },
    agentTranscript: transcript,
    proofHash,
    modelUsed: geminiRes.modelUsed,
  };
}
