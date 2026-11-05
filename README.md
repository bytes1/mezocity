# MezoCity // 4LPHA.TECH × Polly.town on Mezo Testnet (Chain ID: 31611)

An autonomous AI agent ecosystem and policy-locked execution platform built for **Mezo Testnet** (`Chain ID: 31611`, Native Gas Token: `BTC` with 18 decimals), combining:
1. **[4lpha.tech](https://4lpha.tech/) & [docs.4lpha.tech/#start](https://docs.4lpha.tech/#start) Core Infrastructure**:
   - **On-Chain Policy Vaults (`PolicyVault.sol`)**: Enforces the *"Verify, Then Trust"* paradigm with mathematical guardrails (`maxSingleTradeBps`, `maxDailyDrawdownBps`, `minConfidenceBps`, `cooldownSeconds`, and `emergencyLock`).
   - **ERC-8004 Autonomous Agent Registry (`AgentRegistry.sol`)**: Anchors on-chain agent identities, strategy specification hashes, reputation scores, Council debate transcripts, and machine-readable service endpoints.
   - **A2A & Model Context Protocol Endpoints**: Exposes `/.well-known/agent-card.json` and a JSON-RPC 2.0 MCP server at `/api/mcp` (`/mcp`).
2. **[Polly.town](https://polly.town/) Interactive Clay Island Interface**:
   - **Interactive 3D Clay Island Diorama** (`React Three Fiber` + `Three.js` + `shadcn/ui`) where 7 specialized autonomous agents (**Pip**, **Hoot**, **Brutus**, **Bramble**, **Polly**, **Sentinel**, and **SatoshiQuant**) move between 6 island stations, debate bull vs. bear theses, fact-check Mezo RPC data, and execute policy-fenced trades.

---

## 1. Mezo Testnet Network Configuration

| Parameter | Value |
| :--- | :--- |
| **Network Name** | Mezo Testnet |
| **Chain ID** | `31611` (`0x7b7b`) |
| **Native Currency** | `BTC` (18 decimals) |
| **HTTPS RPC** | `https://rpc.test.mezo.org` |
| **WSS RPC** | `wss://rpc-ws.test.mezo.org` |
| **Block Explorer** | `https://explorer.test.mezo.org` |

---

## 2. Foundry Smart Contracts (WSL)

The Solidity smart contracts live in [`./contracts`](./contracts):
- [`contracts/src/interfaces/IERC8004AgentRegistry.sol`](./contracts/src/interfaces/IERC8004AgentRegistry.sol)
- [`contracts/src/AgentRegistry.sol`](./contracts/src/AgentRegistry.sol)
- [`contracts/src/PolicyVault.sol`](./contracts/src/PolicyVault.sol)
- [`contracts/src/MezoPredictionArena.sol`](./contracts/src/MezoPredictionArena.sol)
- [`contracts/test/MezoAlpha.t.sol`](./contracts/test/MezoAlpha.t.sol)
- [`contracts/script/DeployMezoTestnet.s.sol`](./contracts/script/DeployMezoTestnet.s.sol)

### Compile & Run Tests in WSL
```bash
wsl -- bash -lc "cd /mnt/e/frontend/mezocity/contracts && forge test -vv"
```

### Deploy to Mezo Testnet (`31611`)
```bash
wsl -- bash -lc "cd /mnt/e/frontend/mezocity/contracts && forge script script/DeployMezoTestnet.s.sol:DeployMezoTestnet --rpc-url https://rpc.test.mezo.org --private-key <YOUR_PRIVATE_KEY> --broadcast"
```

---

## 3. Running the Next.js + shadcn/ui Frontend

```bash
pnpm dev
```

Open `http://localhost:3000` in your browser.

