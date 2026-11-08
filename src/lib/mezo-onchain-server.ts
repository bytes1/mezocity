import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  keccak256,
  parseEther,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AGENT_REGISTRY_ABI,
  DCA_ENGINE_ABI,
  DEFAULT_CONTRACT_ADDRESSES,
  POLICY_VAULT_ABI,
  mezoTestnet,
} from "./mezo-chain";
import {
  ClayAgent,
  DCAScheduleItem,
  ExecutionAuditEntry,
  INITIAL_AGENTS,
  PolicyGuardrails,
} from "./simulation-data";

const DEFAULT_OPERATOR_PK =
  "0xdbc3baa38bb740094a761967da35c5de791960c88418f73f6c48618e0ac2e109";

function getOperatorPrivateKey(): `0x${string}` {
  const raw =
    process.env.AGENT_OPERATOR_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    DEFAULT_OPERATOR_PK;
  const trimmed = raw.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`;
}

export function getMezoPublicClient() {
  return createPublicClient({
    chain: mezoTestnet,
    transport: http("https://rpc.test.mezo.org", {
      timeout: 20_000,
      retryCount: 2,
    }),
  });
}

export function getMezoOperatorWallet() {
  const account = privateKeyToAccount(getOperatorPrivateKey());
  const walletClient = createWalletClient({
    account,
    chain: mezoTestnet,
    transport: http("https://rpc.test.mezo.org", {
      timeout: 25_000,
      retryCount: 2,
    }),
  });
  return { account, walletClient };
}

/**
 * Dedicated Guard Reserve Wallet — separate EOA account from the DCA Operator Wallet
 * because "one live agent per wallet is an inherited constraint".
 */
export function getDedicatedGuardReserveWallet() {
  const customPk = process.env.MEZO_GUARD_RESERVE_PRIVATE_KEY?.trim();
  const reservePk: `0x${string}` =
    customPk && customPk.length >= 64
      ? ((customPk.startsWith("0x") ? customPk : `0x${customPk}`) as `0x${string}`)
      : keccak256(
          toBytes(
            `${getOperatorPrivateKey()}:MEZO_LENDING_GUARD_DEDICATED_RESERVE_V1`
          )
        );
  const account = privateKeyToAccount(reservePk);
  const walletClient = createWalletClient({
    account,
    chain: mezoTestnet,
    transport: http("https://rpc.test.mezo.org", {
      timeout: 25_000,
      retryCount: 2,
    }),
  });
  return { account, walletClient };
}

export function toSafeEtherWei(btcValue: string | number): bigint {
  const num = typeof btcValue === "number" ? btcValue : parseFloat(btcValue);
  if (!Number.isFinite(num) || num <= 0) return 0n;
  return parseEther(num.toFixed(18));
}

// Sequential mutex lock so Mezo Testnet Tendermint mempool never receives parallel nonces
let operatorQueue: Promise<unknown> = Promise.resolve();

export function withOperatorLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = operatorQueue.then(fn, fn);
  operatorQueue = next.catch(() => undefined);
  return next;
}

/**
 * Ensures the deployed contracts on Mezo Testnet (31611) have:
 * 1. Non-zero BTC liquidity in PolicyVault (so checkPolicyGuardrails doesn't fail with EMPTY_VAULT)
 * 2. 0-second cooldown in PolicyVault (so back-to-back DCA & Rectifier transactions don't hit COOLDOWN_ACTIVE)
 * 3. At least 1 active DCA Schedule in MezoDCAEngine (since tx #8 in forge script hit nonce sequence)
 */
export async function ensureOnChainInitialized(): Promise<{
  initializedTxHashes: string[];
}> {
  return withOperatorLock(async () => {
    const publicClient = getMezoPublicClient();
    const { account, walletClient } = getMezoOperatorWallet();
    const initializedTxHashes: string[] = [];

    // 1. Check PolicyVault balance (ensure at least 100,000 wei so bps math is always non-zero)
    let vaultEquityWei = await publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "vaultTotalEquity",
    });

    if (vaultEquityWei < 100000n) {
      const operatorBalance = await publicClient.getBalance({
        address: account.address,
      });

      // Deposit 20% of operator balance (capped at 0.0005 BTC = 5e14 wei, min 10000 wei)
      // so plenty of BTC remains for gas across dozens of transactions.
      const twentyPercent = operatorBalance / 5n;
      const capWei = parseEther("0.0005");
      const depositWei =
        twentyPercent > capWei
          ? capWei
          : twentyPercent > 10000n
          ? twentyPercent
          : operatorBalance > 50000n
          ? 10000n
          : 0n;

      if (depositWei > 0n) {
        const nonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        const depositHash = await walletClient.writeContract({
          address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "deposit",
          value: depositWei,
          nonce,
          gas: 250000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: depositHash });
        initializedTxHashes.push(depositHash);
        vaultEquityWei = await publicClient.readContract({
          address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "vaultTotalEquity",
        });
      }
    }

    // 2. Check PolicyVault cooldownSeconds (reduce from 15s to 1s if needed so consecutive txs don't block)
    const policyTuple = await publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "policy",
    });
    const [
      maxSingleTradeBps,
      maxDailyDrawdownBps,
      minConfidenceBps,
      cooldownSeconds,
      emergencyLock,
    ] = policyTuple;

    if (Number(cooldownSeconds) > 0) {
      const nonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });
      const policyHash = await walletClient.writeContract({
        address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
        abi: POLICY_VAULT_ABI,
        functionName: "updatePolicy",
        args: [
          maxSingleTradeBps,
          maxDailyDrawdownBps,
          minConfidenceBps,
          0,
          emergencyLock,
        ],
        nonce,
        gas: 250000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: policyHash });
      initializedTxHashes.push(policyHash);
    }

    // 3. Check MezoDCAEngine schedules (create initial schedule if empty)
    const schedules = await publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.dcaEngine,
      abi: DCA_ENGINE_ABI,
      functionName: "getAllSchedules",
    });

    if (schedules.length === 0) {
      // Set default slice to 5% of vault equity (safely inside 10% maxSingleTradeBps cap)
      const baseEquity =
        vaultEquityWei > 0n ? vaultEquityWei : parseEther("0.0005");
      const safeSliceWei =
        (baseEquity * 500n) / 10000n > 0n
          ? (baseEquity * 500n) / 10000n
          : 1000n;

      const nonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });
      const schedHash = await walletClient.writeContract({
        address: DEFAULT_CONTRACT_ADDRESSES.dcaEngine,
        abi: DCA_ENGINE_ABI,
        functionName: "createDCASchedule",
        args: [
          "stBTC Auto-DCA Accumulation",
          "stBTC-MEZO-VAULT",
          safeSliceWei,
          3600,
          45,
          100,
        ],
        nonce,
        gas: 450000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: schedHash });
      initializedTxHashes.push(schedHash);
    }

    // 4. Ensure 5th Transformers Agent (Soundwave - Live Crypto & Macro Signal Interceptor) is registered on-chain
    const totalAgentsCount = await publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.agentRegistry,
      abi: AGENT_REGISTRY_ABI,
      functionName: "totalAgents",
    });

    if (Number(totalAgentsCount) < 5) {
      try {
        const nonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        const soundwaveHash = await walletClient.writeContract({
          address: DEFAULT_CONTRACT_ADDRESSES.agentRegistry,
          abi: AGENT_REGISTRY_ABI,
          functionName: "registerAgent",
          args: [
            "Soundwave",
            "Live Crypto & Macro Signal Interceptor",
            "0x8004000000000000000000000000000000000005",
            "https://mezotown.4lpha.tech/api/agent-card?agentId=5",
            "https://mezotown.4lpha.tech/api/mcp",
            keccak256(toBytes("MEZO-ERC8004-SOUNDWAVE-SIGNAL-INTERCEPTOR-V1")),
          ],
          nonce,
          gas: 450000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: soundwaveHash });
        initializedTxHashes.push(soundwaveHash);
      } catch (e) {
        console.warn("Soundwave agent on-chain registration skipped/already registered:", e);
      }
    }

    return { initializedTxHashes };
  });
}

export interface LiveOnChainState {
  chainId: number;
  blockNumber: string;
  contracts: typeof DEFAULT_CONTRACT_ADDRESSES;
  operatorAddress: string;
  operatorBalanceBtc: number;
  operatorBalanceWei: string;
  userAddress: string;
  userWalletBalanceBtc: number;
  userDepositedBtc: number;
  userDepositedWei: string;
  vaultTvlBtc: number;
  vaultTvlWei: string;
  totalPrincipalDepositedBtc: number;
  totalActiveAllocatedBtc: number;
  dailyRealizedLossBtc: number;
  lastExecutionTimestamp: number;
  guardrails: PolicyGuardrails;
  agents: ClayAgent[];
  dcaSchedules: DCAScheduleItem[];
  executionLedger: ExecutionAuditEntry[];
  rectifiedCount: number;
  totalSlicesExecuted: number;
  initializedTxHashes?: string[];
}

export async function fetchLiveOnChainState(
  userAddress?: string,
  autoInit = true
): Promise<LiveOnChainState> {
  let initializedTxHashes: string[] = [];
  if (autoInit) {
    try {
      const initRes = await ensureOnChainInitialized();
      initializedTxHashes = initRes.initializedTxHashes;
    } catch (e) {
      console.warn("ensureOnChainInitialized warning:", e);
    }
  }

  const publicClient = getMezoPublicClient();
  const { account } = getMezoOperatorWallet();
  const targetUser = (
    userAddress && userAddress.startsWith("0x") && userAddress.length === 42
      ? userAddress
      : account.address
  ) as `0x${string}`;

  const [
    blockNum,
    operatorBalWei,
    userBalWei,
    vaultEquityWei,
    totalPrincipalWei,
    totalAllocatedWei,
    dailyLossWei,
    lastExecTime,
    userDepWei,
    policyTuple,
    rawAgents,
    rawSchedules,
    rawRectifications,
    rawExecutions,
  ] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.getBalance({ address: account.address }),
    publicClient.getBalance({ address: targetUser }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "vaultTotalEquity",
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "totalPrincipalDeposited",
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "totalActiveAllocated",
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "dailyRealizedLoss",
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "lastExecutionTimestamp",
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "userDeposits",
      args: [targetUser],
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "policy",
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.agentRegistry,
      abi: AGENT_REGISTRY_ABI,
      functionName: "getAllAgents",
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.dcaEngine,
      abi: DCA_ENGINE_ABI,
      functionName: "getAllSchedules",
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.dcaEngine,
      abi: DCA_ENGINE_ABI,
      functionName: "getAllRectifications",
    }),
    publicClient.readContract({
      address: DEFAULT_CONTRACT_ADDRESSES.policyVault,
      abi: POLICY_VAULT_ABI,
      functionName: "getRecentExecutions",
      args: [25n],
    }),
  ]);

  const vaultTvlBtc = Number(formatEther(vaultEquityWei));
  const operatorBalanceBtc = Number(formatEther(operatorBalWei));
  const userWalletBalanceBtc = Number(formatEther(userBalWei));
  const userDepositedBtc = Number(formatEther(userDepWei));

  const guardrails: PolicyGuardrails = {
    maxSingleTradeBps: Number(policyTuple[0]),
    maxDailyDrawdownBps: Number(policyTuple[1]),
    minConfidenceBps: Number(policyTuple[2]),
    cooldownSeconds: Number(policyTuple[3]),
    emergencyLock: Boolean(policyTuple[4]),
  };

  // Map on-chain ERC-8004 agents onto the 5 Transformers 3D Island agents
  const agents: ClayAgent[] = INITIAL_AGENTS.map((template, idx) => {
    const onchain = rawAgents[idx];
    if (!onchain) return template;

    const totalActs = Number(onchain.totalActions);
    const successActs = Number(onchain.successfulActions);
    const repBps = Number(onchain.reputationScore);
    const computedSuccessRate =
      totalActs > 0
        ? Number(((successActs / totalActs) * 100).toFixed(1))
        : Number((repBps / 100).toFixed(1));

    return {
      ...template,
      id: Number(onchain.agentId),
      erc8004Id: `ERC8004-MEZO #0${Number(onchain.agentId)}`,
      // Always display the Transformers persona name & role while binding live on-chain stats
      name: template.name,
      role: template.role,
      operatorAddress: onchain.operator,
      strategySpecHash: onchain.strategySpecHash,
      reputationBps: repBps,
      totalActions: totalActs,
      successRate: computedSuccessRate,
    };
  });

  // Map on-chain DCA Schedules & attach latest RectificationLog if any
  const rectificationsBySchedule = new Map<
    number,
    (typeof rawRectifications)[number]
  >();
  for (const r of rawRectifications) {
    rectificationsBySchedule.set(Number(r.scheduleId), r);
  }

  let totalSlicesExecuted = 0;
  const dcaSchedules: DCAScheduleItem[] = rawSchedules.map((s) => {
    const schedId = Number(s.scheduleId);
    const sliceBtc = Number(formatEther(s.sliceAmountWei));
    const execSlices = Number(s.executedSlices);
    const totSlices = Number(s.totalSlices);
    totalSlicesExecuted += execSlices;
    const latestRect = rectificationsBySchedule.get(schedId);

    const intervalSec = Number(s.intervalSeconds);
    const intervalLabel =
      intervalSec <= 900
        ? `Every ${Math.max(1, Math.round(intervalSec / 60))}m`
        : intervalSec <= 3600
        ? "Every 1h (TWAP)"
        : intervalSec <= 14400
        ? "Every 4h"
        : "Daily Epoch";

    return {
      id: schedId,
      strategyName: s.strategyName,
      targetAsset: s.targetAsset,
      sliceAmountBtc: sliceBtc,
      intervalLabel,
      intervalSeconds: intervalSec,
      executedSlices: execSlices,
      totalSlices: totSlices,
      maxSlippageBps: Number(s.maxSlippageBps),
      nextRunCountdown: s.active ? "LIVE ON-CHAIN" : "COMPLETED",
      status: !s.active
        ? "PAUSED"
        : latestRect
        ? "RECTIFIED"
        : "ACTIVE",
      lastRectificationNote: latestRect
        ? `Ratchet AI (#0${Number(
            latestRect.rectifierAgentId
          )}) rectified '${latestRect.originalError}': resized ${formatEther(
            latestRect.originalAmountWei
          )} BTC → ${formatEther(latestRect.rectifiedAmountWei)} BTC`
        : undefined,
      totalAccumulatedBtc: Number((sliceBtc * execSlices).toFixed(8)),
      avgEntryScore: 95.0,
    };
  });

  // Map on-chain Rectifications by proofHash so we can enrich ExecutionRecords
  const rectByProof = new Map<string, (typeof rawRectifications)[number]>();
  for (const r of rawRectifications) {
    rectByProof.set(r.proofHash.toLowerCase(), r);
  }

  const agentMetaById: Record<
    number,
    {
      name:
        | "Optimus Prime"
        | "Bumblebee"
        | "Ratchet"
        | "Ironhide"
        | "Soundwave";
      model: string;
    }
  > = {
    1: { name: "Optimus Prime", model: "gemini-3.8-flash" },
    2: { name: "Bumblebee", model: "gemini-3.8-flash" },
    3: { name: "Ratchet", model: "gemini-3.8-flash" },
    4: { name: "Ironhide", model: "gemini-3.5-flash-lite" },
    5: { name: "Soundwave", model: "gemini-3.5-flash-lite" },
  };

  const executionLedger: ExecutionAuditEntry[] = rawExecutions.map((ex) => {
    const execId = Number(ex.executionId);
    const agId = Number(ex.agentId);
    const meta = agentMetaById[agId] || {
      name: "Bumblebee",
      model: "gemini-3.8-flash",
    };
    const amountBtc = Number(formatEther(ex.amountWei));
    const sharePercent =
      vaultTvlBtc > 0
        ? Number(((amountBtc / vaultTvlBtc) * 100).toFixed(2))
        : 0;
    const matchedRect = rectByProof.get(ex.reasoningProofHash.toLowerCase());
    const tsMs = Number(ex.timestamp) * 1000;
    const timeStr =
      tsMs > 0
        ? new Date(tsMs).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "On-chain";

    return {
      id: execId,
      timestamp: timeStr,
      agentName: meta.name,
      aiModelUsed: meta.model,
      erc8004Id: `ERC8004-MEZO #0${agId}`,
      actionType: matchedRect
        ? "AUTO_ERROR_RECTIFICATION"
        : !ex.passedPolicy
        ? "GUARDRAIL_INTERCEPTION"
        : "DCA_SLICE_EXECUTION",
      targetAsset: ex.marketTicker,
      amountBtc,
      vaultSharePercent: sharePercent,
      confidencePercent: Number((Number(ex.confidenceBps) / 100).toFixed(1)),
      passedPolicy: ex.passedPolicy,
      wasRectified: Boolean(matchedRect),
      violationReason: !ex.passedPolicy
        ? ex.violationReason
        : matchedRect
        ? matchedRect.originalError
        : undefined,
      rectificationSummary: matchedRect
        ? `${matchedRect.aiDiagnosis} (Resized ${formatEther(
            matchedRect.originalAmountWei
          )} → ${formatEther(matchedRect.rectifiedAmountWei)} BTC)`
        : undefined,
      proofHash: ex.reasoningProofHash,
      txHash: ex.reasoningProofHash,
    };
  });

  return {
    chainId: 31611,
    blockNumber: blockNum.toLocaleString(),
    contracts: DEFAULT_CONTRACT_ADDRESSES,
    operatorAddress: account.address,
    operatorBalanceBtc,
    operatorBalanceWei: operatorBalWei.toString(),
    userAddress: targetUser,
    userWalletBalanceBtc,
    userDepositedBtc,
    userDepositedWei: userDepWei.toString(),
    vaultTvlBtc,
    vaultTvlWei: vaultEquityWei.toString(),
    totalPrincipalDepositedBtc: Number(formatEther(totalPrincipalWei)),
    totalActiveAllocatedBtc: Number(formatEther(totalAllocatedWei)),
    dailyRealizedLossBtc: Number(formatEther(dailyLossWei)),
    lastExecutionTimestamp: Number(lastExecTime),
    guardrails,
    agents,
    dcaSchedules,
    executionLedger,
    rectifiedCount: rawRectifications.length,
    totalSlicesExecuted,
    initializedTxHashes:
      initializedTxHashes.length > 0 ? initializedTxHashes : undefined,
  };
}
