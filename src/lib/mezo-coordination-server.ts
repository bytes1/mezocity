import { formatEther } from "viem";
import { MUSD_ERC20_ABI, VE_BTC_ABI, VE_MEZO_ABI } from "./mezo-chain";
import {
  MEZO_TOKEN_ADDRESS,
  VEBTC_TOKEN_ADDRESS,
  VEBTC_VOTER_ADDRESS,
  VEMEZO_TOKEN_ADDRESS,
  resolveMezoCoordinationProfile,
  type MezoCoordinationProfile,
} from "./mezo-coordination";
import { getMezoPublicClient } from "./mezo-onchain-server";

const MAX_VE_NFTS_PER_WALLET = 5;

/**
 * Batch-reads live MEZO ERC-20 + Tigris VeBTC ERC-721 voting power + VeMEZO locks on Mezo Testnet (31611).
 * Keys returned are lowercased hex addresses. Failures degrade cleanly to 0.
 */
export async function readLiveMezoCoordinationProfiles(
  addresses: string[]
): Promise<Record<string, MezoCoordinationProfile>> {
  const unique = Array.from(
    new Set(
      addresses
        .map((a) => String(a || "").trim().toLowerCase())
        .filter((a) => /^0x[0-9a-f]{40}$/.test(a))
    )
  );

  const out: Record<string, MezoCoordinationProfile> = {};
  if (unique.length === 0) return out;

  const publicClient = getMezoPublicClient();
  const settled = await Promise.allSettled(
    unique.map(async (addr) => {
      const target = addr as `0x${string}`;
      const [mezoBalW, veBtcCountW, veMezoCountW] = await Promise.all([
        publicClient
          .readContract({
            address: MEZO_TOKEN_ADDRESS,
            abi: MUSD_ERC20_ABI,
            functionName: "balanceOf",
            args: [target],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: VEBTC_TOKEN_ADDRESS,
            abi: VE_BTC_ABI,
            functionName: "balanceOf",
            args: [target],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: VEMEZO_TOKEN_ADDRESS,
            abi: VE_MEZO_ABI,
            functionName: "balanceOf",
            args: [target],
          })
          .catch(() => 0n),
      ]);

      const veBtcCount = Math.min(
        MAX_VE_NFTS_PER_WALLET,
        Math.max(0, Number(veBtcCountW || 0n))
      );
      const veMezoCount = Math.min(
        MAX_VE_NFTS_PER_WALLET,
        Math.max(0, Number(veMezoCountW || 0n))
      );

      let veBtcVotingPower = 0;
      let veBtcLockedBtc = 0;

      if (veBtcCount > 0) {
        const tokenIds = await Promise.all(
          Array.from({ length: veBtcCount }, (_, idx) =>
            publicClient
              .readContract({
                address: VEBTC_TOKEN_ADDRESS,
                abi: VE_BTC_ABI,
                functionName: "ownerToNFTokenIdList",
                args: [target, BigInt(idx)],
              })
              .catch(() => 0n)
          )
        );
        const nftStats = await Promise.all(
          tokenIds
            .filter((id) => id > 0n)
            .map(async (tokenId) => {
              const [vpW, lockedRes] = await Promise.all([
                publicClient
                  .readContract({
                    address: VEBTC_TOKEN_ADDRESS,
                    abi: VE_BTC_ABI,
                    functionName: "balanceOfNFT",
                    args: [tokenId],
                  })
                  .catch(() => 0n),
                publicClient
                  .readContract({
                    address: VEBTC_TOKEN_ADDRESS,
                    abi: VE_BTC_ABI,
                    functionName: "locked",
                    args: [tokenId],
                  })
                  .catch(() => null),
              ]);
              const vp = Number(formatEther((vpW as bigint) || 0n));
              const lockedAmt =
                lockedRes && typeof lockedRes === "object" && "amount" in lockedRes
                  ? Number(
                      formatEther(
                        (lockedRes as { amount: bigint }).amount > 0n
                          ? (lockedRes as { amount: bigint }).amount
                          : 0n
                      )
                    )
                  : 0;
              return { vp, lockedAmt };
            })
        );
        for (const s of nftStats) {
          veBtcVotingPower += s.vp;
          veBtcLockedBtc += s.lockedAmt;
        }
      }

      let veMezoLockedAmount = 0;
      if (veMezoCount > 0) {
        const tokenIds = await Promise.all(
          Array.from({ length: veMezoCount }, (_, idx) =>
            publicClient
              .readContract({
                address: VEMEZO_TOKEN_ADDRESS,
                abi: VE_MEZO_ABI,
                functionName: "ownerToNFTokenIdList",
                args: [target, BigInt(idx)],
              })
              .catch(() => 0n)
          )
        );
        const locks = await Promise.all(
          tokenIds
            .filter((id) => id > 0n)
            .map((tokenId) =>
              publicClient
                .readContract({
                  address: VEMEZO_TOKEN_ADDRESS,
                  abi: VE_MEZO_ABI,
                  functionName: "locked",
                  args: [tokenId],
                })
                .catch(() => null)
            )
        );
        for (const lockRes of locks) {
          if (lockRes && typeof lockRes === "object" && "amount" in lockRes) {
            const rawAmt = (lockRes as { amount: bigint }).amount;
            if (rawAmt > 0n) {
              veMezoLockedAmount += Number(formatEther(rawAmt));
            }
          }
        }
      }

      const profile = resolveMezoCoordinationProfile({
        mezoBalance: Number(formatEther((mezoBalW as bigint) || 0n)),
        veBtcVotingPower,
        veBtcLockedBtc,
        veBtcNftCount: Number(veBtcCountW || 0n),
        veMezoLockedAmount,
        veMezoNftCount: Number(veMezoCountW || 0n),
      });

      return { addr, profile };
    })
  );

  for (const item of settled) {
    if (item.status === "fulfilled") {
      out[item.value.addr] = item.value.profile;
    }
  }
  return out;
}

