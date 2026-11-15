"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  Coins,
  ExternalLink,
  Flame,
  Gavel,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Sliders,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Vote,
  Wallet,
} from "lucide-react";
import { encodeFunctionData, parseEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GovernanceApiResponse } from "@/app/api/governance/route";
import {
  MAIN_MEZO_VAULT_ADDRESS,
  MEZO_FEE_SPLITTER_ABI,
  MEZO_FEE_SPLITTER_ADDRESS,
  MEZO_GOVERNOR_ABI,
  MEZO_GOVERNOR_ADDRESS,
  extractEvmRevertReason,
  mezoTestnet,
} from "@/lib/mezo-chain";
import { shortenHex } from "@/lib/utils";

const EXPLORER = "https://explorer.test.mezo.org";

interface GovernanceTreasuryPanelProps {
  onOpenMezoVault?: () => void;
  onOpenMusdEarn?: () => void;
  onOpenLeaderboard?: () => void;
  onEnterIsland?: (islandId: string) => void;
}

const FEE_SPLIT_UPDATE_ABI = [
  {
    type: "function",
    name: "setFeeSplitBps",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_mezoStakersBps", type: "uint16" },
      { name: "_treasuryBps", type: "uint16" },
      { name: "_insuranceBps", type: "uint16" },
    ],
    outputs: [],
  },
] as const;

const MUSD_GUARDRAILS_ABI = [
  {
    type: "function",
    name: "updateGuardrails",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_minLiquidReserveBps", type: "uint16" },
      { name: "_maxSingleLoanBps", type: "uint16" },
      { name: "_dailyAutoDisburseCapMusd", type: "uint256" },
      { name: "_minHoldSeconds", type: "uint32" },
      { name: "_emergencyPause", type: "bool" },
    ],
    outputs: [],
  },
] as const;

const SWAP_POOL_PARAM_ABI = [
  {
    type: "function",
    name: "setPoolParameters",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_feeBps", type: "uint16" },
      { name: "_oracleTiltBps", type: "int16" },
    ],
    outputs: [],
  },
] as const;

function formatCountdownSeconds(secs: number): string {
  if (secs <= 0) return "Ended";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.max(1, Math.floor((secs % 3600) / 60));
  return `${h}h ${m}m`;
}

