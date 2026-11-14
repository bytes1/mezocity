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
  {
    type: "function",
    name: "debates",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      { name: "debateId", type: "uint256" },
      { name: "marketTicker", type: "string" },
      { name: "thesis", type: "string" },
      { name: "bullAgentId", type: "uint256" },
      { name: "bearAgentId", type: "uint256" },
      { name: "factCheckerId", type: "uint256" },
      { name: "councilYesBps", type: "uint16" },
      { name: "marketYesBps", type: "uint16" },
      { name: "transcriptHash", type: "bytes32" },
      { name: "timestamp", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "CouncilDebateAnchored",
    inputs: [
      { indexed: true, name: "debateId", type: "uint256" },
      { indexed: false, name: "marketTicker", type: "string" },
      { indexed: false, name: "councilYesBps", type: "uint16" },
      { indexed: false, name: "marketYesBps", type: "uint16" },
      { indexed: false, name: "transcriptHash", type: "bytes32" },
    ],
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
  mezoToken: "0x7B7c000000000000000000000000000000000001" as `0x${string}`,
  troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0" as `0x${string}`,
  borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5" as `0x${string}`,
  borrowerOperationsSignatures:
    "0xD757e3646AF370b15f32EB557F0F8380Df7D639e" as `0x${string}`,
  stabilityPool: "0x1CCA7E410eE41739792eA0A24e00349Dd247680e" as `0x${string}`,
  sMusdVault: "0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16" as `0x${string}`,
  veBtc: "0xB63fcCd03521Cf21907627bd7fA465C129479231" as `0x${string}`,
  veBtcVoter: "0x72F8dd7F44fFa19E45955aa20A5486E8EB255738" as `0x${string}`,
  veMezo: "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b" as `0x${string}`,
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366" as `0x${string}`,
  hintHelpers: "0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6" as `0x${string}`,
  sortedTroves: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA" as `0x${string}`,
} as const;

export const STABILITY_POOL_ABI = [
  {
    type: "function",
    name: "musd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getTotalMUSDDeposits",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCollateralBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposits",
    stateMutability: "view",
    inputs: [{ name: "_depositor", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCompoundedMUSDDeposit",
    stateMutability: "view",
    inputs: [{ name: "_depositor", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getDepositorCollateralGain",
    stateMutability: "view",
    inputs: [{ name: "_depositor", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "provideToSP",
    stateMutability: "nonpayable",
    inputs: [{ name: "_amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawFromSP",
    stateMutability: "nonpayable",
    inputs: [{ name: "_amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawCollateralGainToTrove",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const SMUSD_SAVINGS_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "musdToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "yieldIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingYield",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimableYield",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimYield",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const BORROWER_OPERATIONS_SIGNATURES_ABI = [
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "borrowerOperations",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "addCollWithSignature",
    stateMutability: "payable",
    inputs: [
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
      { name: "_borrower", type: "address" },
      { name: "_signature", type: "bytes" },
      { name: "_deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repayMUSDWithSignature",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
      { name: "_borrower", type: "address" },
      { name: "_signature", type: "bytes" },
      { name: "_deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "adjustTroveWithSignature",
    stateMutability: "payable",
    inputs: [
      { name: "_collWithdrawal", type: "uint256" },
      { name: "_debtChange", type: "uint256" },
      { name: "_isDebtIncrease", type: "bool" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
      { name: "_borrower", type: "address" },
      { name: "_recipient", type: "address" },
      { name: "_signature", type: "bytes" },
      { name: "_deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const BORROWER_SIGNATURES_EIP712_DOMAIN = {
  name: "BorrowerOperationsSignatures",
  version: "1",
  chainId: 31611,
  verifyingContract:
    MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperationsSignatures,
} as const;

export const BORROWER_SIGNATURES_EIP712_TYPES = {
  AddColl: [
    { name: "assetAmount", type: "uint256" },
    { name: "borrower", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  RepayMUSD: [
    { name: "amount", type: "uint256" },
    { name: "borrower", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const VE_BTC_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "_owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerToNFTokenIdList",
    stateMutability: "view",
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOfNFT",
    stateMutability: "view",
    inputs: [{ name: "_tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "locked",
    stateMutability: "view",
    inputs: [{ name: "_tokenId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "int128" },
          { name: "end", type: "uint256" },
          { name: "isPermanent", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "token",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "voter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "epoch",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const VE_MEZO_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "_owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerToNFTokenIdList",
    stateMutability: "view",
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "locked",
    stateMutability: "view",
    inputs: [{ name: "_tokenId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "int128" },
          { name: "end", type: "uint256" },
          { name: "isPermanent", type: "bool" },
          { name: "boost", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "voter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

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

/**
 * Verified canonical Mezo Testnet (Chain ID 31611) Earn Vaults & Tigris Pool addresses.
 * Cross-verified against RPC storage, Blockscout explorers, and official mezo-org/tigris deployments.
 */
export const MEZO_EARN_ADDRESSES = {
  // Tokens (Chain 31611)
  btcToken: "0x7b7C000000000000000000000000000000000000" as `0x${string}`,
  musdToken: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as `0x${string}`,
  mezoToken: "0x7B7c000000000000000000000000000000000001" as `0x${string}`,
  stMezoToken: "0xf55017bF43f22cAbcf85AF3619317b7DA5Bcc148" as `0x${string}`,
  mUsdcToken: "0xe1a26db653708A2AD8F824E92Db9852410e33A59" as `0x${string}`,
  mcbBtcToken: "0x2278CAAE0009E8a325a346feA573eF23C5756DbF" as `0x${string}`,
  mTToken: "0xdd8Bf5ACa0579bEE7e6cd20AC7683E279a5f7d48" as `0x${string}`,

  // Canonical Earn Vaults (/earn/vaults)
  sMusdVault: "0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16" as `0x${string}`,
  stabilityPool: "0x1CCA7E410eE41739792eA0A24e00349Dd247680e" as `0x${string}`,
  upMusdVault: "0x44c8665fe06425Ca801f38DE39e71f61185E90AE" as `0x${string}`,
  upBtcVault: "0x36C3Fa448A798c602ab8a67721534685fe543146" as `0x${string}`,
  morphoBtcMusdcVault: "0x9F9b82ab72C3418B617357f4f5E501D22366dF08" as `0x${string}`,
  mbLpVault: "0x652e31Ba2658CC27ff0E36431cA008De7D439102" as `0x${string}`,

  // Canonical Tigris DEX Router, PoolFactory & Earn Pools (/earn/pools)
  tigrisRouter: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9" as `0x${string}`,
  tigrisPoolFactory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A" as `0x${string}`,
  veBtcVoter: "0x72F8dd7F44fFa19E45955aa20A5486E8EB255738" as `0x${string}`,
  veMezoVoter: "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1" as `0x${string}`,

  // Live Tigris AMM Pools + Active Gauges
  poolMusdBtc: "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9" as `0x${string}`,
  gaugeMusdBtc: "0xeF07B6852f4F877fB3BBD90b8f358Fb3E07D0Cc3" as `0x${string}`,

  poolMusdMusdc: "0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e" as `0x${string}`,
  gaugeMusdMusdc: "0x57Ebd7aFD11923082454689975Ea592C7Ed219a0" as `0x${string}`,

  poolMusdMezo: "0x8eb88d745B0aFFF9D71AbC40d7F550Cded7bB342" as `0x${string}`,
  poolMezoStMezo: "0x6eF4f3547beBF8A80b3ab53E724BE72f890cbdA2" as `0x${string}`,

  poolMcbBtcBtc: "0xc8BA1027e1D4f9C646B9963Eab89B1e7CF2A476E" as `0x${string}`,
  gaugeMcbBtcBtc: "0x7b30d8f43FBD957839edd707b5FD12B504faA4Cb" as `0x${string}`,

  poolMusdMt: "0x0E6BD7E52e4491320012f8C9E6161cD915BB0D19" as `0x${string}`,
  gaugeMusdMt: "0x0DCFb9d7cc59F5Ac8bdB947963405e14d3CEdB8c" as `0x${string}`,
} as const;

export const ERC4626_VAULT_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "maxDeposit",
    stateMutability: "view",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "previewDeposit",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
  },
] as const;

export const TIGRIS_ROUTER_ABI = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "quoteAddLiquidity",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
      { name: "_factory", type: "address" },
      { name: "amountADesired", type: "uint256" },
      { name: "amountBDesired", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteRemoveLiquidity",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
      { name: "_factory", type: "address" },
      { name: "liquidity", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      {
        name: "routes",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "stable", type: "bool" },
          { name: "factory", type: "address" },
        ],
      },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "addLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
      { name: "amountADesired", type: "uint256" },
      { name: "amountBDesired", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "removeLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "stable", type: "bool" },
      { name: "liquidity", type: "uint256" },
      { name: "amountAMin", type: "uint256" },
      { name: "amountBMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
    ],
  },
] as const;

export const TIGRIS_POOL_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "reserve0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "reserve1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "stable",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
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

export const TIGRIS_GAUGE_ABI = [
  {
    type: "function",
    name: "stakingToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "rewardToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "earned",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "_amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "_amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getReward",
    stateMutability: "nonpayable",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [],
  },
] as const;

export const MBLP_VAULT_ABI = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pricePerShare",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingRewards",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [{ name: "musdAmount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "minBtcOut", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const VE_BTC_VOTER_ABI = [
  {
    type: "function",
    name: "length",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalWeight",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pools",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "gauges",
    stateMutability: "view",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "weights",
    stateMutability: "view",
    inputs: [{ name: "pool", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

