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
] as const;

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
      { name: "debt", type: "uint256" },
      { name: "coll", type: "uint256" },
      { name: "pendingMUSDReward", type: "uint256" },
      { name: "pendingCollateralReward", type: "uint256" },
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
      { name: "_maxFeePercentage", type: "uint256" },
      { name: "_MUSDAmount", type: "uint256" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
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
      { name: "_maxFeePercentage", type: "uint256" },
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
    name: "lastGoodPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