export function GovernanceTreasuryPanel({
  onOpenMezoVault,
  onOpenMusdEarn,
  onOpenLeaderboard,
  onEnterIsland,
}: GovernanceTreasuryPanelProps) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [proMode, setProMode] = useState(false);
  const [data, setData] = useState<GovernanceApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
    txHash?: string;
  } | null>(null);

  // New proposal composer state
  const [showNewProposal, setShowNewProposal] = useState(false);
  const [proposalPreset, setProposalPreset] = useState<
    "split_60_25_15" | "musd_cap_up" | "swap_fee_15bps" | "custom_signal"
  >("split_60_25_15");
  const [proposalTitle, setProposalTitle] = useState(
    "Boost MEZO Staker Revenue Share to 60%"
  );
  const [proposalSummary, setProposalSummary] = useState(
    "Route 60% of MezoCity MUSD fees to MainMEZOVault stakers, 25% to Protocol Treasury & POL, and 15% to Bad-Debt Insurance."
  );

  // Interactive revenue estimator sliders
  const [estMonthlyInterestUsd, setEstMonthlyInterestUsd] = useState(2500);
  const [estMonthlySwapVolUsd, setEstMonthlySwapVolUsd] = useState(250000);
  const [estMonthlyGuardRescues, setEstMonthlyGuardRescues] = useState(40);
  const [estMonthlyNewIslands, setEstMonthlyNewIslands] = useState(60);

  // Operator test collection state (Pro Mode)
  const [collectStreamId, setCollectStreamId] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [collectAmountInput, setCollectAmountInput] = useState("10");

  const fetchGovernanceState = useCallback(async () => {
    try {
      const qs = address ? `?user=${encodeURIComponent(address)}` : "";
      const res = await fetch(`/api/governance${qs}`, { cache: "no-store" });
      const json = (await res.json()) as GovernanceApiResponse;
      if (json.ok) {
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch governance state:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchGovernanceState();
  }, [fetchGovernanceState]);

  const applyPreset = (
    preset: "split_60_25_15" | "musd_cap_up" | "swap_fee_15bps" | "custom_signal"
  ) => {
    setProposalPreset(preset);
    if (preset === "split_60_25_15") {
      setProposalTitle("Boost MEZO Staker Revenue Share to 60%");
      setProposalSummary(
        "Update MezoCityFeeSplitter splits to 60% MainMEZOVault Stakers / 25% Protocol Treasury / 15% Bad-Debt Insurance."
      );
    } else if (preset === "musd_cap_up") {
      setProposalTitle("Increase Sub-Island Daily Auto-Disburse Cap to 3,500 MUSD");
      setProposalSummary(
        "Raise MainMUSDVault dailyAutoDisburseCapMusd to 3,500 MUSD while preserving the 25% liquid reserve floor."
      );
    } else if (preset === "swap_fee_15bps") {
      setProposalTitle("Tune MezoTestnetSwapPool Fee to 15 bps (0.15%)");
      setProposalSummary(
        "Increase swap pool fee from 10 bps to 15 bps so more BTC <-> MUSD routing volume feeds MainMEZOVault MUSD yield."
      );
    } else {
      setProposalTitle("Enable Automated Guard Reserve Subsidy for Citadel Council");
      setProposalSummary(
        "Signal mandate to prioritize Mezo Guard gas coverage and featured placement for 500+ MEZO endorsed islands."
      );
    }
  };

  const ensureMezoChain = async () => {
    if (!isConnected || !address) {
      throw new Error("Connect your wallet on Mezo Testnet (31611) first.");
    }
    if (chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (!address) {
      setNotice({ type: "error", text: "Connect your wallet first." });
      return;
    }
    if (!proposalTitle.trim()) {
      setNotice({ type: "error", text: "Proposal title is required." });
      return;
    }

    const c = data?.contracts;
    let category = 6;
    let targetAddr: `0x${string}` =
      (MEZO_FEE_SPLITTER_ADDRESS ||
        MAIN_MEZO_VAULT_ADDRESS ||
        "0x0000000000000000000000000000000000000001") as `0x${string}`;
    let encodedCall: `0x${string}` = "0x";
    let previewStr = "SIGNAL_MANDATE";

    if (proposalPreset === "split_60_25_15" && c?.feeSplitter) {
      category = 0;
      targetAddr = c.feeSplitter as `0x${string}`;
      encodedCall = encodeFunctionData({
        abi: FEE_SPLIT_UPDATE_ABI,
        functionName: "setFeeSplitBps",
        args: [6000, 2500, 1500],
      });
      previewStr = "FeeSplitter.setFeeSplitBps(6000, 2500, 1500)";
    } else if (proposalPreset === "musd_cap_up" && c?.mainMusdVault) {
      category = 1;
      targetAddr = c.mainMusdVault as `0x${string}`;
      encodedCall = encodeFunctionData({
        abi: MUSD_GUARDRAILS_ABI,
        functionName: "updateGuardrails",
        args: [2500, 2500, parseEther("3500"), 60, false],
      });
      previewStr = "MainMUSDVault.updateGuardrails(2500, 2500, 3500e18, 60, false)";
    } else if (proposalPreset === "swap_fee_15bps" && c?.mezoSwapPool) {
      category = 3;
      targetAddr = c.mezoSwapPool as `0x${string}`;
      encodedCall = encodeFunctionData({
        abi: SWAP_POOL_PARAM_ABI,
        functionName: "setPoolParameters",
        args: [15, 0],
      });
      previewStr = "MezoTestnetSwapPool.setPoolParameters(15, 0)";
    }

    setBusyAction("PROPOSE");
    try {
      let txHash = "";
      if (MEZO_GOVERNOR_ADDRESS && publicClient) {
        await ensureMezoChain();
        const hash = await writeContractAsync({
          address: MEZO_GOVERNOR_ADDRESS,
          abi: MEZO_GOVERNOR_ABI,
          functionName: "createProposal",
          args: [
            category,
            targetAddr,
            0n,
            encodedCall,
            proposalTitle.trim(),
            proposalSummary.trim(),
          ],
          chainId: mezoTestnet.id,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        txHash = hash;
      } else {
        const res = await fetch("/api/governance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_proposal",
            proposerAddress: address,
            category,
            title: proposalTitle.trim(),
            summary: proposalSummary.trim(),
            targetContract: targetAddr,
            calldataPreview: previewStr,
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Failed to save draft proposal.");
      }

      setNotice({
        type: "success",
        text: txHash
          ? "Submitted on-chain proposal to MezoCityGovernor."
          : "Published Citadel Governance Proposal Draft (on-chain execution activates when NEXT_PUBLIC_MEZO_GOVERNOR_ADDRESS is set).",
        txHash: txHash || undefined,
      });
      setShowNewProposal(false);
      await fetchGovernanceState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleOnChainVote = async (proposalId: number, support: 0 | 1 | 2) => {
    setNotice(null);
    if (!MEZO_GOVERNOR_ADDRESS) return;
    setBusyAction(`VOTE_CHAIN_${proposalId}_${support}`);
    try {
      await ensureMezoChain();
      const hash = await writeContractAsync({
        address: MEZO_GOVERNOR_ADDRESS,
        abi: MEZO_GOVERNOR_ABI,
        functionName: "castVote",
        args: [BigInt(proposalId), support],
        chainId: mezoTestnet.id,
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setNotice({
        type: "success",
        text: `Cast on-chain ${support === 1 ? "FOR" : support === 0 ? "AGAINST" : "ABSTAIN"} vote on Proposal #${proposalId}.`,
        txHash: hash,
      });
      await fetchGovernanceState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleOnChainProposalStep = async (
    proposalId: number,
    step: "queue" | "execute"
  ) => {
    setNotice(null);
    if (!MEZO_GOVERNOR_ADDRESS) return;
    setBusyAction(`${step.toUpperCase()}_${proposalId}`);
    try {
      await ensureMezoChain();
      const hash = await writeContractAsync({
        address: MEZO_GOVERNOR_ADDRESS,
        abi: MEZO_GOVERNOR_ABI,
        functionName: step === "queue" ? "queueProposal" : "executeProposal",
        args: [BigInt(proposalId)],
        chainId: mezoTestnet.id,
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setNotice({
        type: "success",
        text: `Proposal #${proposalId} ${step === "queue" ? "queued in timelock" : "executed on-chain"}.`,
        txHash: hash,
      });
      await fetchGovernanceState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleDraftVote = async (proposalId: string, support: 0 | 1 | 2) => {
    setNotice(null);
    if (!address) {
      setNotice({ type: "error", text: "Connect your wallet to vote." });
      return;
    }
    setBusyAction(`VOTE_DRAFT_${proposalId}`);
    try {
      const res = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cast_vote",
          proposalId,
          voterAddress: address,
          support,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to record vote.");
      setNotice({
        type: "success",
        text: `Recorded ${support === 1 ? "FOR" : support === 0 ? "AGAINST" : "ABSTAIN"} vote (+${json.weight} MEZO weight).`,
      });
      await fetchGovernanceState();
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyAction("");
    }
  };

  const handleEndorseIsland = async (islandId: string, chainIslandId: number) => {
    setNotice(null);
    if (!address) {
      setNotice({ type: "error", text: "Connect your wallet to endorse a Sub-Island." });
      return;
    }
    setBusyAction(`ENDORSE_${islandId}`);
    try {
      let txHash = "";
      if (MEZO_GOVERNOR_ADDRESS && chainIslandId > 0) {
        await ensureMezoChain();
        const hash = await writeContractAsync({
          address: MEZO_GOVERNOR_ADDRESS,
          abi: MEZO_GOVERNOR_ABI,
          functionName: "endorseIsland",
          args: [BigInt(chainIslandId)],
          chainId: mezoTestnet.id,
        });
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }
        txHash = hash;
      }

      const res = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "endorse_island",
          voterAddress: address,
          islandId,
          txHash,
        }),
      });
      const json = await res.json();
      if (!json.ok && !txHash) {
        throw new Error(json.error || "Failed to update endorsement.");
      }

      setNotice({
        type: "success",
        text: islandId
          ? `Pledged your MEZO Citizen Endorsement to ${islandId}.`
          : "Cleared Sub-Island Citizen Endorsement.",
        txHash: txHash || undefined,
      });
      await fetchGovernanceState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleFlushStakerRewards = async () => {
    setNotice(null);
    if (!MEZO_FEE_SPLITTER_ADDRESS) return;
    setBusyAction("FLUSH");
    try {
      await ensureMezoChain();
      const hash = await writeContractAsync({
        address: MEZO_FEE_SPLITTER_ADDRESS,
        abi: MEZO_FEE_SPLITTER_ABI,
        functionName: "flushPendingStakerRewards",
        args: [],
        chainId: mezoTestnet.id,
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setNotice({
        type: "success",
        text: "Flushed buffered MUSD rewards into MainMEZOVault for active stakers.",
        txHash: hash,
      });
      await fetchGovernanceState();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyAction("");
    }
  };

  const handleOperatorCollectRevenue = async () => {
    setNotice(null);
    const amt = Number(collectAmountInput || "0");
    if (!Number.isFinite(amt) || amt <= 0) {
      setNotice({ type: "error", text: "Enter a positive MUSD amount." });
      return;
    }
    setBusyAction("COLLECT_REV");
    try {
      const res = await fetch("/api/governance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "collect_revenue",
          streamId: collectStreamId,
          musdAmount: amt,
          memo: `OPERATOR_STREAM_${collectStreamId}`,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to route revenue.");
      setNotice({
        type: "success",
        text: `Routed ${amt} MUSD through MezoCityFeeSplitter (50% MEZO Stakers / 30% Treasury / 20% Insurance).`,
        txHash: json.txHash,
      });
      await fetchGovernanceState();
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyAction("");
    }
  };

  const rev = data?.revenue;
  const gov = data?.governance;
  const us = data?.userState;
  const contracts = data?.contracts;

  const stakersPct = ((rev?.mezoStakersBps ?? 5000) / 100).toFixed(0);
  const treasuryPct = ((rev?.treasuryBps ?? 3000) / 100).toFixed(0);
  const insurancePct = ((rev?.insuranceBps ?? 2000) / 100).toFixed(0);

  // Simulated monthly projection across all MezoCity revenue streams
  const projectedMonthly = useMemo(() => {
    const creditCut = estMonthlyInterestUsd * 0.15;
    const swapCut = estMonthlySwapVolUsd * 0.0005; // 5 bps
    const guardCut = estMonthlyGuardRescues * 7.5; // Avg 0.5% on ~$1,500 Trove action
    const mintSaasCut = estMonthlyNewIslands * 3.5; // Net blended launch + keeper SaaS after MEZO discounts
    const total = creditCut + swapCut + guardCut + mintSaasCut;
    const stakerShare = (total * (rev?.mezoStakersBps ?? 5000)) / 10_000;
    const treasuryShare = (total * (rev?.treasuryBps ?? 3000)) / 10_000;
    const insuranceShare = (total * (rev?.insuranceBps ?? 2000)) / 10_000;
    return { total, stakerShare, treasuryShare, insuranceShare };
  }, [
    estMonthlyInterestUsd,
    estMonthlySwapVolUsd,
    estMonthlyGuardRescues,
    estMonthlyNewIslands,
    rev?.mezoStakersBps,
    rev?.treasuryBps,
    rev?.insuranceBps,
  ]);

  return (
    <div className="space-y-5">
      {/* Hero Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border-2 border-white bg-gradient-to-r from-[#1c1917] via-[#2e1065] to-[#1e1b4b] px-6 py-5 text-white shadow-xl">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-300">
            <Gavel className="h-3.5 w-3.5" />
            <span>MEZO Citadel Governance &amp; City Revenue</span>
            {us?.profile?.tier && (
              <Badge className="bg-white/15 text-white border border-white/25 text-[10px]">
                {us.profile.tier.label} ·{" "}
                {(us.onChainVotingPower || 0).toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}{" "}
                Vote Weight
              </Badge>
            )}
          </div>
          <h2 className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight">
            {proMode
              ? "MezoCityGovernor + MezoCityFeeSplitter Architecture"
              : "Govern MezoCity with MEZO & Share Real MUSD Revenue"}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-indigo-100/90 leading-relaxed">
            {proMode
              ? "Flash-loan-resistant governance backed by MainMEZOVault coordinationPowerOf(), timelocked parameter execution, Citizen Endorsement gauges, and 5-stream MUSD fee splitting."
              : "Staked MEZO powers island rule votes, endorses winning Sub-Islands on the Leaderboard, and earns 50% of protocol MUSD fees."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenMezoVault && (
            <Button
              onClick={onOpenMezoVault}
              variant="secondary"
              className="rounded-xl font-extrabold bg-violet-100 text-violet-950 hover:bg-white"
            >
              <Coins className="h-4 w-4 mr-1.5 text-violet-700" />
              Stake MEZO
            </Button>
          )}
          <div className="inline-flex items-center rounded-xl bg-white/10 p-1 border border-white/15">
            <button
              type="button"
              onClick={() => setProMode(false)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-black transition-all ${
                !proMode
                  ? "bg-white text-[#1c1917] shadow-sm"
                  : "text-indigo-100 hover:text-white"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setProMode(true)}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-black transition-all ${
                proMode
                  ? "bg-white text-[#1c1917] shadow-sm"
                  : "text-indigo-100 hover:text-white"
              }`}
            >
              <Sliders className="h-3 w-3" />
              Pro Details
            </button>
          </div>

          <Button
            onClick={fetchGovernanceState}
            variant="secondary"
            disabled={loading}
            className="rounded-xl font-extrabold bg-white/95 text-[#1c1917] hover:bg-white"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Deployment Notice */}
      {contracts && (!contracts.governorDeployed || !contracts.feeSplitterDeployed) && (
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 px-4 py-3 text-xs text-amber-950 flex items-start gap-2.5 shadow-sm">
          <Shield className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-black">
              Governance Contracts Ready to Deploy — Running Live Telemetry &amp; Citadel Draft Mode
            </div>
            <p className="text-[11px] mt-0.5 leading-relaxed">
              Your live <code className="font-mono">MEZO</code> / <code className="font-mono">veMEZO</code> voting power is calculated on-chain right now. Broadcast{" "}
              <code className="font-mono bg-amber-100 px-1 rounded">
                DeployGovernanceAndRevenue.s.sol
              </code>{" "}
              on Mezo Testnet (31611) and populate{" "}
              <code className="font-mono">NEXT_PUBLIC_MEZO_FEE_SPLITTER_ADDRESS</code> &amp;{" "}
              <code className="font-mono">NEXT_PUBLIC_MEZO_GOVERNOR_ADDRESS</code> to execute trustless timelocked proposals and auto-routed MUSD fees on-chain.
            </p>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`rounded-2xl border-2 px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 ${
            notice.type === "error"
              ? "bg-rose-50 border-rose-300 text-rose-900"
              : notice.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                : "bg-indigo-50 border-indigo-300 text-indigo-950"
          }`}
        >
          <span>{notice.text}</span>
          {notice.txHash && (
            <a
              href={`${EXPLORER}/tx/${notice.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline shrink-0"
            >
              <span>{shortenHex(notice.txHash, 6)}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Top KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="bg-white/95 border-white shadow-md">
          <CardContent className="pt-4 pb-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <Vote className="h-3.5 w-3.5 text-violet-600" />
              <span>Your Voting Power</span>
            </div>
            <div className="text-2xl font-black text-[#231f20] tabular-nums">
              {(us?.onChainVotingPower ?? 0).toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}{" "}
              <span className="text-xs font-bold text-violet-700">MEZO pts</span>
            </div>
            <div className="text-[11px] font-bold text-stone-600">
              {(us?.onChainVotingPower ?? 0) >= (gov?.proposalThresholdPower ?? 50)
                ? "Eligible to create & vote on proposals"
                : `Need ${(gov?.proposalThresholdPower ?? 50).toFixed(0)} pts to propose (vote at >0)`}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/95 border-white shadow-md">
          <CardContent className="pt-4 pb-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <Coins className="h-3.5 w-3.5 text-emerald-600" />
              <span>Total City MUSD Fees</span>
            </div>
            <div className="text-2xl font-black text-emerald-700 tabular-nums">
              ${(rev?.totalCollectedMusd ?? 0).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-[11px] font-bold text-stone-600">
              Routed: {stakersPct}% Stakers · {treasuryPct}% Treasury · {insurancePct}% Insurance
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/95 border-white shadow-md">
          <CardContent className="pt-4 pb-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-amber-600" />
              <span>Bad-Debt Insurance Shield</span>
            </div>
            <div className="text-2xl font-black text-[#231f20] tabular-nums">
              ${(rev?.insuranceReserveBalanceMusd ?? 0).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-[11px] font-bold text-stone-600">
              First-loss MUSD buffer protecting LP depositors
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/95 border-white shadow-md">
          <CardContent className="pt-4 pb-4 space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
              <span>Governance Proposals</span>
            </div>
            <div className="text-2xl font-black text-[#231f20] tabular-nums">
              {(gov?.onChainProposals.length ?? 0) + (gov?.draftProposals.length ?? 0)}
            </div>
            <div className="text-[11px] font-bold text-stone-600">
              Quorum: {(gov?.quorumPower ?? 100).toFixed(0)} pts · Timelock:{" "}
              {Math.round((gov?.executionDelaySeconds ?? 3600) / 60)}m
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 1: REVENUE MODEL & FEESPLITTER FLOW */}
      <Card className="bg-white/95 border-white shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-black flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-600" />
                <span>MezoCity Revenue Engine (6 Self-Sustaining MUSD Streams)</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Every fee stream sweeps real MUSD through <code className="font-mono">MezoCityFeeSplitter.sol</code> straight into{" "}
                <code className="font-mono">MainMEZOVault.notifyRewardMusd()</code>, Protocol Treasury / POL, and the LP Bad-Debt Insurance Buffer.
              </CardDescription>
            </div>
            {(rev?.pendingStakerRewardsMusd ?? 0) > 0 && contracts?.feeSplitterDeployed && (
              <Button
                size="sm"
                onClick={handleFlushStakerRewards}
                disabled={busyAction === "FLUSH"}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs"
              >
                {busyAction === "FLUSH" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Flame className="h-3.5 w-3.5 mr-1.5" />
                )}
                Flush ${rev?.pendingStakerRewardsMusd.toFixed(2)} to Stakers
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Active Split Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-extrabold text-stone-700">
              <span>Live Protocol Split Rule (Governed by MEZO)</span>
              <span>
                {stakersPct}% MEZO Stakers · {treasuryPct}% Treasury &amp; POL · {insurancePct}% Bad-Debt Insurance
              </span>
            </div>
            <div className="h-3.5 w-full rounded-full overflow-hidden flex border border-stone-200 shadow-inner">
              <div
                className="bg-gradient-to-r from-violet-600 to-indigo-600 h-full transition-all"
                style={{ width: `${stakersPct}%` }}
                title={`MEZO Stakers: ${stakersPct}%`}
              />
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{ width: `${treasuryPct}%` }}
                title={`Protocol Treasury & POL: ${treasuryPct}%`}
              />
              <div
                className="bg-amber-400 h-full transition-all"
                style={{ width: `${insurancePct}%` }}
                title={`Bad-Debt Insurance: ${insurancePct}%`}
              />
            </div>
          </div>

          {/* 6 Revenue Streams Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(rev?.streamTotals ?? []).map((s) => (
              <div
                key={s.streamId}
                className="rounded-2xl bg-[#faf7f2] border border-[#e7dfd0] p-3.5 flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge className="bg-violet-100 text-violet-900 border border-violet-200 text-[10px] font-black">
                      Stream #{s.streamId + 1}
                    </Badge>
                    <span className="font-mono text-xs font-black text-emerald-700">
                      ${(s.onChainMusd + s.ledgerMusd).toFixed(2)}
                    </span>
                  </div>
                  <div className="font-black text-sm text-[#231f20] mt-1.5">
                    {s.name}
                  </div>
                  <div className="text-[11px] font-extrabold text-violet-700 mt-0.5">
                    {s.suggestedRate}
                  </div>
                  <p className="text-[11px] text-stone-600 mt-1.5 leading-relaxed">
                    {s.description}
                  </p>
                </div>
              </div>
            ))}

            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-3.5 flex flex-col justify-between gap-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Badge className="bg-emerald-600 text-white text-[10px] font-black">
                    Stream #6 · POL
                  </Badge>
                  {onOpenMusdEarn && (
                    <button
                      type="button"
                      onClick={onOpenMusdEarn}
                      className="text-[10.5px] font-black text-emerald-800 hover:underline"
                    >
                      Open Earn Pools →
                    </button>
                  )}
                </div>
                <div className="font-black text-sm text-[#231f20] mt-1.5">
                  Protocol-Owned Liquidity (POL)
                </div>
                <div className="text-[11px] font-extrabold text-emerald-800 mt-0.5">
                  Treasury MUSD deployed into sMUSD, upMUSD &amp; Tigris LP
                </div>
                <p className="text-[11px] text-stone-700 mt-1.5 leading-relaxed">
                  Treasury reserves compound passively across canonical Mezo Earn savings vaults and vAMM-MUSD/BTC liquidity.
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Monthly Revenue Simulator */}
          <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-black text-[#231f20]">
                  City Cashflow &amp; Staker Yield Simulator
                </div>
                <div className="text-[11px] text-stone-600">
                  Drag monthly city activity sliders to model real MUSD cashflow across all three recipients.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                <span className="rounded-xl bg-white border border-stone-200 px-3 py-1.5 text-[#231f20]">
                  Total: ${projectedMonthly.total.toFixed(0)}/mo
                </span>
                <span className="rounded-xl bg-violet-100 border border-violet-200 px-3 py-1.5 text-violet-950">
                  MEZO Stakers: ${projectedMonthly.stakerShare.toFixed(0)}/mo
                </span>
                <span className="rounded-xl bg-amber-100 border border-amber-200 px-3 py-1.5 text-amber-950">
                  Insurance: ${projectedMonthly.insuranceShare.toFixed(0)}/mo
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
              <label className="space-y-1">
                <div className="flex justify-between font-bold text-stone-700">
                  <span>Loan Interest / mo</span>
                  <span>${estMonthlyInterestUsd.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={25000}
                  step={500}
                  value={estMonthlyInterestUsd}
                  onChange={(e) => setEstMonthlyInterestUsd(Number(e.target.value))}
                  className="w-full accent-violet-600"
                />
              </label>
              <label className="space-y-1">
                <div className="flex justify-between font-bold text-stone-700">
                  <span>Swap &amp; Earn Vol / mo</span>
                  <span>${estMonthlySwapVolUsd.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={25000}
                  max={2000000}
                  step={25000}
                  value={estMonthlySwapVolUsd}
                  onChange={(e) => setEstMonthlySwapVolUsd(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </label>
              <label className="space-y-1">
                <div className="flex justify-between font-bold text-stone-700">
                  <span>Trove Rescues / mo</span>
                  <span>{estMonthlyGuardRescues}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={300}
                  step={5}
                  value={estMonthlyGuardRescues}
                  onChange={(e) => setEstMonthlyGuardRescues(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </label>
              <label className="space-y-1">
                <div className="flex justify-between font-bold text-stone-700">
                  <span>Islands &amp; SaaS / mo</span>
                  <span>{estMonthlyNewIslands}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={500}
                  step={10}
                  value={estMonthlyNewIslands}
                  onChange={(e) => setEstMonthlyNewIslands(Number(e.target.value))}
                  className="w-full accent-amber-600"
                />
              </label>
            </div>
          </div>

          {/* Pro Mode: Operator Direct Revenue Collection Test */}
          {proMode && (
            <div className="rounded-2xl bg-violet-50/70 border border-violet-200 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs">
                <div className="font-black text-violet-950">
                  Operator Fee-Stream Settlement Trigger
                </div>
                <div className="text-[11px] text-violet-800">
                  Calls <code className="font-mono">MezoCityFeeSplitter.collectRevenue(streamId, amount)</code> from operator MUSD treasury.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={collectStreamId}
                  onChange={(e) =>
                    setCollectStreamId(Number(e.target.value) as 0 | 1 | 2 | 3 | 4)
                  }
                  className="rounded-xl border border-violet-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                >
                  <option value={0}>0 · Credit Interest</option>
                  <option value={1}>1 · Clone Royalty</option>
                  <option value={2}>2 · Swap &amp; Earn</option>
                  <option value={3}>3 · Guard Premium</option>
                  <option value={4}>4 · Island Mint / SaaS</option>
                </select>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={collectAmountInput}
                  onChange={(e) => setCollectAmountInput(e.target.value)}
                  className="w-24 rounded-xl border border-violet-300 bg-white px-2.5 py-1.5 text-xs font-black"
                />
                <Button
                  size="sm"
                  onClick={handleOperatorCollectRevenue}
                  disabled={busyAction === "COLLECT_REV" || !contracts?.feeSplitterDeployed}
                  className="rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-black text-xs"
                >
                  {busyAction === "COLLECT_REV" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  )}
                  Route MUSD Fee
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: CITADEL GOVERNANCE PROPOSALS + CITIZEN ENDORSEMENTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Governance Proposals */}
        <Card className="lg:col-span-7 bg-white/95 border-white shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Gavel className="h-5 w-5 text-violet-700" />
                  <span>Island Governance Proposals</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Governed by non-flash-loanable <code className="font-mono">MainMEZOVault</code> lock weight ({">="}{gov?.proposalThresholdPower ?? 50} pts to propose).
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => setShowNewProposal((v) => !v)}
                className="rounded-xl bg-[#242331] hover:bg-[#171622] text-white font-black text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {showNewProposal ? "Close" : "New Proposal"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {showNewProposal && (
              <form
                onSubmit={handleSubmitProposal}
                className="rounded-2xl bg-[#faf7f2] border border-[#e7dfd0] p-4 space-y-3"
              >
                <div className="text-xs font-black text-[#231f20]">
                  Select Governance Action Blueprint
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      id: "split_60_25_15" as const,
                      label: "Fee Split: 60% MEZO / 25% Treas / 15% Ins",
                    },
                    {
                      id: "musd_cap_up" as const,
                      label: "Raise MUSD Auto-Loan Cap to 3,500",
                    },
                    {
                      id: "swap_fee_15bps" as const,
                      label: "Set Swap Pool Fee to 15 bps",
                    },
                    {
                      id: "custom_signal" as const,
                      label: "Citadel Signal Mandate",
                    },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-all ${
                        proposalPreset === p.id
                          ? "bg-violet-600 text-white border-violet-700 shadow-sm"
                          : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-stone-700">
                    Proposal Title
                  </label>
                  <input
                    value={proposalTitle}
                    onChange={(e) => setProposalTitle(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-stone-700">
                    Rationale &amp; Expected Impact
                  </label>
                  <textarea
                    rows={2}
                    value={proposalSummary}
                    onChange={(e) => setProposalSummary(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={busyAction === "PROPOSE"}
                  className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-xs"
                >
                  {busyAction === "PROPOSE" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  )}
                  {contracts?.governorDeployed
                    ? "Submit On-Chain Proposal"
                    : "Publish Citadel Proposal Draft"}
                </Button>
              </form>
            )}

            {/* On-chain proposals */}
            {(gov?.onChainProposals ?? []).map((p) => {
              const totalVotes = p.forVotes + p.againstVotes + p.abstainVotes;
              const forPct = totalVotes > 0 ? Math.round((p.forVotes / totalVotes) * 100) : 0;
              const secsLeft = p.endTime - Math.floor(Date.now() / 1000);
              return (
                <div
                  key={`chain-${p.id}`}
                  className="rounded-2xl bg-[#faf7f2] border border-[#e7dfd0] p-4 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-violet-600 text-white text-[10px] font-black">
                        ON-CHAIN #{p.id}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-black border-stone-300"
                      >
                        {p.stateLabel}
                      </Badge>
                    </div>
                    <span className="text-[11px] font-bold text-stone-500">
                      {p.stateLabel === "ACTIVE"
                        ? `${formatCountdownSeconds(secsLeft)} left`
                        : `Target ${shortenHex(p.target, 4)}`}
                    </span>
                  </div>

                  <div className="font-black text-sm text-[#231f20]">{p.title}</div>
                  {p.summary && (
                    <p className="text-[11px] text-stone-600 leading-relaxed">{p.summary}</p>
                  )}

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-emerald-700">
                        For: {p.forVotes.toFixed(1)} ({forPct}%)
                      </span>
                      <span className="text-rose-700">
                        Against: {p.againstVotes.toFixed(1)}
                      </span>
                      <span className="text-stone-500">
                        Quorum: {(p.forVotes + p.abstainVotes).toFixed(1)} / {gov?.quorumPower}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-stone-200 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${forPct}%` }}
                      />
                    </div>
                  </div>

                  {p.stateLabel === "ACTIVE" && !p.userHasVoted && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleOnChainVote(p.id, 1)}
                        disabled={Boolean(busyAction)}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black"
                      >
                        <ThumbsUp className="h-3 w-3 mr-1" /> Vote For
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOnChainVote(p.id, 0)}
                        disabled={Boolean(busyAction)}
                        className="rounded-xl border-rose-300 text-rose-800 hover:bg-rose-50 text-xs font-black"
                      >
                        <ThumbsDown className="h-3 w-3 mr-1" /> Against
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOnChainVote(p.id, 2)}
                        disabled={Boolean(busyAction)}
                        className="rounded-xl text-xs font-bold"
                      >
                        Abstain
                      </Button>
                    </div>
                  )}

                  {p.stateLabel === "SUCCEEDED" && (
                    <Button
                      size="sm"
                      onClick={() => handleOnChainProposalStep(p.id, "queue")}
                      disabled={Boolean(busyAction)}
                      className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black"
                    >
                      Queue in Timelock
                    </Button>
                  )}

                  {p.stateLabel === "QUEUED" && (
                    <Button
                      size="sm"
                      onClick={() => handleOnChainProposalStep(p.id, "execute")}
                      disabled={Boolean(busyAction)}
                      className="rounded-xl bg-[#242331] hover:bg-black text-white text-xs font-black"
                    >
                      Execute Proposal
                    </Button>
                  )}
                </div>
              );
            })}

            {/* Citadel Draft Proposals */}
            {(gov?.draftProposals ?? []).map((d) => {
              const total = d.forVotes + d.againstVotes + d.abstainVotes;
              const forPct = total > 0 ? Math.round((d.forVotes / total) * 100) : 0;
              return (
                <div
                  key={d.proposalId}
                  className="rounded-2xl bg-stone-50 border border-stone-200 p-3.5 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">
                      {d.status === "ON_CHAIN" ? "INDEXED" : "CITADEL DRAFT"}
                    </Badge>
                    <span className="font-mono text-[10px] text-stone-500">
                      by {shortenHex(d.proposerAddress, 4)}
                    </span>
                  </div>
                  <div className="font-black text-sm text-[#231f20]">{d.title}</div>
                  {d.summary && (
                    <p className="text-[11px] text-stone-600 leading-relaxed">{d.summary}</p>
                  )}
                  {proMode && d.calldataPreview && (
                    <div className="font-mono text-[10px] text-violet-800 bg-violet-50 rounded-lg px-2 py-1 truncate">
                      {d.calldataPreview}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] font-bold text-stone-700">
                    <span className="text-emerald-700">
                      For: {d.forVotes.toFixed(1)} ({forPct}%)
                    </span>
                    <span className="text-rose-700">Against: {d.againstVotes.toFixed(1)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleDraftVote(d.proposalId, 1)}
                      disabled={busyAction === `VOTE_DRAFT_${d.proposalId}`}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black h-7 px-2.5"
                    >
                      <ThumbsUp className="h-3 w-3 mr-1" /> Vote For
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDraftVote(d.proposalId, 0)}
                      disabled={busyAction === `VOTE_DRAFT_${d.proposalId}`}
                      className="rounded-xl border-rose-300 text-rose-800 hover:bg-rose-50 text-[11px] font-black h-7 px-2.5"
                    >
                      <ThumbsDown className="h-3 w-3 mr-1" /> Against
                    </Button>
                  </div>
                </div>
              );
            })}

            {(gov?.onChainProposals.length ?? 0) === 0 &&
              (gov?.draftProposals.length ?? 0) === 0 && (
                <div className="rounded-2xl bg-stone-50 border border-dashed border-stone-300 p-6 text-center space-y-2">
                  <Gavel className="h-6 w-6 text-stone-400 mx-auto" />
                  <div className="text-xs font-black text-stone-700">
                    No active proposals yet
                  </div>
                  <p className="text-[11px] text-stone-500 max-w-md mx-auto">
                    Use <strong>New Proposal</strong> above to propose fee-split updates, MUSD reserve guardrails, or swap-pool parameter changes backed by your MEZO stake weight.
                  </p>
                </div>
              )}
          </CardContent>
        </Card>

        {/* Right: Sub-Island Citizen Endorsement Gauge */}
        <Card className="lg:col-span-5 bg-white/95 border-white shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg font-black flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-500" />
                  <span>Archipelago Island Gauges</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Pledge your MEZO weight to endorse top Sub-Islands for featured placement &amp; curator gauges.
                </CardDescription>
              </div>
              {onOpenLeaderboard && (
                <button
                  type="button"
                  onClick={onOpenLeaderboard}
                  className="text-[11px] font-black text-violet-700 hover:underline shrink-0"
                >
                  Leaderboard →
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {(gov?.islands ?? []).length === 0 ? (
              <div className="rounded-2xl bg-stone-50 border border-dashed border-stone-300 p-5 text-center text-xs text-stone-500">
                No Sub-Islands deployed yet. Launch a Sub-Island to make it eligible for Citizen Endorsements.
              </div>
            ) : (
              (gov?.islands ?? []).slice(0, 8).map((isl) => {
                const isEndorsedByUser =
                  (us?.endorsedChainIslandId &&
                    us.endorsedChainIslandId === isl.chainIslandId) ||
                  us?.endorsedNeonIslandId === isl.islandId;
                return (
                  <div
                    key={isl.islandId}
                    className={`rounded-2xl border p-3 flex items-center justify-between gap-2.5 ${
                      isEndorsedByUser
                        ? "bg-violet-50 border-violet-300"
                        : "bg-[#faf7f2] border-[#e7dfd0]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEnterIsland?.(isl.islandId)}
                          className="font-black text-xs text-[#231f20] hover:text-violet-700 truncate"
                        >
                          {isl.name}
                        </button>
                        {isEndorsedByUser && (
                          <Badge className="bg-violet-600 text-white text-[9px] font-black">
                            Endorsed
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10.5px] text-stone-500 mt-0.5 flex items-center gap-2">
                        <span className="capitalize">{isl.biomeTheme}</span>
                        <span>·</span>
                        <span className="font-bold text-violet-800">
                          {isl.totalEndorsementPower.toLocaleString(undefined, {
                            maximumFractionDigits: 1,
                          })}{" "}
                          MEZO votes
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant={isEndorsedByUser ? "outline" : "default"}
                      disabled={busyAction === `ENDORSE_${isl.islandId}`}
                      onClick={() =>
                        handleEndorseIsland(
                          isEndorsedByUser ? "" : isl.islandId,
                          isEndorsedByUser ? 0 : isl.chainIslandId
                        )
                      }
                      className={`rounded-xl text-[11px] font-black shrink-0 h-8 ${
                        isEndorsedByUser
                          ? "border-violet-300 text-violet-900"
                          : "bg-[#242331] hover:bg-black text-white"
                      }`}
                    >
                      {busyAction === `ENDORSE_${isl.islandId}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isEndorsedByUser ? (
                        "Clear"
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Endorse
                        </>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECTION 3: PRO DETAILS ARCHITECTURE & REVENUE LEDGER */}
      {proMode && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-6 bg-white/95 border-white shadow-md">
            <CardHeader className="pb-2.5">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-600" />
                <span>Governance &amp; FeeSplitter Contracts</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                { label: "MezoCityGovernor.sol", addr: contracts?.governor || "" },
                { label: "MezoCityFeeSplitter.sol", addr: contracts?.feeSplitter || "" },
                { label: "MainMEZOVault.sol", addr: contracts?.mainMezoVault || "" },
                { label: "MainMUSDVault.sol", addr: contracts?.mainMusdVault || "" },
                { label: "IslandCreditCouncil.sol", addr: contracts?.islandCreditCouncil || "" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[#faf7f2] border border-[#e7dfd0] px-3 py-2"
                >
                  <span className="font-bold text-[#231f20]">{item.label}</span>
                  {item.addr ? (
                    <a
                      href={`${EXPLORER}/address/${item.addr}?tab=contract`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] font-bold text-violet-700 hover:underline inline-flex items-center gap-1"
                    >
                      {shortenHex(item.addr, 6)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="font-mono text-[10.5px] text-amber-700 font-bold">
                      Pending DeployGovernanceAndRevenue.s.sol
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-6 bg-white/95 border-white shadow-md">
            <CardHeader className="pb-2.5">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-600" />
                <span>Recent FeeSplitter Revenue Events</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {(rev?.recentEvents ?? []).length === 0 ? (
                <div className="rounded-xl bg-stone-50 border border-dashed border-stone-300 p-4 text-center text-[11px] text-stone-500">
                  No fee settlement events indexed yet.
                </div>
              ) : (
                (rev?.recentEvents ?? []).slice(0, 6).map((ev) => (
                  <div
                    key={ev.eventId}
                    className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="font-black text-[#231f20] truncate">
                        {ev.streamLabel} · ${ev.totalMusd.toFixed(2)} MUSD
                      </div>
                      <div className="text-[10px] text-stone-500">
                        Stakers +${ev.stakersShareMusd.toFixed(2)} · Treas +${ev.treasuryShareMusd.toFixed(2)} · Ins +${ev.insuranceShareMusd.toFixed(2)}
                      </div>
                    </div>
                    {ev.txHash ? (
                      <a
                        href={`${EXPLORER}/tx/${ev.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[10.5px] font-bold text-violet-700 hover:underline shrink-0"
                      >
                        {shortenHex(ev.txHash, 4)}
                      </a>
                    ) : (
                      <Badge variant="outline" className="text-[9.5px] shrink-0">
                        {ev.sourceMode}
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
