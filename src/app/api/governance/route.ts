import { NextRequest, NextResponse } from "next/server";
import { formatEther, parseEther } from "viem";
import { ISLAND_ECOSYSTEM_ADDRESSES } from "@/lib/island-contracts";
import {
  castGovernanceDraftVoteInNeon,
  createGovernanceDraftInNeon,
  listCustomIslandsFromNeon,
  listGovernanceDraftsFromNeon,
  listIslandEndorsementsFromNeon,
  listRevenueLedgerFromNeon,
  recordRevenueLedgerEventInNeon,
  upsertIslandEndorsementInNeon,
  type GovernanceDraftProposalRecord,
  type RevenueLedgerEventRecord,
} from "@/lib/island-db";
import {
  MAIN_MEZO_VAULT_ABI,
  MAIN_MEZO_VAULT_ADDRESS,
  MEZO_FEE_SPLITTER_ABI,
  MEZO_FEE_SPLITTER_ADDRESS,
  MEZO_GOVERNOR_ABI,
  MEZO_GOVERNOR_ADDRESS,
  MEZO_TESTNET_LENDING_ADDRESSES,
  MUSD_ERC20_ABI,
  extractEvmRevertReason,
} from "@/lib/mezo-chain";
import {
  resolveMezoCoordinationProfile,
  type MezoCoordinationProfile,
} from "@/lib/mezo-coordination";
import {
  readLiveMezoCoordinationProfiles,
  readVeBtcProtocolTelemetry,
} from "@/lib/mezo-coordination-server";
import {
  getMezoOperatorWallet,
  getMezoPublicClient,
  withOperatorLock,
} from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

const REVENUE_STREAM_CATALOG = [
  {
    streamId: 0 as const,
    code: "CREDIT_SPREAD",
    name: "Sub-Island Credit Spread",
    suggestedRate: "15% of loan interest + 0.25% origination",
    description:
      "MainMUSDVault forwards 15% of repaid Sub-Island interest into FeeSplitter while LPs keep 85%.",
  },
  {
    streamId: 1 as const,
    code: "CLONE_ROYALTY",
    name: "Strategy Clone & Profit Cut",
    suggestedRate: "10% HWM profit (50% Creator / 35% MEZO / 15% Treasury)",
    description:
      "Charged strictly above High-Water Mark on cloned & autonomous ProfitCheckpoints.",
  },
  {
    streamId: 2 as const,
    code: "SWAP_EARN_FEE",
    name: "Swap & Earn Routing",
    suggestedRate: "50% of 0.10% pool fee (5 bps) + auto-compound fee",
    description:
      "MezoTestnetSwapPool sweeps its protocol swap fee share automatically on BTC <-> MUSD fills.",
  },
  {
    streamId: 3 as const,
    code: "GUARD_PREMIUM",
    name: "Mezo Guard Rescue Fee",
    suggestedRate: "0.50% per rescue (Waived for Citadel Council)",
    description:
      "Automated 110% MCR Trove rescues charge 0.50% vs ~10%+ liquidation loss; free for 500+ MEZO tier.",
  },
  {
    streamId: 4 as const,
    code: "SAAS_MINT",
    name: "Island Launch & Managed AI SaaS",
    suggestedRate: "5 MUSD launch (50%–100% off via MEZO) + MCP/Keeper credits",
    description:
      "IslandFactory discounts/waives mint fees for MEZO tiers; BYOK stays free while hosted Keepers pay MUSD.",
  },
] as const;

export interface OnChainProposalItem {
  id: number;
  category: number;
  proposer: string;
  target: string;
  valueMusd: number;
  callData: string;
  title: string;
  summary: string;
  startTime: number;
  endTime: number;
  eta: number;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  queued: boolean;
  executed: boolean;
  canceled: boolean;
  stateCode: number;
  stateLabel: "ACTIVE" | "DEFEATED" | "SUCCEEDED" | "QUEUED" | "EXECUTED" | "CANCELED";
  userHasVoted: boolean;
}

export interface GovernanceIslandTarget {
  islandId: string;
  chainIslandId: number;
  name: string;
  biomeTheme: string;
  ownerAddress: string;
  onChainEndorsementPower: number;
  offChainEndorsementPower: number;
  totalEndorsementPower: number;
}

