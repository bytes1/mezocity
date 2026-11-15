"use client";

import React, { useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Cpu,
  ExternalLink,
  Gavel,
  Globe,
  KeyRound,
  Layers,
  Lock,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trophy,
  Vault,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ISLAND_ECOSYSTEM_ADDRESSES } from "@/lib/island-contracts";
import {
  MAIN_MEZO_VAULT_ADDRESS,
  MEZO_EARN_ADDRESSES,
  MEZO_FEE_SPLITTER_ADDRESS,
  MEZO_GOVERNOR_ADDRESS,
  MEZO_TESTNET_LENDING_ADDRESSES,
} from "@/lib/mezo-chain";
import { shortenHex } from "@/lib/utils";

export type DocsTargetTab =
  | "island"
  | "leaderboard"
  | "crew"
  | "arena"
  | "dca"
  | "musd-vault"
  | "mezo-vault"
  | "governance"
  | "lending"
  | "contracts"
  | "docs";

export interface ProtocolHealthCheckItem {
  id: string;
  label: string;
  endpoint: string;
  ok: boolean;
  summary: string;
  latencyMs: number;
}

interface ProtocolDocsPanelProps {
  contractAddresses: {
    agentRegistry: string;
    policyVault: string;
    dcaEngine: string;
  };
  protocolHealthChecks: ProtocolHealthCheckItem[];
  isCheckingHealth: boolean;
  onRunHealthCheck: () => void;
  onNavigateTab: (tab: DocsTargetTab) => void;
}

type DocsTopicFilter =
  | "all"
  | "how-it-works"
  | "modules"
  | "crew"
  | "contracts"
  | "security"
  | "walkthrough";

const EXPLORER = "https://explorer.test.mezo.org";

const MCP_CURL_EXAMPLE = `curl -X POST https://mezocity.vercel.app/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_vault_telemetry",
      "arguments": {}
    }
  }'`;

const LIVE_TX_PROOFS = [
  {
    contract: "AgentRegistry",
    nonDeployCount: "6",
    method: "registerAgent",
    block: "16752179",
    txHash:
      "0x38d19fbdb3e99978a7cf329c560b9756bcf7093383a12aace14c848eeddfe6ce",
    note: "Registered autonomous Transformer identity on-chain (ERC-8004)",
  },
  {
    contract: "PolicyVault",
    nonDeployCount: "28",
    method: "withdraw (Vault -> Tigris LP)",
    block: "16820027",
    txHash:
      "0x94cf5cb4e61e4cb20b76dd0cc70e0fcfcfaf02e8c637504163d035bf4a0ea28c",
    note: "Pulled BTC directly from PolicyVault to fund Tigris MUSD/BTC LP",
  },
  {
    contract: "PolicyVault",
    nonDeployCount: "28",
    method: "updatePolicy",
    block: "16801774",
    txHash:
      "0x442966d9ea99df891f781783abf4fc127fa9655c31319b8a56ba71b4a056004d",
    note: "Updated maxSingleTradeBps / drawdown / minConfidenceBps guardrails",
  },
  {
    contract: "MezoDCAEngine",
    nonDeployCount: "13",
    method: "rectifyAndExecuteDCASlice",
    block: "16751431",
    txHash:
      "0xc864649a0579109ce7cebde32e07d0a9b06ec370471f06c0a120440f57793a64",
    note: "Ratchet (#03) diagnosed cap rejection and executed healed slice",
  },
  {
    contract: "MainMUSDVault",
    nonDeployCount: "29",
    method: "withdrawMUSD (Vault -> Tigris LP)",
    block: "16820022",
    txHash:
      "0xfbdd7f080224091e05c8f78653050368b8050de951f04a24278bdce2b1183c1d",
    note: "Pulled liquid MUSD directly from MainMUSDVault for pool deployment",
  },
  {
    contract: "MainMUSDVault",
    nonDeployCount: "29",
    method: "depositMUSD (User Wallet)",
    block: "16815724",
    txHash:
      "0x528375669dd622aa984ac22c7a032af46a6594fc8722a8cfa363eb2ec6d400ac",
    note: "User deposited MUSD to mint ERC-4626 LP lending shares",
  },
  {
    contract: "IslandFactory",
    nonDeployCount: "3",
    method: 'createIsland (#2 "stark")',
    block: "16804859",
    txHash:
      "0xbfa06b93dbc922bfd7ea4dd6d973260a8d2027c3f6b5cd798d06e7d5c9349563",
    note: "Deployed EIP-1167 Sub-Island vault clone 0x9AF8...E885 (0.0001 BTC + 20 MUSD)",
  },
  {
    contract: "IslandFactory",
    nonDeployCount: "3",
    method: 'createIsland (#1 "Maya")',
    block: "16779541",
    txHash:
      "0x49756005835daeb2d6da07df88e9df6e5335fe0e3df3149940ca475e4c0478fd",
    note: "Deployed EIP-1167 Sub-Island vault clone 0x3713...BD0B (0.0001 BTC + 100 MUSD)",
  },
  {
    contract: "MainMEZOVault",
    nonDeployCount: "2",
    method: "stakeMezo (User Wallet)",
    block: "16815923",
    txHash:
      "0xe8ddc0dd34bde21de512de2189124d8d35c3185f9fe5c09c45e7b15947bfbe88",
    note: "Staked MEZO for coordination power, loan APR discount & MUSD rewards",
  },
  {
    contract: "MezoCityFeeSplitter",
    nonDeployCount: "1",
    method: "setGovernance",
    block: "16800394",
    txHash:
      "0xe61de798a07cb73f6d34805e1d5d153d161db9ccaea17351bd45859db602b090",
    note: "Bound 50/30/20 fee splitter governance control to MezoCityGovernor",
  },
  {
    contract: "Tigris Router (Canonical)",
    nonDeployCount: "Live",
    method: "addLiquidity (vAMM-MUSD/BTC)",
    block: "16820033",
    txHash:
      "0xfb21ce86f75be289a14b0c969f02b6bcea95f7cb7d54d8b893c068ecc5c006e0",
    note: "Autonomous vault-funded LP addition into canonical vAMM-MUSD/BTC pool",
  },
  {
    contract: "Tigris Gauge (Canonical)",
    nonDeployCount: "Live",
    method: "deposit (vAMM-MUSD/BTC Gauge)",
    block: "16820036",
    txHash:
      "0xbcabf5d7515df6d6ccaebc78d61fe563aa34a6061be698d039a24627db69b706",
    note: "Staked vAMM-MUSD/BTC LP tokens into active VeBTC yield gauge",
  },
  {
    contract: "BorrowerOperations (Canonical)",
    nonDeployCount: "Live",
    method: "openTrove (0.048 BTC -> MUSD)",
    block: "16774590",
    txHash:
      "0xc7d1aa368e56ce0f547e5724e433a7bce94beca3133e622c15550aa831b6d014",
    note: "Opened live BTC-backed MUSD Trove monitored by Mezo Guard (110% MCR)",
  },
];

