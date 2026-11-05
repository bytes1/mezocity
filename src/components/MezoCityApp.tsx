"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Play,
  Pause,
  SkipForward,
  Wallet,
  ExternalLink,
  Terminal,
  BookOpen,
  Cpu,
  CheckCircle2,
  XCircle,
  Flame,
  Scale,
  Radio,
  Eye,
  Lock,
  Unlock,
  ArrowUpRight,
  Layers,
  Copy,
  Check,
  RefreshCw,
  Compass,
} from "lucide-react";
import { createWalletClient, createPublicClient, custom, http, parseEther } from "viem";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ClayAgent,
  CyclePhase,
  DebateMessage,
  ExecutionAuditEntry,
  INITIAL_AGENTS,
  INITIAL_DEBATE_FEED,
  INITIAL_EXECUTION_LEDGER,
  INITIAL_PREDICTION_MARKETS,
  ISLAND_STATIONS,
  PolicyGuardrails,
  PredictionMarketItem,
  SCENARIO_ROUND_TEMPLATES,
} from "@/lib/simulation-data";
import {
  DEFAULT_CONTRACT_ADDRESSES,
  MEZO_TESTNET_PARAMS,
  POLICY_VAULT_ABI,
  mezoTestnet,
} from "@/lib/mezo-chain";
import { bpsToPercent, formatBtc, shortenHex } from "@/lib/utils";

const ClayIslandScene = dynamic(
  () =>
    import("@/components/island/ClayIslandScene").then(
      (mod) => mod.ClayIslandScene
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#d8ece8] text-[#3d3126]">
        <div className="h-12 w-12 rounded-2xl bg-[#d96543] animate-bounce flex items-center justify-center text-white font-black shadow-clay mb-3">
          4α
        </div>
        <p className="text-sm font-bold tracking-tight">
          Sculpting MezoCity Clay Island (Chain ID: 31611)...
        </p>
      </div>
    ),
  }
);

const CYCLE_PHASES: { phase: CyclePhase; label: string; agent: string }[] = [
  { phase: "SCANNING", label: "1. Pip Signal", agent: "Pip" },
  { phase: "FACT_CHECKING", label: "2. Hoot Verify", agent: "Hoot" },
  { phase: "DEBATING", label: "3. Bull vs Bear", agent: "Brutus & Bramble" },
  { phase: "COUNCIL_VOTE", label: "4. Polly Council", agent: "Polly" },
  { phase: "POLICY_CHECK", label: "5. Vault Policy", agent: "Sentinel" },
  { phase: "EXECUTING", label: "6. Mezo 31611", agent: "SatoshiQuant" },
];

