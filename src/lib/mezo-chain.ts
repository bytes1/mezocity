import { defineChain } from "viem";

/**
 * Mezo Testnet Chain Definition (EVM-compatible Bitcoin L2)
 * Chain ID: 31611 (0x7b7b)
 * Native Gas Token: BTC (18 decimals)
 */
export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Mezo Testnet BTC",
    symbol: "BTC",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.test.mezo.org"],
      webSocket: ["wss://rpc-ws.test.mezo.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Mezo Testnet Explorer",
      url: "https://explorer.test.mezo.org",
    },
  },
  testnet: true,
});

export const MEZO_TESTNET_PARAMS = {
  chainId: "0x7b7b", // 31611
  chainName: "Mezo Testnet",
  nativeCurrency: {
    name: "Bitcoin",
    symbol: "BTC",
    decimals: 18,
  },
  rpcUrls: ["https://rpc.test.mezo.org"],
  blockExplorerUrls: ["https://explorer.test.mezo.org"],
};

export const DEFAULT_CONTRACT_ADDRESSES = {
  agentRegistry: (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS ||
    "0x4e6a49b021f01fbbA71408de556aA41aC491A426") as `0x${string}`,
  policyVault: (process.env.NEXT_PUBLIC_POLICY_VAULT_ADDRESS ||
    "0xb3A7ab7be5116737b05B7682aCaC62e7D54B1477") as `0x${string}`,
  dcaEngine: (process.env.NEXT_PUBLIC_DCA_ENGINE_ADDRESS ||
    "0x3118372cAc92B14d2C733bA625739f1A31084701") as `0x${string}`,
};

