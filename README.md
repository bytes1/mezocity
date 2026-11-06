# Mezo Town // 4LPHA Autonomous DCA & Self-Healing AI Agent Island (Mezo Testnet 31611)

Built for **Mezo Blockchain Testnet (`Chain ID: 31611`, Native BTC 18 decimals)**, combining **[4lpha.tech](https://4lpha.tech/) Policy-Locked Vaults & ERC-8004 Registry** with the **[Polly.town](https://polly.town/) 3D Clay Island Diorama UI** and **Live Free AI Models**.

---

## 1. The 4 Purpose-Built Autonomous AI Agents (Zero Dummy Agents)

Every agent on the island has a dedicated role, a 3D landmark station, an on-chain ERC-8004 identity, and a live connection to a **Free AI Model** via [`/api/ai-agents`](./src/app/api/ai-agents/route.ts):

1. **Aura (Head Orchestrator Agent)** — *Connected Free AI: `Llama-3.3-70B`*
   - Station: **Central 4-Tower Astrolabe Citadel & Lighthouse**
   - Role: Monitors Mezo Testnet (`31611`) block state, gas fees, and orchestrates the autonomous execution pipeline.
2. **Kronos (Autonomous BTC DCA Agent)** — *Connected Free AI: `DeepSeek-R1`*
   - Station: **Golden Piggy-Bank DCA Vault**
   - Role: Computes time-weighted BTC Dollar-Cost Averaging (TWAP DCA) slices via [`MezoDCAEngine.sol`](./contracts/src/MezoDCAEngine.sol).
3. **Patch (Self-Healing Error Rectifier Agent)** — *Connected Free AI: `Qwen-2.5-Coder`*
   - Station: **Error Rectifier Lab & Diagnostic Crane**
   - Role: Intercepts failed or reverted transactions (such as `MAX_TRADE_EXCEEDED` PolicyVault cap overflows, slippage spikes, or nonce drift), diagnoses the root cause with its coding LLM, **automatically resizes/rectifies the transaction payload**, and re-submits it on-chain.
4. **Sentinel (4lpha Policy Vault Auditor)** — *Connected Free AI: `Mistral-Small-3`*
   - Station: **Sentinel Policy Vault Fortress**
   - Role: Enforces hard mathematical guardrails in [`PolicyVault.sol`](./contracts/src/PolicyVault.sol) (`maxSingleTradeBps`, `maxDailyDrawdownBps`, `minConfidenceBps`, `emergencyLock`) and anchors SHA-256 reasoning proof hashes to Mezo Testnet.

---

## 2. How Free AI Models Work Out-of-the-Box

- **Zero API Key Required by Default**: [`/api/ai-agents`](./src/app/api/ai-agents/route.ts) connects to **Pollinations.ai's Free OpenAI-compatible LLM Router** (`openai`, `deepseek`, `qwen-coder`, `mistral`) out of the box—so hackathon judges can clone and click **"Run Live AI DCA"** or **"Simulate Error & Fix"** immediately with zero setup!
- **Optional Free Keys Supported**: In the **Crew (4 AI)** tab, you can also switch to **Groq Cloud Free Tier** (`llama-3.3-70b-versatile`) or **OpenRouter Free Models (`:free`)**.

---

## 3. Foundry Smart Contracts (`./contracts` in WSL)

- [`contracts/src/interfaces/IERC8004AgentRegistry.sol`](./contracts/src/interfaces/IERC8004AgentRegistry.sol) — ERC-8004 On-Chain Agent Identity Interface
- [`contracts/src/AgentRegistry.sol`](./contracts/src/AgentRegistry.sol) — Registers Aura, Kronos, Patch & Sentinel
- [`contracts/src/PolicyVault.sol`](./contracts/src/PolicyVault.sol) — *"Verify, Then Trust"* BTC Vault enforcing mathematical guardrails
- [`contracts/src/MezoDCAEngine.sol`](./contracts/src/MezoDCAEngine.sol) — Autonomous BTC DCA Scheduler & On-Chain Error Rectification Engine (`rectifyAndExecuteDCASlice`)
- [`contracts/test/MezoAlpha.t.sol`](./contracts/test/MezoAlpha.t.sol) — Foundry unit test suite testing DCA execution & Patch's self-healing error rectification
- [`contracts/script/DeployMezoTestnet.s.sol`](./contracts/script/DeployMezoTestnet.s.sol) — Mezo Testnet (`31611`) deployment script

### Run Foundry Tests in WSL
```bash
wsl -- bash -lc "cd /mnt/e/frontend/mezocity/contracts && forge test -vv"
```

### Deploy to Mezo Testnet (`Chain ID: 31611`)
```bash
wsl -- bash -lc "cd /mnt/e/frontend/mezocity/contracts && forge script script/DeployMezoTestnet.s.sol:DeployMezoTestnet --rpc-url https://rpc.test.mezo.org --private-key <YOUR_PRIVATE_KEY> --broadcast"
```

---

## 4. Run the Next.js Frontend

```powershell
pnpm.cmd dev
```
Open **http://localhost:3000**.