export interface GovernanceApiResponse {
  ok: boolean;
  contracts: {
    mainMezoVault: string;
    feeSplitter: string;
    governor: string;
    mainMusdVault: string;
    islandCreditCouncil: string;
    mezoSwapPool: string;
    islandFactory: string;
    feeSplitterDeployed: boolean;
    governorDeployed: boolean;
    mainMezoVaultDeployed: boolean;
  };
  revenue: {
    totalCollectedMusd: number;
    totalToMezoStakersMusd: number;
    totalToTreasuryMusd: number;
    totalToInsuranceMusd: number;
    insuranceReserveBalanceMusd: number;
    pendingStakerRewardsMusd: number;
    mezoStakersBps: number;
    treasuryBps: number;
    insuranceBps: number;
    streamTotals: Array<{
      streamId: 0 | 1 | 2 | 3 | 4;
      code: string;
      name: string;
      suggestedRate: string;
      description: string;
      onChainMusd: number;
      ledgerMusd: number;
    }>;
    recentEvents: RevenueLedgerEventRecord[];
  };
  governance: {
    proposalThresholdPower: number;
    quorumPower: number;
    votingPeriodSeconds: number;
    executionDelaySeconds: number;
    guardian: string;
    totalVaultWeightedPower: number;
    onChainProposals: OnChainProposalItem[];
    draftProposals: GovernanceDraftProposalRecord[];
    islands: GovernanceIslandTarget[];
  };
  userState: {
    connected: boolean;
    address: string;
    onChainVotingPower: number;
    endorsedChainIslandId: number;
    endorsedNeonIslandId: string;
    profile: MezoCoordinationProfile;
  };
  veBtcProtocol: {
    totalVeBtcVotingPower: number;
    currentEpoch: number;
  };
  fetchedAt: string;
}

const PROPOSAL_STATE_LABELS = [
  "ACTIVE",
  "DEFEATED",
  "SUCCEEDED",
  "QUEUED",
  "EXECUTED",
  "CANCELED",
] as const;

