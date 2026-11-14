"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  Award,
  Bot,
  Copy,
  ExternalLink,
  Filter,
  Flame,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Vault,
  Zap,
  ArrowUpRight,
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
import {
  MEZO_COORDINATION_TIERS,
  MEZO_TOKEN_ADDRESS,
  resolveMezoCoordinationTier,
  STARTER_STRATEGY_TEMPLATES,
  type IslandCloneTemplate,
  type MezoCoordinationTier,
} from "@/lib/mezo-coordination";
import type { IslandBiomeTheme } from "@/lib/island-db";
import { shortenHex } from "@/lib/utils";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

interface LeaderboardApiResponse {
  ok: boolean;
  mezoTokenAddress: string;
  veBtcProtocol?: {
    veBtcAddress: string;
    veBtcVoterAddress: string;
    veMezoAddress: string;
    totalVeBtcVotingPower: number;
    currentEpoch: number;
    validatorsVoterStatus: string;
  };
  userMezoBalance: number;
  userMezoTier: MezoCoordinationTier;
  userMezoProfile?: {
    mezoBalance: number;
    veBtcVotingPower: number;
    veBtcLockedBtc: number;
    veBtcNftCount: number;
    veMezoLockedAmount: number;
    effectiveScore: number;
    boostedByVeBtc: boolean;
    boostSourceLabel: string;
  };
  stats: {
    totalIslands: number;
    totalVerifiedProfitUsd: number;
    bestRoiBps: number;
    mezoBoostedCount: number;
  };
  entries: LeaderboardEntry[];
  starterTemplates: IslandCloneTemplate[];
}

interface SubIslandLeaderboardPanelProps {
  onEnterIsland: (islandId: string) => void;
  onCloneTemplate: (template: IslandCloneTemplate) => void;
}

type SortKey = "roi" | "profit" | "credit" | "mezo";

