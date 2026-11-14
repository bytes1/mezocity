import { NextRequest, NextResponse } from "next/server";
import { formatEther, parseEther } from "viem";
import {
  ISLAND_ECOSYSTEM_ADDRESSES,
  ISLAND_VAULT_ABI,
  MAIN_MUSD_VAULT_ABI,
} from "@/lib/island-contracts";
import { listCustomIslandsFromNeon } from "@/lib/island-db";
import {
  BORROWER_OPERATIONS_ABI,
  MEZO_TESTNET_LENDING_ADDRESSES,
  MUSD_ERC20_ABI,
  PRICE_FEED_ABI,
  TROVE_MANAGER_ABI,
} from "@/lib/mezo-chain";
import {
  MEZO_TOKEN_ADDRESS,
  resolveMezoCoordinationProfile,
  type MezoCoordinationProfile,
} from "@/lib/mezo-coordination";
import { readLiveMezoCoordinationProfiles } from "@/lib/mezo-coordination-server";
import { getMezoPublicClient } from "@/lib/mezo-onchain-server";

export const dynamic = "force-dynamic";

export interface CapitalLoopOwnedIsland {
  islandId: string;
  chainIslandId: number | null;
  name: string;
  biomeTheme: string;
  vaultAddress: string;
  trackedMusdBalance: number;
  trackedBtcBalance: number;
  netEquityUsd: number;
  netProfitUsd: number;
  outstandingLoanMusd: number;
}

