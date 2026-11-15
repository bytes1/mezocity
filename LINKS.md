# 🔗 MezoCity — Live Demo, Video & Official Links Directory

> ### 🚀 **Start Here — Live Demo & Walkthrough**
>
> * **🌐 Live Demo Application:** **[https://mezocity.vercel.app/](https://mezocity.vercel.app/)**
> * **🎬  Demo Video (YouTube):** **[https://youtu.be/OU30uombJR4](https://youtu.be/OU30uombJR4)**
> * **📊 Pitch Deck (PDF):** **[PitchDeck.pdf](./PitchDeck.pdf)** · **📈 Business Plan:** **[BUSINESS_PLAN.md](./PitchDeck.pdf)**

Quick-reference index of **MezoCity (`mezocity`)** live endpoints, Blockscout-verified smart contracts, canonical Mezo Testnet (`Chain ID: 31611`) primitives, and agent APIs.

---

## 🎯 Hackathon & Submission Links

| Resource | Status | Link |
| :--- | :---: | :--- |
| **Live Application (Frontend)** | ✅ Live | **[https://mezocity.vercel.app/](https://mezocity.vercel.app/)** |
| **5-Minute Demo Video** | ✅ Live | **[https://youtu.be/OU30uombJR4](https://youtu.be/OU30uombJR4)** |
| **Pitch Deck (PDF)** | ✅ Repo | **[PitchDeck.pdf](./PitchDeck.pdf)** |
| **Business Plan (`BUSINESS_PLAN.md`)** | ✅ Repo | **[BUSINESS_PLAN.md](./BUSINESS_PLAN.md)** |
| **GitHub Repository** | ✅ Live | https://github.com/bytes1/mezocity |
| **Main Documentation (`README.md`)** | ✅ Repo | [README.md](./README.md) |
| **Mezo Testnet Blockscout Explorer** | ✅ Live | https://explorer.test.mezo.org |
| **Mezo Testnet RPC / WebSocket** | ✅ Live | `https://rpc.test.mezo.org` · `wss://rpc-ws.test.mezo.org` |

---

## 📜 Deployed & Blockscout-Verified Smart Contracts (`Mezo Testnet · 31611`)

All **11 custom smart contracts** are deployed on Mezo Testnet (`Chain ID: 31611 / 0x7b7b`) and source-verified on Blockscout:

### Main Island Autonomous Core (`DeployMezoTestnet.s.sol`)

| Contract | Purpose | Explorer Link |
| :--- | :--- | :--- |
| **`AgentRegistry`** *(ERC-8004)* | On-chain identities, reputation, & council debate anchoring | [`0x4e6a49b021f01fbbA71408de556aA41aC491A426`](https://explorer.test.mezo.org/address/0x4e6a49b021f01fbbA71408de556aA41aC491A426?tab=contract) |
| **`PolicyVault`** | Non-custodial BTC vault enforcing trade, drawdown, & kill-switch caps | [`0xb3A7ab7be5116737b05B7682aCaC62e7D54B1477`](https://explorer.test.mezo.org/address/0xb3A7ab7be5116737b05B7682aCaC62e7D54B1477?tab=contract) |
| **`MezoDCAEngine`** | Time-weighted BTC strategy scheduler & self-healing slice rectifier | [`0x3118372cAc92B14d2C733bA625739f1A31084701`](https://explorer.test.mezo.org/address/0x3118372cAc92B14d2C733bA625739f1A31084701?tab=contract) |

### Sub-Island Archipelago & MUSD Credit Layer (`DeployIslandEcosystem.s.sol`)

| Contract | Purpose | Explorer Link |
| :--- | :--- | :--- |
| **`MainMUSDVault`** | ERC-4626 MUSD LP treasury with virtual-share defense & O(1) interest | [`0xFb92f088843985a6329681883869b2F0D0212340`](https://explorer.test.mezo.org/address/0xFb92f088843985a6329681883869b2F0D0212340?tab=contract) |
| **`MezoTestnetSwapPool`** | `PriceFeed`-calibrated `BTC <-> MUSD` liquidity pool (`10 bps` fee) | [`0xC51f73FeB35b1b338108dD571a6983BeAd08c0F7`](https://explorer.test.mezo.org/address/0xC51f73FeB35b1b338108dD571a6983BeAd08c0F7?tab=contract) |
| **`IslandVault` (Impl)** | EIP-1167 Sub-Island vault impl (anti-spoof NAV & `ProfitCheckpoint`s) | [`0x2744315d000665E271FBFB41bB2204607807E45D`](https://explorer.test.mezo.org/address/0x2744315d000665E271FBFB41bB2204607807E45D?tab=contract) |
| **`IslandFactory`** | Deterministic `CREATE2` clone factory for permissionless Sub-Islands | [`0x27e3d7116bb84f0C978377a3015441F7608aB003`](https://explorer.test.mezo.org/address/0x27e3d7116bb84f0C978377a3015441F7608aB003?tab=contract) |
| **`IslandCreditCouncil`** | On-chain underwriting router (`min(5x profit, 80% netEquity)`) & loan ledger | [`0xeECf05f26534E66C9C4E950BB7504Bb83a7FcA9c`](https://explorer.test.mezo.org/address/0xeECf05f26534E66C9C4E950BB7504Bb83a7FcA9c?tab=contract) |

### Main Island `MEZO` Staking, Governance & Revenue Splitter (`DeployMainMezoVault.s.sol` & `DeployGovernanceAndRevenue.s.sol`)

| Contract | Purpose | Explorer Link |
| :--- | :--- | :--- |
| **`MainMEZOVault`** | Lock-weighted `MEZO` staking (`1.0x / 1.5x / 2.5x`) & `O(1)` `MUSD` fee-share vault | [`0xA4A17D8da6E472fA2bEaa5E223cf4b8c0190A346`](https://explorer.test.mezo.org/address/0xA4A17D8da6E472fA2bEaa5E223cf4b8c0190A346?tab=contract) |
| **`MezoCityFeeSplitter`** | 5-stream `MUSD` revenue router (`50%` Stakers / `30%` Treasury / `20%` Bad-Debt Insurance) | [`0x9618ba2644df0C8B755E74EcB9915A7348Ef58F6`](https://explorer.test.mezo.org/address/0x9618ba2644df0C8B755E74EcB9915A7348Ef58F6?tab=contract) |
| **`MezoCityGovernor`** | Timelocked `MEZO` governance, executable proposals & Sub-Island citizen endorsements | [`0x835E348BfCaB59153975e3dB606DEf0131d8E99f`](https://explorer.test.mezo.org/address/0x835E348BfCaB59153975e3dB606DEf0131d8E99f?tab=contract) |

---

## 🏦 Canonical Mezo Primitives Composed (`Chain ID: 31611`)

### Tokens & Governance / Coordination Locks

| Asset / Contract | Role in MezoCity | Explorer Link |
| :--- | :--- | :--- |
| **`MUSD`** | Native stablecoin borrowed via Troves, LP treasury & Sub-Island credit | [`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`](https://explorer.test.mezo.org/address/0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503) |
| **`MEZO`** | Non-custodial coordination power unlocking `-50` to `-200 bps` APR tiers | [`0x7B7c000000000000000000000000000000000001`](https://explorer.test.mezo.org/address/0x7B7c000000000000000000000000000000000001) |
| **`veBTC`** | Locked BTC ERC-721 power boosting coordination tiers & gauge staking | [`0xB63fcCd03521Cf21907627bd7fA465C129479231`](https://explorer.test.mezo.org/address/0xB63fcCd03521Cf21907627bd7fA465C129479231) |
| **`veMEZO`** | Locked MEZO ERC-721 positions boosting Credit Council & Leaderboard rank | [`0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b`](https://explorer.test.mezo.org/address/0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b) |
| **`stMEZO` / `mUSDC` / `mcbBTC`** | Canonical Mezo Testnet assets for Earn routing & Tigris Pool liquidity | [`stMEZO`](https://explorer.test.mezo.org/address/0xf55017bF43f22cAbcf85AF3619317b7DA5Bcc148) · [`mUSDC`](https://explorer.test.mezo.org/address/0xe1a26db653708A2AD8F824E92Db9852410e33A59) · [`mcbBTC`](https://explorer.test.mezo.org/address/0x2278CAAE0009E8a325a346feA573eF23C5756DbF) |

### Trove Lending & `110% MCR` Guard Infrastructure

| Contract | Role in MezoCity | Explorer Link |
| :--- | :--- | :--- |
| **`BorrowerOperations`** | Direct Trove open, add collateral, withdraw MUSD, repay, and close | [`0xCdF7028ceAB81fA0C6971208e83fa7872994beE5`](https://explorer.test.mezo.org/address/0xCdF7028ceAB81fA0C6971208e83fa7872994beE5) |
| **`BorrowerOperationsSignatures`** | EIP-712 delegated Trove signature execution interface | [`0xD757e3646AF370b15f32EB557F0F8380Df7D639e`](https://explorer.test.mezo.org/address/0xD757e3646AF370b15f32EB557F0F8380Df7D639e) |
| **`TroveManager`** | Reads `getEntireDebtAndColl`, `getCurrentICR`, `MCR` (`110%`), & `getTCR` | [`0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0`](https://explorer.test.mezo.org/address/0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0) |
| **`PriceFeed`** | Live BTC/USD oracle powering Trove HF, crash sims, & swap pricing | [`0x86bCF0841622a5dAC14A313a15f96A95421b9366`](https://explorer.test.mezo.org/address/0x86bCF0841622a5dAC14A313a15f96A95421b9366) |
| **`HintHelpers`** & **`SortedTroves`** | O(1) NICR hint computation and sorted insert positioning | [`HintHelpers`](https://explorer.test.mezo.org/address/0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6) · [`SortedTroves`](https://explorer.test.mezo.org/address/0x722E4D24FD6Ff8b0AC679450F3D91294607268fA) |

### Canonical Mezo Earn Vaults & Tigris Pools

| Venue | Purpose | Explorer Link |
| :--- | :--- | :--- |
| **`sMUSD` Vault** | MUSD savings yield destination in the Earn Router | [`0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16`](https://explorer.test.mezo.org/address/0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16) |
| **`StabilityPool`** | Native MUSD stability & liquidation yield destination | [`0x1CCA7E410eE41739792eA0A24e00349Dd247680e`](https://explorer.test.mezo.org/address/0x1CCA7E410eE41739792eA0A24e00349Dd247680e) |
| **`upMUSD` Vault** & **`upBTC` Vault** | Canonical ERC-4626 upside yield vaults | [`upMUSD`](https://explorer.test.mezo.org/address/0x44c8665fe06425Ca801f38DE39e71f61185E90AE) · [`upBTC`](https://explorer.test.mezo.org/address/0x36C3Fa448A798c602ab8a67721534685fe543146) |
| **`Tigris Router` & `PoolFactory`** | Canonical AMM swap router & pool factory | [`Router`](https://explorer.test.mezo.org/address/0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9) · [`Factory`](https://explorer.test.mezo.org/address/0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A) |
| **Tigris Pools (`MUSD/MEZO`, `MUSD/BTC`, `MUSD/mUSDC`)** | Yield & liquidity pools surfaced by Earn Router | [`MUSD/MEZO`](https://explorer.test.mezo.org/address/0x8eb88d745B0aFFF9D71AbC40d7F550Cded7bB342) · [`MUSD/BTC`](https://explorer.test.mezo.org/address/0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9) · [`MUSD/mUSDC`](https://explorer.test.mezo.org/address/0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e) |

---

## 🤖 Agent Interoperability & App API Endpoints

| Standard / Module | Path *(append to `https://mezocity.vercel.app` or `http://localhost:3000`)* | Description |
| :--- | :--- | :--- |
| **A2A Agent Card** | [`/.well-known/agent-card.json`](https://mezocity.vercel.app/.well-known/agent-card.json) · [`/api/agent-card`](https://mezocity.vercel.app/api/agent-card) | ERC-8004 & Google A2A discovery manifest |
| **MCP JSON-RPC 2.0 Server** | [`/mcp`](https://mezocity.vercel.app/mcp) · [`/api/mcp`](https://mezocity.vercel.app/api/mcp) | Tools: `get_island_state`, `get_ecosystem_telemetry`, `get_mezo_earn_opportunities`, `get_sub_island_leaderboard`, `check_policy_vault`, `get_erc8004_agents` |
| **Core Protocol APIs** | `/api/ai-agents` · `/api/earn-router` · `/api/stability-pool` · `/api/capital-loop` · `/api/lending-guard` · `/api/main-musd-vault` · `/api/main-mezo-vault` · `/api/governance` · `/api/credit-council` · `/api/leaderboard` · `/api/debate-keeper` · `/api/islands` · `/api/onchain-state` · `/api/inngest` | Live on-chain telemetry, autonomous execution, crash simulations, BYOK Sub-Islands, MEZO governance, and Inngest cron triggers |

---

## 🧪 Verification & Repository Key Files

* **Smart Contract Tests (`16` tests across `4` suites):** [MezoAlpha.t.sol](./contracts/test/MezoAlpha.t.sol), [IslandEcosystem.t.sol](./contracts/test/IslandEcosystem.t.sol), [MainMEZOVault.t.sol](./contracts/test/MainMEZOVault.t.sol) & [GovernanceAndRevenue.t.sol](./contracts/test/GovernanceAndRevenue.t.sol) — run `cd contracts && forge test -vv`
* **Deployment Scripts:** [DeployMezoTestnet.s.sol](./contracts/script/DeployMezoTestnet.s.sol), [DeployIslandEcosystem.s.sol](./contracts/script/DeployIslandEcosystem.s.sol), [DeployMainMezoVault.s.sol](./contracts/script/DeployMainMezoVault.s.sol) & [DeployGovernanceAndRevenue.s.sol](./contracts/script/DeployGovernanceAndRevenue.s.sol)
* **In-App Live Judge Health Check:** Open the **`Docs`** tab in the UI and click **Run Live Protocol Health Check**
* **Environment Template & DB Schema:** [.env.example](./.env.example) · [schema.sql](./schema.sql)