const BIOME_STYLE: Record<string, { label: string; dot: string; chip: string }> = {
  meadow: {
    label: "Clay Meadow",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  basalt: {
    label: "Obsidian Ridge",
    dot: "bg-orange-500",
    chip: "bg-slate-800 text-amber-200 border-slate-600",
  },
  sand: {
    label: "Dune Oasis",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-900 border-amber-200",
  },
  grid: {
    label: "Cyber Matrix",
    dot: "bg-cyan-500",
    chip: "bg-slate-900 text-cyan-300 border-cyan-500/40",
  },
};

export function SubIslandLeaderboardPanel({
  onEnterIsland,
  onCloneTemplate,
}: SubIslandLeaderboardPanelProps) {
  const { address } = useAccount();
  const [data, setData] = useState<LeaderboardApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [biomeFilter, setBiomeFilter] = useState<"all" | IslandBiomeTheme>("all");
  const [mezoBoostedOnly, setMezoBoostedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("roi");

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const qs = address ? `?user=${encodeURIComponent(address)}` : "";
      const res = await fetch(`/api/leaderboard${qs}`, { cache: "no-store" });
      const json = (await res.json()) as LeaderboardApiResponse;
      if (json.ok) setData(json);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const userMezoBal = data?.userMezoBalance ?? 0;
  const userVeBtc = data?.userMezoProfile?.veBtcVotingPower ?? 0;
  const userEffectiveScore = data?.userMezoProfile?.effectiveScore ?? userMezoBal;
  const userTier = data?.userMezoTier ?? resolveMezoCoordinationTier(userMezoBal);
  const mezoAddr = data?.mezoTokenAddress || MEZO_TOKEN_ADDRESS;

  const filteredEntries = useMemo(() => {
    const entries = data?.entries || [];
    const q = searchQuery.trim().toLowerCase();

    return entries
      .filter((e) => {
        if (biomeFilter !== "all" && e.biomeTheme !== biomeFilter) return false;
        if (mezoBoostedOnly && e.mezoTier.tierId === "NONE") return false;
        if (q) {
          const hay = [
            e.name,
            e.description,
            e.ownerAddress,
            ...e.agentsPreview.map((a) => `${a.name} ${a.role} ${a.specialty}`),
          ]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "profit") return b.netProfitUsd - a.netProfitUsd;
        if (sortBy === "credit") return b.creditScoreBps - a.creditScoreBps;
        if (sortBy === "mezo")
          return (b.mezoEffectiveScore ?? b.mezoBalance) - (a.mezoEffectiveScore ?? a.mezoBalance);
        if (b.roiBps !== a.roiBps) return b.roiBps - a.roiBps;
        return b.netProfitUsd - a.netProfitUsd;
      });
  }, [data?.entries, searchQuery, biomeFilter, mezoBoostedOnly, sortBy]);

  const starterTemplates = data?.starterTemplates || STARTER_STRATEGY_TEMPLATES;

  return (
    <div className="space-y-6 text-[#231f20]">
      {/* Hero + Connected Wallet MEZO Coordination Strip */}
      <div className="rounded-[28px] bg-gradient-to-r from-[#1e1b4b] via-[#312e81] to-[#4c1d95] text-white p-6 shadow-xl border-2 border-white/80 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-amber-400/25 text-amber-100 border-amber-300/40 font-black">
                MEZO + veBTC + MUSD Coordination
              </Badge>
              <Badge className="bg-emerald-400/20 text-emerald-100 border-emerald-300/40 font-extrabold">
                1-Click Copy &amp; Seed Islands
              </Badge>
              {data?.veBtcProtocol && (
                <Badge className="bg-white/15 text-amber-100 border-white/25 font-mono text-[10px]">
                  Tigris VeBTC Epoch #{data.veBtcProtocol.currentEpoch} ·{" "}
                  {data.veBtcProtocol.totalVeBtcVotingPower.toFixed(4)} veBTC Live
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-black tracking-tight">
              Verified Sub-Island Yield Leaderboard &amp; MEZO Boost Desk
            </h1>
            <p className="text-xs text-indigo-100 leading-relaxed">
              Inspect on-chain{" "}
              <code className="font-mono text-amber-200">IslandVault</code> ROI,
              Credit Council scores, and builder{" "}
              <code className="font-mono text-amber-200">MEZO</code> holdings
              — then clone any winning strategy into your own live Sub-Island in
              one click.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://explorer.test.mezo.org/token/${mezoAddr}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 px-3 py-2 text-xs font-extrabold text-white transition-colors"
            >
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              <span>MEZO {shortenHex(mezoAddr, 4)}</span>
              <ExternalLink className="h-3 w-3 opacity-80" />
            </a>
            <Button
              onClick={fetchLeaderboard}
              disabled={loading}
              variant="secondary"
              className="rounded-xl font-extrabold bg-white/95 text-indigo-950 hover:bg-white"
            >
              <RefreshCw
                className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* MEZO Coordination Tier Ladder + Wallet Status */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-white/10 rounded-2xl p-3.5 border border-white/15">
          <div className="lg:col-span-4 flex flex-col justify-between gap-2 pr-2">
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-indigo-200">
              Your Connected MEZO + veBTC Coordination Power
            </div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-2xl font-black text-white">
                {userMezoBal.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                MEZO
              </span>
              <span className="text-xs font-extrabold text-amber-200">
                + {userVeBtc.toFixed(4)} veBTC ({userEffectiveScore.toFixed(1)} pts)
              </span>
              <Badge className={`${userTier.badgeClasses} font-black border`}>
                {userTier.label}
              </Badge>
            </div>
            <div className="text-[11px] text-indigo-100">
              {address ? (
                userTier.aprDiscountBps > 0 ? (
                  <>
                    Active Underwriting Boost:{" "}
                    <strong className="text-emerald-300">
                      -{userTier.aprDiscountBps} bps APR
                    </strong>{" "}
                    (floor {(userTier.effectiveMinAprBps / 100).toFixed(2)}%)
                  </>
                ) : (
                  "Hold >= 10 MEZO or lock BTC into Tigris veBTC (0xB63f...) on Mezo Testnet (31611) for automatic APR discounts."
                )
              ) : (
                "Connect wallet to inspect your MEZO + veBTC coordination tier."
              )}
            </div>
          </div>

          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[...MEZO_COORDINATION_TIERS].reverse().map((tier) => {
              const isCurrent = userTier.tierId === tier.tierId;
              return (
                <div
                  key={tier.tierId}
                  className={`rounded-xl p-2.5 border transition-all ${
                    isCurrent
                      ? "bg-white text-[#231f20] border-amber-300 shadow-lg"
                      : "bg-white/10 text-white border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black uppercase truncate">
                      {tier.shortLabel}
                    </span>
                    {isCurrent && (
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    )}
                  </div>
                  <div className="text-sm font-black mt-0.5">
                    {tier.minMezoRequired === 0
                      ? "0 MEZO"
                      : `${tier.minMezoRequired}+ MEZO`}
                  </div>
                  <div
                    className={`text-[10px] font-bold mt-0.5 ${
                      isCurrent ? "text-emerald-700" : "text-indigo-200"
                    }`}
                  >
                    {tier.aprDiscountBps > 0
                      ? `-${tier.aprDiscountBps} bps APR • Floor ${(
                          tier.effectiveMinAprBps / 100
                        ).toFixed(2)}%`
                      : "Base Floor 5.00% APR"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ecosystem KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
          <CardHeader className="pb-1.5">
            <CardDescription className="text-[10px] font-extrabold uppercase">
              Active Sub-Islands
            </CardDescription>
            <CardTitle className="text-2xl font-black text-indigo-900">
              {data?.stats.totalIslands ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] font-semibold text-stone-600">
            EIP-1167 clones bridged to Main MUSD Vault
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
          <CardHeader className="pb-1.5">
            <CardDescription className="text-[10px] font-extrabold uppercase">
              Total Proved Profit
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-700">
              +$
              {(data?.stats.totalVerifiedProfitUsd ?? 0).toLocaleString(
                undefined,
                { maximumFractionDigits: 2 }
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] font-semibold text-stone-600">
            Liability-adjusted on-chain NAV gains
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
          <CardHeader className="pb-1.5">
            <CardDescription className="text-[10px] font-extrabold uppercase">
              Peak Verified ROI
            </CardDescription>
            <CardTitle className="text-2xl font-black text-violet-700">
              +{((data?.stats.bestRoiBps ?? 0) / 100).toFixed(2)}%
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] font-semibold text-stone-600">
            Verified via ProfitCheckpoint proofs
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-2 border-white bg-white/95 shadow-md">
          <CardHeader className="pb-1.5">
            <CardDescription className="text-[10px] font-extrabold uppercase">
              MEZO Boosted Islands
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-700">
              {data?.stats.mezoBoostedCount ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] font-semibold text-stone-600">
            Receiving Credit Council APR discounts
          </CardContent>
        </Card>
      </div>

      {/* Filter & Sort Controls */}
      <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Sub-Island name, strategy, agent specialty, or owner..."
              className="w-full rounded-xl bg-[#faf7f2] border border-[#dfd6c5] pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-stone-500 mr-1" />
            {(["all", "meadow", "basalt", "sand", "grid"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBiomeFilter(b)}
                className={`rounded-full px-3 py-1 text-[11px] font-extrabold border transition-colors ${
                  biomeFilter === b
                    ? "bg-[#242331] text-white border-[#242331]"
                    : "bg-[#faf7f2] text-stone-700 border-[#dfd6c5] hover:bg-white"
                }`}
              >
                {b === "all" ? "All Biomes" : BIOME_STYLE[b].label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setMezoBoostedOnly((v) => !v)}
              className={`rounded-full px-3 py-1 text-[11px] font-extrabold border transition-colors inline-flex items-center gap-1 ${
                mezoBoostedOnly
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-[#faf7f2] text-amber-800 border-amber-300 hover:bg-amber-50"
              }`}
            >
              <Zap className="h-3 w-3" />
              <span>MEZO Boosted</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-extrabold">
            <span className="text-stone-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-xl bg-[#faf7f2] border border-[#dfd6c5] px-2.5 py-1.5 text-xs font-extrabold"
            >
              <option value="roi">Verified ROI %</option>
              <option value="profit">Net Profit ($)</option>
              <option value="credit">Credit Score</option>
              <option value="mezo">MEZO Holding</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Live On-Chain Sub-Islands Ranking */}
      <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base font-black flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-600" />
              Live On-Chain Sub-Islands (Mezo Testnet 31611)
            </CardTitle>
            <CardDescription className="text-xs">
              Sorted by verified{" "}
              <code className="font-mono">IslandVault.sol</code> metrics and{" "}
              <code className="font-mono">IslandCreditCouncil.sol</code> scores.
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-black">
            {filteredEntries.length} Ranked Islands
          </Badge>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading && !data ? (
            <div className="rounded-2xl bg-[#faf7f2] border border-[#e6dec8] p-8 text-center text-xs font-bold text-stone-500">
              Syncing live IslandVault checkpoints and MEZO balances from Mezo
              Testnet (31611)...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="rounded-2xl bg-[#faf7f2] border border-dashed border-[#d9ceb8] p-8 text-center text-xs font-semibold text-stone-600">
              No live Sub-Islands match those filters yet. Launch a strategy
              from the 1-Click Starter Blueprints below to take Rank #1!
            </div>
          ) : (
            filteredEntries.map((entry, idx) => {
              const biomeMeta =
                BIOME_STYLE[entry.biomeTheme] || BIOME_STYLE.meadow;
              const isOwner = Boolean(
                address &&
                  entry.ownerAddress.toLowerCase() === address.toLowerCase()
              );
              const rankBadge =
                idx === 0
                  ? "bg-amber-400 text-amber-950"
                  : idx === 1
                  ? "bg-slate-300 text-slate-900"
                  : idx === 2
                  ? "bg-orange-300 text-orange-950"
                  : "bg-[#ede7dc] text-[#4a433d]";

              return (
                <div
                  key={entry.islandId}
                  className="rounded-2xl bg-[#faf7f2] border border-[#e6dec8] p-4 space-y-3 hover:border-violet-300 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex h-6 min-w-6 px-1.5 items-center justify-center rounded-full text-[11px] font-black ${rankBadge}`}
                        >
                          #{idx + 1}
                        </span>
                        <span className="text-base font-black text-[#231f20] truncate">
                          {entry.name}
                        </span>
                        <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 text-[9.5px] font-black">
                          LIVE ON-CHAIN
                        </Badge>
                        <Badge
                          className={`${biomeMeta.chip} border text-[9.5px] font-extrabold`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full mr-1 ${biomeMeta.dot}`}
                          />
                          {biomeMeta.label}
                        </Badge>
                        {entry.mezoTier.tierId !== "NONE" && (
                          <Badge
                            className={`${entry.mezoTier.badgeClasses} border text-[9.5px] font-black`}
                          >
                            <Zap className="h-3 w-3 mr-0.5" />
                            {entry.mezoTier.label} (-{entry.mezoTier.aprDiscountBps}{" "}
                            bps APR)
                          </Badge>
                        )}
                        {isOwner && (
                          <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[9.5px] font-black">
                            YOUR ISLAND
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-stone-600 line-clamp-2">
                        {entry.description ||
                          "Autonomous Sub-Island strategy verified on Mezo Testnet 31611."}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-stone-500">
                        <span>Owner {shortenHex(entry.ownerAddress)}</span>
                        <span>•</span>
                        <a
                          href={`https://explorer.test.mezo.org/address/${entry.vaultAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-violet-700 hover:underline font-mono"
                        >
                          Vault {shortenHex(entry.vaultAddress)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <span>•</span>
                        <span>{entry.totalCheckpoints} Checkpoints</span>
                        <span>•</span>
                        <span>{entry.repaidLoanCount} Repaid Loans</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEnterIsland(entry.islandId)}
                        className="rounded-xl font-extrabold text-xs border-[#d8ceb8]"
                      >
                        <span>Inspect 3D Island</span>
                        <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onCloneTemplate(entry.cloneTemplate)}
                        className="rounded-xl bg-[#242331] hover:bg-violet-700 text-white font-extrabold text-xs"
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Clone &amp; Seed
                      </Button>
                    </div>
                  </div>

                  {/* Verified Metrics Strip + Agent Squad */}
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    <div className="rounded-xl bg-white border border-[#e7decb] px-2.5 py-2">
                      <div className="text-[9px] font-extrabold uppercase text-stone-400">
                        Verified ROI
                      </div>
                      <div className="text-sm font-black text-emerald-700 flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        +{(entry.roiBps / 100).toFixed(2)}%
                      </div>
                    </div>

                    <div className="rounded-xl bg-white border border-[#e7decb] px-2.5 py-2">
                      <div className="text-[9px] font-extrabold uppercase text-stone-400">
                        Net Profit
                      </div>
                      <div className="text-sm font-black text-[#231f20]">
                        {entry.netProfitUsd >= 0 ? "+" : ""}$
                        {entry.netProfitUsd.toFixed(2)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white border border-[#e7decb] px-2.5 py-2">
                      <div className="text-[9px] font-extrabold uppercase text-stone-400">
                        Net Equity
                      </div>
                      <div className="text-sm font-black text-[#231f20]">
                        ${entry.netEquityUsd.toFixed(2)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white border border-[#e7decb] px-2.5 py-2">
                      <div className="text-[9px] font-extrabold uppercase text-stone-400">
                        Credit Score
                      </div>
                      <div className="text-sm font-black text-violet-700">
                        {(entry.creditScoreBps / 100).toFixed(1)}%
                      </div>
                    </div>

                    <div className="rounded-xl bg-white border border-[#e7decb] px-2.5 py-2">
                      <div className="text-[9px] font-extrabold uppercase text-stone-400">
                        MEZO + veBTC Power
                      </div>
                      <div className="text-sm font-black text-amber-700">
                        {entry.mezoBalance.toFixed(1)} MEZO
                        {(entry.veBtcVotingPower ?? 0) > 0 && (
                          <span className="ml-1 text-[10px] font-extrabold text-orange-600">
                            +{entry.veBtcVotingPower.toFixed(3)} veBTC
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white border border-[#e7decb] px-2.5 py-2">
                      <div className="text-[9px] font-extrabold uppercase text-stone-400">
                        Infrastructure
                      </div>
                      <div className="text-xs font-black text-stone-700 mt-0.5">
                        {entry.vaultCount} Vaults • {entry.agentCount} Agents
                      </div>
                    </div>
                  </div>

                  {entry.agentsPreview.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] font-extrabold uppercase text-stone-400 mr-1">
                        Crew Blueprint:
                      </span>
                      {entry.agentsPreview.map((ag, aIdx) => (
                        <span
                          key={`${entry.islandId}-ag-${aIdx}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#e6dec8] px-2.5 py-0.5 text-[10.5px] font-bold"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: ag.primaryColor }}
                          />
                          <span>{ag.name}</span>
                          <span className="text-[9.5px] text-stone-400 font-semibold">
                            {ag.specialty}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Curated Starter Blueprints (Track 2: 1-Click Onboarding) */}
      <Card className="rounded-[24px] border-2 border-white bg-white/95 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-black flex items-center gap-2">
                <Flame className="h-4 w-4 text-violet-700" />
                1-Click Strategy Starter Blueprints (Track 2 Onboarding)
              </CardTitle>
              <CardDescription className="text-xs">
                Pre-configured vault guardrails &amp; AI agent squads ready to
                deploy onto a fresh Sub-Island in one transaction.
              </CardDescription>
            </div>
            <Badge className="bg-violet-100 text-violet-900 border-violet-300 font-black">
              CURATED TEMPLATES
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {starterTemplates.map((tpl) => {
            const biomeMeta =
              BIOME_STYLE[tpl.biomeTheme] || BIOME_STYLE.meadow;
            return (
              <div
                key={tpl.templateId}
                className="rounded-2xl bg-[#faf7f2] border border-[#e6dec8] p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      className={`${biomeMeta.chip} border text-[9.5px] font-extrabold`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full mr-1 ${biomeMeta.dot}`}
                      />
                      {biomeMeta.label}
                    </Badge>
                    <span className="text-[10px] font-black text-stone-500">
                      {tpl.suggestedSeedBtc} BTC + {tpl.suggestedSeedMusd} MUSD
                    </span>
                  </div>

                  <div>
                    <div className="text-sm font-black text-[#231f20]">
                      {tpl.sourceName}
                    </div>
                    <p className="text-[11px] text-stone-600 mt-1 leading-snug">
                      {tpl.description}
                    </p>
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-stone-700">
                      <Vault className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>
                        {tpl.vaultTemplates.length} Vault
                        {tpl.vaultTemplates.length === 1 ? "" : "s"}:{" "}
                        {tpl.vaultTemplates.map((v) => v.vaultName).join(", ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-stone-700">
                      <Bot className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                      <span>
                        {tpl.agentTemplates.length} AI Agent
                        {tpl.agentTemplates.length === 1 ? "" : "s"}:{" "}
                        {tpl.agentTemplates
                          .map((a) => `${a.name} (${a.specialty})`)
                          .join(", ")}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => onCloneTemplate(tpl)}
                  className="w-full rounded-xl bg-[#242331] hover:bg-violet-700 text-white font-extrabold text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Launch This Blueprint
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="rounded-2xl bg-white/80 border border-white px-4 py-3 text-[11px] text-stone-600 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          Live on-chain metrics reflect <code className="font-mono">IslandVault</code> tracked balances and{" "}
          <code className="font-mono">MEZO</code> balances on Mezo Testnet (31611).
        </span>
      </div>
    </div>
  );
}
