"use client";

import React, { useState } from "react";
import { keccak256, parseEther, toBytes } from "viem";
import {
  useAccount,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  Vault,
  Bot,
  KeyRound,
  Landmark,
  Sparkles,
  Play,
  Plus,
  Coins,
  ArrowLeftRight,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  ExternalLink,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WorkshopPreviewConfig } from "@/components/island/CustomIslandScene";
import {
  ISLAND_CREDIT_COUNCIL_ABI,
  ISLAND_ECOSYSTEM_ADDRESSES,
  ISLAND_VAULT_ABI,
} from "@/lib/island-contracts";
import type {
  AgentChassisType,
  AgentHeadgearType,
  AgentSpecialty,
  CustomIslandAgent,
  CustomIslandRecord,
  CustomIslandVaultBuilding,
  IslandCycleRecord,
  IslandLoanApplicationRecord,
} from "@/lib/island-db";
import type { CustomIslandCycleResult } from "@/lib/island-agent-runner";
import {
  extractEvmRevertReason,
  MEZO_TESTNET_LENDING_ADDRESSES,
  mezoTestnet,
  MUSD_ERC20_ABI,
} from "@/lib/mezo-chain";
import {
  resolveMezoCoordinationTier,
  type MezoCoordinationTier,
} from "@/lib/mezo-coordination";
import { shortenHex } from "@/lib/utils";

export interface SubIslandDetailsResponse {
  ok: boolean;
  island: CustomIslandRecord;
  vaults: CustomIslandVaultBuilding[];
  agents: CustomIslandAgent[];
  cycles: IslandCycleRecord[];
  loans: IslandLoanApplicationRecord[];
  onChainMetrics: {
    syncedFromChain: boolean;
    trackedBtc: number;
    trackedMusd: number;
    costBasisUsd: number;
    grossNavUsd: number;
    netEquityUsd: number;
    netProfitUsd: number;
    roiBps: number;
    outstandingLoanMusd: number;
    totalCheckpoints: number;
    latestCheckpoint: null | {
      id: number;
      blockNumber: number;
      netEquityUsd: number;
      netProfitUsd: number;
      roiBps: number;
      tradeCount: number;
      transcriptHash: string;
    };
    creditScoreBps: number;
    mezoBalance?: number;
    veBtcVotingPower?: number;
    veBtcLockedBtc?: number;
    veBtcNftCount?: number;
    effectiveCoordinationScore?: number;
    boostedByVeBtc?: boolean;
    mezoTier?: MezoCoordinationTier;
  };
}

interface SubIslandWorkspaceProps {
  details: SubIslandDetailsResponse;
  selectedPlotIndex: number | null;
  onSelectPlot: (plotIndex: number | null) => void;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onWorkshopPreviewChange: (preview: WorkshopPreviewConfig | null) => void;
  onRefresh: () => Promise<void>;
}

type WorkspaceTab = "vaults" | "agents" | "ai" | "loans";

