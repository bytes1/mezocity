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
  agentRegistry: "0x41FA000000000000000000000000000000008004" as `0x${string}`,
  policyVault: "0x41FA000000000000000000000000000000031611" as `0x${string}`,
  predictionArena: "0x41FA00000000000000000000000000000000BEEF" as `0x${string}`,
};

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
    name: "vaultTotalEquity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const AGENT_REGISTRY_ABI = [
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
    name: "totalAgents",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