export const AGENT_REGISTRY_ABI = [
  {
    type: "function",
    name: "getAllAgents",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "list",
        type: "tuple[]",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "name", type: "string" },
          { name: "role", type: "string" },
          { name: "operator", type: "address" },
          { name: "agentCardURI", type: "string" },
          { name: "mcpEndpoint", type: "string" },
          { name: "strategySpecHash", type: "bytes32" },
          { name: "reputationScore", type: "uint256" },
          { name: "totalActions", type: "uint256" },
          { name: "successfulActions", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "registeredAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "name", type: "string" },
          { name: "role", type: "string" },
          { name: "operator", type: "address" },
          { name: "agentCardURI", type: "string" },
          { name: "mcpEndpoint", type: "string" },
          { name: "strategySpecHash", type: "bytes32" },
          { name: "reputationScore", type: "uint256" },
          { name: "totalActions", type: "uint256" },
          { name: "successfulActions", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "registeredAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "totalAgents",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "role", type: "string" },
      { name: "operator", type: "address" },
      { name: "agentCardURI", type: "string" },
      { name: "mcpEndpoint", type: "string" },
      { name: "strategySpecHash", type: "bytes32" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "recordExecutionOutcome",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "success", type: "bool" },
      { name: "proofHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "anchorCouncilDebate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketTicker", type: "string" },
      { name: "thesis", type: "string" },
      { name: "bullAgentId", type: "uint256" },
      { name: "bearAgentId", type: "uint256" },
      { name: "factCheckerId", type: "uint256" },
      { name: "councilYesBps", type: "uint16" },
      { name: "marketYesBps", type: "uint16" },
      { name: "transcriptHash", type: "bytes32" },
    ],
    outputs: [{ name: "debateId", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalDebates",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * PolicyVault.ActionType enum indices matching contracts/src/PolicyVault.sol
 */
export const POLICY_ACTION_TYPES = {
  LONG_POSITION: 0,
  SHORT_POSITION: 1,
  REBALANCE_BASKET: 2,
  PREDICTION_BET: 3,
  BTC_YIELD_ALLOCATION: 4,
} as const;

export const POLICY_VAULT_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountWei", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "updatePolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "maxSingleTradeBps", type: "uint16" },
      { name: "maxDailyDrawdownBps", type: "uint16" },
      { name: "minConfidenceBps", type: "uint16" },
      { name: "cooldownSeconds", type: "uint32" },
      { name: "emergencyLock", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "executePolicyFencedAction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "actionType", type: "uint8" },
      { name: "marketTicker", type: "string" },
      { name: "amountWei", type: "uint256" },
      { name: "confidenceBps", type: "uint16" },
      { name: "reasoningProofHash", type: "bytes32" },
    ],
    outputs: [
      { name: "passed", type: "bool" },
      { name: "executionId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "checkPolicyGuardrails",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "amountWei", type: "uint256" },
      { name: "confidenceBps", type: "uint16" },
    ],
    outputs: [
      { name: "allowed", type: "bool" },
      { name: "reason", type: "string" },
    ],
  },
  {
    type: "function",
    name: "vaultTotalEquity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalPrincipalDeposited",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalActiveAllocated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "dailyRealizedLoss",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "lastExecutionTimestamp",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "userDeposits",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "policy",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "maxSingleTradeBps", type: "uint16" },
      { name: "maxDailyDrawdownBps", type: "uint16" },
      { name: "minConfidenceBps", type: "uint16" },
      { name: "cooldownSeconds", type: "uint32" },
      { name: "emergencyLock", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "totalExecutions",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getRecentExecutions",
    stateMutability: "view",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [
      {
        name: "list",
        type: "tuple[]",
        components: [
          { name: "executionId", type: "uint256" },
          { name: "agentId", type: "uint256" },
          { name: "actionType", type: "uint8" },
          { name: "marketTicker", type: "string" },
          { name: "amountWei", type: "uint256" },
          { name: "confidenceBps", type: "uint16" },
          { name: "reasoningProofHash", type: "bytes32" },
          { name: "passedPolicy", type: "bool" },
          { name: "violationReason", type: "string" },
          { name: "timestamp", type: "uint64" },
        ],
      },
    ],
  },
] as const;

export const DCA_ENGINE_ABI = [
  {
    type: "function",
    name: "createDCASchedule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "strategyName", type: "string" },
      { name: "targetAsset", type: "string" },
      { name: "sliceAmountWei", type: "uint256" },
      { name: "intervalSeconds", type: "uint32" },
      { name: "maxSlippageBps", type: "uint16" },
      { name: "totalSlices", type: "uint32" },
    ],
    outputs: [{ name: "scheduleId", type: "uint256" }],
  },
  {
    type: "function",
    name: "executeDCASlice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "scheduleId", type: "uint256" },
      { name: "dcaAgentId", type: "uint256" },
      { name: "confidenceBps", type: "uint16" },
      { name: "aiProofHash", type: "bytes32" },
    ],
    outputs: [
      { name: "passed", type: "bool" },
      { name: "executionId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "rectifyAndExecuteDCASlice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "scheduleId", type: "uint256" },
      { name: "rectifierAgentId", type: "uint256" },
      { name: "rectifiedAmountWei", type: "uint256" },
      { name: "rectifiedConfidenceBps", type: "uint16" },
      { name: "originalError", type: "string" },
      { name: "aiDiagnosis", type: "string" },
      { name: "proofHash", type: "bytes32" },
    ],
    outputs: [
      { name: "passed", type: "bool" },
      { name: "rectificationId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getAllSchedules",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "scheduleId", type: "uint256" },
          { name: "creator", type: "address" },
          { name: "strategyName", type: "string" },
          { name: "targetAsset", type: "string" },
          { name: "sliceAmountWei", type: "uint256" },
          { name: "intervalSeconds", type: "uint32" },
          { name: "maxSlippageBps", type: "uint16" },
          { name: "totalSlices", type: "uint32" },
          { name: "executedSlices", type: "uint32" },
          { name: "lastExecutionTime", type: "uint64" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getAllRectifications",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "rectificationId", type: "uint256" },
          { name: "scheduleId", type: "uint256" },
          { name: "rectifierAgentId", type: "uint256" },
          { name: "originalError", type: "string" },
          { name: "originalAmountWei", type: "uint256" },
          { name: "rectifiedAmountWei", type: "uint256" },
          { name: "aiDiagnosis", type: "string" },
          { name: "proofHash", type: "bytes32" },
          { name: "timestamp", type: "uint64" },
        ],
      },
    ],
  },
] as const;

/**
 * Official Mezo Testnet (Chain ID: 31611) MUSD Lending / Trove System Addresses
 */
export const MEZO_TESTNET_LENDING_ADDRESSES = {
  musdToken: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as `0x${string}`,
  troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0" as `0x${string}`,
  borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5" as `0x${string}`,
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366" as `0x${string}`,
  hintHelpers: "0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6" as `0x${string}`,
  sortedTroves: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA" as `0x${string}`,
} as const;