/**
 * Batch-reads live ERC-20 MEZO balances on Mezo Testnet (Chain ID: 31611).
 * Keys returned are lowercased hex addresses. Failures degrade cleanly to 0.
 */
export async function readLiveMezoBalances(
  addresses: string[]
): Promise<Record<string, number>> {
  const profiles = await readLiveMezoCoordinationProfiles(addresses);
  const out: Record<string, number> = {};
  for (const [addr, profile] of Object.entries(profiles)) {
    out[addr] = profile.mezoBalance;
  }
  return out;
}

export async function readVeBtcProtocolTelemetry() {
  const publicClient = getMezoPublicClient();
  const [totalVeBtcSupplyW, epochW, voterAddr] = await Promise.all([
    publicClient
      .readContract({
        address: VEBTC_TOKEN_ADDRESS,
        abi: VE_BTC_ABI,
        functionName: "totalSupply",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: VEBTC_TOKEN_ADDRESS,
        abi: VE_BTC_ABI,
        functionName: "epoch",
      })
      .catch(() => 0n),
    publicClient
      .readContract({
        address: VEBTC_TOKEN_ADDRESS,
        abi: VE_BTC_ABI,
        functionName: "voter",
      })
      .catch(() => VEBTC_VOTER_ADDRESS),
  ]);

  return {
    veBtcAddress: VEBTC_TOKEN_ADDRESS,
    veBtcVoterAddress: String(voterAddr || VEBTC_VOTER_ADDRESS),
    veMezoAddress: VEMEZO_TOKEN_ADDRESS,
    totalVeBtcVotingPower: Number(formatEther(totalVeBtcSupplyW as bigint)),
    currentEpoch: Number(epochW || 0n),
    validatorsVoterStatus: "MAINNET_ONLY_NOT_ON_31611" as const,
  };
}