export async function GET(req: NextRequest) {
  try {
    const userAddress = (req.nextUrl.searchParams.get("user") || "").trim();
    const hasValidUser = /^0x[0-9a-fA-F]{40}$/.test(userAddress);

    const [profileMap, veBtcProtocol, islands, draftProposals, recentEvents, neonEndorsements] =
      await Promise.all([
        hasValidUser
          ? readLiveMezoCoordinationProfiles([userAddress])
          : Promise.resolve({} as Record<string, MezoCoordinationProfile>),
        readVeBtcProtocolTelemetry(),
        listCustomIslandsFromNeon().catch(() => []),
        listGovernanceDraftsFromNeon().catch(() => []),
        listRevenueLedgerFromNeon().catch(() => []),
        listIslandEndorsementsFromNeon().catch(() => []),
      ]);

    const resolvedProfile =
      (hasValidUser ? profileMap[userAddress.toLowerCase()] : undefined) ??
      resolveMezoCoordinationProfile(0);

    const publicClient = getMezoPublicClient();

    // Revenue defaults match MezoCityFeeSplitter constructor defaults (50 / 30 / 20)
    let totalCollectedMusd = 0;
    let totalToMezoStakersMusd = 0;
    let totalToTreasuryMusd = 0;
    let totalToInsuranceMusd = 0;
    let insuranceReserveBalanceMusd = 0;
    let pendingStakerRewardsMusd = 0;
    let mezoStakersBps = 5000;
    let treasuryBps = 3000;
    let insuranceBps = 2000;
    const onChainStreamTotals = [0, 0, 0, 0, 0];

    if (MEZO_FEE_SPLITTER_ADDRESS) {
      const [overview, ...streams] = await Promise.all([
        publicClient
          .readContract({
            address: MEZO_FEE_SPLITTER_ADDRESS,
            abi: MEZO_FEE_SPLITTER_ABI,
            functionName: "splitterOverview",
          })
          .catch(() => null),
        ...[0, 1, 2, 3, 4].map((id) =>
          publicClient
            .readContract({
              address: MEZO_FEE_SPLITTER_ADDRESS as `0x${string}`,
              abi: MEZO_FEE_SPLITTER_ABI,
              functionName: "streamTotalsMusd",
              args: [id],
            })
            .catch(() => 0n)
        ),
      ]);

      if (overview) {
        const tuple = overview as readonly [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          number,
          number,
          number
        ];
        totalCollectedMusd = Number(formatEther(tuple[0]));
        totalToMezoStakersMusd = Number(formatEther(tuple[1]));
        totalToTreasuryMusd = Number(formatEther(tuple[2]));
        totalToInsuranceMusd = Number(formatEther(tuple[3]));
        insuranceReserveBalanceMusd = Number(formatEther(tuple[4]));
        pendingStakerRewardsMusd = Number(formatEther(tuple[5]));
        mezoStakersBps = Number(tuple[6]);
        treasuryBps = Number(tuple[7]);
        insuranceBps = Number(tuple[8]);
      }
      streams.forEach((raw, idx) => {
        onChainStreamTotals[idx] = Number(formatEther((raw as bigint) ?? 0n));
      });
    }

    let totalVaultWeightedPower = 0;
    if (MAIN_MEZO_VAULT_ADDRESS) {
      const vaultOverview = await publicClient
        .readContract({
          address: MAIN_MEZO_VAULT_ADDRESS,
          abi: MAIN_MEZO_VAULT_ABI,
          functionName: "vaultOverview",
        })
        .catch(() => null);
      if (vaultOverview) {
        const tuple = vaultOverview as readonly [bigint, bigint, bigint, bigint, number, boolean];
        totalVaultWeightedPower = Number(formatEther(tuple[1]));
      }
    }

    let proposalThresholdPower = 50;
    let quorumPower = 100;
    let votingPeriodSeconds = 259_200; // 3 days
    let executionDelaySeconds = 3_600; // 1 hour
    let guardian = "";
    let onChainProposals: OnChainProposalItem[] = [];
    let onChainVotingPower = 0;
    let endorsedChainIslandId = 0;
    const onChainEndorsementByChainId = new Map<number, number>();

    const chainIslandIds = islands
      .map((i) => i.chainIslandId)
      .filter((id): id is number => typeof id === "number" && id > 0);

    if (MEZO_GOVERNOR_ADDRESS) {
      const govAddr = MEZO_GOVERNOR_ADDRESS;
      const [threshRaw, quorumRaw, periodRaw, delayRaw, guardianRaw, rawProposals, endorsementsRaw] =
        await Promise.all([
          publicClient
            .readContract({ address: govAddr, abi: MEZO_GOVERNOR_ABI, functionName: "proposalThresholdPower" })
            .catch(() => parseEther("50")),
          publicClient
            .readContract({ address: govAddr, abi: MEZO_GOVERNOR_ABI, functionName: "quorumPower" })
            .catch(() => parseEther("100")),
          publicClient
            .readContract({ address: govAddr, abi: MEZO_GOVERNOR_ABI, functionName: "votingPeriodSeconds" })
            .catch(() => 259_200),
          publicClient
            .readContract({ address: govAddr, abi: MEZO_GOVERNOR_ABI, functionName: "executionDelaySeconds" })
            .catch(() => 3_600),
          publicClient
            .readContract({ address: govAddr, abi: MEZO_GOVERNOR_ABI, functionName: "guardian" })
            .catch(() => ""),
          publicClient
            .readContract({ address: govAddr, abi: MEZO_GOVERNOR_ABI, functionName: "getAllProposals" })
            .catch(() => []),
          chainIslandIds.length > 0
            ? publicClient
                .readContract({
                  address: govAddr,
                  abi: MEZO_GOVERNOR_ABI,
                  functionName: "getIslandEndorsements",
                  args: [chainIslandIds.map((id) => BigInt(id))],
                })
                .catch(() => [])
            : Promise.resolve([]),
        ]);

      proposalThresholdPower = Number(formatEther((threshRaw as bigint) ?? 0n));
      quorumPower = Number(formatEther((quorumRaw as bigint) ?? 0n));
      votingPeriodSeconds = Number(periodRaw || 259_200);
      executionDelaySeconds = Number(delayRaw || 3_600);
      guardian = String(guardianRaw || "");

      (endorsementsRaw as bigint[]).forEach((pow, i) => {
        const cid = chainIslandIds[i];
        if (cid) onChainEndorsementByChainId.set(cid, Number(formatEther(pow ?? 0n)));
      });

      if (hasValidUser) {
        const [vpRaw, endRaw] = await Promise.all([
          publicClient
            .readContract({
              address: govAddr,
              abi: MEZO_GOVERNOR_ABI,
              functionName: "votingPowerOf",
              args: [userAddress as `0x${string}`],
            })
            .catch(() => 0n),
          publicClient
            .readContract({
              address: govAddr,
              abi: MEZO_GOVERNOR_ABI,
              functionName: "endorsedIslandOf",
              args: [userAddress as `0x${string}`],
            })
            .catch(() => 0n),
        ]);
        onChainVotingPower = Number(formatEther((vpRaw as bigint) ?? 0n));
        endorsedChainIslandId = Number((endRaw as bigint) ?? 0n);
      }

      const rawList = rawProposals as Array<{
        id: bigint;
        category: number;
        proposer: string;
        target: string;
        value: bigint;
        callData: string;
        title: string;
        summary: string;
        startTime: bigint;
        endTime: bigint;
        eta: bigint;
        forVotes: bigint;
        againstVotes: bigint;
        abstainVotes: bigint;
        queued: boolean;
        executed: boolean;
        canceled: boolean;
      }>;

      onChainProposals = await Promise.all(
        rawList.map(async (p) => {
          const [stateRaw, votedRaw] = await Promise.all([
            publicClient
              .readContract({
                address: govAddr,
                abi: MEZO_GOVERNOR_ABI,
                functionName: "stateOf",
                args: [p.id],
              })
              .catch(() => 0),
            hasValidUser
              ? publicClient
                  .readContract({
                    address: govAddr,
                    abi: MEZO_GOVERNOR_ABI,
                    functionName: "hasVoted",
                    args: [p.id, userAddress as `0x${string}`],
                  })
                  .catch(() => false)
              : Promise.resolve(false),
          ]);
          const stateCode = Number(stateRaw || 0);
          return {
            id: Number(p.id),
            category: Number(p.category),
            proposer: p.proposer,
            target: p.target,
            valueMusd: Number(formatEther(p.value)),
            callData: p.callData,
            title: p.title,
            summary: p.summary,
            startTime: Number(p.startTime),
            endTime: Number(p.endTime),
            eta: Number(p.eta),
            forVotes: Number(formatEther(p.forVotes)),
            againstVotes: Number(formatEther(p.againstVotes)),
            abstainVotes: Number(formatEther(p.abstainVotes)),
            queued: Boolean(p.queued),
            executed: Boolean(p.executed),
            canceled: Boolean(p.canceled),
            stateCode,
            stateLabel: PROPOSAL_STATE_LABELS[stateCode] ?? "ACTIVE",
            userHasVoted: Boolean(votedRaw),
          };
        })
      );
      onChainProposals.sort((a, b) => b.id - a.id);
    } else if (hasValidUser) {
      onChainVotingPower =
        resolvedProfile.vaultCoordinationPower > 0
          ? resolvedProfile.vaultCoordinationPower
          : resolvedProfile.effectiveScore;
    }

    const neonEndorsementTotals = new Map<string, number>();
    let endorsedNeonIslandId = "";
    for (const row of neonEndorsements) {
      neonEndorsementTotals.set(
        row.islandId,
        (neonEndorsementTotals.get(row.islandId) || 0) + row.weight
      );
      if (hasValidUser && row.voterAddress.toLowerCase() === userAddress.toLowerCase()) {
        endorsedNeonIslandId = row.islandId;
      }
    }

    const ledgerByStream = [0, 0, 0, 0, 0];
    for (const ev of recentEvents) {
      if (ev.streamId >= 0 && ev.streamId <= 4) {
        ledgerByStream[ev.streamId] += ev.totalMusd;
      }
    }

    const islandTargets: GovernanceIslandTarget[] = islands
      .slice(0, 16)
      .map((isl) => {
        const cid = isl.chainIslandId || 0;
        const onChainPow = cid > 0 ? onChainEndorsementByChainId.get(cid) || 0 : 0;
        const offChainPow = neonEndorsementTotals.get(isl.islandId) || 0;
        return {
          islandId: isl.islandId,
          chainIslandId: cid,
          name: isl.name,
          biomeTheme: isl.biomeTheme,
          ownerAddress: isl.ownerAddress,
          onChainEndorsementPower: Number(onChainPow.toFixed(2)),
          offChainEndorsementPower: Number(offChainPow.toFixed(2)),
          totalEndorsementPower: Number((onChainPow + offChainPow).toFixed(2)),
        };
      })
      .sort((a, b) => b.totalEndorsementPower - a.totalEndorsementPower);

    const payload: GovernanceApiResponse = {
      ok: true,
      contracts: {
        mainMezoVault: MAIN_MEZO_VAULT_ADDRESS,
        feeSplitter: MEZO_FEE_SPLITTER_ADDRESS,
        governor: MEZO_GOVERNOR_ADDRESS,
        mainMusdVault: ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault,
        islandCreditCouncil: ISLAND_ECOSYSTEM_ADDRESSES.islandCreditCouncil,
        mezoSwapPool: ISLAND_ECOSYSTEM_ADDRESSES.mezoSwapPool,
        islandFactory: ISLAND_ECOSYSTEM_ADDRESSES.islandFactory,
        feeSplitterDeployed: Boolean(MEZO_FEE_SPLITTER_ADDRESS),
        governorDeployed: Boolean(MEZO_GOVERNOR_ADDRESS),
        mainMezoVaultDeployed: Boolean(MAIN_MEZO_VAULT_ADDRESS),
      },
      revenue: {
        totalCollectedMusd: Number(totalCollectedMusd.toFixed(4)),
        totalToMezoStakersMusd: Number(totalToMezoStakersMusd.toFixed(4)),
        totalToTreasuryMusd: Number(totalToTreasuryMusd.toFixed(4)),
        totalToInsuranceMusd: Number(totalToInsuranceMusd.toFixed(4)),
        insuranceReserveBalanceMusd: Number(insuranceReserveBalanceMusd.toFixed(4)),
        pendingStakerRewardsMusd: Number(pendingStakerRewardsMusd.toFixed(4)),
        mezoStakersBps,
        treasuryBps,
        insuranceBps,
        streamTotals: REVENUE_STREAM_CATALOG.map((meta) => ({
          ...meta,
          onChainMusd: Number(onChainStreamTotals[meta.streamId].toFixed(4)),
          ledgerMusd: Number(ledgerByStream[meta.streamId].toFixed(4)),
        })),
        recentEvents,
      },
      governance: {
        proposalThresholdPower,
        quorumPower,
        votingPeriodSeconds,
        executionDelaySeconds,
        guardian,
        totalVaultWeightedPower: Number(totalVaultWeightedPower.toFixed(2)),
        onChainProposals,
        draftProposals,
        islands: islandTargets,
      },
      userState: {
        connected: hasValidUser,
        address: userAddress,
        onChainVotingPower: Number(onChainVotingPower.toFixed(2)),
        endorsedChainIslandId,
        endorsedNeonIslandId,
        profile: resolvedProfile,
      },
      veBtcProtocol: {
        totalVeBtcVotingPower: Number(veBtcProtocol.totalVeBtcVotingPower.toFixed(4)),
        currentEpoch: veBtcProtocol.currentEpoch,
      },
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: extractEvmRevertReason(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    if (action === "create_proposal") {
      const voterAddress = String(body?.proposerAddress || "").trim();
      const title = String(body?.title || "").trim().slice(0, 140);
      const summary = String(body?.summary || "").trim().slice(0, 800);
      const category = Math.min(6, Math.max(0, Number(body?.category ?? 0)));
      const targetContract = String(body?.targetContract || "").trim();
      const calldataPreview = String(body?.calldataPreview || "").trim();
      const txHash = String(body?.txHash || "").trim();

      if (!/^0x[0-9a-fA-F]{40}$/.test(voterAddress) || !title) {
        return NextResponse.json(
          { ok: false, error: "Valid proposerAddress and title are required." },
          { status: 400 }
        );
      }

      const profiles = await readLiveMezoCoordinationProfiles([voterAddress]);
      const prof = profiles[voterAddress.toLowerCase()] ?? resolveMezoCoordinationProfile(0);
      const power = prof.vaultCoordinationPower > 0 ? prof.vaultCoordinationPower : prof.effectiveScore;

      if (!txHash && power < 50) {
        return NextResponse.json(
          {
            ok: false,
            error: `At least 50 MEZO coordination power is required to draft a proposal (current: ${power.toFixed(1)}).`,
          },
          { status: 400 }
        );
      }

      const proposalId = `gov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await createGovernanceDraftInNeon({
        proposalId,
        chainProposalId: Number(body?.chainProposalId || 0),
        category,
        title,
        summary,
        proposerAddress: voterAddress,
        targetContract,
        calldataPreview,
        forVotes: 0,
        againstVotes: 0,
        abstainVotes: 0,
        status: txHash ? "ON_CHAIN" : "OFFCHAIN_DRAFT",
        txHash,
      });

      return NextResponse.json({ ok: true, proposalId });
    }

    if (action === "cast_vote") {
      const proposalId = String(body?.proposalId || "").trim();
      const voterAddress = String(body?.voterAddress || "").trim();
      const support = Number(body?.support ?? 1);
      if (!proposalId || !/^0x[0-9a-fA-F]{40}$/.test(voterAddress) || ![0, 1, 2].includes(support)) {
        return NextResponse.json(
          { ok: false, error: "proposalId, valid voterAddress, and support (0/1/2) are required." },
          { status: 400 }
        );
      }

      const profiles = await readLiveMezoCoordinationProfiles([voterAddress]);
      const prof = profiles[voterAddress.toLowerCase()] ?? resolveMezoCoordinationProfile(0);
      const weight = Number(
        (prof.vaultCoordinationPower > 0 ? prof.vaultCoordinationPower : prof.effectiveScore).toFixed(2)
      );
      if (weight <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Wallet has 0 active MEZO / veMEZO / veBTC voting power.",
          },
          { status: 400 }
        );
      }

      const res = await castGovernanceDraftVoteInNeon({
        proposalId,
        voterAddress,
        support: support as 0 | 1 | 2,
        weight,
        txHash: String(body?.txHash || ""),
      });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, weight });
    }

    if (action === "endorse_island") {
      const voterAddress = String(body?.voterAddress || "").trim();
      const islandId = String(body?.islandId || "").trim();
      const txHash = String(body?.txHash || "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(voterAddress)) {
        return NextResponse.json(
          { ok: false, error: "Valid voterAddress is required." },
          { status: 400 }
        );
      }

      const profiles = await readLiveMezoCoordinationProfiles([voterAddress]);
      const prof = profiles[voterAddress.toLowerCase()] ?? resolveMezoCoordinationProfile(0);
      const weight = Number(
        (prof.vaultCoordinationPower > 0 ? prof.vaultCoordinationPower : prof.effectiveScore).toFixed(2)
      );
      if (islandId && weight <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Stake MEZO in MainMEZOVault or hold veMEZO/veBTC to endorse a Sub-Island.",
          },
          { status: 400 }
        );
      }

      await upsertIslandEndorsementInNeon({ voterAddress, islandId, weight, txHash });
      return NextResponse.json({ ok: true, islandId, weight });
    }

    if (action === "collect_revenue") {
      const streamId = Math.min(4, Math.max(0, Number(body?.streamId ?? 0)));
      const musdAmount = Number(body?.musdAmount || 0);
      const memo = String(body?.memo || REVENUE_STREAM_CATALOG[streamId]?.code || "PROTOCOL_FEE")
        .trim()
        .slice(0, 64);

      if (!Number.isFinite(musdAmount) || musdAmount <= 0 || musdAmount > 5000) {
        return NextResponse.json(
          { ok: false, error: "musdAmount must be between 0 and 5000 MUSD." },
          { status: 400 }
        );
      }

      if (!MEZO_FEE_SPLITTER_ADDRESS) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "MezoCityFeeSplitter is not deployed yet (NEXT_PUBLIC_MEZO_FEE_SPLITTER_ADDRESS missing).",
          },
          { status: 400 }
        );
      }

      const splitterAddr: `0x${string}` = MEZO_FEE_SPLITTER_ADDRESS;
      const txHash = await withOperatorLock(async () => {
        const publicClient = getMezoPublicClient();
        const { account, walletClient } = getMezoOperatorWallet();
        const amountWei = parseEther(musdAmount.toString());

        const allowance = await publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "allowance",
          args: [account.address, splitterAddr],
        });

        if ((allowance as bigint) < amountWei) {
          const appHash = await walletClient.writeContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "approve",
            args: [splitterAddr, amountWei],
          });
          await publicClient.waitForTransactionReceipt({ hash: appHash });
        }

        const hash = await walletClient.writeContract({
          address: splitterAddr,
          abi: MEZO_FEE_SPLITTER_ABI,
          functionName: "collectRevenue",
          args: [streamId, amountWei, memo],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      });

      await recordRevenueLedgerEventInNeon({
        eventId: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        streamId,
        streamLabel: REVENUE_STREAM_CATALOG[streamId]?.name || "Protocol Fee",
        totalMusd: musdAmount,
        stakersShareMusd: Number((musdAmount * 0.5).toFixed(4)),
        treasuryShareMusd: Number((musdAmount * 0.3).toFixed(4)),
        insuranceShareMusd: Number((musdAmount * 0.2).toFixed(4)),
        memo,
        txHash,
        sourceMode: "ONCHAIN",
      });

      return NextResponse.json({ ok: true, txHash, musdAmount, streamId });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown governance action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: extractEvmRevertReason(err) },
      { status: 500 }
    );
  }
}
