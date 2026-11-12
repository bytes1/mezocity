export interface IslandEcosystemAddresses {
  mainMusdVault: `0x${string}` | "";
  islandFactory: `0x${string}` | "";
  islandCreditCouncil: `0x${string}` | "";
  mezoSwapPool: `0x${string}` | "";
  islandVaultImpl: `0x${string}` | "";
}

function normalizeAddr(val: string | undefined): `0x${string}` | "" {
  const s = (val || "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? (s as `0x${string}`) : "";
}

export const ISLAND_ECOSYSTEM_ADDRESSES: IslandEcosystemAddresses = {
  mainMusdVault: normalizeAddr(process.env.NEXT_PUBLIC_MAIN_MUSD_VAULT_ADDRESS),
  islandFactory: normalizeAddr(process.env.NEXT_PUBLIC_ISLAND_FACTORY_ADDRESS),
  islandCreditCouncil: normalizeAddr(
    process.env.NEXT_PUBLIC_ISLAND_CREDIT_COUNCIL_ADDRESS
  ),
  mezoSwapPool: normalizeAddr(process.env.NEXT_PUBLIC_MEZO_SWAP_POOL_ADDRESS),
  islandVaultImpl: normalizeAddr(process.env.NEXT_PUBLIC_ISLAND_VAULT_IMPL_ADDRESS),
};

export function areIslandContractsDeployed(
  addrs: IslandEcosystemAddresses = ISLAND_ECOSYSTEM_ADDRESSES
): boolean {
  return Boolean(
    addrs.mainMusdVault &&
      addrs.islandFactory &&
      addrs.islandCreditCouncil &&
      addrs.mezoSwapPool
  );
}

export const MAIN_MUSD_VAULT_ABI = [
  {
    type: "function",
    name: "depositMUSD",
    stateMutability: "nonpayable",
    inputs: [{ name: "assetsMusd", type: "uint256" }],
    outputs: [{ name: "sharesMinted", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdrawMUSD",
    stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assetsOut", type: "uint256" }],
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
    name: "trackedLiquidMusd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "activePrincipalTotal",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "cumulativeInterestEarnedMusd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "sharePriceE18",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalShares",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "shareBalances",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
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
    name: "convertToShares",
    stateMutability: "view",
    inputs: [{ name: "assetsMusd", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "maxEligibleLoanMusd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "minLiquidReserveBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "maxSingleLoanBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "dailyAutoDisburseCapMusd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "dailyAutoDisbursedMusd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "minHoldSeconds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "lastDepositTimestamp",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "emergencyPause",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const ISLAND_FACTORY_ABI = [
  {
    type: "function",
    name: "createIsland",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "biomeTheme", type: "string" },
      { name: "initialMusdAmount", type: "uint256" },
      { name: "operatorWallet", type: "address" },
    ],
    outputs: [
      { name: "islandId", type: "uint256" },
      { name: "vaultAddr", type: "address" },
    ],
  },
  {
    type: "function",
    name: "minSeedBtc",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "minSeedMusd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalIslands",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getIslandsByOwner",
    stateMutability: "view",
    inputs: [{ name: "ownerAddr", type: "address" }],
    outputs: [
      {
        name: "list",
        type: "tuple[]",
        components: [
          { name: "islandId", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "operator", type: "address" },
          { name: "vault", type: "address" },
          { name: "name", type: "string" },
          { name: "biomeTheme", type: "string" },
          { name: "createdAt", type: "uint64" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getAllIslands",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "list",
        type: "tuple[]",
        components: [
          { name: "islandId", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "operator", type: "address" },
          { name: "vault", type: "address" },
          { name: "name", type: "string" },
          { name: "biomeTheme", type: "string" },
          { name: "createdAt", type: "uint64" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "anchorIslandAgentSpec",
    stateMutability: "nonpayable",
    inputs: [
      { name: "islandId", type: "uint256" },
      { name: "agentName", type: "string" },
      { name: "role", type: "string" },
      { name: "agentSpecHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export const ISLAND_VAULT_ABI = [
  {
    type: "function",
    name: "depositBtc",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "depositMusd",
    stateMutability: "nonpayable",
    inputs: [{ name: "musdAmount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawBtc",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountWei", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawMusd",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountMusd", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "executeWhitelistedSwap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "btcToMusd", type: "bool" },
      { name: "amountIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "recordProfitCheckpoint",
    stateMutability: "nonpayable",
    inputs: [{ name: "strategyTranscriptHash", type: "bytes32" }],
    outputs: [{ name: "checkpointId", type: "uint256" }],
  },
  {
    type: "function",
    name: "updatePolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_maxSingleTradeBps", type: "uint16" },
      { name: "_maxDailyDrawdownBps", type: "uint16" },
      { name: "_cooldownSeconds", type: "uint32" },
      { name: "_allowBtc", type: "bool" },
      { name: "_allowMusd", type: "bool" },
      { name: "_emergencyLock", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "trackedBtcBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "trackedMusdBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "activeCostBasisUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "outstandingLoanPrincipalMusd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCurrentGrossNavUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getNetEquityUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getNetProfitUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalCheckpoints",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCheckpoint",
    stateMutability: "view",
    inputs: [{ name: "checkpointId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "blockNumber", type: "uint256" },
      { name: "timestamp", type: "uint64" },
      { name: "grossNavUsd", type: "uint256" },
      { name: "loanLiabilityUsd", type: "uint256" },
      { name: "netEquityUsd", type: "uint256" },
      { name: "costBasisUsd", type: "uint256" },
      { name: "netProfitUsd", type: "uint256" },
      { name: "roiBps", type: "uint256" },
      { name: "tradeCount", type: "uint32" },
      { name: "transcriptHash", type: "bytes32" },
    ],
  },
] as const;

export const MEZO_SWAP_POOL_ABI = [
  {
    type: "function",
    name: "quoteBtcForMusd",
    stateMutability: "view",
    inputs: [{ name: "btcAmountWei", type: "uint256" }],
    outputs: [{ name: "musdOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteMusdForBtc",
    stateMutability: "view",
    inputs: [{ name: "musdAmount", type: "uint256" }],
    outputs: [{ name: "btcOutWei", type: "uint256" }],
  },
  {
    type: "function",
    name: "getEffectivePrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "trackedBtcReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "trackedMusdReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const ISLAND_CREDIT_COUNCIL_ABI = [
  {
    type: "function",
    name: "submitLoanApplication",
    stateMutability: "nonpayable",
    inputs: [
      { name: "islandId", type: "uint256" },
      { name: "checkpointId", type: "uint256" },
      { name: "requestedMusd", type: "uint256" },
      { name: "termDays", type: "uint32" },
      { name: "businessPlanHash", type: "bytes32" },
    ],
    outputs: [{ name: "appId", type: "uint256" }],
  },
  {
    type: "function",
    name: "recordCouncilDecision",
    stateMutability: "nonpayable",
    inputs: [
      { name: "appId", type: "uint256" },
      { name: "verdictCode", type: "uint8" },
      { name: "approvedMusd", type: "uint256" },
      { name: "aprBps", type: "uint16" },
      { name: "transcriptHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeAndDisburseLoan",
    stateMutability: "nonpayable",
    inputs: [{ name: "appId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "repayLoanFromVault",
    stateMutability: "nonpayable",
    inputs: [
      { name: "appId", type: "uint256" },
      { name: "maxPayMusd", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repayLoanExternal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "appId", type: "uint256" },
      { name: "maxPayMusd", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "liquidateDefaultedLoan",
    stateMutability: "nonpayable",
    inputs: [{ name: "appId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "deterministicMaxLoanUsd",
    stateMutability: "view",
    inputs: [
      { name: "vaultAddr", type: "address" },
      { name: "provedProfitUsd", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "creditScoreBps",
    stateMutability: "view",
    inputs: [{ name: "islandId", type: "uint256" }],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "activeApplicationByIsland",
    stateMutability: "view",
    inputs: [{ name: "islandId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getRemainingPrincipal",
    stateMutability: "view",
    inputs: [{ name: "appId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getTotalInterestOwed",
    stateMutability: "view",
    inputs: [{ name: "appId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "autoDisburseCapMusd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "minRequiredProfitUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "minRequiredRoiBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAllApplications",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "list",
        type: "tuple[]",
        components: [
          { name: "appId", type: "uint256" },
          { name: "islandId", type: "uint256" },
          { name: "vault", type: "address" },
          { name: "borrower", type: "address" },
          { name: "checkpointId", type: "uint256" },
          { name: "provedProfitUsd", type: "uint256" },
          { name: "provedRoiBps", type: "uint256" },
          { name: "requestedMusd", type: "uint256" },
          { name: "approvedMusd", type: "uint256" },
          { name: "principalRepaid", type: "uint256" },
          { name: "interestRepaid", type: "uint256" },
          { name: "accruedInterestOwed", type: "uint256" },
          { name: "aprBps", type: "uint16" },
          { name: "termDays", type: "uint32" },
          { name: "createdAt", type: "uint64" },
          { name: "disbursedAt", type: "uint64" },
          { name: "lastInterestTs", type: "uint64" },
          { name: "dueDate", type: "uint64" },
          { name: "businessPlanHash", type: "bytes32" },
          { name: "councilTranscriptHash", type: "bytes32" },
          { name: "verdict", type: "uint8" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
] as const;
