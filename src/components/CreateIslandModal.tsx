"use client";

import React, { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  Sparkles,
  Sprout,
  Coins,
  ShieldCheck,
  AlertTriangle,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  areIslandContractsDeployed,
  ISLAND_ECOSYSTEM_ADDRESSES,
  ISLAND_FACTORY_ABI,
} from "@/lib/island-contracts";
import type { CustomIslandRecord, IslandBiomeTheme } from "@/lib/island-db";
import type { IslandCloneTemplate } from "@/lib/mezo-coordination";
import {
  extractEvmRevertReason,
  MEZO_TESTNET_LENDING_ADDRESSES,
  mezoTestnet,
  MUSD_ERC20_ABI,
} from "@/lib/mezo-chain";

interface CreateIslandModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (island: CustomIslandRecord) => void;
  templateDraft?: IslandCloneTemplate | null;
}

const BIOME_OPTIONS: Array<{
  id: IslandBiomeTheme;
  label: string;
  desc: string;
  swatch: string;
}> = [
  {
    id: "meadow",
    label: "Clay Meadow",
    desc: "Lush grass hills & limestone courtyard",
    swatch: "from-emerald-300 to-lime-200",
  },
  {
    id: "basalt",
    label: "Obsidian Ridge",
    desc: "Dark basalt plateau with amber trim",
    swatch: "from-slate-700 to-amber-500",
  },
  {
    id: "sand",
    label: "Dune Oasis",
    desc: "Warm terracotta sand & desert stone",
    swatch: "from-amber-200 to-orange-300",
  },
  {
    id: "grid",
    label: "Cyber Matrix",
    desc: "Neon cyan circuit floor & slate rim",
    swatch: "from-slate-900 to-cyan-500",
  },
];