export async function GET(req: NextRequest) {
  try {
    const userAddress = (req.nextUrl.searchParams.get("user") || "").trim();
    const hasValidUser = /^0x[0-9a-fA-F]{40}$/.test(userAddress);
    const publicClient = getMezoPublicClient();
    const mainVaultAddr = ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault;

    // 1. Live Mezo Core Protocol State (PriceFeed, TroveManager, BorrowerOperations)
    const priceWei = await publicClient
      .readContract({
        address: MEZO_TESTNET_LENDING_ADDRESSES.priceFeed,
        abi: PRICE_FEED_ABI,
        functionName: "fetchPrice",
      })
      .catch(() => parseEther("90000"));

    const btcPriceUsd = Number(Number(formatEther(priceWei)).toFixed(2)) || 90000;

    const [
      tcrWei,
      recoveryMode,
      borrowingRateWei,
      minNetDebtWei,
      gasCompWei,
    ] = await Promise.all([
      publicClient
        .readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
          abi: TROVE_MANAGER_ABI,
          functionName: "getTCR",
          args: [priceWei],
        })
        .catch(() => parseEther("2.5")),
      publicClient
        .readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
          abi: TROVE_MANAGER_ABI,
          functionName: "checkRecoveryMode",
          args: [priceWei],
        })
        .catch(() => false),
      publicClient
        .readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "borrowingRate",
        })
        .catch(() => parseEther("0.005")),
      publicClient
        .readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "minNetDebt",
        })
        .catch(() => parseEther("1800")),
      publicClient
        .readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "MUSD_GAS_COMPENSATION",
        })
        .catch(() => parseEther("200")),
    ]);

    const systemTcrPct = Number((Number(formatEther(tcrWei)) * 100).toFixed(2));
    const borrowingFeeBps = Math.round(
      Number(formatEther(borrowingRateWei)) * 10000
    );
    const minNetDebtMusd =
      Number(Number(formatEther(minNetDebtWei)).toFixed(2)) || 1800;
    const gasCompMusd =
      Number(Number(formatEther(gasCompWei)).toFixed(2)) || 200;

    // 2. MainMUSDVault Live Yield & Liquidity State
    let vaultDeployed = Boolean(mainVaultAddr);
    let totalAssetsMusd = 0;
    let trackedLiquidMusd = 0;
    let activePrincipalLoanedMusd = 0;
    let weightedLoanAprBps = 0;
    let lpYieldApyBps = 0;
    let sharePriceMusd = 1;
    let minHoldSeconds = 60;
    let emergencyPause = false;

    if (mainVaultAddr) {
      try {
        const [
          totalAssetsW,
          liquidW,
          activePrincipalW,
          weightedAprSumW,
          sharePriceW,
          minHoldW,
          pausedB,
        ] = await Promise.all([
          publicClient.readContract({
            address: mainVaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "totalAssets",
          }),
          publicClient.readContract({
            address: mainVaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "trackedLiquidMusd",
          }),
          publicClient.readContract({
            address: mainVaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "activePrincipalTotal",
          }),
          publicClient.readContract({
            address: mainVaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "weightedAprPrincipalSum",
          }),
          publicClient.readContract({
            address: mainVaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "sharePriceE18",
          }),
          publicClient.readContract({
            address: mainVaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "minHoldSeconds",
          }),
          publicClient.readContract({
            address: mainVaultAddr,
            abi: MAIN_MUSD_VAULT_ABI,
            functionName: "emergencyPause",
          }),
        ]);

        totalAssetsMusd = Number(formatEther(totalAssetsW));
        trackedLiquidMusd = Number(formatEther(liquidW));
        activePrincipalLoanedMusd = Number(formatEther(activePrincipalW));
        sharePriceMusd = Number(formatEther(sharePriceW));
        minHoldSeconds = Number(minHoldW);
        emergencyPause = Boolean(pausedB);

        if (activePrincipalW > 0n) {
          weightedLoanAprBps = Number(weightedAprSumW / activePrincipalW);
        }
        if (totalAssetsW > 0n) {
          lpYieldApyBps = Number(weightedAprSumW / totalAssetsW);
        }
      } catch (err) {
        console.warn("[GET /api/capital-loop] MainMUSDVault read warning:", err);
        vaultDeployed = false;
      }
    }

    // 3. Connected User Wallet, Trove, Vault Shares & Owned Sub-Islands
    let userState = {
      connected: hasValidUser,
      address: hasValidUser ? userAddress : "",
      walletBtc: 0,
      walletMusd: 0,
      walletMezo: 0,
      walletVeBtc: 0,
      walletVeBtcLockedBtc: 0,
      mezoProfile: resolveMezoCoordinationProfile(0) as MezoCoordinationProfile,
      mezoTier: resolveMezoCoordinationProfile(0).tier,
      troveActive: false,
      troveCollBtc: 0,
      troveDebtMusd: 0,
      troveIcrPct: 0,
      troveHf: 0,
      mainVaultShares: 0,
      mainVaultAssetsMusd: 0,
      mainVaultAllowanceMusd: 0,
      canWithdrawAfterSec: 0,
      ownedIslands: [] as CapitalLoopOwnedIsland[],
    };

    if (hasValidUser) {
      const addr = userAddress as `0x${string}`;
      const [
        btcBalW,
        musdBalW,
        mezoMap,
        troveStatusW,
        troveData,
        ownedDbIslands,
      ] = await Promise.all([
        publicClient.getBalance({ address: addr }).catch(() => 0n),
        publicClient
          .readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
            abi: MUSD_ERC20_ABI,
            functionName: "balanceOf",
            args: [addr],
          })
          .catch(() => 0n),
        readLiveMezoCoordinationProfiles([addr]),
        publicClient
          .readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
            abi: TROVE_MANAGER_ABI,
            functionName: "getTroveStatus",
            args: [addr],
          })
          .catch(() => 0n),
        publicClient
          .readContract({
            address: MEZO_TESTNET_LENDING_ADDRESSES.troveManager,
            abi: TROVE_MANAGER_ABI,
            functionName: "getEntireDebtAndColl",
            args: [addr],
          })
          .catch(() => [0n, 0n, 0n, 0n, 0n, 0n] as const),
        listCustomIslandsFromNeon(addr).catch(() => []),
      ]);

      const walletMezoProfile =
        mezoMap[addr.toLowerCase()] ?? resolveMezoCoordinationProfile(0);
      const walletMezo = walletMezoProfile.mezoBalance;
      const troveActive = Number(troveStatusW) === 1;
      const collW = troveData[0] + troveData[3];
      const debtW = troveData[1] + troveData[2] + troveData[4] + troveData[5];
      const troveCollBtc = troveActive ? Number(formatEther(collW)) : 0;
      const troveDebtMusd = troveActive ? Number(formatEther(debtW)) : 0;
      const troveIcrPct =
        troveActive && troveDebtMusd > 0
          ? Number(
              (((troveCollBtc * btcPriceUsd) / troveDebtMusd) * 100).toFixed(1)
            )
          : 0;
      const troveHf =
        troveActive && troveDebtMusd > 0
          ? Number(
              ((troveCollBtc * btcPriceUsd) / (troveDebtMusd * 1.1)).toFixed(2)
            )
          : 0;

      let mainVaultShares = 0;
      let mainVaultAssetsMusd = 0;
      let mainVaultAllowanceMusd = 0;
      let canWithdrawAfterSec = 0;

      if (mainVaultAddr && vaultDeployed) {
        try {
          const [sharesW, allowanceW, lastDepTs] = await Promise.all([
            publicClient.readContract({
              address: mainVaultAddr,
              abi: MAIN_MUSD_VAULT_ABI,
              functionName: "shareBalances",
              args: [addr],
            }),
            publicClient.readContract({
              address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
              abi: MUSD_ERC20_ABI,
              functionName: "allowance",
              args: [addr, mainVaultAddr],
            }),
            publicClient.readContract({
              address: mainVaultAddr,
              abi: MAIN_MUSD_VAULT_ABI,
              functionName: "lastDepositTimestamp",
              args: [addr],
            }),
          ]);

          mainVaultShares = Number(formatEther(sharesW));
          mainVaultAllowanceMusd = Number(formatEther(allowanceW));

          if (sharesW > 0n) {
            const assetsW = await publicClient.readContract({
              address: mainVaultAddr,
              abi: MAIN_MUSD_VAULT_ABI,
              functionName: "convertToAssets",
              args: [sharesW],
            });
            mainVaultAssetsMusd = Number(formatEther(assetsW));
          }

          const nowSec = Math.floor(Date.now() / 1000);
          const unlockAt = Number(lastDepTs) + minHoldSeconds;
          canWithdrawAfterSec =
            Number(lastDepTs) > 0 && unlockAt > nowSec ? unlockAt - nowSec : 0;
        } catch {
          // Non-fatal
        }
      }

      const ownedIslands = await Promise.all(
        ownedDbIslands.slice(0, 12).map(async (isl): Promise<CapitalLoopOwnedIsland> => {
          let trackedMusdBalance = isl.seedMusd;
          let trackedBtcBalance = isl.seedBtc;
          let netEquityUsd = isl.seedMusd + isl.seedBtc * btcPriceUsd;
          let netProfitUsd = 0;
          let outstandingLoanMusd = 0;

          if (/^0x[0-9a-fA-F]{40}$/.test(isl.vaultAddress)) {
            const vAddr = isl.vaultAddress as `0x${string}`;
            try {
              const [mW, bW, eqW, profW, debtOutW] = await Promise.all([
                publicClient.readContract({
                  address: vAddr,
                  abi: ISLAND_VAULT_ABI,
                  functionName: "trackedMusdBalance",
                }),
                publicClient.readContract({
                  address: vAddr,
                  abi: ISLAND_VAULT_ABI,
                  functionName: "trackedBtcBalance",
                }),
                publicClient.readContract({
                  address: vAddr,
                  abi: ISLAND_VAULT_ABI,
                  functionName: "getNetEquityUsd",
                }),
                publicClient.readContract({
                  address: vAddr,
                  abi: ISLAND_VAULT_ABI,
                  functionName: "getNetProfitUsd",
                }),
                publicClient.readContract({
                  address: vAddr,
                  abi: ISLAND_VAULT_ABI,
                  functionName: "outstandingLoanPrincipalMusd",
                }),
              ]);
              trackedMusdBalance = Number(formatEther(mW));
              trackedBtcBalance = Number(formatEther(bW));
              netEquityUsd = Number(formatEther(eqW));
              netProfitUsd = Number(formatEther(profW));
              outstandingLoanMusd = Number(formatEther(debtOutW));
            } catch {
              // Keep Neon fallback
            }
          }

          return {
            islandId: isl.islandId,
            chainIslandId: isl.chainIslandId,
            name: isl.name,
            biomeTheme: isl.biomeTheme,
            vaultAddress: isl.vaultAddress,
            trackedMusdBalance,
            trackedBtcBalance,
            netEquityUsd,
            netProfitUsd,
            outstandingLoanMusd,
          };
        })
      );

      userState = {
        connected: true,
        address: addr,
        walletBtc: Number(formatEther(btcBalW)),
        walletMusd: Number(formatEther(musdBalW)),
        walletMezo,
        walletVeBtc: walletMezoProfile.veBtcVotingPower,
        walletVeBtcLockedBtc: walletMezoProfile.veBtcLockedBtc,
        mezoProfile: walletMezoProfile,
        mezoTier: walletMezoProfile.tier,
        troveActive,
        troveCollBtc,
        troveDebtMusd,
        troveIcrPct,
        troveHf,
        mainVaultShares,
        mainVaultAssetsMusd,
        mainVaultAllowanceMusd,
        canWithdrawAfterSec,
        ownedIslands,
      };
    }

    return NextResponse.json({
      ok: true,
      mezoTokenAddress: MEZO_TOKEN_ADDRESS,
      contracts: {
        ...ISLAND_ECOSYSTEM_ADDRESSES,
        ...MEZO_TESTNET_LENDING_ADDRESSES,
      },
      protocol: {
        btcPriceUsd,
        systemTcrPct,
        recoveryMode: Boolean(recoveryMode),
        borrowingFeeBps,
        minNetDebtMusd,
        gasCompMusd,
        mcrPct: 110,
        ccrPct: 150,
      },
      mainVault: {
        deployed: vaultDeployed,
        totalAssetsMusd,
        trackedLiquidMusd,
        activePrincipalLoanedMusd,
        weightedLoanAprBps,
        lpYieldApyBps,
        sharePriceMusd,
        minHoldSeconds,
        emergencyPause,
      },
      user: userState,
    });
  } catch (err) {
    console.error("[GET /api/capital-loop] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to load Trove-to-Island Capital Loop telemetry",
      },
      { status: 500 }
    );
  }
}