export const MUSD_ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const TROVE_MANAGER_ABI = [
  {
    type: "function",
    name: "getEntireDebtAndColl",
    stateMutability: "view",
    inputs: [{ name: "_borrower", type: "address" }],
    outputs: [
      { name: "coll", type: "uint256" },
      { name: "principal", type: "uint256" },
      { name: "interest", type: "uint256" },
      { name: "pendingCollateral", type: "uint256" },
      { name: "pendingPrincipal", type: "uint256" },
      { name: "pendingInterest", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getCurrentICR",
    stateMutability: "view",
    inputs: [
      { name: "_borrower", type: "address" },
      { name: "_price", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTroveStatus",
    stateMutability: "view",
    inputs: [{ name: "_borrower", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTroveDebt",
    stateMutability: "view",
    inputs: [{ name: "_borrower", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTroveColl",
    stateMutability: "view",
    inputs: [{ name: "_borrower", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTCR",
    stateMutability: "view",
    inputs: [{ name: "_price", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "checkRecoveryMode",
    stateMutability: "view",
    inputs: [{ name: "_price", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "MCR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "CCR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const BORROWER_OPERATIONS_ABI = [
  {
    type: "function",
    name: "openTrove",
    stateMutability: "payable",
    inputs: [
      { name: "_debtAmount", type: "uint256" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "adjustTrove",
    stateMutability: "payable",
    inputs: [
      { name: "_collWithdrawal", type: "uint256" },
      { name: "_debtChange", type: "uint256" },
      { name: "_isDebtIncrease", type: "bool" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "minNetDebt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MUSD_GAS_COMPENSATION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "borrowingRate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getBorrowingFee",
    stateMutability: "view",
    inputs: [{ name: "_debt", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCompositeDebt",
    stateMutability: "view",
    inputs: [{ name: "_debt", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "addColl",
    stateMutability: "payable",
    inputs: [
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawColl",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawMUSD",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repayMUSD",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "closeTrove",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export const PRICE_FEED_ABI = [
  {
    type: "function",
    name: "fetchPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const HINT_HELPERS_ABI = [
  {
    type: "function",
    name: "computeNominalCR",
    stateMutability: "pure",
    inputs: [
      { name: "_coll", type: "uint256" },
      { name: "_debt", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getApproxHint",
    stateMutability: "view",
    inputs: [
      { name: "_CR", type: "uint256" },
      { name: "_numTrials", type: "uint256" },
      { name: "_inputRandomSeed", type: "uint256" },
    ],
    outputs: [
      { name: "hintAddress", type: "address" },
      { name: "diff", type: "uint256" },
      { name: "latestRandomSeed", type: "uint256" },
    ],
  },
] as const;

export const SORTED_TROVES_ABI = [
  {
    type: "function",
    name: "getSize",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "findInsertPosition",
    stateMutability: "view",
    inputs: [
      { name: "_CR", type: "uint256" },
      { name: "_prevId", type: "address" },
      { name: "_nextId", type: "address" },
    ],
    outputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
    ],
  },
] as const;

const ZERO_HINT = "0x0000000000000000000000000000000000000000" as `0x${string}`;

/**
 * Computes exact SortedTroves insertion hints (_upperHint, _lowerHint) on Mezo Testnet
 * so openTrove / adjustTrove / repayMUSD execute at minimal gas without full list scans.
 */
export async function computeMezoTroveHints(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: { readContract: (args: any) => Promise<any> } | null | undefined,
  totalCollWei: bigint,
  totalCompositeDebtWei: bigint
): Promise<[`0x${string}`, `0x${string}`]> {
  if (!publicClient || totalCollWei <= 0n || totalCompositeDebtWei <= 0n) {
    return [ZERO_HINT, ZERO_HINT];
  }
  try {
    const nicr = (await publicClient.readContract({
      address: MEZO_TESTNET_LENDING_ADDRESSES.hintHelpers,
      abi: HINT_HELPERS_ABI,
      functionName: "computeNominalCR",
      args: [totalCollWei, totalCompositeDebtWei],
    })) as bigint;

    const listSize = (await publicClient.readContract({
      address: MEZO_TESTNET_LENDING_ADDRESSES.sortedTroves,
      abi: SORTED_TROVES_ABI,
      functionName: "getSize",
    })) as bigint;

    const numTrials = BigInt(
      Math.min(60, Math.max(15, Math.ceil(15 * Math.sqrt(Number(listSize || 1n)))))
    );

    const approx = (await publicClient.readContract({
      address: MEZO_TESTNET_LENDING_ADDRESSES.hintHelpers,
      abi: HINT_HELPERS_ABI,
      functionName: "getApproxHint",
      args: [nicr, numTrials, 42n],
    })) as [`0x${string}`, bigint, bigint];

    const pos = (await publicClient.readContract({
      address: MEZO_TESTNET_LENDING_ADDRESSES.sortedTroves,
      abi: SORTED_TROVES_ABI,
      functionName: "findInsertPosition",
      args: [nicr, approx[0], approx[0]],
    })) as [`0x${string}`, `0x${string}`];

    return [pos[0] || ZERO_HINT, pos[1] || ZERO_HINT];
  } catch {
    return [ZERO_HINT, ZERO_HINT];
  }
}

export function extractEvmRevertReason(err: unknown): string {
  if (!err || typeof err !== "object") {
    return String(err || "Unknown contract error");
  }
  const e = err as {
    shortMessage?: string;
    message?: string;
    details?: string;
    cause?: { shortMessage?: string; reason?: string; message?: string };
  };
  return (
    e.cause?.reason ||
    e.cause?.shortMessage ||
    e.shortMessage ||
    e.details ||
    e.message ||
    "Transaction reverted on Mezo Testnet"
  );
}