export function ProtocolDocsPanel({
  contractAddresses,
  protocolHealthChecks,
  isCheckingHealth,
  onRunHealthCheck,
  onNavigateTab,
}: ProtocolDocsPanelProps) {
  const [topic, setTopic] = useState<DocsTopicFilter>("all");
  const [copiedCurl, setCopiedCurl] = useState(false);

  const showSection = (id: Exclude<DocsTopicFilter, "all">) =>
    topic === "all" || topic === id;

  const handleCopyCurl = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(MCP_CURL_EXAMPLE).catch(() => {});
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1800);
  };

  return (
    <div className="h-full overflow-y-auto pt-28 xl:pt-24 pb-12 px-4 sm:px-6 bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
      <div className="max-w-5xl mx-auto space-y-6">
        <Card className="bg-white/95 border-white shadow-xl">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-[#7c3aed] text-white font-black">
                  MezoCity Protocol Docs • Mezo Testnet 31611
                </Badge>
                <Badge className="bg-emerald-600 text-white font-black">
                  11/11 Contracts Blockscout Verified
                </Badge>
                <Badge className="bg-amber-500 text-white font-black">
                  16/16 Foundry Tests Passing
                </Badge>
              </div>
              <Badge variant="outline" className="font-mono">
                Chain ID: 31611 (0x7b7b) • ERC-8004 + A2A + MCP
              </Badge>
            </div>

            <CardTitle className="text-2xl sm:text-3xl font-black tracking-tight text-[#231f20]">
              MezoCity Architecture, Modules &amp; Security Documentation
            </CardTitle>

            <CardDescription className="text-sm leading-relaxed text-[#453e38]">
              <strong>MezoCity</strong> is an interactive 3D Bitcoin island city
              on <strong>Mezo Testnet (31611)</strong> where every financial
              pillar—spot BTC execution, market-regime{" "}
              <strong>MUSD &amp; MEZO</strong> yield routing,{" "}
              <strong>110% MCR Trove liquidation defense</strong>, Sub-Island
              working-capital credit, and fee-sharing governance—is coordinated
              by autonomous AI agents inside{" "}
              <strong>hard mathematical smart-contract guardrails</strong>.
            </CardDescription>

            {/* Quick External Links + Section Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: "all" as const, label: "All Sections" },
                  { id: "how-it-works" as const, label: "How It Works" },
                  { id: "modules" as const, label: "6 Core Modules" },
                  { id: "crew" as const, label: "5 AI Agents" },
                  { id: "security" as const, label: "Security & Safety" },
                  { id: "contracts" as const, label: "Contracts & Live Txs" },
                  { id: "walkthrough" as const, label: "Judge Walkthrough" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTopic(item.id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-black transition-all ${
                      topic === item.id
                        ? "bg-[#242331] text-white shadow-sm"
                        : "bg-[#f3ede2] text-[#453e38] hover:bg-[#e8decb]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <a
                  href="https://youtu.be/OU30uombJR4"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1 font-extrabold text-rose-800 transition-colors"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  <span>5-Min Demo Video</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="/.well-known/agent-card.json"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1 font-extrabold text-violet-900 transition-colors"
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span>A2A Agent Card</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={EXPLORER}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1 font-extrabold text-emerald-900 transition-colors"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>Blockscout</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-8 text-sm leading-relaxed text-[#38322d]">
            {/* 0. LIVE PROTOCOL HEALTH VERIFICATION CONSOLE */}
            <section className="rounded-2xl bg-[#181520] text-white p-4 sm:p-5 space-y-3 border border-white/15">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                    Live Judge Verification Console · Zero Mock Telemetry
                  </div>
                  <h3 className="font-black text-base text-white">
                    Live End-to-End Protocol &amp; Endpoint Health Check
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Probes Mezo Testnet RPC (31611), <code>PolicyVault</code>,{" "}
                    <code>MainMUSDVault</code>, canonical Earn/Tigris pools,
                    Sub-Island Leaderboard,{" "}
                    <code>/.well-known/agent-card.json</code>, and JSON-RPC{" "}
                    <code>/api/mcp</code> simultaneously.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={isCheckingHealth}
                  onClick={onRunHealthCheck}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shrink-0"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 mr-1.5 ${isCheckingHealth ? "animate-spin" : ""}`}
                  />
                  {isCheckingHealth
                    ? "Probing Live Endpoints..."
                    : "Run Live Protocol Health Check"}
                </Button>
              </div>

              {protocolHealthChecks.length === 0 ? (
                <div className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-xs text-slate-300">
                  Click <strong>Run Live Protocol Health Check</strong> to test
                  every smart contract reader, API route, and agent standard
                  live in real time.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {protocolHealthChecks.map((chk) => (
                    <div
                      key={chk.id}
                      className={`rounded-xl p-2.5 border text-xs ${
                        chk.ok
                          ? "bg-emerald-950/60 border-emerald-500/40"
                          : "bg-rose-950/60 border-rose-500/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-black text-white truncate">
                          {chk.label}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-black ${
                            chk.ok
                              ? "bg-emerald-500 text-white"
                              : "bg-rose-600 text-white"
                          }`}
                        >
                          {chk.ok ? `PASS · ${chk.latencyMs}ms` : "FAIL"}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 truncate mt-0.5">
                        {chk.endpoint}
                      </div>
                      <div className="text-[11px] text-slate-200 font-semibold mt-1">
                        {chk.summary}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 1. HOW MEZOCITY WORKS END-TO-END */}
            {showSection("how-it-works") && (
              <section className="space-y-3">
                <div>
                  <h3 className="font-black text-lg text-[#231f20] flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#7c3aed]" />
                    <span>
                      1. How MezoCity Works End-to-End (Every Autonomous Cycle)
                    </span>
                  </h3>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Instead of disconnected DeFi dashboards or unverified bots,
                    MezoCity runs a four-stage closed capital loop anchored on
                    Mezo Testnet (31611):
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {[
                    {
                      step: "STEP 01 · SENSE MARKET",
                      title: "Soundwave Reads Regime",
                      body: "Checks Mezo PriceFeed, 24h BTC spot range position, Fear & Greed Index, and macro news before any trade or yield shift.",
                      tone: "from-pink-50 to-white border-pink-200",
                      tag: "NEWS_SCANNING",
                    },
                    {
                      step: "STEP 02 · DELIBERATE & CHECK",
                      title: "Council Votes Inside Caps",
                      body: "Optimus Prime, Bumblebee, Ratchet & Ironhide debate turns and verify trade size & confidence against PolicyVault.sol rules.",
                      tone: "from-violet-50 to-white border-violet-200",
                      tag: "POLICY_AUDIT",
                    },
                    {
                      step: "STEP 03 · VAULT-FUNDED EXEC",
                      title: "Pulls Directly From Vaults",
                      body: "Bumblebee draws MUSD from MainMUSDVault, BTC from PolicyVault & MEZO from MainMEZOVault to deploy into sMUSD, upMUSD & Tigris LP.",
                      tone: "from-emerald-50 to-white border-emerald-200",
                      tag: "VAULT -> TIGRIS",
                    },
                    {
                      step: "STEP 04 · DEFEND & DISTRIBUTE",
                      title: "Trove Shield & Fee Split",
                      body: "Ironhide guards 110% MCR Troves via 2/2 finalized checks, while MezoCityFeeSplitter splits real MUSD revenue 50/30/20.",
                      tone: "from-amber-50 to-white border-amber-200",
                      tag: "110% MCR + FEES",
                    },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className={`rounded-2xl bg-gradient-to-br ${item.tone} border p-3.5 space-y-1.5 shadow-sm`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black text-stone-500">
                          {item.step}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono font-bold px-1.5 py-0"
                        >
                          {item.tag}
                        </Badge>
                      </div>
                      <div className="font-black text-sm text-[#231f20]">
                        {item.title}
                      </div>
                      <p className="text-[11.5px] text-stone-700 leading-relaxed">
                        {item.body}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 2. CLEAR EXPLANATION OF ALL 6 PROTOCOL MODULES */}
            {showSection("modules") && (
              <section className="space-y-3">
                <div>
                  <h3 className="font-black text-lg text-[#231f20] flex items-center gap-2">
                    <Layers className="h-5 w-5 text-emerald-700" />
                    <span>
                      2. Core Protocol Modules Explained (Plain English +
                      Architecture)
                    </span>
                  </h3>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Each UI tab maps directly to verifiable smart contracts on
                    Mezo Testnet. Click any button to jump straight into that
                    module.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                  {/* Module 1: BTC Vault */}
                  <div className="rounded-2xl bg-[#faf7f2] border border-[#e5dec9] p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-black text-sm text-[#231f20]">
                          <Vault className="h-4 w-4 text-emerald-700" />
                          <span>BTC Strategy Vault &amp; Self-Healing DCA</span>
                        </span>
                        <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 text-[9.5px] font-black">
                          PolicyVault + MezoDCAEngine
                        </Badge>
                      </div>
                      <p className="text-stone-700">
                        <strong>In plain English:</strong> You deposit native
                        test BTC once and pick safety rules (e.g. max 10% of
                        vault per trade, 5% max daily loss). Only your wallet
                        can withdraw your principal—agents can never pull user
                        deposits out for themselves.
                      </p>
                      <p className="text-stone-600">
                        <strong>Smart Self-Healing (<code>Ratchet #03</code>):</strong>{" "}
                        If an agent tries an oversized slice (
                        <code>MAX_TRADE_EXCEEDED</code>),{" "}
                        <code>PolicyVault.sol</code> rejects it on-chain and
                        Ratchet automatically calls{" "}
                        <code>MezoDCAEngine.rectifyAndExecuteDCASlice()</code>{" "}
                        to resize and settle inside the approved guardrail.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateTab("dca")}
                      className="w-fit rounded-xl bg-white font-black text-[11px]"
                    >
                      <span>Open BTC Vault</span>
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>

                  {/* Module 2: MUSD & Earn */}
                  <div className="rounded-2xl bg-[#faf7f2] border border-[#e5dec9] p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-black text-sm text-[#231f20]">
                          <Coins className="h-4 w-4 text-sky-700" />
                          <span>MUSD &amp; MEZO Yield Router + LP Treasury</span>
                        </span>
                        <Badge className="bg-sky-100 text-sky-900 border-sky-300 text-[9.5px] font-black">
                          MainMUSDVault + Tigris + sMUSD
                        </Badge>
                      </div>
                      <p className="text-stone-700">
                        <strong>In plain English:</strong> Instead of leaving
                        minted MUSD idle, LPs earn interest from Sub-Island
                        loans in <code>MainMUSDVault</code> (85% interest to
                        LPs, 25% liquid reserve floor, 20% single-loan cap).
                      </p>
                      <p className="text-stone-600">
                        <strong>Vault-Funded Pool Routing:</strong> When Bitcoin
                        weakens or dips, <code>Bumblebee (#02)</code> withdraws
                        MUSD from <code>MainMUSDVault</code>, BTC from{" "}
                        <code>PolicyVault</code>, and MEZO from{" "}
                        <code>MainMEZOVault</code> to deploy directly into{" "}
                        <code>sMUSD</code>, <code>upMUSD</code>,{" "}
                        <code>StabilityPool</code>, and{" "}
                        <code>Tigris vAMM-MUSD/BTC</code> LP + Gauge.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateTab("musd-vault")}
                      className="w-fit rounded-xl bg-white font-black text-[11px]"
                    >
                      <span>Open MUSD &amp; Earn</span>
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>

                  {/* Module 3: Mezo Guard */}
                  <div className="rounded-2xl bg-[#faf7f2] border border-[#e5dec9] p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-black text-sm text-[#231f20]">
                          <ShieldCheck className="h-4 w-4 text-orange-600" />
                          <span>Mezo Guard (110% MCR Trove Shield)</span>
                        </span>
                        <Badge className="bg-orange-100 text-orange-900 border-orange-300 text-[9.5px] font-black">
                          TroveManager + EIP-712
                        </Badge>
                      </div>
                      <p className="text-stone-700">
                        <strong>In plain English:</strong> Borrow MUSD against BTC
                        without waking up liquidated. <code>Ironhide (#04)</code>{" "}
                        monitors live <code>TroveManager</code> health and steps
                        in early before Mezo&apos;s 110% Minimum Collateral
                        Ratio (<code>HF = 1.00</code>).
                      </p>
                      <p className="text-stone-600">
                        <strong>How safety stays zero-custody:</strong> Uses a{" "}
                        <strong>3-wallet split</strong> + scoped{" "}
                        <strong>EIP-712 Rescue Permits</strong> (
                        <code>BorrowerOperationsSignatures</code> <code>AddColl</code> /{" "}
                        <code>RepayMUSD</code>—never collateral withdrawal).
                        Requires <strong>2/2 finalized observations</strong>{" "}
                        inside <code>1.00 &lt; HF &lt; Trigger</code>, uses{" "}
                        <strong>Repay-First math</strong> with exact approvals
                        (never <code>MaxUint256</code>), and refuses <code>HF &lt;= 1.00</code>
                        losing races.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateTab("lending")}
                      className="w-fit rounded-xl bg-white font-black text-[11px]"
                    >
                      <span>Open Mezo Guard</span>
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>

                  {/* Module 4: Sub-Islands & Credit Council */}
                  <div className="rounded-2xl bg-[#faf7f2] border border-[#e5dec9] p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-black text-sm text-[#231f20]">
                          <KeyRound className="h-4 w-4 text-indigo-700" />
                          <span>Sub-Island Factory &amp; AI Credit Council</span>
                        </span>
                        <Badge className="bg-indigo-100 text-indigo-900 border-indigo-300 text-[9.5px] font-black">
                          EIP-1167 + BYOK Gemini
                        </Badge>
                      </div>
                      <p className="text-stone-700">
                        <strong>In plain English:</strong> Anyone can launch an
                        isolated strategy Sub-Island (<code>&gt;= 0.0001 BTC</code> or{" "}
                        <code>&gt;= 10 MUSD</code>), build custom 3D agents powered by their
                        own encrypted <strong>Gemini API key</strong> ($0 cost
                        to protocol), and trade against Mezo&apos;s oracle feed.
                      </p>
                      <p className="text-stone-600">
                        <strong>Performance-Backed Credit:</strong> Profitable
                        islands anchor anti-spoof{" "}
                        <code>ProfitCheckpoint</code>s on-chain and borrow
                        working-capital MUSD from{" "}
                        <code>MainMUSDVault</code>—strictly capped at{" "}
                        <code>min(5x profit, 80% netEquity)</code> with a{" "}
                        <code>115%</code> maintenance margin. Top islands can be
                        cloned in 1 click from the Leaderboard.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateTab("leaderboard")}
                      className="w-fit rounded-xl bg-white font-black text-[11px]"
                    >
                      <span>Open Leaderboard &amp; Sub-Islands</span>
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>

                  {/* Module 5: MEZO Vault */}
                  <div className="rounded-2xl bg-[#faf7f2] border border-[#e5dec9] p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-black text-sm text-[#231f20]">
                          <Lock className="h-4 w-4 text-violet-700" />
                          <span>Main Island MEZO Vault (Yield + Discounts)</span>
                        </span>
                        <Badge className="bg-violet-100 text-violet-900 border-violet-300 text-[9.5px] font-black">
                          MainMEZOVault + veMEZO/veBTC
                        </Badge>
                      </div>
                      <p className="text-stone-700">
                        <strong>In plain English:</strong> Staking native{" "}
                        <code>MEZO</code> powers island coordination. Flexible
                        stakes earn <code>1.0x</code> weight, 30-day locks earn{" "}
                        <code>1.5x</code>, and 90-day locks earn{" "}
                        <code>2.5x</code> (protected by a 60s flash-loan hold
                        window).
                      </p>
                      <p className="text-stone-600">
                        <strong>Real Utility, Not Emissions:</strong> Stakers
                        claim real <code>MUSD</code> protocol fees distributed
                        via <code>rewardPerWeightStored</code> (<code>O(1)</code>{" "}
                        gas), get <code>-50</code> to <code>-200 bps</code>{" "}
                        Credit Council APR discounts, and pay $0 Sub-Island
                        launch &amp; Guard fees at the 500+ MEZO Citadel Council
                        tier.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateTab("mezo-vault")}
                      className="w-fit rounded-xl bg-white font-black text-[11px]"
                    >
                      <span>Open MEZO Vault</span>
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>

                  {/* Module 6: Governance & Fee Splitter */}
                  <div className="rounded-2xl bg-[#faf7f2] border border-[#e5dec9] p-4 flex flex-col justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-black text-sm text-[#231f20]">
                          <Gavel className="h-4 w-4 text-amber-700" />
                          <span>MEZO Governance &amp; 5-Stream Revenue Engine</span>
                        </span>
                        <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[9.5px] font-black">
                          MezoCityFeeSplitter + Governor
                        </Badge>
                      </div>
                      <p className="text-stone-700">
                        <strong>In plain English:</strong> Five on-chain fee
                        streams (credit interest spread 15%, clone HWM royalties
                        10%, Swap &amp; Earn pool fees, Guard rescue premiums
                        0.50%, and island SaaS mint fees) flow into{" "}
                        <code>MezoCityFeeSplitter.sol</code>.
                      </p>
                      <p className="text-stone-600">
                        <strong>Automated 50 / 30 / 20 Split:</strong> Every MUSD
                        collected routes <code>50%</code> to{" "}
                        <code>MainMEZOVault</code> stakers, <code>30%</code> to
                        Protocol Treasury / POL, and <code>20%</code> to the{" "}
                        <strong>First-Loss Bad-Debt Insurance Buffer</strong>—all
                        governed by timelocked <code>MezoCityGovernor</code>{" "}
                        votes.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateTab("governance")}
                      className="w-fit rounded-xl bg-white font-black text-[11px]"
                    >
                      <span>Open Governance &amp; Revenue</span>
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {/* 3. THE 5 AUTONOMOUS TRANSFORMERS */}
            {showSection("crew") && (
              <section className="space-y-2.5">
                <div>
                  <h3 className="font-black text-lg text-[#231f20] flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-[#7c3aed]" />
                    <span>
                      3. The 5 Autonomous Transformers (ERC-8004 on Gemini)
                    </span>
                  </h3>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Every cycle runs publicly across five specialized agents
                    registered in <code>AgentRegistry.sol</code>, with full
                    reasoning transcripts persisted to Neon Postgres and hashed
                    on-chain.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                  {[
                    {
                      badge: "ERC8004-MEZO #05 · gemini-2.5-flash-lite · 15% Vote",
                      name: "Soundwave — Macro & Bitcoin Regime Radar",
                      station: "Soundwave News Observatory",
                      desc: "Aggregates live BTC/USD PriceFeed, 24h high/low range position, Fear & Greed Index, and crypto headlines into structured regime signals before any capital moves.",
                    },
                    {
                      badge: "ERC8004-MEZO #01 · gemini-2.5-flash · 25% Vote",
                      name: "Optimus Prime — Head Orchestrator",
                      station: "Optimus Prime's Mezo Citadel",
                      desc: "Synthesizes Soundwave signals with the active Strategy Mandate (CONSERVATIVE / BALANCED / GROWTH) and issues the coordinated multi-protocol action verdict.",
                    },
                    {
                      badge: "ERC8004-MEZO #02 · gemini-2.5-flash · 25% Vote",
                      name: "Bumblebee — Capital & Earn Router",
                      station: "Bumblebee Capital & Earn Forge",
                      desc: "Executes bounded BTC Vault DCA slices during strength and pulls MUSD/BTC/MEZO from Main Vaults into canonical sMUSD, upMUSD, StabilityPool & Tigris LP Gauges.",
                    },
                    {
                      badge: "ERC8004-MEZO #03 · gemini-2.5-flash · 20% Vote",
                      name: "Ratchet — Self-Healing Error Rectifier",
                      station: "Ratchet Healer Lab",
                      desc: "Diagnoses reverted or oversized trades (e.g. MAX_TRADE_EXCEEDED) and repairs them autonomously via MezoDCAEngine.rectifyAndExecuteDCASlice().",
                    },
                    {
                      badge: "ERC8004-MEZO #04 · gemini-2.5-flash-lite · 15% Vote",
                      name: "Ironhide — PolicyGuard & 110% MCR Trove Sentinel",
                      station: "Ironhide Policy Fortress",
                      desc: "Calibrates PolicyVault drawdown/confidence caps for volatility regimes and runs the 6-step Repay-First Trove Guard defending borrower loans against 110% MCR liquidation.",
                    },
                  ].map((ag) => (
                    <div
                      key={ag.name}
                      className="rounded-xl bg-[#faf7f2] border border-[#e7dfd0] p-3.5 space-y-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-[10px] font-black text-[#7c3aed]">
                          {ag.badge}
                        </span>
                        <span className="text-[10px] font-bold text-stone-500">
                          {ag.station}
                        </span>
                      </div>
                      <div className="font-black text-[#231f20]">{ag.name}</div>
                      <p className="text-stone-600">{ag.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 4. SECURITY INVARIANTS & TRUST BOUNDARIES */}
            {showSection("security") && (
              <section className="space-y-3">
                <div>
                  <h3 className="font-black text-lg text-[#231f20] flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-rose-600" />
                    <span>
                      4. Security Invariants &amp; Non-Custodial Trust
                      Boundaries
                    </span>
                  </h3>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Why AI agents and external operators cannot drain funds,
                    forge Sub-Island profits, or bypass user guardrails (all
                    verified in Foundry&apos;s 16-test suite):
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 space-y-2">
                    <div className="font-black text-emerald-950 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      <span>Hard On-Chain Guarantees (Enforced in Solidity)</span>
                    </div>
                    <ul className="space-y-1.5 text-emerald-950/90 list-disc pl-4">
                      <li>
                        <strong>Anti-Spoof NAV (<code>IslandVault.sol</code>):</strong>{" "}
                        Only reads internal <code>trackedBtcBalance</code> &amp;{" "}
                        <code>trackedMusdBalance</code>—raw token transfers or{" "}
                        <code>selfdestruct</code> ETH/BTC injections cannot fake
                        profit.
                      </li>
                      <li>
                        <strong>No Loss-Washing:</strong> Partial withdrawals
                        scale <code>activeCostBasisUsd</code> proportionally so
                        underwater vaults cannot reset losses.
                      </li>
                      <li>
                        <strong>Virtual-Share Inflation Shield:</strong>{" "}
                        <code>MainMUSDVault</code> uses a <code>1e3</code>{" "}
                        share/asset offset plus <code>minHoldSeconds</code>{" "}
                        flash-withdrawal checks.
                      </li>
                      <li>
                        <strong>Hard Policy Caps (<code>PolicyVault</code>):</strong>{" "}
                        <code>maxSingleTradeBps</code>, daily drawdown caps, and
                        emergency kill-switch execute deterministically on-chain.
                      </li>
                      <li>
                        <strong>Exact ERC-20 Hygiene:</strong> Trove Guard
                        resets residual allowance to <code>0</code> and approves
                        only the exact computed rescue amount (never{" "}
                        <code>MaxUint256</code>).
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-2xl bg-rose-50/70 border border-rose-200 p-4 space-y-2">
                    <div className="font-black text-rose-950 flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-rose-700" />
                      <span>What AI Agents &amp; Operators Can NEVER Do</span>
                    </div>
                    <ul className="space-y-1.5 text-rose-950/90 list-disc pl-4">
                      <li>
                        <strong>Withdraw User Collateral:</strong>{" "}
                        <code>PolicyVault.withdraw()</code> and EIP-712 Guard
                        permits (<code>AddColl</code> / <code>RepayMUSD</code>)
                        cannot siphon borrower collateral or user deposits.
                      </li>
                      <li>
                        <strong>Approve Uncapped Loans (&gt; 500 MUSD):</strong>{" "}
                        <code>IslandCreditCouncil</code> rejects loans exceeding{" "}
                        <code>min(5x profit, 80% netEquity)</code>; large loans
                        above 500 MUSD require owner finalization.
                      </li>
                      <li>
                        <strong>Flash-Loan Governance or Staking Votes:</strong>{" "}
                        <code>MainMEZOVault</code> enforces a 60s hold window (
                        <code>coordinationPowerOf() == 0</code> right after
                        stake), and <code>MezoCityGovernor</code> uses a
                        timelock + guardian cancel.
                      </li>
                      <li>
                        <strong>Expose BYOK Gemini Keys:</strong> Sub-Island keys
                        require EIP-191 nonce signatures, are encrypted with{" "}
                        <code>AES-256-GCM</code>, and never leave server routes.
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {/* 5. DEPLOYED CONTRACTS & VERIFIED LIVE POST-DEPLOY TX PROOFS */}
            {showSection("contracts") && (
              <section className="space-y-4">
                <div>
                  <h3 className="font-black text-lg text-[#231f20] flex items-center gap-2">
                    <Activity className="h-5 w-5 text-emerald-700" />
                    <span>
                      5. 11 Blockscout-Verified Contracts &amp; Live Transaction
                      Proofs
                    </span>
                  </h3>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Every custom contract and canonical Mezo integration is
                    source-verified on Mezo Testnet (31611) with real
                    non-deployment transactions below.
                  </p>
                </div>

                {/* Address Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                  {[
                    {
                      label: "AgentRegistry (ERC-8004)",
                      addr: contractAddresses.agentRegistry,
                    },
                    {
                      label: "PolicyVault (BTC Guardrails)",
                      addr: contractAddresses.policyVault,
                    },
                    {
                      label: "MezoDCAEngine (DCA + Rectifier)",
                      addr: contractAddresses.dcaEngine,
                    },
                    {
                      label: "MainMUSDVault (LP Lending Pool)",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault,
                    },
                    {
                      label: "MainMEZOVault (MEZO Lock & MUSD Yield)",
                      addr: MAIN_MEZO_VAULT_ADDRESS,
                    },
                    {
                      label: "MezoCityFeeSplitter (50/30/20 Router)",
                      addr: MEZO_FEE_SPLITTER_ADDRESS,
                    },
                    {
                      label: "MezoCityGovernor (Timelocked Voting)",
                      addr: MEZO_GOVERNOR_ADDRESS,
                    },
                    {
                      label: "IslandFactory (CREATE2 Clones)",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.islandFactory,
                    },
                    {
                      label: "IslandVault (EIP-1167 Logic Impl)",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.islandVaultImpl,
                    },
                    {
                      label: "IslandCreditCouncil (Underwriting)",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil,
                    },
                    {
                      label: "MezoTestnetSwapPool (Oracle AMM)",
                      addr: ISLAND_ECOSYSTEM_ADDRESSES.mezoSwapPool,
                    },
                    {
                      label: "MUSD Token (Canonical)",
                      addr: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
                    },
                    {
                      label: "MEZO & veBTC Tokens",
                      addr: MEZO_TESTNET_LENDING_ADDRESSES.mezoToken,
                    },
                    {
                      label: "BorrowerOperations & TroveManager",
                      addr: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
                    },
                    {
                      label: "Tigris Router & sMUSD Vault",
                      addr: MEZO_EARN_ADDRESSES.tigrisRouter,
                    },
                  ]
                    .filter((c) => Boolean(c.addr))
                    .map((c) => (
                      <div
                        key={c.label}
                        className="flex items-center justify-between gap-2 rounded-xl bg-[#f8f5f0] border border-[#e7dfd0] px-3 py-2"
                      >
                        <strong className="font-sans text-[#231f20] truncate">
                          {c.label}
                        </strong>
                        <a
                          href={`${EXPLORER}/address/${c.addr}?tab=contract`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#7c3aed] hover:underline inline-flex items-center gap-1 shrink-0"
                        >
                          {shortenHex(c.addr, 6)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                </div>

                {/* Verified Post-Deployment Transactions Table */}
                <div className="rounded-2xl border border-[#e5dec9] bg-[#faf7f2] overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#efe8da] border-b border-[#e0d7c3] flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-[#231f20]">
                      Verified Post-Deployment Interaction Proofs (
                      <code>status: ok</code>)
                    </span>
                    <span className="text-[11px] font-bold text-stone-600">
                      Non-deployment agent, user &amp; vault transactions on
                      Chain 31611
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/70 text-[10.5px] uppercase tracking-wider text-stone-500">
                        <tr>
                          <th className="px-3.5 py-2 font-black">Contract</th>
                          <th className="px-3.5 py-2 font-black">Txs</th>
                          <th className="px-3.5 py-2 font-black">Method</th>
                          <th className="px-3.5 py-2 font-black">Block</th>
                          <th className="px-3.5 py-2 font-black">
                            Tx Hash Proof
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ece4d4]">
                        {LIVE_TX_PROOFS.map((row) => (
                          <tr
                            key={row.txHash}
                            className="hover:bg-white/80 transition-colors"
                          >
                            <td className="px-3.5 py-2 font-black text-[#231f20] whitespace-nowrap">
                              {row.contract}
                            </td>
                            <td className="px-3.5 py-2 font-mono font-bold text-emerald-800">
                              {row.nonDeployCount}
                            </td>
                            <td className="px-3.5 py-2">
                              <div className="font-mono font-bold text-[#231f20]">
                                {row.method}
                              </div>
                              <div className="text-[10.5px] text-stone-600">
                                {row.note}
                              </div>
                            </td>
                            <td className="px-3.5 py-2 font-mono text-stone-600">
                              {row.block}
                            </td>
                            <td className="px-3.5 py-2 font-mono whitespace-nowrap">
                              <a
                                href={`${EXPLORER}/tx/${row.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#7c3aed] font-bold hover:underline"
                              >
                                {shortenHex(row.txHash, 6)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2.5 bg-white/80 border-t border-[#ece4d4] text-[11px] text-stone-600 space-y-1">
                    <div>
                      <strong>Sub-Island Clones &amp; Pending Contracts:</strong>{" "}
                      <code>IslandVault</code> (<code>0x2744...E45D</code>) is
                      the EIP-1167 template; live clones{" "}
                      <a
                        href={`${EXPLORER}/address/0x3713e158FAF686C0EAddA05c1114DACdCAC3BD0B`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[#7c3aed] underline"
                      >
                        0x3713...BD0B
                      </a>{" "}
                      (&ldquo;Maya&rdquo;) and{" "}
                      <a
                        href={`${EXPLORER}/address/0x9AF8078b3cCE2B3F33a0eE5bD398Ea267801E885`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[#7c3aed] underline"
                      >
                        0x9AF8...E885
                      </a>{" "}
                      (&ldquo;stark&rdquo;) were initialized inside{" "}
                      <code>createIsland</code>.{" "}
                      <code>MezoTestnetSwapPool</code>,{" "}
                      <code>IslandCreditCouncil</code>, and{" "}
                      <code>MezoCityGovernor</code> are deployed, verified, and
                      wired (<code>setCreditCouncil</code> /{" "}
                      <code>setGovernance</code>), awaiting their first user
                      swap, loan application, or governance proposal.
                    </div>
                  </div>
                </div>

                {/* MCP JSON-RPC & A2A Developer Quick Reference */}
                <div className="rounded-2xl bg-[#181520] text-slate-100 p-4 space-y-2.5 border border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-emerald-400" />
                      <span className="text-xs font-black">
                        Open Agent Interoperability: MCP JSON-RPC (
                        <code>/api/mcp</code>) &amp; Google A2A (
                        <code>/.well-known/agent-card.json</code>)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCopyCurl}
                        className="h-7 rounded-lg bg-white/10 hover:bg-white/20 border-white/20 text-white text-[11px] font-bold"
                      >
                        {copiedCurl ? (
                          <>
                            <Check className="h-3 w-3 mr-1 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            Copy cURL
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onNavigateTab("contracts")}
                        className="h-7 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-[11px] font-black"
                      >
                        Test /mcp Live
                      </Button>
                    </div>
                  </div>
                  <pre className="rounded-xl bg-black/50 p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto leading-relaxed">
                    {MCP_CURL_EXAMPLE}
                  </pre>
                </div>
              </section>
            )}

            {/* 6. INTERACTIVE JUDGE DEMO WALKTHROUGH */}
            {showSection("walkthrough") && (
              <section className="space-y-2.5">
                <div>
                  <h3 className="font-black text-lg text-[#231f20] flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-600" />
                    <span>
                      6. Interactive Walkthrough — Jump Directly Into Any Step
                    </span>
                  </h3>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Follow this sequence to inspect every autonomous agent flow,
                    on-chain vault, and revenue flywheel live in the UI:
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                  {[
                    {
                      tab: "island" as const,
                      step: "Step 1 · 3D Citadel & Council",
                      desc: "Click Soundwave or trigger Run Now in the right panel, then click Bigger for the full-screen Council transcript reader.",
                      cta: "Open 3D Island",
                    },
                    {
                      tab: "dca" as const,
                      step: "Step 2 · BTC Vault & Self-Heal",
                      desc: "Switch to Pro Details to inspect PolicyVault guardrails, Ratchet self-healing rectifications, and Explorer tx proofs.",
                      cta: "Open BTC Vault",
                    },
                    {
                      tab: "musd-vault" as const,
                      step: "Step 3 · MUSD & Earn Router",
                      desc: "Inspect Simple Earn (sMUSD, upMUSD, StabilityPool), Tigris Pools, and MainMUSDVault ERC-4626 LP credit reserves.",
                      cta: "Open MUSD & Earn",
                    },
                    {
                      tab: "lending" as const,
                      step: "Step 4 · Mezo Guard (110% MCR)",
                      desc: "Switch to Simulator & Logs to drag BTC crash scenarios and test the 2/2 finalized observation Repay-First rescue flow.",
                      cta: "Open Mezo Guard",
                    },
                    {
                      tab: "leaderboard" as const,
                      step: "Step 5 · Sub-Islands & Cloning",
                      desc: "Compare verified Sub-Island ROI, veBTC / MEZO tier boosts, and clone or inspect any EIP-1167 Sub-Island workspace.",
                      cta: "Open Leaderboard",
                    },
                    {
                      tab: "governance" as const,
                      step: "Step 6 · Governance & Revenue",
                      desc: "Model all 5 MUSD fee streams on the City Cashflow Simulator and test timelocked MezoCityGovernor proposals & votes.",
                      cta: "Open Governance",
                    },
                  ].map((j) => (
                    <div
                      key={j.step}
                      className="rounded-xl bg-gradient-to-br from-[#faf7f2] to-[#f1e9da] border border-[#e3d9c6] p-3.5 flex flex-col justify-between gap-2.5"
                    >
                      <div>
                        <div className="font-black text-[#7c3aed]">{j.step}</div>
                        <p className="text-stone-700 mt-1 leading-relaxed">
                          {j.desc}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onNavigateTab(j.tab)}
                        className="w-full rounded-lg bg-white font-black text-[11px]"
                      >
                        {j.cta}
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