export function SubIslandWorkspace({
  details,
  selectedPlotIndex,
  onSelectPlot,
  onWorkshopPreviewChange,
  onRefresh,
}: SubIslandWorkspaceProps) {
  const { island, vaults, agents, cycles, loans, onChainMetrics } = details;
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();

  const [tab, setTab] = useState<WorkspaceTab>("vaults");
  const [busy, setBusy] = useState<string>("");
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
    txHash?: string;
  } | null>(null);

  // Vault Creation + Funding State
  const [vaultAssetType, setVaultAssetType] = useState<"BTC" | "MUSD" | "MULTI_ASSET">(
    "MULTI_ASSET"
  );
  const [vaultName, setVaultName] = useState("Alpha Strategy Vault");
  const [maxSingleTradeBps, setMaxSingleTradeBps] = useState("2500");
  const [maxDrawdownBps, setMaxDrawdownBps] = useState("1000");

  const [depositBtcAmt, setDepositBtcAmt] = useState("0.0001");
  const [depositMusdAmt, setDepositMusdAmt] = useState("10");
  const [withdrawBtcAmt, setWithdrawBtcAmt] = useState("0.0001");
  const [withdrawMusdAmt, setWithdrawMusdAmt] = useState("5");
  const [swapDirection, setSwapDirection] = useState<"BTC_TO_MUSD" | "MUSD_TO_BTC">(
    "MUSD_TO_BTC"
  );
  const [swapAmount, setSwapAmount] = useState("5");

  // Agent Studio State
  const [isDesignerOpen, setIsDesignerOpen] = useState(false);
  const [agentName, setAgentName] = useState("Prime Architect");
  const [agentRole, setAgentRole] = useState("BTC Momentum Trader");
  const [agentSpecialty, setAgentSpecialty] = useState<AgentSpecialty>("BTC_TRADER");
  const [agentPrompt, setAgentPrompt] = useState(
    "Analyze live BTC volatility and execute disciplined swaps on Mezo Swap Pool while protecting cost basis."
  );
  const [agentAssets, setAgentAssets] = useState("BTC,MUSD");
  const [chassis, setChassis] = useState<AgentChassisType>("mech");
  const [primaryColor, setPrimaryColor] = useState("#7c3aed");
  const [secondaryColor, setSecondaryColor] = useState("#f59e0b");
  const [headgear, setHeadgear] = useState<AgentHeadgearType>("visor");
  const [scaleFactor, setScaleFactor] = useState(1.0);

  // Gemini Key & Execution State
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [lastRunResult, setLastRunResult] = useState<CustomIslandCycleResult | null>(null);

  // Loan Application & Repayment State
  const [loanRequestedMusd, setLoanRequestedMusd] = useState("50");
  const [loanTermDays, setLoanTermDays] = useState("30");
  const [loanPurpose, setLoanPurpose] = useState(
    "Scale profitable BTC/MUSD strategy inventory across Sub-Island vaults"
  );
  const [repayAmount, setRepayAmount] = useState("25");

  const isOwner =
    Boolean(address) &&
    address!.toLowerCase() === island.ownerAddress.toLowerCase();

  const pushWorkshopPreview = (active: boolean, overrides?: Partial<WorkshopPreviewConfig>) => {
    if (!active) {
      onWorkshopPreviewChange(null);
      return;
    }
    onWorkshopPreviewChange({
      active: true,
      name: overrides?.name ?? agentName,
      chassis: overrides?.chassis ?? chassis,
      primaryColor: overrides?.primaryColor ?? primaryColor,
      secondaryColor: overrides?.secondaryColor ?? secondaryColor,
      headgear: overrides?.headgear ?? headgear,
      scaleFactor: overrides?.scaleFactor ?? scaleFactor,
    });
  };

  const handleTabSwitch = (nextTab: WorkspaceTab) => {
    setTab(nextTab);
    if (nextTab !== "agents" && isDesignerOpen) {
      setIsDesignerOpen(false);
      pushWorkshopPreview(false);
    }
  };

  const ensureMezoWallet = async () => {
    if (!isConnected || !address) {
      throw new Error("Connect your EVM wallet first.");
    }
    if (!isOwner) {
      throw new Error(`Only island owner (${shortenHex(island.ownerAddress, 6)}) can perform this action.`);
    }
    if (chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
  };

  const requestSignedNonce = async (
    action: "SAVE_GEMINI_KEY" | "RUN_ISLAND_CYCLE"
  ): Promise<{ nonce: string; signature: string }> => {
    if (!address) throw new Error("Connect wallet first.");
    const nRes = await fetch(
      `/api/islands/auth-nonce?wallet=${encodeURIComponent(
        address
      )}&islandId=${encodeURIComponent(island.islandId)}&action=${action}`,
      { cache: "no-store" }
    );
    const nJson = await nRes.json();
    if (!nJson.ok) throw new Error(nJson.error || "Nonce request failed.");
    const signature = await signMessageAsync({ message: nJson.message });
    return { nonce: nJson.nonce, signature };
  };

  const handleCreateVaultBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy("CREATE_VAULT");
    try {
      await ensureMezoWallet();
      let txHash = "";
      if (/^0x[0-9a-fA-F]{40}$/.test(island.vaultAddress)) {
        setNotice({ type: "info", text: "Updating on-chain IslandVault policy limits..." });
        txHash = await writeContractAsync({
          address: island.vaultAddress as `0x${string}`,
          abi: ISLAND_VAULT_ABI,
          functionName: "updatePolicy",
          args: [
            Number(maxSingleTradeBps || 2500),
            Number(maxDrawdownBps || 1000),
            60,
            vaultAssetType !== "MUSD",
            vaultAssetType !== "BTC",
            false,
          ],
          chainId: mezoTestnet.id,
        });
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({
            hash: txHash as `0x${string}`,
          });
        }
      }

      const res = await fetch(`/api/islands/${island.islandId}/vaults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: address,
          plotIndex: selectedPlotIndex || undefined,
          assetType: vaultAssetType,
          vaultName: vaultName.trim(),
          maxSingleTradeBps: Number(maxSingleTradeBps || 2500),
          maxDrawdownBps: Number(maxDrawdownBps || 1000),
          txHash,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to place vault building.");
      setNotice({
        type: "success",
        text: `Placed ${json.vault.assetType} Vault on Plot #${json.vault.plotIndex}!`,
        txHash: txHash || undefined,
      });
      onSelectPlot(json.vault.plotIndex);
      await onRefresh();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusy("");
    }
  };

  const handleVaultFundingTx = async (
    kind: "DEP_BTC" | "DEP_MUSD" | "WDR_BTC" | "WDR_MUSD"
  ) => {
    setNotice(null);
    setBusy(kind);
    try {
      await ensureMezoWallet();
      const vAddr = island.vaultAddress as `0x${string}`;
      let txHash: `0x${string}`;

      if (kind === "DEP_BTC") {
        txHash = await writeContractAsync({
          address: vAddr,
          abi: ISLAND_VAULT_ABI,
          functionName: "depositBtc",
          value: parseEther(depositBtcAmt || "0"),
          chainId: mezoTestnet.id,
        });
      } else if (kind === "DEP_MUSD") {
        const musdWei = parseEther(depositMusdAmt || "0");
        if (publicClient && address) {
          const allowance = (await publicClient.readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "allowance",
            args: [address, vAddr],
          })) as bigint;
          if (allowance < musdWei) {
            setNotice({ type: "info", text: "Step 1/2: Approving MUSD..." });
            const appTx = await writeContractAsync({
              address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
              abi: MUSD_ERC20_ABI,
              functionName: "approve",
              args: [vAddr, musdWei],
              chainId: mezoTestnet.id,
            });
            await publicClient.waitForTransactionReceipt({ hash: appTx });
          }
        }
        txHash = await writeContractAsync({
          address: vAddr,
          abi: ISLAND_VAULT_ABI,
          functionName: "depositMusd",
          args: [musdWei],
          chainId: mezoTestnet.id,
        });
      } else if (kind === "WDR_BTC") {
        txHash = await writeContractAsync({
          address: vAddr,
          abi: ISLAND_VAULT_ABI,
          functionName: "withdrawBtc",
          args: [parseEther(withdrawBtcAmt || "0")],
          chainId: mezoTestnet.id,
        });
      } else {
        txHash = await writeContractAsync({
          address: vAddr,
          abi: ISLAND_VAULT_ABI,
          functionName: "withdrawMusd",
          args: [parseEther(withdrawMusdAmt || "0")],
          chainId: mezoTestnet.id,
        });
      }

      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: txHash });
      setNotice({ type: "success", text: "IslandVault balance updated on-chain.", txHash });
      await onRefresh();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusy("");
    }
  };

  const handleExecuteSwap = async (btcToMusd: boolean, amtStr: string) => {
    setNotice(null);
    setBusy("SWAP");
    try {
      await ensureMezoWallet();
      const txHash = await writeContractAsync({
        address: island.vaultAddress as `0x${string}`,
        abi: ISLAND_VAULT_ABI,
        functionName: "executeWhitelistedSwap",
        args: [btcToMusd, parseEther(amtStr || "0"), 0n],
        chainId: mezoTestnet.id,
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: txHash });
      setNotice({
        type: "success",
        text: `Executed ${btcToMusd ? "BTC -> MUSD" : "MUSD -> BTC"} swap via MezoTestnetSwapPool.`,
        txHash,
      });
      await onRefresh();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusy("");
    }
  };

  const handleSaveCustomAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy("SAVE_AGENT");
    try {
      await ensureMezoWallet();
      const res = await fetch(`/api/islands/${island.islandId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: address,
          name: agentName.trim(),
          role: agentRole.trim(),
          specialty: agentSpecialty,
          systemPrompt: agentPrompt.trim(),
          allowedAssets: agentAssets,
          chassis,
          primaryColor,
          secondaryColor,
          headgear,
          scaleFactor,
          active: true,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to save custom agent.");
      setIsDesignerOpen(false);
      pushWorkshopPreview(false);
      setNotice({
        type: "success",
        text: `Spawned "${json.agent.name}" onto 3D Slot #${json.agent.spawnSlotIndex}!`,
      });
      await onRefresh();
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy("");
    }
  };

  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy("SAVE_KEY");
    try {
      await ensureMezoWallet();
      if (!geminiApiKey.trim()) throw new Error("Paste your Gemini API key first.");
      const { nonce, signature } = await requestSignedNonce("SAVE_GEMINI_KEY");

      const res = await fetch(`/api/islands/${island.islandId}/gemini-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: address,
          geminiApiKey: geminiApiKey.trim(),
          model: geminiModel,
          nonce,
          signature,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to verify/encrypt Gemini key.");
      setGeminiApiKey("");
      setNotice({
        type: "success",
        text: `Gemini Key verified & AES-256-GCM encrypted (****${json.last4} • ${json.model}).`,
      });
      await onRefresh();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusy("");
    }
  };

  const handleRunCustomCycle = async () => {
    setNotice(null);
    setBusy("RUN_CYCLE");
    try {
      await ensureMezoWallet();
      const { nonce, signature } = await requestSignedNonce("RUN_ISLAND_CYCLE");
      const res = await fetch(`/api/islands/${island.islandId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: address,
          nonce,
          signature,
        }),
      });
      const json = (await res.json()) as CustomIslandCycleResult & { error?: string };
      if (!json.ok) throw new Error(json.error || "Custom AI cycle failed.");
      setLastRunResult(json);
      setNotice({
        type: "success",
        text: `Custom AI crew completed cycle: ${json.decision} (${json.agentTranscript.length} agent responses).`,
      });
      await onRefresh();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusy("");
    }
  };

  const handleRecordProfitCheckpoint = async (transcriptHex?: string) => {
    setNotice(null);
    setBusy("CHECKPOINT");
    try {
      await ensureMezoWallet();
      const proofHash =
        transcriptHex && /^0x[0-9a-fA-F]{64}$/.test(transcriptHex)
          ? (transcriptHex as `0x${string}`)
          : keccak256(toBytes(`cp:${island.islandId}:${Date.now()}`));

      const txHash = await writeContractAsync({
        address: island.vaultAddress as `0x${string}`,
        abi: ISLAND_VAULT_ABI,
        functionName: "recordProfitCheckpoint",
        args: [proofHash],
        chainId: mezoTestnet.id,
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: txHash });
      setNotice({
        type: "success",
        text: "On-chain Proof-of-Profit Checkpoint recorded!",
        txHash,
      });
      await onRefresh();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusy("");
    }
  };

  const handleApplyForLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const councilAddr = ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil;
    if (!councilAddr || !island.chainIslandId) {
      setNotice({
        type: "error",
        text: "Credit Council address or chainIslandId missing.",
      });
      return;
    }
    const cpId = onChainMetrics.latestCheckpoint?.id ?? 0;
    if (!onChainMetrics.latestCheckpoint) {
      setNotice({
        type: "error",
        text: "Record at least 1 on-chain Profit Checkpoint before applying for a loan.",
      });
      return;
    }

    setBusy("APPLY_LOAN");
    try {
      await ensureMezoWallet();
      const planHash = keccak256(toBytes(loanPurpose.trim() || "Sub-Island expansion"));
      setNotice({ type: "info", text: "Step 1/2: Submitting loan application on-chain..." });
      const submitTxHash = await writeContractAsync({
        address: councilAddr,
        abi: ISLAND_CREDIT_COUNCIL_ABI,
        functionName: "submitLoanApplication",
        args: [
          BigInt(island.chainIslandId),
          BigInt(cpId),
          parseEther(loanRequestedMusd || "0"),
          Number(loanTermDays || 30),
          planHash,
        ],
        chainId: mezoTestnet.id,
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: submitTxHash });
      }

      let chainAppId = 0;
      if (publicClient) {
        const rawId = (await publicClient.readContract({
          address: councilAddr,
          abi: ISLAND_CREDIT_COUNCIL_ABI,
          functionName: "activeApplicationByIsland",
          args: [BigInt(island.chainIslandId)],
        })) as bigint;
        chainAppId = Number(rawId || 0n);
      }

      setNotice({
        type: "info",
        text: "Step 2/2: Convening Main Island 5-Agent Credit Council...",
      });
      const res = await fetch("/api/credit-council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          islandId: island.islandId,
          chainAppId,
          checkpointId: cpId,
          requestedMusd: Number(loanRequestedMusd || 0),
          termDays: Number(loanTermDays || 30),
          purposeSummary: loanPurpose.trim(),
          provedProfitUsd:
            onChainMetrics.latestCheckpoint.netProfitUsd || onChainMetrics.netProfitUsd,
          provedRoiBps:
            onChainMetrics.latestCheckpoint.roiBps || onChainMetrics.roiBps,
          submitTxHash,
          runCouncilImmediately: true,
        }),
      });
      const councilJson = await res.json();
      if (!councilJson.ok) {
        throw new Error(councilJson.error || "Council evaluation failed.");
      }

      setNotice({
        type: "success",
        text: `Main Council Verdict: ${councilJson.verdict} (${councilJson.approvedMusd} MUSD @ ${(
          (councilJson.aprBps || 0) / 100
        ).toFixed(2)}% APR)${councilJson.autoDisbursed ? " • Auto-Disbursed!" : ""}`,
        txHash: councilJson.txHash || submitTxHash,
      });
      await onRefresh();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusy("");
    }
  };

  const handleRepayLoan = async (chainAppId: number, fromVault: boolean) => {
    setNotice(null);
    const councilAddr = ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil;
    if (!councilAddr) return;
    setBusy(`REPAY-${chainAppId}`);
    try {
      await ensureMezoWallet();
      const payWei = parseEther(repayAmount || "0");
      if (!fromVault && publicClient && address) {
        const allowance = (await publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "allowance",
          args: [address, councilAddr],
        })) as bigint;
        if (allowance < payWei) {
          const appTx = await writeContractAsync({
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "approve",
            args: [councilAddr, payWei],
            chainId: mezoTestnet.id,
          });
          await publicClient.waitForTransactionReceipt({ hash: appTx });
        }
      }

      const txHash = await writeContractAsync({
        address: councilAddr,
        abi: ISLAND_CREDIT_COUNCIL_ABI,
        functionName: fromVault ? "repayLoanFromVault" : "repayLoanExternal",
        args: [BigInt(chainAppId), payWei],
        chainId: mezoTestnet.id,
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: txHash });
      setNotice({
        type: "success",
        text: `Repaid ${repayAmount} MUSD toward Loan #${chainAppId}.`,
        txHash,
      });
      await onRefresh();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="pointer-events-auto w-full max-w-[445px] h-[calc(100vh-7rem)] flex flex-col rounded-[28px] bg-[#faf7f2]/95 border-2 border-white shadow-[0_20px_50px_rgba(35,31,32,0.18)] backdrop-blur-md overflow-hidden text-[#231f20]">
      {/* Header */}
      <div className="px-4 py-3.5 bg-gradient-to-r from-[#242331] to-[#3b2e5a] text-white shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Badge className="bg-violet-500/30 border-violet-300/40 text-violet-100 text-[9.5px] font-black uppercase">
                Sub-Island #{island.chainIslandId ?? "?"}
              </Badge>
              <Badge className="bg-white/15 border-white/25 text-white text-[9.5px] font-bold">
                {island.biomeTheme}
              </Badge>
            </div>
            <h2 className="text-base font-black truncate mt-1">{island.name}</h2>
            <p className="text-[10.5px] text-violet-200 truncate">
              Vault:{" "}
              <a
                href={`https://explorer.test.mezo.org/address/${island.vaultAddress}`}
                target="_blank"
                rel="noreferrer"
                className="underline font-mono"
              >
                {shortenHex(island.vaultAddress, 6)}
              </a>{" "}
              • Owner: {shortenHex(island.ownerAddress, 5)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRefresh()}
            title="Sync Vault Balances & Profit"
            className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-4 gap-1.5 mt-3">
          <div className="rounded-xl bg-white/10 px-2 py-1.5">
            <div className="text-[8.5px] uppercase text-violet-200 font-bold">BTC Vault</div>
            <div className="text-[11px] font-black">{onChainMetrics.trackedBtc.toFixed(4)}</div>
          </div>
          <div className="rounded-xl bg-white/10 px-2 py-1.5">
            <div className="text-[8.5px] uppercase text-violet-200 font-bold">MUSD Vault</div>
            <div className="text-[11px] font-black">{onChainMetrics.trackedMusd.toFixed(2)}</div>
          </div>
          <div className="rounded-xl bg-white/10 px-2 py-1.5">
            <div className="text-[8.5px] uppercase text-violet-200 font-bold">Net Profit</div>
            <div className="text-[11px] font-black text-emerald-300">
              +${onChainMetrics.netProfitUsd.toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl bg-white/10 px-2 py-1.5">
            <div className="text-[8.5px] uppercase text-violet-200 font-bold">ROI / Debt</div>
            <div className="text-[11px] font-black">
              {(onChainMetrics.roiBps / 100).toFixed(1)}% / {onChainMetrics.outstandingLoanMusd.toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* Workspace Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1.5 bg-[#efe9dc] shrink-0">
        {[
          { id: "vaults" as const, label: "Vaults", icon: Vault },
          { id: "agents" as const, label: `Agents (${agents.length})`, icon: Bot },
          { id: "ai" as const, label: "Gemini AI", icon: KeyRound },
          { id: "loans" as const, label: "Credit/Loan", icon: Landmark },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabSwitch(item.id)}
              className={`flex items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-extrabold transition-all ${
                active
                  ? "bg-white text-[#231f20] shadow-sm"
                  : "text-stone-600 hover:text-[#231f20]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          className={`mx-3 mt-2.5 rounded-xl border px-3 py-2 text-[11px] font-bold flex items-center justify-between gap-2 shrink-0 ${
            notice.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : notice.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-violet-50 border-violet-200 text-violet-900"
          }`}
        >
          <span className="leading-snug">{notice.text}</span>
          {notice.txHash && (
            <a
              href={`https://explorer.test.mezo.org/tx/${notice.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-0.5 shrink-0"
            >
              <span>Tx</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {tab === "vaults" && (
          <>
            {/* Empty Plots + Vault Building Builder */}
            <div className="rounded-2xl bg-white border border-[#e6dec8] p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-violet-600" />
                  <span>Build 3D Vault on Plot {selectedPlotIndex ?? "(Auto)"}</span>
                </div>
                <span className="text-[10px] font-bold text-stone-500">
                  {vaults.length}/6 Plots Built
                </span>
              </div>

              <form onSubmit={handleCreateVaultBuilding} className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {(["BTC", "MUSD", "MULTI_ASSET"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVaultAssetType(t)}
                      className={`rounded-xl py-1.5 text-[10.5px] font-black border ${
                        vaultAssetType === t
                          ? "bg-[#242331] text-white border-[#242331]"
                          : "bg-[#faf7f2] border-[#dfd6c5] text-stone-700"
                      }`}
                    >
                      {t.replace("_", " ")}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={vaultName}
                  onChange={(e) => setVaultName(e.target.value)}
                  placeholder="Vault name"
                  className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2.5 py-1.5 text-xs font-semibold"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9.5px] font-bold text-stone-500">
                      Max Trade (bps)
                    </label>
                    <input
                      type="number"
                      value={maxSingleTradeBps}
                      onChange={(e) => setMaxSingleTradeBps(e.target.value)}
                      className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9.5px] font-bold text-stone-500">
                      Max Drawdown (bps)
                    </label>
                    <input
                      type="number"
                      value={maxDrawdownBps}
                      onChange={(e) => setMaxDrawdownBps(e.target.value)}
                      className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1 text-xs font-bold"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy !== "" || vaults.length >= 6}
                  className="w-full rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-xs"
                >
                  {busy === "CREATE_VAULT" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : null}
                  Place Vault Building on Land
                </Button>
              </form>
            </div>

            {/* Deposit / Withdraw Collateral */}
            <div className="rounded-2xl bg-white border border-[#e6dec8] p-3 space-y-2.5">
              <div className="text-xs font-black flex items-center gap-1.5">
                <Coins className="h-4 w-4 text-amber-600" />
                <span>Deposit / Withdraw BTC & MUSD</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={depositBtcAmt}
                    onChange={(e) => setDepositBtcAmt(e.target.value)}
                    className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1 text-xs font-bold"
                  />
                  <Button
                    size="sm"
                    disabled={busy !== ""}
                    onClick={() => handleVaultFundingTx("DEP_BTC")}
                    className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[11px]"
                  >
                    + Deposit BTC
                  </Button>
                </div>
                <div className="space-y-1">
                  <input
                    type="number"
                    step="1"
                    value={depositMusdAmt}
                    onChange={(e) => setDepositMusdAmt(e.target.value)}
                    className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1 text-xs font-bold"
                  />
                  <Button
                    size="sm"
                    disabled={busy !== ""}
                    onClick={() => handleVaultFundingTx("DEP_MUSD")}
                    className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px]"
                  >
                    + Deposit MUSD
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={withdrawBtcAmt}
                    onChange={(e) => setWithdrawBtcAmt(e.target.value)}
                    className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1 text-xs font-bold"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== ""}
                    onClick={() => handleVaultFundingTx("WDR_BTC")}
                    className="w-full rounded-xl font-extrabold text-[11px]"
                  >
                    Withdraw BTC
                  </Button>
                </div>
                <div className="space-y-1">
                  <input
                    type="number"
                    step="1"
                    value={withdrawMusdAmt}
                    onChange={(e) => setWithdrawMusdAmt(e.target.value)}
                    className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1 text-xs font-bold"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== ""}
                    onClick={() => handleVaultFundingTx("WDR_MUSD")}
                    className="w-full rounded-xl font-extrabold text-[11px]"
                  >
                    Withdraw MUSD
                  </Button>
                </div>
              </div>
            </div>

            {/* Direct Swap Router Box */}
            <div className="rounded-2xl bg-white border border-[#e6dec8] p-3 space-y-2">
              <div className="text-xs font-black flex items-center gap-1.5">
                <ArrowLeftRight className="h-4 w-4 text-sky-600" />
                <span>Execute On-Chain Swap (MezoTestnetSwapPool)</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSwapDirection("MUSD_TO_BTC")}
                  className={`rounded-xl py-1 text-[10.5px] font-black border ${
                    swapDirection === "MUSD_TO_BTC"
                      ? "bg-sky-700 text-white border-sky-700"
                      : "bg-[#faf7f2] border-[#dfd6c5]"
                  }`}
                >
                  MUSD -&gt; BTC
                </button>
                <button
                  type="button"
                  onClick={() => setSwapDirection("BTC_TO_MUSD")}
                  className={`rounded-xl py-1 text-[10.5px] font-black border ${
                    swapDirection === "BTC_TO_MUSD"
                      ? "bg-sky-700 text-white border-sky-700"
                      : "bg-[#faf7f2] border-[#dfd6c5]"
                  }`}
                >
                  BTC -&gt; MUSD
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.0001"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  className="flex-1 rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2.5 py-1 text-xs font-bold"
                />
                <Button
                  size="sm"
                  disabled={busy !== ""}
                  onClick={() =>
                    handleExecuteSwap(swapDirection === "BTC_TO_MUSD", swapAmount)
                  }
                  className="rounded-xl bg-[#242331] text-white font-extrabold text-xs"
                >
                  {busy === "SWAP" ? "Swapping..." : "Swap"}
                </Button>
              </div>
            </div>
          </>
        )}

        {tab === "agents" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black">
                Custom Island Agents ({agents.length}/8 Slots)
              </span>
              <Button
                size="sm"
                onClick={() => {
                  const next = !isDesignerOpen;
                  setIsDesignerOpen(next);
                  pushWorkshopPreview(next);
                }}
                className="rounded-xl bg-[#242331] hover:bg-violet-700 text-white font-extrabold text-xs"
              >
                {isDesignerOpen ? "Exit 3D Workshop" : "+ Design New Agent"}
              </Button>
            </div>

            {isDesignerOpen && (
              <form
                onSubmit={handleSaveCustomAgent}
                className="rounded-2xl bg-white border-2 border-violet-300 p-3 space-y-2.5 shadow-sm"
              >
                <div className="text-[11px] font-black text-violet-800 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>3D Workshop Pedestal Live Preview Active</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => {
                      setAgentName(e.target.value);
                      pushWorkshopPreview(true, { name: e.target.value });
                    }}
                    placeholder="Agent Name"
                    required
                    className="rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2.5 py-1.5 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={agentRole}
                    onChange={(e) => setAgentRole(e.target.value)}
                    placeholder="Role Title"
                    required
                    className="rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2.5 py-1.5 text-xs font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={agentSpecialty}
                    onChange={(e) => setAgentSpecialty(e.target.value as AgentSpecialty)}
                    className="rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1.5 text-xs font-bold"
                  >
                    <option value="MARKET_ANALYST">MARKET ANALYST</option>
                    <option value="BTC_TRADER">BTC TRADER</option>
                    <option value="MUSD_YIELD">MUSD YIELD</option>
                    <option value="RISK_AUDITOR">RISK AUDITOR</option>
                    <option value="ARBITRAGE">ARBITRAGE</option>
                  </select>
                  <input
                    type="text"
                    value={agentAssets}
                    onChange={(e) => setAgentAssets(e.target.value)}
                    placeholder="BTC,MUSD"
                    className="rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2.5 py-1.5 text-xs font-bold"
                  />
                </div>

                <textarea
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  rows={2}
                  placeholder="Custom Gemini system instruction..."
                  className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] p-2 text-[11px] font-medium"
                />

                {/* 3D Appearance Pickers */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9.5px] font-bold text-stone-500">
                      Chassis Body
                    </label>
                    <select
                      value={chassis}
                      onChange={(e) => {
                        const v = e.target.value as AgentChassisType;
                        setChassis(v);
                        pushWorkshopPreview(true, { chassis: v });
                      }}
                      className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1 text-xs font-bold"
                    >
                      <option value="bot">Clay Bot</option>
                      <option value="mech">Armored Mech</option>
                      <option value="rover">Wheeled Rover</option>
                      <option value="orb">Hover Orb</option>
                      <option value="guardian">Shield Guardian</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9.5px] font-bold text-stone-500">
                      Headgear
                    </label>
                    <select
                      value={headgear}
                      onChange={(e) => {
                        const v = e.target.value as AgentHeadgearType;
                        setHeadgear(v);
                        pushWorkshopPreview(true, { headgear: v });
                      }}
                      className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1 text-xs font-bold"
                    >
                      <option value="antenna">Antenna</option>
                      <option value="crown">Crown</option>
                      <option value="visor">Cyber Visor</option>
                      <option value="halo">Halo</option>
                      <option value="radar">Radar Dish</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 items-center">
                  <div>
                    <label className="block text-[9.5px] font-bold text-stone-500">
                      Primary
                    </label>
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => {
                        setPrimaryColor(e.target.value);
                        pushWorkshopPreview(true, { primaryColor: e.target.value });
                      }}
                      className="w-full h-8 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[9.5px] font-bold text-stone-500">
                      Accent
                    </label>
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => {
                        setSecondaryColor(e.target.value);
                        pushWorkshopPreview(true, { secondaryColor: e.target.value });
                      }}
                      className="w-full h-8 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[9.5px] font-bold text-stone-500">
                      Scale ({scaleFactor.toFixed(2)}x)
                    </label>
                    <input
                      type="range"
                      min="0.75"
                      max="1.4"
                      step="0.05"
                      value={scaleFactor}
                      onChange={(e) => {
                        const s = Number(e.target.value);
                        setScaleFactor(s);
                        pushWorkshopPreview(true, { scaleFactor: s });
                      }}
                      className="w-full"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={busy !== ""}
                  className="w-full rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-xs"
                >
                  {busy === "SAVE_AGENT" ? "Spawning..." : "Spawn Custom Agent on Island"}
                </Button>
              </form>
            )}

            {agents.length === 0 && !isDesignerOpen && (
              <div className="rounded-2xl bg-white border border-dashed border-[#dfd6c5] p-6 text-center text-xs font-semibold text-stone-500">
                No AI agents deployed on this island yet. Click &ldquo;+ Design New Agent&rdquo; to customize your first robot on the 3D Workshop Pedestal!
              </div>
            )}

            {agents.map((ag) => (
              <div
                key={ag.agentId}
                className="rounded-2xl bg-white border border-[#e6dec8] p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: ag.primaryColor }}
                    />
                    <span className="text-xs font-black">{ag.name}</span>
                  </div>
                  <Badge className="bg-stone-100 text-stone-700 border-stone-200 text-[9.5px] font-bold">
                    Slot #{ag.spawnSlotIndex} • {ag.chassis}/{ag.headgear}
                  </Badge>
                </div>
                <div className="text-[10.5px] font-bold text-violet-700">
                  {ag.role} ({ag.specialty})
                </div>
                {ag.lastOutput && (
                  <p className="text-[10.5px] text-stone-600 bg-[#faf7f2] rounded-xl p-2 mt-1">
                    {ag.lastOutput}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "ai" && (
          <div className="space-y-3">
            {/* Encrypted BYOK Gemini Key */}
            <form
              onSubmit={handleSaveGeminiKey}
              className="rounded-2xl bg-white border border-[#e6dec8] p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-black flex items-center gap-1.5">
                  <KeyRound className="h-4 w-4 text-violet-700" />
                  <span>Island Gemini API Connection</span>
                </div>
                {island.geminiConnected ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-black">
                    Connected (****{island.geminiKeyLast4})
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-black">
                    Not Connected
                  </Badge>
                )}
              </div>

              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="Paste Google Gemini API key (AIza...)"
                className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2.5 py-1.5 text-xs font-mono"
              />
              <div className="flex gap-2">
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="flex-1 rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1.5 text-xs font-bold"
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                </select>
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy !== "" || !geminiApiKey.trim()}
                  className="rounded-xl bg-[#242331] text-white font-extrabold text-xs"
                >
                  {busy === "SAVE_KEY" ? "Signing..." : "Sign & Encrypt Key"}
                </Button>
              </div>
              <p className="text-[10px] text-stone-500">
                Protected by single-use EIP-191 <code className="font-mono">personal_sign</code> challenge + AES-256-GCM encryption at rest.
              </p>
            </form>

            {/* Run Cycle */}
            <div className="rounded-2xl bg-white border border-[#e6dec8] p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black">Execute Custom Crew Cycle</span>
                <Button
                  size="sm"
                  disabled={busy !== "" || !island.geminiConnected || agents.length === 0}
                  onClick={handleRunCustomCycle}
                  className="rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-xs"
                >
                  {busy === "RUN_CYCLE" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Sign & Run Agents
                    </>
                  )}
                </Button>
              </div>

              {lastRunResult && (
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-2.5 space-y-2 text-[11px]">
                  <div className="flex items-center justify-between font-black text-violet-950">
                    <span>Verdict: {lastRunResult.decision}</span>
                    <span>{lastRunResult.modelUsed}</span>
                  </div>
                  {(lastRunResult.decision === "SWAP_BTC_TO_MUSD" ||
                    lastRunResult.decision === "SWAP_MUSD_TO_BTC") && (
                    <Button
                      size="sm"
                      disabled={busy !== ""}
                      onClick={() =>
                        handleExecuteSwap(
                          lastRunResult.btcToMusd,
                          String(lastRunResult.suggestedAmountIn || 5)
                        )
                      }
                      className="w-full rounded-xl bg-emerald-700 text-white font-black text-xs"
                    >
                      Execute Suggested Swap ({lastRunResult.suggestedAmountIn})
                    </Button>
                  )}
                  {lastRunResult.shouldRecordCheckpoint && (
                    <Button
                      size="sm"
                      disabled={busy !== ""}
                      onClick={() => handleRecordProfitCheckpoint(lastRunResult.proofHash)}
                      className="w-full rounded-xl bg-amber-600 text-white font-black text-xs"
                    >
                      Record Recommended Checkpoint On-Chain
                    </Button>
                  )}
                </div>
              )}

              {cycles.slice(0, 4).map((c) => (
                <div
                  key={c.cycleUid}
                  className="rounded-xl bg-[#faf7f2] border border-[#e6dec8] p-2.5 text-[10.5px] space-y-1"
                >
                  <div className="flex justify-between font-black">
                    <span>{c.decision}</span>
                    <span className="text-emerald-700">
                      NAV ${c.navUsd.toFixed(2)} (Profit ${c.netProfitUsd.toFixed(2)})
                    </span>
                  </div>
                  {c.transcript.map((line, i) => (
                    <div key={i} className="text-stone-700">
                      <strong>{line.speaker}:</strong> {line.text}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "loans" && (
          <div className="space-y-3">
            {/* Step 1: Proof-of-Profit Checkpoint */}
            <div className="rounded-2xl bg-white border border-[#e6dec8] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Proof-of-Profit Checkpoint</span>
                </div>
                <span className="text-[10px] font-bold text-stone-500">
                  {onChainMetrics.totalCheckpoints} Recorded
                </span>
              </div>
              {onChainMetrics.latestCheckpoint ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2 text-[11px] text-emerald-950 flex justify-between">
                  <span>
                    Checkpoint #{onChainMetrics.latestCheckpoint.id}: Profit{" "}
                    <strong>${onChainMetrics.latestCheckpoint.netProfitUsd.toFixed(2)}</strong>
                  </span>
                  <strong>
                    {(onChainMetrics.latestCheckpoint.roiBps / 100).toFixed(2)}% ROI
                  </strong>
                </div>
              ) : (
                <div className="text-[11px] text-stone-600">
                  Execute profitable swaps or accumulate value, then seal an immutable checkpoint before applying for Main Island MUSD credit.
                </div>
              )}
              <Button
                size="sm"
                disabled={busy !== ""}
                onClick={() => handleRecordProfitCheckpoint()}
                className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs"
              >
                {busy === "CHECKPOINT" ? "Recording..." : "Seal Profit Checkpoint On-Chain"}
              </Button>
            </div>

            {/* Step 2: Apply to Main Island 5-Agent Credit Council */}
            <form
              onSubmit={handleApplyForLoan}
              className="rounded-2xl bg-white border border-[#e6dec8] p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black flex items-center gap-1.5">
                  <Landmark className="h-4 w-4 text-violet-700" />
                  <span>Apply for Main Island MUSD Loan</span>
                </div>
                {(() => {
                  const tier =
                    onChainMetrics.mezoTier ||
                    resolveMezoCoordinationTier(onChainMetrics.mezoBalance ?? 0);
                  return (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-black ${tier.badgeClasses}`}
                    >
                      <Zap className="h-2.5 w-2.5" />
                      {tier.shortLabel}
                      {tier.aprDiscountBps > 0 ? ` (-${tier.aprDiscountBps} bps)` : ""}
                    </span>
                  );
                })()}
              </div>
              {(() => {
                const mezoBal = onChainMetrics.mezoBalance ?? 0;
                const veBtcVp = onChainMetrics.veBtcVotingPower ?? 0;
                const tier =
                  onChainMetrics.mezoTier || resolveMezoCoordinationTier(mezoBal);
                return (
                  <div className="rounded-xl bg-indigo-50/80 border border-indigo-200 px-2.5 py-1.5 text-[10.5px] text-indigo-950 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Builder Power: <strong>{mezoBal.toFixed(1)} MEZO</strong>
                      {veBtcVp > 0 ? ` + ${veBtcVp.toFixed(4)} veBTC` : ""}
                    </span>
                    <span>
                      APR Floor:{" "}
                      <strong>{(tier.effectiveMinAprBps / 100).toFixed(2)}%</strong>
                      {tier.aprDiscountBps > 0
                        ? ` (-${tier.aprDiscountBps} bps boost)`
                        : " (10+ MEZO or veBTC unlocks discount)"}
                    </span>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9.5px] font-bold text-stone-500">
                    Requested MUSD
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={loanRequestedMusd}
                    onChange={(e) => setLoanRequestedMusd(e.target.value)}
                    className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2.5 py-1 text-xs font-black"
                  />
                </div>
                <div>
                  <label className="block text-[9.5px] font-bold text-stone-500">
                    Term (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={loanTermDays}
                    onChange={(e) => setLoanTermDays(e.target.value)}
                    className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2.5 py-1 text-xs font-black"
                  />
                </div>
              </div>
              <textarea
                value={loanPurpose}
                onChange={(e) => setLoanPurpose(e.target.value)}
                rows={2}
                placeholder="Business plan memo for Main Island 5-Agent Council..."
                className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] p-2 text-[11px] font-medium"
              />
              <Button
                type="submit"
                size="sm"
                disabled={busy !== ""}
                className="w-full rounded-xl bg-[#242331] hover:bg-violet-700 text-white font-extrabold text-xs"
              >
                {busy === "APPLY_LOAN"
                  ? "Submitting & Convening Council..."
                  : "Submit On-Chain & Convene Council"}
              </Button>
            </form>

            {/* Step 3: Loans & Repayment */}
            {loans.map((loan) => (
              <div
                key={loan.appId}
                className="rounded-2xl bg-white border border-[#e6dec8] p-3 space-y-2 text-[11px]"
              >
                <div className="flex items-center justify-between font-black">
                  <span>Loan #{loan.chainAppId || loan.appId.slice(-5)}</span>
                  <Badge className="bg-violet-100 text-violet-900 border-violet-200 text-[9.5px]">
                    {loan.verdict} • {loan.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-stone-600 font-semibold">
                  <span>Req: {loan.requestedMusd} MUSD</span>
                  <span>Approved: {loan.approvedMusd} MUSD</span>
                  <span>APR: {(loan.aprBps / 100).toFixed(2)}%</span>
                  <span>Repaid: {loan.repaidMusd.toFixed(2)}</span>
                </div>
                {(loan.status === "DISBURSED" || loan.status === "ACTIVE_LOAN") &&
                  loan.chainAppId > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-stone-100">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="1"
                        value={repayAmount}
                        onChange={(e) => setRepayAmount(e.target.value)}
                        className="w-24 rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2 py-1 text-xs font-black"
                      />
                      <Button
                        size="sm"
                        disabled={busy !== ""}
                        onClick={() => handleRepayLoan(loan.chainAppId, true)}
                        className="flex-1 rounded-xl bg-emerald-700 text-white font-bold text-[10.5px]"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Repay from Vault
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== ""}
                        onClick={() => handleRepayLoan(loan.chainAppId, false)}
                        className="rounded-xl font-bold text-[10.5px]"
                      >
                        Wallet MUSD
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