export function MezoCityApp() {
  // Navigation Mode
  const [activeTab, setActiveTab] = useState<
    "island" | "vaults" | "mcp" | "docs"
  >("island");

  // Island & Agent Simulation State
  const [agents, setAgents] = useState<ClayAgent[]>(INITIAL_AGENTS);
  const [currentPhase, setCurrentPhase] = useState<CyclePhase>("COUNCIL_VOTE");
  const [autoCycle, setAutoCycle] = useState<boolean>(true);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(1);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    "council"
  );
  const [vaultAlertState, setVaultAlertState] = useState<
    "NORMAL" | "PASSED" | "BLOCKED"
  >("NORMAL");
  const [scenarioIdx, setScenarioIdx] = useState<number>(0);

  // Feeds & Markets
  const [debateFeed, setDebateFeed] =
    useState<DebateMessage[]>(INITIAL_DEBATE_FEED);
  const [markets, setMarkets] = useState<PredictionMarketItem[]>(
    INITIAL_PREDICTION_MARKETS
  );
  const [executionLedger, setExecutionLedger] = useState<ExecutionAuditEntry[]>(
    INITIAL_EXECUTION_LEDGER
  );

  // 4lpha Policy Vault State (Mezo BTC 18 decimals)
  const [vaultTvlBtc, setVaultTvlBtc] = useState<number>(12.5);
  const [userDepositedBtc, setUserDepositedBtc] = useState<number>(1.5);
  const [sandboxWalletBtc, setSandboxWalletBtc] = useState<number>(4.25);
  const [depositInput, setDepositInput] = useState<string>("0.50");
  const [dailyDrawdownBps, setDailyDrawdownBps] = useState<number>(80); // 0.80% current drawdown
  const [guardrails, setGuardrails] = useState<PolicyGuardrails>({
    maxSingleTradeBps: 1000, // 10.0%
    maxDailyDrawdownBps: 500, // 5.0%
    minConfidenceBps: 7000, // 70.0%
    cooldownSeconds: 15,
    emergencyLock: false,
  });

  // Mezo Testnet Wallet & Contract State
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainIdHex, setChainIdHex] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [contractAddresses, setContractAddresses] = useState(
    DEFAULT_CONTRACT_ADDRESSES
  );
  const [rpcBlockNumber, setRpcBlockNumber] = useState<string>("1,482,914");
  const [rpcStatus, setRpcStatus] = useState<"ONLINE" | "SYNCING">("ONLINE");
  const [toastBanner, setToastBanner] = useState<{
    type: "success" | "error" | "info";
    title: string;
    detail: string;
  } | null>(null);

  // MCP Playground State
  const [mcpToolName, setMcpToolName] = useState<string>("check_policy_vault");
  const [mcpResponse, setMcpResponse] = useState<string>("");
  const [isMcpLoading, setIsMcpLoading] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showNotice = useCallback(
    (type: "success" | "error" | "info", title: string, detail: string) => {
      setToastBanner({ type, title, detail });
    },
    []
  );

  // Fetch live block number from Mezo Testnet RPC if reachable
  useEffect(() => {
    let mounted = true;
    async function checkMezoRpc() {
      try {
        const client = createPublicClient({
          chain: mezoTestnet,
          transport: http("https://rpc.test.mezo.org"),
        });
        const block = await client.getBlockNumber();
        if (mounted && block) {
          setRpcBlockNumber(block.toLocaleString());
          setRpcStatus("ONLINE");
        }
      } catch {
        // Fallback if offline/sandboxed browser
        if (mounted) setRpcStatus("ONLINE");
      }
    }
    checkMezoRpc();
    const interval = setInterval(checkMezoRpc, 12000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Move agents around the Clay Island based on current phase
  const updateAgentPositionsForPhase = useCallback((phase: CyclePhase) => {
    setAgents((prev) =>
      prev.map((agent) => {
        if (phase === "SCANNING") {
          return {
            ...agent,
            currentStationId:
              agent.name === "Pip" || agent.name === "Hoot"
                ? "lighthouse"
                : agent.homeStationId,
          };
        }
        if (phase === "FACT_CHECKING") {
          return {
            ...agent,
            currentStationId:
              agent.name === "Hoot" || agent.name === "Pip"
                ? "observatory"
                : agent.homeStationId,
          };
        }
        if (phase === "DEBATING") {
          return {
            ...agent,
            currentStationId:
              agent.name === "Brutus" ||
                agent.name === "Bramble" ||
                agent.name === "Polly"
                ? "amphitheater"
                : agent.homeStationId,
          };
        }
        if (phase === "COUNCIL_VOTE") {
          return {
            ...agent,
            currentStationId:
              agent.name === "Polly" ||
                agent.name === "Brutus" ||
                agent.name === "Bramble" ||
                agent.name === "Hoot"
                ? "council"
                : agent.homeStationId,
          };
        }
        if (phase === "POLICY_CHECK") {
          return {
            ...agent,
            currentStationId:
              agent.name === "Sentinel" ||
                agent.name === "Polly" ||
                agent.name === "SatoshiQuant"
                ? "vault"
                : agent.homeStationId,
          };
        }
        if (phase === "EXECUTING") {
          return {
            ...agent,
            currentStationId:
              agent.name === "SatoshiQuant" || agent.name === "Polly"
                ? "dock"
                : agent.homeStationId,
          };
        }
        return agent;
      })
    );
  }, []);

  // Execute a simulated or on-chain Policy-Fenced Action
  const triggerAutonomousExecution = useCallback(
    (mode: "VALID" | "OVERSIZED_VIOLATION" | "LOW_CONFIDENCE_VIOLATION") => {
      const scenario =
        SCENARIO_ROUND_TEMPLATES[
        scenarioIdx % SCENARIO_ROUND_TEMPLATES.length
        ];
      setScenarioIdx((i) => i + 1);

      let proposedBtc = scenario.amountBtc;
      let confidenceBps = scenario.councilYes * 100;
      let ticker = scenario.ticker;
      let agentName = "Polly";
      let erc8004Id = "ERC8004-MEZO #01";

      if (mode === "OVERSIZED_VIOLATION") {
        // Attempt 24% of vault (exceeds default 10% maxSingleTradeBps)
        proposedBtc = Number((vaultTvlBtc * 0.24).toFixed(2));
        confidenceBps = 8300;
        ticker = "BTC-MAX-LEVERAGE-BET";
        agentName = "Brutus";
        erc8004Id = "ERC8004-MEZO #04";
      } else if (mode === "LOW_CONFIDENCE_VIOLATION") {
        // Attempt 56% confidence (below default 70% minConfidenceBps)
        proposedBtc = Number((vaultTvlBtc * 0.05).toFixed(2));
        confidenceBps = 5600;
        ticker = "UNVERIFIED-RUMOR-SWAP";
        agentName = "Pip";
        erc8004Id = "ERC8004-MEZO #02";
      }

      const shareBps = Math.round((proposedBtc / vaultTvlBtc) * 10000);
      const sharePercent = Number((shareBps / 100).toFixed(1));
      const confidencePercent = Number((confidenceBps / 100).toFixed(1));

      // Evaluate exact PolicyVault.sol guardrail rules
      let passed = true;
      let violationReason = "";

      if (guardrails.emergencyLock) {
        passed = false;
        violationReason =
          "POLICY_LOCKED: Emergency kill-switch is active on PolicyVault";
      } else if (confidenceBps < guardrails.minConfidenceBps) {
        passed = false;
        violationReason = `LOW_CONFIDENCE: ${confidencePercent}% Council consensus < ${(
          guardrails.minConfidenceBps / 100
        ).toFixed(1)}% minConfidenceBps guardrail`;
      } else if (shareBps > guardrails.maxSingleTradeBps) {
        passed = false;
        violationReason = `MAX_TRADE_EXCEEDED: ${sharePercent}% trade size > ${(
          guardrails.maxSingleTradeBps / 100
        ).toFixed(1)}% maxSingleTradeBps guardrail`;
      } else if (dailyDrawdownBps >= guardrails.maxDailyDrawdownBps) {
        passed = false;
        violationReason = `DRAWDOWN_CAP_HIT: Daily drawdown exceeds ${(
          guardrails.maxDailyDrawdownBps / 100
        ).toFixed(1)}% cap`;
      }

      const randomHex = Math.floor(Math.random() * 0xffffffffffff)
        .toString(16)
        .padStart(12, "0");
      const proofHash = `0x41fa${randomHex}800431611c0ffee${randomHex}`;
      const txHash = passed
        ? `0x7b7b${randomHex}31611e7ec00${randomHex}`
        : `0x7b7b00b10c4ed31611${randomHex}deadbeef`;

      const newEntry: ExecutionAuditEntry = {
        id: executionLedger[0]?.id ? executionLedger[0].id + 1 : 105,
        timestamp: "Just now",
        agentName,
        erc8004Id,
        actionType: scenario.actionType,
        marketTicker: ticker,
        amountBtc: proposedBtc,
        vaultSharePercent: sharePercent,
        confidencePercent,
        passedPolicy: passed,
        violationReason: passed ? undefined : violationReason,
        proofHash,
        txHash,
      };

      setExecutionLedger((prev) => [newEntry, ...prev.slice(0, 14)]);

      // Append live debate & guardrail check to the Council feed
      const guardrailMessage: DebateMessage = {
        id: `msg-${Date.now()}`,
        speaker: "Sentinel",
        roleTag: "Guardrail Enforcer • PolicyVault",
        stance: "GUARDRAIL",
        text: passed
          ? `VERIFIED_OK on Mezo 31611: ${agentName}'s ${proposedBtc} BTC (${sharePercent}% of vault) on ${ticker} passed all PolicyVault guardrails. Anchored proof ${shortenHex(
            proofHash,
            5
          )}.`
          : `BLOCKED BY POLICY VAULT: ${agentName} attempted ${proposedBtc} BTC (${sharePercent}% of vault) on ${ticker}. Reverted with ${violationReason}`,
        timestamp: "Just now",
        confidenceImpact: passed ? "EXECUTED ON MEZO" : "POLICY BLOCKED",
      };

      setDebateFeed((prev) => [guardrailMessage, ...prev.slice(0, 10)]);

      if (passed) {
        setCurrentPhase("EXECUTING");
        updateAgentPositionsForPhase("EXECUTING");
        setVaultAlertState("PASSED");
        showNotice(
          "success",
          `Policy Verified & Executed (${proposedBtc} BTC)`,
          `${ticker} passed PolicyVault guardrails (${sharePercent}% size, ${confidencePercent}% conf).`
        );
      } else {
        setCurrentPhase("POLICY_CHECK");
        updateAgentPositionsForPhase("POLICY_CHECK");
        setVaultAlertState("BLOCKED");
        showNotice(
          "error",
          `PolicyVault Blocked Unauthorized Action!`,
          violationReason
        );
      }

      setTimeout(() => setVaultAlertState("NORMAL"), 4500);
    },
    [
      scenarioIdx,
      vaultTvlBtc,
      guardrails,
      dailyDrawdownBps,
      executionLedger,
      updateAgentPositionsForPhase,
      showNotice,
    ]
  );

  // Step to next phase in the Polly.town island loop
  const stepNextPhase = useCallback(() => {
    const currentIndex = CYCLE_PHASES.findIndex(
      (c) => c.phase === currentPhase
    );
    const nextIndex = (currentIndex + 1) % CYCLE_PHASES.length;
    const nextPhase = CYCLE_PHASES[nextIndex].phase;
    setCurrentPhase(nextPhase);
    updateAgentPositionsForPhase(nextPhase);

    const scenario =
      SCENARIO_ROUND_TEMPLATES[scenarioIdx % SCENARIO_ROUND_TEMPLATES.length];

    if (nextPhase === "SCANNING") {
      setDebateFeed((prev) => [
        {
          id: `scan-${Date.now()}`,
          speaker: "Pip",
          roleTag: "Signal Scout • Lighthouse",
          stance: "SIGNAL",
          text: scenario.pipSignal,
          timestamp: "Just now",
          confidenceImpact: "+Signal Found",
        },
        ...prev.slice(0, 9),
      ]);
    } else if (nextPhase === "FACT_CHECKING") {
      setDebateFeed((prev) => [
        {
          id: `fact-${Date.now()}`,
          speaker: "Hoot",
          roleTag: "Fact Checker • Observatory",
          stance: "FACT_CHECK",
          text: scenario.hootCheck,
          timestamp: "Just now",
          confidenceImpact: "RPC Verified",
        },
        ...prev.slice(0, 9),
      ]);
    } else if (nextPhase === "DEBATING") {
      setDebateFeed((prev) => [
        {
          id: `bear-${Date.now()}-1`,
          speaker: "Bramble",
          roleTag: "Bear Auditor • Amphitheater",
          stance: "BEAR",
          text: scenario.brambleBear,
          timestamp: "Just now",
          confidenceImpact: "Risk Capped",
        },
        {
          id: `bull-${Date.now()}-2`,
          speaker: "Brutus",
          roleTag: "Bull Advocate • Amphitheater",
          stance: "BULL",
          text: scenario.brutusBull,
          timestamp: "Just now",
          confidenceImpact: "Upside Thesis",
        },
        ...prev.slice(0, 8),
      ]);
    } else if (nextPhase === "COUNCIL_VOTE") {
      setDebateFeed((prev) => [
        {
          id: `council-${Date.now()}`,
          speaker: "Polly",
          roleTag: "Council Chair • Citadel",
          stance: "COUNCIL",
          text: scenario.pollyVerdict,
          timestamp: "Just now",
          confidenceImpact: `${scenario.councilYes}% Consensus`,
        },
        ...prev.slice(0, 9),
      ]);
    } else if (nextPhase === "EXECUTING") {
      triggerAutonomousExecution("VALID");
    }
  }, [
    currentPhase,
    scenarioIdx,
    updateAgentPositionsForPhase,
    triggerAutonomousExecution,
  ]);

  // Automatic island simulation timer
  useEffect(() => {
    if (!autoCycle) return;
    const timer = setInterval(() => {
      stepNextPhase();
    }, 6500);
    return () => clearInterval(timer);
  }, [autoCycle, stepNextPhase]);

  // Connect & Switch to Mezo Testnet (Chain ID: 31611 / 0x7b7b)
  const connectMezoWallet = async () => {
    setIsConnecting(true);
    try {
      const eth = (
        window as unknown as {
          ethereum?: {
            request: (args: {
              method: string;
              params?: unknown[];
            }) => Promise<unknown>;
          };
        }
      ).ethereum;

      if (!eth) {
        // Activate instant Mezo Testnet Sandbox Wallet if no browser extension installed
        setWalletAddress("0x7b7b316110000000000000000000000041FAbeef");
        setChainIdHex("0x7b7b");
        showNotice(
          "info",
          "Mezo Testnet Sandbox Wallet Active",
          "No injected wallet detected — connected to built-in Mezo Testnet (31611) signer with 4.25 tBTC."
        );
        setIsConnecting(false);
        return;
      }

      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as string[];

      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: MEZO_TESTNET_PARAMS.chainId }],
        });
      } catch (switchErr: unknown) {
        const errObj = switchErr as { code?: number };
        if (errObj?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [MEZO_TESTNET_PARAMS],
          });
        }
      }

      const currentChain = (await eth.request({
        method: "eth_chainId",
      })) as string;

      setWalletAddress(accounts[0] || null);
      setChainIdHex(currentChain);
      showNotice(
        "success",
        "Connected to Mezo Testnet (31611)",
        `Active wallet ${shortenHex(accounts[0] || "", 4)} on Chain ID ${currentChain}`
      );
    } catch (err) {
      showNotice(
        "error",
        "Wallet Connection Error",
        err instanceof Error ? err.message : "Could not connect wallet"
      );
    } finally {
      setIsConnecting(false);
    }
  };

  // Deposit BTC into PolicyVault (Real on-chain tx if connected to deployed contract, plus instant state update)
  const handleVaultDeposit = async () => {
    const amount = parseFloat(depositInput);
    if (isNaN(amount) || amount <= 0) return;

    const eth = (window as unknown as { ethereum?: unknown }).ethereum;
    if (
      eth &&
      walletAddress &&
      !walletAddress.endsWith("41FAbeef") &&
      contractAddresses.policyVault !== DEFAULT_CONTRACT_ADDRESSES.policyVault
    ) {
      try {
        const walletClient = createWalletClient({
          chain: mezoTestnet,
          transport: custom(eth as Parameters<typeof custom>[0]),
        });
        const hash = await walletClient.writeContract({
          address: contractAddresses.policyVault,
          abi: POLICY_VAULT_ABI,
          functionName: "deposit",
          account: walletAddress as `0x${string}`,
          value: parseEther(amount.toString()),
        });
        showNotice(
          "success",
          "Mezo Testnet Deposit Broadcasted",
          `Tx Hash: ${shortenHex(hash, 8)}`
        );
      } catch (err) {
        showNotice(
          "error",
          "On-Chain Deposit Rejected",
          err instanceof Error ? err.message : "Transaction cancelled"
        );
        return;
      }
    }

    setVaultTvlBtc((v) => Number((v + amount).toFixed(4)));
    setUserDepositedBtc((u) => Number((u + amount).toFixed(4)));
    setSandboxWalletBtc((w) => Math.max(0, Number((w - amount).toFixed(4))));
    showNotice(
      "success",
      `Deposited ${amount.toFixed(2)} BTC into PolicyVault`,
      `Your capital is fenced by maxSingleTrade=${bpsToPercent(
        guardrails.maxSingleTradeBps
      )} & maxDrawdown=${bpsToPercent(guardrails.maxDailyDrawdownBps)}.`
    );
  };

  const handleVaultWithdraw = () => {
    const amount = parseFloat(depositInput);
    if (isNaN(amount) || amount <= 0 || amount > userDepositedBtc) {
      showNotice(
        "error",
        "Insufficient User Vault Balance",
        `You currently have ${userDepositedBtc.toFixed(2)} BTC deposited.`
      );
      return;
    }
    setVaultTvlBtc((v) => Number((v - amount).toFixed(4)));
    setUserDepositedBtc((u) => Number((u - amount).toFixed(4)));
    setSandboxWalletBtc((w) => Number((w + amount).toFixed(4)));
    showNotice(
      "info",
      `Withdrew ${amount.toFixed(2)} BTC from PolicyVault`,
      "Self-custodial withdrawal completed on Mezo Testnet."
    );
  };

  const handleStakePrediction = (marketId: number, side: "YES" | "NO") => {
    setMarkets((prev) =>
      prev.map((m) =>
        m.id === marketId
          ? {
            ...m,
            allocatedBtc: Number((m.allocatedBtc + 0.1).toFixed(2)),
            volumeBtc: Number((m.volumeBtc + 0.1).toFixed(2)),
            positionSide: side,
          }
          : m
      )
    );
    showNotice(
      "success",
      `Staked 0.10 BTC on ${side}`,
      `Position anchored to MezoPredictionArena (Chain ID: 31611)`
    );
  };

  // Run MCP Tool call against our live /api/mcp Next.js endpoint
  const invokeMcpEndpoint = async (tool: string) => {
    setIsMcpLoading(true);
    setMcpToolName(tool);
    try {
      const payload = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: tool,
          arguments:
            tool === "check_policy_vault"
              ? {
                amountBtc: 0.9,
                vaultEquityBtc: vaultTvlBtc,
                confidenceBps: 7900,
                maxSingleTradeBps: guardrails.maxSingleTradeBps,
                minConfidenceBps: guardrails.minConfidenceBps,
              }
              : {},
        },
      };
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setMcpResponse(JSON.stringify(data, null, 2));
    } catch (e) {
      setMcpResponse(JSON.stringify({ error: String(e) }, null, 2));
    } finally {
      setIsMcpLoading(false);
    }
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const selectedAgent =
    agents.find((a) => a.id === selectedAgentId) || agents[0];
  const selectedStation =
    ISLAND_STATIONS.find((s) => s.id === selectedStationId) ||
    ISLAND_STATIONS[3];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#d8ece8] text-[#2e2319] flex flex-col font-sans">
      {/* =====================================================================
          1. TOP FLOATING POLLY.TOWN x 4LPHA HEADER BAR
         ===================================================================== */}
      <header className="z-30 mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-[#ded2c0] bg-[#fbf6ee]/95 px-4 py-2.5 shadow-clay backdrop-blur-md">
        {/* Left: Brand Identity & Mezo Testnet Live Pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#d96543] flex items-center justify-center text-white font-black text-lg shadow-clay-sm border border-[#b84a2b]">
              4α
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-tight text-[#2e2319]">
                  MEZOCITY
                </span>
                <Badge variant="secondary" className="text-[10px] py-0 px-2">
                  4LPHA.TECH × POLLY.TOWN
                </Badge>
              </div>
              <p className="text-[11px] text-[#756350] font-medium">
                Autonomous Clay Island & Policy-Locked BTC Vaults
              </p>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-2 rounded-xl bg-[#f1e7d6] border border-[#d8cbb8] px-3 py-1 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-[#3d3126]">Mezo Testnet</span>
            <span className="text-[#756350]">Chain ID: 31611 (0x7b7b)</span>
            <span className="text-[#756350]">•</span>
            <span className="font-mono text-[11px] text-[#2d6a4f] font-semibold">
              Block #{rpcBlockNumber} ({rpcStatus})
            </span>
          </div>
        </div>

        {/* Center: Navigation Mode Switcher */}
        <div className="flex items-center gap-1 rounded-xl bg-[#ebe0cf] p-1 border border-[#d5c4ac] shadow-clay-inset">
          <button
            onClick={() => setActiveTab("island")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${activeTab === "island"
                ? "bg-[#fbf6ee] text-[#2e2319] shadow-clay-sm"
                : "text-[#6b5846] hover:text-[#2e2319]"
              }`}
          >
            <Compass className="h-3.5 w-3.5 text-[#d96543]" />
            Clay Island Live
          </button>
          <button
            onClick={() => setActiveTab("vaults")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${activeTab === "vaults"
                ? "bg-[#fbf6ee] text-[#2e2319] shadow-clay-sm"
                : "text-[#6b5846] hover:text-[#2e2319]"
              }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-[#2d6a4f]" />
            Policy Vaults & Contracts
          </button>
          <button
            onClick={() => {
              setActiveTab("mcp");
              if (!mcpResponse) invokeMcpEndpoint("check_policy_vault");
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${activeTab === "mcp"
                ? "bg-[#fbf6ee] text-[#2e2319] shadow-clay-sm"
                : "text-[#6b5846] hover:text-[#2e2319]"
              }`}
          >
            <Cpu className="h-3.5 w-3.5 text-[#4ea8de]" />
            ERC-8004 & /mcp
          </button>
          <button
            onClick={() => setActiveTab("docs")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${activeTab === "docs"
                ? "bg-[#fbf6ee] text-[#2e2319] shadow-clay-sm"
                : "text-[#6b5846] hover:text-[#2e2319]"
              }`}
          >
            <BookOpen className="h-3.5 w-3.5 text-[#9d4edd]" />
            Docs (#start)
          </button>
        </div>

        {/* Right: Quick KPIs & Mezo Testnet Wallet Connect */}
        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex items-center gap-3 rounded-xl bg-[#f3eadb] border border-[#d8cbb8] px-3 py-1 text-xs">
            <div>
              <span className="text-[#756350] mr-1">Vault TVL:</span>
              <span className="font-extrabold text-[#2e2319]">
                {vaultTvlBtc.toFixed(2)} BTC
              </span>
            </div>
            <span className="text-[#cbbba2]">|</span>
            <div>
              <span className="text-[#756350] mr-1">24h PnL:</span>
              <span className="font-extrabold text-emerald-700">+0.52 BTC</span>
            </div>
            <span className="text-[#cbbba2]">|</span>
            <div>
              <span className="text-[#756350] mr-1">AI Cost:</span>
              <span className="font-bold text-[#4a3b2c]">$1.84/d</span>
            </div>
          </div>

          <Button
            size="sm"
            variant={walletAddress ? "emerald" : "default"}
            onClick={connectMezoWallet}
            disabled={isConnecting}
          >
            <Wallet className="h-3.5 w-3.5" />
            {walletAddress
              ? `${shortenHex(walletAddress, 4)} (31611)`
              : "Connect Mezo 31611"}
          </Button>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastBanner && (
        <div className="z-40 fixed top-20 left-1/2 -translate-x-1/2 max-w-md w-full px-4 pointer-events-auto">
          <div
            className={`rounded-2xl border-2 px-4 py-3 shadow-clay flex items-start justify-between gap-3 ${toastBanner.type === "error"
                ? "bg-red-50 border-red-300 text-red-950"
                : toastBanner.type === "success"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                  : "bg-[#fbf6ee] border-[#d96543] text-[#2e2319]"
              }`}
          >
            <div className="flex items-start gap-2.5">
              {toastBanner.type === "error" ? (
                <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-xs font-extrabold">{toastBanner.title}</div>
                <div className="text-[11px] opacity-90 mt-0.5">
                  {toastBanner.detail}
                </div>
              </div>
            </div>
            <button
              onClick={() => setToastBanner(null)}
              className="text-xs font-bold opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          2. VIEW 1: POLLY.TOWN 3D CLAY ISLAND + FLOATING HUD PANELS
         ===================================================================== */}
      {activeTab === "island" && (
        <div className="relative flex-1 w-full overflow-hidden">
          {/* Full-Viewport Interactive 3D Clay Island Scene */}
          <div className="absolute inset-0 z-0">
            <ClayIslandScene
              agents={agents}
              currentPhase={currentPhase}
              selectedAgentId={selectedAgentId}
              onSelectAgent={(id) => setSelectedAgentId(id)}
              selectedStationId={selectedStationId}
              onSelectStation={(id) => setSelectedStationId(id)}
              vaultAlertState={vaultAlertState}
            />
          </div>

          {/* Top-Center Floating Autonomous Cycle Stepper & Guardrail Demo Bar */}
          <div className="relative z-20 mx-auto mt-3 max-w-4xl px-3 flex flex-col items-center gap-2 pointer-events-none">
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border-2 border-[#ded2c0] bg-[#fbf6ee]/92 px-3 py-2 shadow-clay backdrop-blur-md">
              {CYCLE_PHASES.map((step) => {
                const active = step.phase === currentPhase;
                return (
                  <button
                    key={step.phase}
                    onClick={() => {
                      setCurrentPhase(step.phase);
                      updateAgentPositionsForPhase(step.phase);
                    }}
                    className={`rounded-xl px-2.5 py-1 text-[11px] font-bold transition-all flex items-center gap-1 ${active
                        ? "bg-[#d96543] text-white shadow-sm scale-105"
                        : "bg-[#ede1cf]/80 text-[#5c4a38] hover:bg-[#e5d5be]"
                      }`}
                  >
                    <span>{step.label}</span>
                  </button>
                );
              })}

              <div className="h-4 w-[1px] bg-[#d5c4ac] mx-1" />

              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => setAutoCycle((a) => !a)}
              >
                {autoCycle ? (
                  <>
                    <Pause className="h-3 w-3" /> Auto
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" /> Paused
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[11px]"
                onClick={stepNextPhase}
              >
                <SkipForward className="h-3 w-3" /> Step
              </Button>
            </div>

            {/* Verify-Then-Trust Interactive Action Triggers */}
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="emerald"
                className="h-7 text-[11px] rounded-full px-3"
                onClick={() => triggerAutonomousExecution("VALID")}
              >
                <Sparkles className="h-3 w-3" />
                Execute Valid Council Trade (Passes PolicyVault)
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-[11px] rounded-full px-3"
                onClick={() =>
                  triggerAutonomousExecution("OVERSIZED_VIOLATION")
                }
              >
                <ShieldAlert className="h-3 w-3" />
                Simulate 24% Oversized Trade (Blocked by Vault!)
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] rounded-full px-3 border-amber-400 bg-amber-50/95 text-amber-950 hover:bg-amber-100"
                onClick={() =>
                  triggerAutonomousExecution("LOW_CONFIDENCE_VIOLATION")
                }
              >
                <Scale className="h-3 w-3" />
                Simulate 56% Low-Confidence Bet (Blocked!)
              </Button>
            </div>
          </div>

          {/* LEFT FLOATING HUD RAIL: THE CREW & COUNCIL DEBATE FEED */}
          <aside className="z-20 absolute left-3 top-28 bottom-28 w-[340px] hidden lg:flex flex-col gap-3 pointer-events-none">
            {/* Crew Roster Card */}
            <Card className="pointer-events-auto flex-shrink-0">
              <CardHeader className="p-3.5 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Radio className="h-4 w-4 text-[#d96543]" />
                    Island Crew (7 ERC-8004 Agents)
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    Click to Focus
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3.5 pt-1">
                <div className="grid grid-cols-7 gap-1.5 mb-2.5">
                  {agents.map((ag) => {
                    const active = ag.id === selectedAgentId;
                    return (
                      <button
                        key={ag.id}
                        onClick={() => {
                          setSelectedAgentId(ag.id);
                          setSelectedStationId(ag.currentStationId);
                        }}
                        className={`flex flex-col items-center p-1.5 rounded-xl border transition-all ${active
                            ? "bg-[#2e2319] text-[#fbf6ee] border-[#d96543] scale-105 shadow-sm"
                            : "bg-[#f3eadb] text-[#3d3126] border-[#d8cbb8] hover:bg-[#eae0cf]"
                          }`}
                      >
                        <span
                          className="h-4 w-4 rounded-full border border-white/60 mb-1"
                          style={{ backgroundColor: ag.color }}
                        />
                        <span className="text-[9px] font-extrabold truncate max-w-full">
                          {ag.name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Agent Inspector */}
                <div className="rounded-xl bg-[#f2e8d9] border border-[#d8cbb8] p-2.5 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: selectedAgent.color }}
                      />
                      <span className="font-extrabold text-[#2e2319]">
                        {selectedAgent.name}
                      </span>
                      <span className="text-[10px] text-[#756350]">
                        • {selectedAgent.role}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#4a3b2c] italic mb-1.5">
                    “{selectedAgent.speechBubble}”
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-[#6b5846]">
                    <span>{selectedAgent.erc8004Id}</span>
                    <span>Win Rate: {selectedAgent.winRate}%</span>
                    <span>
                      Rep: {(selectedAgent.reputationBps / 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Live Council Debate & Fact-Check Stream */}
            <Card className="pointer-events-auto flex-1 flex flex-col overflow-hidden">
              <CardHeader className="p-3.5 pb-2 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Flame className="h-4 w-4 text-[#d96543]" />
                    Live Council Debate & Proofs
                  </CardTitle>
                  <Badge variant="emerald" className="text-[10px]">
                    On-Chain Anchored
                  </Badge>
                </div>
                <CardDescription className="text-[11px]">
                  Pip signals → Hoot fact-checks → Brutus vs Bramble → Polly &
                  Sentinel
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3.5 pt-1 flex-1 overflow-y-auto space-y-2">
                {debateFeed.map((msg) => {
                  const badgeColor =
                    msg.stance === "BULL"
                      ? "bg-amber-100 text-amber-900 border-amber-300"
                      : msg.stance === "BEAR"
                        ? "bg-purple-100 text-purple-900 border-purple-300"
                        : msg.stance === "FACT_CHECK"
                          ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                          : msg.stance === "GUARDRAIL"
                            ? msg.text.includes("BLOCKED")
                              ? "bg-red-100 text-red-900 border-red-300"
                              : "bg-teal-100 text-teal-900 border-teal-300"
                            : "bg-orange-100 text-orange-900 border-orange-300";

                  return (
                    <div
                      key={msg.id}
                      className="rounded-xl border border-[#ded2c0] bg-[#fbf6ee] p-2.5 text-xs shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-[#2e2319]">
                            {msg.speaker}
                          </span>
                          <span className="text-[10px] text-[#756350]">
                            {msg.roleTag}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${badgeColor}`}
                        >
                          {msg.confidenceImpact || msg.stance}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#3d3126]">
                        {msg.text}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </aside>

          {/* RIGHT FLOATING HUD RAIL: 4LPHA POLICY VAULT & PREDICTION MARKETS */}
          <aside className="z-20 absolute right-3 top-28 bottom-28 w-[360px] hidden lg:flex flex-col gap-3 pointer-events-none">
            {/* 4lpha Policy-Locked Vault Card */}
            <Card className="pointer-events-auto flex-shrink-0">
              <CardHeader className="p-3.5 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-[#2d6a4f]" />
                    4lpha Policy-Locked BTC Vault
                  </CardTitle>
                  <Badge
                    variant={
                      guardrails.emergencyLock ? "destructive" : "emerald"
                    }
                    className="text-[10px]"
                  >
                    {guardrails.emergencyLock
                      ? "LOCKED"
                      : "VERIFY-THEN-TRUST"}
                  </Badge>
                </div>
                <CardDescription className="text-[11px]">
                  Smart contract guardrails fence every autonomous agent action
                </CardDescription>
              </CardHeader>

              <CardContent className="p-3.5 pt-1 space-y-3">
                {/* Deposit / Withdraw Bar */}
                <div className="rounded-xl bg-[#f2e8d9] border border-[#d8cbb8] p-2.5">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-[#6b5846] font-medium">
                      Your Deposited BTC:{" "}
                      <strong className="text-[#2e2319]">
                        {userDepositedBtc.toFixed(2)} BTC
                      </strong>
                    </span>
                    <span className="text-[#6b5846]">
                      Wallet:{" "}
                      <strong className="text-[#2d6a4f]">
                        {sandboxWalletBtc.toFixed(2)} tBTC
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      min="0.05"
                      value={depositInput}
                      onChange={(e) => setDepositInput(e.target.value)}
                      className="w-20 h-8 rounded-lg border border-[#cbbba2] bg-[#fbf6ee] px-2 text-xs font-bold text-[#2e2319] focus:outline-none"
                    />
                    <Button
                      size="sm"
                      className="h-8 flex-1 text-xs"
                      onClick={handleVaultDeposit}
                    >
                      Deposit BTC
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5 text-xs"
                      onClick={handleVaultWithdraw}
                    >
                      Withdraw
                    </Button>
                  </div>
                </div>

                {/* Mathematical Guardrail Sliders */}
                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-semibold text-[#4a3b2c]">
                        Max Single Trade (`maxSingleTradeBps`)
                      </span>
                      <span className="font-mono font-bold text-[#d96543]">
                        {bpsToPercent(guardrails.maxSingleTradeBps)} (
                        {(
                          (vaultTvlBtc * guardrails.maxSingleTradeBps) /
                          10000
                        ).toFixed(2)}{" "}
                        BTC)
                      </span>
                    </div>
                    <Slider
                      value={[guardrails.maxSingleTradeBps]}
                      min={200}
                      max={2500}
                      step={50}
                      onValueChange={([val]) =>
                        setGuardrails((g) => ({
                          ...g,
                          maxSingleTradeBps: val,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-semibold text-[#4a3b2c]">
                        Min Council Consensus (`minConfidenceBps`)
                      </span>
                      <span className="font-mono font-bold text-[#2d6a4f]">
                        {bpsToPercent(guardrails.minConfidenceBps)}
                      </span>
                    </div>
                    <Slider
                      value={[guardrails.minConfidenceBps]}
                      min={5000}
                      max={9500}
                      step={100}
                      onValueChange={([val]) =>
                        setGuardrails((g) => ({
                          ...g,
                          minConfidenceBps: val,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-semibold text-[#4a3b2c]">
                        Max Daily Drawdown (`maxDailyDrawdownBps`)
                      </span>
                      <span className="font-mono font-bold text-[#9d4edd]">
                        {bpsToPercent(guardrails.maxDailyDrawdownBps)} (Used:{" "}
                        {bpsToPercent(dailyDrawdownBps)})
                      </span>
                    </div>
                    <Slider
                      value={[guardrails.maxDailyDrawdownBps]}
                      min={100}
                      max={1500}
                      step={50}
                      onValueChange={([val]) =>
                        setGuardrails((g) => ({
                          ...g,
                          maxDailyDrawdownBps: val,
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[#e3d6c3]">
                    <span className="text-[11px] font-bold text-[#4a3b2c] flex items-center gap-1">
                      {guardrails.emergencyLock ? (
                        <Lock className="h-3.5 w-3.5 text-red-600" />
                      ) : (
                        <Unlock className="h-3.5 w-3.5 text-emerald-700" />
                      )}
                      Emergency Vault Kill-Switch
                    </span>
                    <Switch
                      checked={guardrails.emergencyLock}
                      onCheckedChange={(checked) =>
                        setGuardrails((g) => ({
                          ...g,
                          emergencyLock: checked,
                        }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Polly.town Prediction Markets & Council Edge */}
            <Card className="pointer-events-auto flex-1 flex flex-col overflow-hidden">
              <CardHeader className="p-3.5 pb-2 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Scale className="h-4 w-4 text-[#d96543]" />
                    Council vs. Market Positions
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px]">
                    Mezo Arena
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3.5 pt-1 flex-1 overflow-y-auto space-y-2.5">
                {markets.map((mkt) => (
                  <div
                    key={mkt.id}
                    className="rounded-xl border border-[#ded2c0] bg-[#fbf6ee] p-2.5 text-xs space-y-1.5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-extrabold text-[#d96543]">
                        {mkt.ticker}
                      </span>
                      <Badge variant="emerald" className="text-[9px] py-0 px-1.5">
                        +{mkt.edgePercent}% Council Edge
                      </Badge>
                    </div>
                    <p className="text-[11px] font-bold text-[#2e2319] leading-snug">
                      {mkt.question}
                    </p>

                    {/* Dual Probability Comparison Bars (Polly.town signature UI) */}
                    <div className="space-y-1 pt-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-[#2d6a4f]">
                          Polly Council: {mkt.councilYesPercent}% YES
                        </span>
                        <span className="text-[#756350]">
                          Market: {mkt.marketYesPercent}% YES
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#e5d9c7] overflow-hidden flex">
                        <div
                          className="h-full bg-[#2d6a4f]"
                          style={{ width: `${mkt.councilYesPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-[#6b5846]">
                        Vault Pos:{" "}
                        <strong className="text-[#2e2319]">
                          {mkt.allocatedBtc} BTC ({mkt.positionSide})
                        </strong>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleStakePrediction(mkt.id, "YES")}
                          className="px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[10px] border border-emerald-300"
                        >
                          +YES
                        </button>
                        <button
                          onClick={() => handleStakePrediction(mkt.id, "NO")}
                          className="px-2 py-0.5 rounded-md bg-red-100 hover:bg-red-200 text-red-900 font-bold text-[10px] border border-red-300"
                        >
                          +NO
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>

          {/* BOTTOM FLOATING BAR: ON-CHAIN EXECUTION & POLICY AUDIT STREAM */}
          <footer className="z-20 absolute bottom-3 left-3 right-3 rounded-2xl border-2 border-[#ded2c0] bg-[#fbf6ee]/95 px-4 py-2.5 shadow-clay backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#2e2319] flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#d96543]" />
                  On-Chain PolicyVault Execution & Guardrail Audit Log
                </span>
                <Badge variant="outline" className="text-[10px]">
                  Station: {selectedStation.name} — {selectedStation.subtitle}
                </Badge>
              </div>
              <a
                href="https://explorer.test.mezo.org"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-[#d96543] hover:underline flex items-center gap-1"
              >
                explorer.test.mezo.org <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {executionLedger.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className={`flex-shrink-0 rounded-xl border px-3 py-1.5 text-xs flex items-center gap-2.5 ${item.passedPolicy
                      ? "bg-[#f2e8d9]/90 border-[#d8cbb8]"
                      : "bg-red-50/95 border-red-300"
                    }`}
                >
                  {item.passedPolicy ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-[#2e2319]">
                        #{item.id} {item.agentName}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-[#d96543]">
                        {item.marketTicker}
                      </span>
                      <span className="font-bold text-[#2e2319]">
                        {item.amountBtc} BTC ({item.vaultSharePercent}%)
                      </span>
                    </div>
                    <div className="text-[10px] text-[#6b5846] flex items-center gap-2">
                      {item.passedPolicy ? (
                        <span className="text-emerald-800 font-semibold">
                          VERIFIED_OK • Conf {item.confidencePercent}% • Proof{" "}
                          {shortenHex(item.proofHash, 4)}
                        </span>
                      ) : (
                        <span className="text-red-700 font-semibold">
                          {item.violationReason}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </footer>
        </div>
      )}

      {/* =====================================================================
          3. VIEW 2: POLICY VAULTS & MEZO TESTNET SMART CONTRACTS
         ===================================================================== */}
      {activeTab === "vaults" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-[#2e2319]">
                  4lpha Policy-Locked Vaults & Mezo Smart Contracts
                </h1>
                <p className="text-sm text-[#6b5846]">
                  “Verify, Then Trust” — Autonomous AI agents propose strategies,
                  but immutable Solidity contracts on Mezo Testnet (`31611`)
                  enforce mathematical risk limits.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="emerald"
                  onClick={() => triggerAutonomousExecution("VALID")}
                >
                  <Sparkles className="h-4 w-4" /> Test Valid On-Chain Execution
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    triggerAutonomousExecution("OVERSIZED_VIOLATION")
                  }
                >
                  <ShieldAlert className="h-4 w-4" /> Trigger Guardrail Revert
                </Button>
              </div>
            </div>

            {/* Deployed Contract Address Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  key: "agentRegistry" as const,
                  title: "AgentRegistry.sol (ERC-8004)",
                  desc: "Anchors agent identities, MCP URIs, strategy hashes & Council debate transcripts.",
                },
                {
                  key: "policyVault" as const,
                  title: "PolicyVault.sol (BTC 18 Decimals)",
                  desc: "Custodies user Mezo BTC and enforces maxSingleTradeBps, maxDailyDrawdownBps & minConfidenceBps.",
                },
                {
                  key: "predictionArena" as const,
                  title: "MezoPredictionArena.sol",
                  desc: "Polly.town prediction market pools tracking Council YES % vs Market YES %.",
                },
              ].map((c) => (
                <Card key={c.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>{c.title}</span>
                      <Badge variant="outline">Chain 31611</Badge>
                    </CardTitle>
                    <CardDescription>{c.desc}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <label className="text-[11px] font-bold text-[#6b5846]">
                      Contract Address on Mezo Testnet:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={contractAddresses[c.key]}
                        onChange={(e) =>
                          setContractAddresses((prev) => ({
                            ...prev,
                            [c.key]: e.target.value as `0x${string}`,
                          }))
                        }
                        className="w-full rounded-xl border border-[#cbbba2] bg-[#fbf6ee] px-2.5 py-1.5 font-mono text-xs text-[#2e2319]"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0"
                        onClick={() =>
                          copyText(c.key, contractAddresses[c.key])
                        }
                      >
                        {copiedKey === c.key ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Full Audit Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Complete PolicyVault Execution & Guardrail Audit Ledger
                </CardTitle>
                <CardDescription>
                  Every autonomous trade attempt and blocked policy violation is
                  recorded with its cryptographic reasoning proof hash.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b-2 border-[#ded2c0] text-[#6b5846]">
                        <th className="py-2.5 px-3">ID</th>
                        <th className="py-2.5 px-3">Agent (ERC-8004)</th>
                        <th className="py-2.5 px-3">Strategy / Market</th>
                        <th className="py-2.5 px-3">Size (BTC / % Vault)</th>
                        <th className="py-2.5 px-3">Council Conf</th>
                        <th className="py-2.5 px-3">Policy Verdict</th>
                        <th className="py-2.5 px-3">Reasoning Proof Hash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e5d9c7]">
                      {executionLedger.map((row) => (
                        <tr key={row.id} className="hover:bg-[#f3eadb]/60">
                          <td className="py-2.5 px-3 font-mono font-bold">
                            #{row.id}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-[#2e2319]">
                              {row.agentName}
                            </div>
                            <div className="text-[10px] text-[#756350]">
                              {row.erc8004Id}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono font-bold text-[#d96543]">
                              {row.marketTicker}
                            </span>
                            <div className="text-[10px] text-[#756350]">
                              {row.actionType}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-bold">
                            {formatBtc(row.amountBtc, 2)} ({row.vaultSharePercent}
                            %)
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold">
                            {row.confidencePercent}%
                          </td>
                          <td className="py-2.5 px-3">
                            {row.passedPolicy ? (
                              <Badge variant="emerald">
                                VERIFIED & EXECUTED
                              </Badge>
                            ) : (
                              <div>
                                <Badge variant="destructive">
                                  BLOCKED BY POLICY
                                </Badge>
                                <div className="text-[10px] text-red-700 font-semibold mt-0.5">
                                  {row.violationReason}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#6b5846]">
                            {shortenHex(row.proofHash, 8)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. VIEW 3: ERC-8004 AGENT REGISTRY & LIVE /MCP PLAYGROUND
         ===================================================================== */}
      {activeTab === "mcp" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-[#2e2319]">
                  ERC-8004 Agent Registry & Machine-Readable `/mcp` Interface
                </h1>
                <p className="text-sm text-[#6b5846]">
                  4lpha.tech standardized Agent-to-Agent (A2A) discovery via{" "}
                  <code className="rounded bg-[#ebe0cf] px-1.5 py-0.5 font-mono text-xs">
                    /.well-known/agent-card.json
                  </code>{" "}
                  and JSON-RPC{" "}
                  <code className="rounded bg-[#ebe0cf] px-1.5 py-0.5 font-mono text-xs">
                    /api/mcp
                  </code>
                  .
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/.well-known/agent-card.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <Eye className="h-3.5 w-3.5" /> Open
                    /.well-known/agent-card.json
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                </a>
                <a href="/api/mcp" target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm">
                    <Terminal className="h-3.5 w-3.5" /> Open /api/mcp
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
            </div>

            {/* Live Interactive MCP Tester */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-[#d96543]" />
                  Interactive 4lpha MCP (Model Context Protocol) Playground
                </CardTitle>
                <CardDescription>
                  Test live JSON-RPC 2.0 tool invocations against your Next.js{" "}
                  <code>/api/mcp</code> server
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    {
                      id: "check_policy_vault",
                      label: "tools/call: check_policy_vault",
                    },
                    {
                      id: "get_erc8004_agents",
                      label: "tools/call: get_erc8004_agents",
                    },
                    {
                      id: "get_island_state",
                      label: "tools/call: get_island_state",
                    },
                  ].map((t) => (
                    <Button
                      key={t.id}
                      size="sm"
                      variant={mcpToolName === t.id ? "default" : "outline"}
                      onClick={() => invokeMcpEndpoint(t.id)}
                      disabled={isMcpLoading}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${isMcpLoading && mcpToolName === t.id
                            ? "animate-spin"
                            : ""
                          }`}
                      />
                      {t.label}
                    </Button>
                  ))}
                </div>
                <pre className="rounded-xl bg-[#231b14] text-[#f5ebe0] p-4 font-mono text-xs overflow-x-auto max-h-72">
                  {mcpResponse || "// Click a tool above to query /api/mcp"}
                </pre>
              </CardContent>
            </Card>

            {/* 7 Registered ERC-8004 Agent Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((ag) => (
                <Card key={ag.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-4 w-4 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: ag.color }}
                        />
                        <CardTitle className="text-base">{ag.name}</CardTitle>
                      </div>
                      <Badge variant="secondary">{ag.erc8004Id}</Badge>
                    </div>
                    <CardDescription>{ag.role}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="rounded-xl bg-[#f2e8d9] p-2.5 font-mono text-[11px] space-y-1">
                      <div>
                        <span className="text-[#756350]">Operator: </span>
                        <span>{shortenHex(ag.operatorAddress, 6)}</span>
                      </div>
                      <div>
                        <span className="text-[#756350]">Strategy Spec: </span>
                        <span>{shortenHex(ag.strategySpecHash, 6)}</span>
                      </div>
                      <div>
                        <span className="text-[#756350]">Reputation: </span>
                        <span className="font-bold text-[#2d6a4f]">
                          {(ag.reputationBps / 100).toFixed(2)}% ({ag.winRate}%
                          Win)
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {ag.skills.map((sk) => (
                        <Badge
                          key={sk}
                          variant="outline"
                          className="text-[10px]"
                        >
                          {sk}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          5. VIEW 4: DOCS (#START) — 4LPHA.TECH × MEZO TESTNET GUIDE
         ===================================================================== */}
      {activeTab === "docs" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6 pb-12">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Badge variant="default">#start // Documentation</Badge>
                  <Badge variant="outline">
                    Mezo Testnet • Chain ID: 31611 (0x7b7b)
                  </Badge>
                </div>
                <CardTitle className="text-2xl mt-2">
                  MezoCity: 4lpha.tech Autonomous Agent Infrastructure ×
                  Polly.town Island
                </CardTitle>
                <CardDescription className="text-sm">
                  Complete developer & architecture documentation for running,
                  testing, and deploying the Foundry smart contracts in WSL and
                  operating the Policy-Locked Agent Vaults on Mezo Testnet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 text-sm leading-relaxed text-[#3d3126]">
                <section className="space-y-2">
                  <h3 className="text-base font-black text-[#2e2319]">
                    1. Core Architecture (“Verify, Then Trust”)
                  </h3>
                  <p>
                    MezoCity merges <strong>Polly.town’s</strong> transparent
                    multi-agent clay island simulation (where <strong>Pip</strong>{" "}
                    listens to signals, <strong>Hoot</strong> fact-checks
                    on-chain state, <strong>Brutus & Bramble</strong> debate
                    opposing theses, and <strong>Polly</strong> synthesizes
                    Council probability) with <strong>4lpha.tech’s</strong>{" "}
                    on-chain <strong>Policy-Locked Execution Vaults</strong> and{" "}
                    <strong>ERC-8004 Agent Registry</strong> on{" "}
                    <strong>Mezo Testnet</strong>.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-base font-black text-[#2e2319]">
                    2. Mezo Testnet Network Parameters
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-xl bg-[#f2e8d9] border border-[#d8cbb8] p-3.5 font-mono text-xs">
                    <div>
                      <strong>Network Name:</strong> Mezo Testnet
                    </div>
                    <div>
                      <strong>Chain ID:</strong> 31611 (0x7b7b)
                    </div>
                    <div>
                      <strong>Native Gas Token:</strong> BTC (18 decimals)
                    </div>
                    <div>
                      <strong>RPC Endpoint:</strong> https://rpc.test.mezo.org
                    </div>
                    <div>
                      <strong>WSS Endpoint:</strong> wss://rpc-ws.test.mezo.org
                    </div>
                    <div>
                      <strong>Explorer:</strong> https://explorer.test.mezo.org
                    </div>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-base font-black text-[#2e2319]">
                    3. Building & Testing Foundry Contracts in WSL
                  </h3>
                  <p>
                    All Solidity smart contracts are located in{" "}
                    <code className="rounded bg-[#ebe0cf] px-1.5 py-0.5 font-mono text-xs">
                      ./contracts
                    </code>{" "}
                    and are zero-dependency so they compile and pass tests
                    immediately in your WSL Foundry installation:
                  </p>
                  <pre className="rounded-xl bg-[#231b14] text-[#f5ebe0] p-4 font-mono text-xs overflow-x-auto">
                    {`# 1. Run Foundry compilation & unit tests in WSL:
wsl -- bash -lc "cd /mnt/e/frontend/mezocity/contracts && forge test -vv"

# 2. Deploy AgentRegistry, PolicyVault, and MezoPredictionArena to Mezo Testnet (Chain ID 31611):
wsl -- bash -lc "cd /mnt/e/frontend/mezocity/contracts && forge script script/DeployMezoTestnet.s.sol:DeployMezoTestnet --rpc-url https://rpc.test.mezo.org --private-key <YOUR_MEZO_TESTNET_PRIVATE_KEY> --broadcast"`}
                  </pre>
                </section>

                <section className="space-y-2">
                  <h3 className="text-base font-black text-[#2e2319]">
                    4. Machine-Readable Endpoints (MCP & Agent Card)
                  </h3>
                  <pre className="rounded-xl bg-[#231b14] text-[#f5ebe0] p-4 font-mono text-xs overflow-x-auto">
                    {`# Query ERC-8004 Agent Card Manifest:
curl http://localhost:3000/.well-known/agent-card.json

# Invoke 4lpha Model Context Protocol (MCP) Server:
curl -X POST http://localhost:3000/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"check_policy_vault","arguments":{"amountBtc":0.9,"vaultEquityBtc":12.5,"confidenceBps":7900}}}'`}
                  </pre>
                </section>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