export function CreateIslandModal({
  open,
  onClose,
  onCreated,
  templateDraft,
}: CreateIslandModalProps) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [biomeTheme, setBiomeTheme] = useState<IslandBiomeTheme>("meadow");
  const [seedBtcInput, setSeedBtcInput] = useState("0.0001");
  const [seedMusdInput, setSeedMusdInput] = useState("0");

  useEffect(() => {
    if (!open) return;
    setErrorMsg("");
    setTxHash("");
    setStatusStep("");
    if (templateDraft) {
      setName(templateDraft.suggestedName);
      setDescription(templateDraft.description);
      setBiomeTheme(templateDraft.biomeTheme);
      setSeedBtcInput(templateDraft.suggestedSeedBtc || "0.0001");
      setSeedMusdInput(templateDraft.suggestedSeedMusd || "0");
    } else {
      setName("");
      setDescription("");
      setBiomeTheme("meadow");
      setSeedBtcInput("0.0001");
      setSeedMusdInput("0");
    }
  }, [open, templateDraft]);

  const [statusStep, setStatusStep] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  const deployed = areIslandContractsDeployed();
  const seedBtcNum = Number(seedBtcInput || "0");
  const seedMusdNum = Number(seedMusdInput || "0");
  const meetsMinimumStake = seedBtcNum >= 0.0001 || seedMusdNum >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setTxHash("");

    if (!isConnected || !address) {
      setErrorMsg("Connect your EVM wallet on Mezo Testnet (31611) first.");
      return;
    }
    if (!deployed || !ISLAND_ECOSYSTEM_ADDRESSES.islandFactory) {
      setErrorMsg(
        "IslandFactory.sol is not configured yet. Deploy contracts/script/DeployIslandEcosystem.s.sol and set NEXT_PUBLIC_ISLAND_FACTORY_ADDRESS in .env."
      );
      return;
    }
    if (!name.trim()) {
      setErrorMsg("Enter a name for your Sub-Island.");
      return;
    }
    if (!meetsMinimumStake) {
      setErrorMsg("Minimum seed stake required: >= 0.0001 BTC or >= 10 MUSD.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (chainId !== mezoTestnet.id) {
        setStatusStep("Switching wallet to Mezo Testnet (31611)...");
        await switchChainAsync({ chainId: mezoTestnet.id });
      }

      const btcWei = seedBtcNum > 0 ? parseEther(seedBtcNum.toString()) : 0n;
      const musdWei = seedMusdNum > 0 ? parseEther(seedMusdNum.toString()) : 0n;
      const factoryAddr = ISLAND_ECOSYSTEM_ADDRESSES.islandFactory;

      if (musdWei > 0n && publicClient) {
        setStatusStep("Checking MUSD balance & allowance for IslandFactory...");
        const currentAllowance = (await publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "allowance",
          args: [address, factoryAddr],
        })) as bigint;

        if (currentAllowance < musdWei) {
          setStatusStep("Step 1/2: Approve MUSD seed deposit in wallet...");
          const approveHash = await writeContractAsync({
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "approve",
            args: [factoryAddr, musdWei],
            chainId: mezoTestnet.id,
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      setStatusStep("Deploying EIP-1167 empty IslandVault on Mezo 31611...");
      const createHash = await writeContractAsync({
        address: factoryAddr,
        abi: ISLAND_FACTORY_ABI,
        functionName: "createIsland",
        args: [name.trim(), biomeTheme, musdWei, address],
        value: btcWei,
        chainId: mezoTestnet.id,
      });
      setTxHash(createHash);

      if (publicClient) {
        setStatusStep("Confirming transaction & indexing your empty island...");
        await publicClient.waitForTransactionReceipt({ hash: createHash });
      }

      let chainIslandId: number | null = null;
      let vaultAddress = "";

      if (publicClient) {
        const ownerIslands = await publicClient.readContract({
          address: factoryAddr,
          abi: ISLAND_FACTORY_ABI,
          functionName: "getIslandsByOwner",
          args: [address],
        });
        const latest = ownerIslands[ownerIslands.length - 1];
        if (latest) {
          chainIslandId = Number(latest.islandId);
          vaultAddress = latest.vault;
        }
      }

      if (!vaultAddress) {
        throw new Error(
          "Island transaction confirmed but factory did not return vault address."
        );
      }

      setStatusStep("Registering empty Sub-Island in Neon Cloud DB...");
      const res = await fetch("/api/islands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainIslandId,
          ownerAddress: address,
          operatorAddress: address,
          vaultAddress,
          name: name.trim(),
          description: description.trim(),
          biomeTheme,
          seedBtc: seedBtcNum > 0 ? Number(formatEther(btcWei)) : 0,
          seedMusd: seedMusdNum > 0 ? Number(formatEther(musdWei)) : 0,
          seedTxHash: createHash,
        }),
      });
      const data = await res.json();
      if (!data.ok || !data.island) {
        throw new Error(data.error || "Failed to register custom island.");
      }

      const createdIsland = data.island as CustomIslandRecord;

      if (templateDraft) {
        setStatusStep(
          "Provisioning cloned vaults & AI agent squad onto your new Sub-Island..."
        );
        for (const vt of templateDraft.vaultTemplates) {
          await fetch(`/api/islands/${createdIsland.islandId}/vaults`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ownerAddress: address,
              plotIndex: vt.plotIndex,
              assetType: vt.assetType,
              vaultName: vt.vaultName,
              maxSingleTradeBps: vt.maxSingleTradeBps,
              maxDrawdownBps: vt.maxDrawdownBps,
              txHash: createHash,
            }),
          }).catch(() => {});
        }
        for (const ag of templateDraft.agentTemplates) {
          await fetch(`/api/islands/${createdIsland.islandId}/agents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ownerAddress: address,
              spawnSlotIndex: ag.spawnSlotIndex,
              name: ag.name,
              role: ag.role,
              specialty: ag.specialty,
              systemPrompt: ag.systemPrompt,
              allowedAssets: ag.allowedAssets,
              chassis: ag.chassis,
              primaryColor: ag.primaryColor,
              secondaryColor: ag.secondaryColor,
              headgear: ag.headgear,
              scaleFactor: ag.scaleFactor,
            }),
          }).catch(() => {});
        }
        createdIsland.vaultCount = templateDraft.vaultTemplates.length;
        createdIsland.agentCount = templateDraft.agentTemplates.length;
      }

      setStatusStep("");
      onCreated(createdIsland);
      onClose();
    } catch (err) {
      setErrorMsg(extractEvmRevertReason(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-[28px] bg-[#faf7f2] border-2 border-white shadow-2xl overflow-hidden text-[#231f20]">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#242331] to-[#3c2d5c] text-white">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-2xl bg-violet-500/30 border border-violet-300/40 flex items-center justify-center">
              <Sprout className="h-5 w-5 text-violet-200" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">
                Launch Empty Sub-Island
              </h2>
              <p className="text-[11px] text-violet-200">
                Seed BTC or MUSD on-chain, then build custom AI agents & vaults from scratch
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {!deployed && (
            <div className="rounded-2xl bg-amber-50 border border-amber-300 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <div className="font-extrabold">Ecosystem Contracts Not Configured Yet</div>
                <p className="text-[11px] mt-0.5 leading-snug">
                  Deploy <code className="font-mono">contracts/script/DeployIslandEcosystem.s.sol</code> on Mezo Testnet (31611) and add{" "}
                  <code className="font-mono">NEXT_PUBLIC_ISLAND_FACTORY_ADDRESS</code> to <code className="font-mono">.env</code> to mint live Sub-Islands.
                </p>
              </div>
            </div>
          )}

          {templateDraft ? (
            <div className="rounded-2xl bg-violet-50 border border-violet-200 px-3.5 py-2.5 text-[11px] text-violet-950 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600 shrink-0" />
              <span>
                <strong>Cloning Blueprint ({templateDraft.sourceName}):</strong>{" "}
                After your on-chain Sub-Island mints, {templateDraft.vaultTemplates.length} vault
                {templateDraft.vaultTemplates.length === 1 ? "" : "s"} &amp;{" "}
                {templateDraft.agentTemplates.length} AI agent
                {templateDraft.agentTemplates.length === 1 ? "" : "s"} will be provisioned automatically.
              </span>
            </div>
          ) : (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[11px] text-emerald-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Empty Land Guarantee:</strong> Your new island spawns as empty biome terrain with 6 open building plots—zero Main Island bots or landmarks copied over.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-extrabold uppercase text-[#5c534a] mb-1">
                Island Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CyberGrid Yield Isle"
                maxLength={48}
                required
                className="w-full rounded-xl bg-white border border-[#dfd6c5] px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-extrabold uppercase text-[#5c534a] mb-1">
                Strategy / Island Vision
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="High-frequency BTC/MUSD swing island targeting steady treasury growth"
                maxLength={160}
                className="w-full rounded-xl bg-white border border-[#dfd6c5] px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase text-[#5c534a] mb-1.5">
              Empty Terrain Biome
            </label>
            <div className="grid grid-cols-2 gap-2">
              {BIOME_OPTIONS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBiomeTheme(b.id)}
                  className={`rounded-2xl p-2.5 text-left border-2 transition-all flex items-center gap-2.5 ${
                    biomeTheme === b.id
                      ? "bg-white border-violet-600 shadow-sm"
                      : "bg-white/70 border-[#e7decb] hover:bg-white"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${b.swatch} shrink-0 border border-white shadow-inner`} />
                  <div className="min-w-0">
                    <div className="text-xs font-black truncate">{b.label}</div>
                    <div className="text-[10px] text-stone-500 truncate">{b.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-[#e6dec8] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-black">
                <Coins className="h-4 w-4 text-amber-600" />
                <span>Initial On-Chain Seed Stake</span>
              </div>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  meetsMinimumStake
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {meetsMinimumStake
                  ? "Minimum Stake Met"
                  : "Need >= 0.0001 BTC or >= 10 MUSD"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] font-bold text-stone-600 mb-1">
                  Native BTC Seed (min 0.0001)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={seedBtcInput}
                  onChange={(e) => setSeedBtcInput(e.target.value)}
                  className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-3 py-1.5 text-sm font-black"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold text-stone-600 mb-1">
                  MUSD Seed (min 10 MUSD)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={seedMusdInput}
                  onChange={(e) => setSeedMusdInput(e.target.value)}
                  className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-3 py-1.5 text-sm font-black"
                />
              </div>
            </div>
          </div>

          {statusStep && (
            <div className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-2 text-xs font-bold text-violet-900 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>{statusStep}</span>
            </div>
          )}

          {txHash && (
            <a
              href={`https://explorer.test.mezo.org/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-violet-700 hover:underline"
            >
              <span>View Island Creation Tx on Mezo Explorer</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {errorMsg && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-bold text-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl font-bold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !deployed || !meetsMinimumStake || !name.trim()}
              className="rounded-xl bg-[#242331] hover:bg-violet-700 text-white font-extrabold px-5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Deploying Island...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-1.5" />
                  {templateDraft ? "Mint & Clone Sub-Island" : "Mint Empty Sub-Island"}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
