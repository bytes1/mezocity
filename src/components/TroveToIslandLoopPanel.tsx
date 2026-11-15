"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatEther, parseEther, zeroAddress } from "viem";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  CheckCircle2,
  Coins,
  ExternalLink,
  Flame,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unlock,
  Vault,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BORROWER_OPERATIONS_ABI,
  computeMezoTroveHints,
  extractEvmRevertReason,
  MEZO_TESTNET_LENDING_ADDRESSES,
  mezoTestnet,
  MUSD_ERC20_ABI,
} from "@/lib/mezo-chain";
import {
  ISLAND_ECOSYSTEM_ADDRESSES,
  ISLAND_VAULT_ABI,
  MAIN_MUSD_VAULT_ABI,
} from "@/lib/island-contracts";

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

interface CapitalLoopApiResponse {
  ok: boolean;
  error?: string;
  mezoTokenAddress: string;
  contracts: typeof ISLAND_ECOSYSTEM_ADDRESSES &
    typeof MEZO_TESTNET_LENDING_ADDRESSES;
  protocol: {
    btcPriceUsd: number;
    systemTcrPct: number;
    recoveryMode: boolean;
    borrowingFeeBps: number;
    minNetDebtMusd: number;
    gasCompMusd: number;
    mcrPct: number;
    ccrPct: number;
  };
  mainVault: {
    deployed: boolean;
    totalAssetsMusd: number;
    trackedLiquidMusd: number;
    activePrincipalLoanedMusd: number;
    weightedLoanAprBps: number;
    lpYieldApyBps: number;
    sharePriceMusd: number;
    minHoldSeconds: number;
    emergencyPause: boolean;
  };
  user: {
    connected: boolean;
    address: string;
    walletBtc: number;
    walletMusd: number;
    walletMezo: number;
    walletVeBtc?: number;
    walletVeBtcLockedBtc?: number;
    mezoProfile?: {
      mezoBalance?: number;
      veBtcVotingPower?: number;
      effectiveCoordinationPower?: number;
      validatorsVoterStatus?: string;
    };
    mezoTier: {
      tierName?: string;
      tier?: string;
      discountBps?: number;
      feeDiscountBps?: number;
    };
    troveActive: boolean;
    troveCollBtc: number;
    troveDebtMusd: number;
    troveIcrPct: number;
    troveHf: number;
    mainVaultShares: number;
    mainVaultAssetsMusd: number;
    mainVaultAllowanceMusd: number;
    canWithdrawAfterSec: number;
    ownedIslands: CapitalLoopOwnedIsland[];
  };
}

interface TroveToIslandLoopPanelProps {
  onSelectIsland?: (islandId: string) => void;
  onVaultChanged?: () => void;
  proMode?: boolean;
}

const EXPLORER_TX_BASE = "https://explorer.test.mezo.org/tx/";

function formatNum(val: number, decimals = 2): string {
  if (!Number.isFinite(val)) return "0.00";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function TroveToIslandLoopPanel({
  onSelectIsland,
  onVaultChanged,
  proMode = false,
}: TroveToIslandLoopPanelProps) {
  const { address, chainId, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: mezoTestnet.id });
  const { writeContractAsync } = useWriteContract();

  const [data, setData] = useState<CapitalLoopApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStep, setBusyStep] = useState<string>("");
  const [guidedStep, setGuidedStep] = useState<1 | 2 | 3>(1);
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
    txHash?: string;
  } | null>(null);

  // Stage 1: Borrow inputs
  const [borrowCollBtcInput, setBorrowCollBtcInput] = useState("0.05");
  const [borrowMusdInput, setBorrowMusdInput] = useState("1850");

  // Stage 2: Deploy Yield inputs
  const [deployTarget, setDeployTarget] = useState<string>("main"); // "main" | islandId
  const [deployMusdInput, setDeployMusdInput] = useState("500");

  // Stage 3: Unwind & Repay inputs
  const [unwindSource, setUnwindSource] = useState<string>("main"); // "main" | islandId
  const [withdrawMusdInput, setWithdrawMusdInput] = useState("500");
  const [repayMusdInput, setRepayMusdInput] = useState("500");

  const fetchLoopState = useCallback(async () => {
    setLoading(true);
    try {
      const qs = address ? `?user=${address}` : "";
      const res = await fetch(`/api/capital-loop${qs}`, { cache: "no-store" });
      const json = (await res.json()) as CapitalLoopApiResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to load Capital Loop state");
      }
      setData(json);
    } catch (err) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to load on-chain state",
      });
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchLoopState();
  }, [fetchLoopState]);

  const ensureMezoWallet = useCallback(async (): Promise<`0x${string}`> => {
    if (!isConnected || !address) {
      openConnectModal?.();
      throw new Error("Connect your wallet to execute Mezo Testnet transactions.");
    }
    if (chainId !== mezoTestnet.id) {
      await switchChainAsync({ chainId: mezoTestnet.id });
    }
    if (!publicClient) {
      throw new Error("Mezo Testnet RPC client unavailable.");
    }
    return address;
  }, [address, chainId, isConnected, openConnectModal, publicClient, switchChainAsync]);

  const protocol = data?.protocol;
  const mainVault = data?.mainVault;
  const user = data?.user;
  const ownedIslands = useMemo(() => user?.ownedIslands ?? [], [user]);

  const selectedDeployIsland = useMemo(
    () => ownedIslands.find((i) => i.islandId === deployTarget) ?? null,
    [deployTarget, ownedIslands]
  );

  const selectedUnwindIsland = useMemo(
    () => ownedIslands.find((i) => i.islandId === unwindSource) ?? null,
    [unwindSource, ownedIslands]
  );

  // Live carry spread calculations (using real on-chain LP APY vs Mezo borrowing rate)
  const lpYieldPct = (mainVault?.lpYieldApyBps ?? 0) / 100;
  const weightedLoanAprPct = (mainVault?.weightedLoanAprBps ?? 0) / 100;
  const borrowingFeePct = (protocol?.borrowingFeeBps ?? 0) / 100;
  const netCarrySpreadPct = lpYieldPct - borrowingFeePct;

  // Stage 1 preview metrics
  const parsedAddCollBtc = Number(borrowCollBtcInput) || 0;
  const parsedBorrowMusd = Number(borrowMusdInput) || 0;
  const btcPriceUsd = protocol?.btcPriceUsd ?? 0;
  const minNetDebt = protocol?.minNetDebtMusd ?? 1800;
  const gasComp = protocol?.gasCompMusd ?? 200;
  const criticalCrPct = protocol?.recoveryMode
    ? protocol?.ccrPct ?? 150
    : protocol?.mcrPct ?? 110;

  const projectedTroveCollBtc =
    (user?.troveActive ? user.troveCollBtc : 0) + parsedAddCollBtc;
  const projectedFeeMusd =
    parsedBorrowMusd > 0 ? parsedBorrowMusd * (borrowingFeePct / 100) : 0;
  const projectedTroveDebtMusd = user?.troveActive
    ? user.troveDebtMusd + parsedBorrowMusd + projectedFeeMusd
    : parsedBorrowMusd + projectedFeeMusd + (parsedBorrowMusd > 0 ? gasComp : 0);
  const projectedIcrPct =
    projectedTroveDebtMusd > 0 && btcPriceUsd > 0
      ? ((projectedTroveCollBtc * btcPriceUsd) / projectedTroveDebtMusd) * 100
      : 0;

  const stage1MinDebtViolation =
    !user?.troveActive && parsedBorrowMusd > 0 && parsedBorrowMusd < minNetDebt;
  const stage1CrViolation =
    projectedTroveDebtMusd > 0 &&
    projectedIcrPct > 0 &&
    projectedIcrPct < criticalCrPct;

  // Stage 1: Execute openTrove or adjustTrove
  const handleStage1Borrow = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureMezoWallet();
      if (!publicClient) return;

      if (parsedBorrowMusd <= 0 && parsedAddCollBtc <= 0) {
        throw new Error("Enter BTC collateral and/or MUSD amount to borrow.");
      }
      if (stage1MinDebtViolation) {
        throw new Error(
          `Opening a new Mezo Trove requires at least ${formatNum(minNetDebt, 0)} net MUSD.`
        );
      }
      if (stage1CrViolation) {
        throw new Error(
          `Projected ICR (${formatNum(projectedIcrPct, 1)}%) is below the required ${criticalCrPct}% floor.`
        );
      }

      setBusyStep("borrow");
      const addCollWei = parseEther(Math.max(0, parsedAddCollBtc).toFixed(8));
      const musdBorrowWei = parseEther(Math.max(0, parsedBorrowMusd).toFixed(6));

      let feeWei = 0n;
      if (musdBorrowWei > 0n) {
        feeWei = (await publicClient.readContract({
          address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "getBorrowingFee",
          args: [musdBorrowWei],
        })) as bigint;
      }

      const currentCollWei = user?.troveActive
        ? parseEther(user.troveCollBtc.toFixed(8))
        : 0n;
      const currentDebtWei = user?.troveActive
        ? parseEther(user.troveDebtMusd.toFixed(6))
        : 0n;
      const gasCompWei = user?.troveActive
        ? 0n
        : parseEther(gasComp.toFixed(2));

      const targetCollWei = currentCollWei + addCollWei;
      const targetDebtWei =
        currentDebtWei + musdBorrowWei + feeWei + gasCompWei;

      const [upperHint, lowerHint] = await computeMezoTroveHints(
        publicClient,
        targetCollWei,
        targetDebtWei
      );

      let txHash: `0x${string}`;
      if (!user?.troveActive) {
        const sim = await publicClient.simulateContract({
          account: userAddr,
          address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "openTrove",
          args: [musdBorrowWei, upperHint, lowerHint],
          value: addCollWei,
        });
        txHash = await writeContractAsync(sim.request);
      } else {
        const sim = await publicClient.simulateContract({
          account: userAddr,
          address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: "adjustTrove",
          args: [
            0n,
            musdBorrowWei,
            musdBorrowWei > 0n,
            upperHint,
            lowerHint,
          ],
          value: addCollWei,
        });
        txHash = await writeContractAsync(sim.request);
      }

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Auto-populate Stage 2 with the newly minted MUSD amount
      if (parsedBorrowMusd > 0) {
        setDeployMusdInput(parsedBorrowMusd.toFixed(2));
      }

      setNotice({
        type: "success",
        text: user?.troveActive
          ? `Adjusted Mezo Trove (+${formatNum(parsedAddCollBtc, 4)} BTC, +${formatNum(parsedBorrowMusd, 2)} MUSD). Stage 2 pre-filled!`
          : `Opened Mezo Trove (+${formatNum(parsedAddCollBtc, 4)} BTC, minted ${formatNum(parsedBorrowMusd, 2)} MUSD). Stage 2 pre-filled!`,
        txHash,
      });
      await fetchLoopState();
      onVaultChanged?.();
    } catch (err) {
      setNotice({
        type: "error",
        text: extractEvmRevertReason(err),
      });
    } finally {
      setBusyStep("");
    }
  };

  // Shared helper for ERC-20 MUSD approve (with zero-reset hygiene if needed)
  const ensureMusdApproval = useCallback(
    async (
      owner: `0x${string}`,
      spender: `0x${string}`,
      requiredWei: bigint
    ) => {
      if (!publicClient) return;
      const currentAllowance = (await publicClient.readContract({
        address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
        abi: MUSD_ERC20_ABI,
        functionName: "allowance",
        args: [owner, spender],
      })) as bigint;

      if (currentAllowance >= requiredWei) return;

      if (currentAllowance > 0n) {
        const resetSim = await publicClient.simulateContract({
          account: owner,
          address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
          abi: MUSD_ERC20_ABI,
          functionName: "approve",
          args: [spender, 0n],
        });
        const resetHash = await writeContractAsync(resetSim.request);
        await publicClient.waitForTransactionReceipt({ hash: resetHash });
      }

      const approveSim = await publicClient.simulateContract({
        account: owner,
        address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
        abi: MUSD_ERC20_ABI,
        functionName: "approve",
        args: [spender, requiredWei],
      });
      const approveHash = await writeContractAsync(approveSim.request);
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    },
    [publicClient, writeContractAsync]
  );

  // Stage 2: Deploy borrowed MUSD into MainMUSDVault or IslandVault
  const handleStage2Deploy = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureMezoWallet();
      if (!publicClient) return;

      const amount = Number(deployMusdInput);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a positive MUSD amount to deploy.");
      }
      const amountWei = parseEther(amount.toFixed(6));

      setBusyStep("deploy");

      if (deployTarget === "main") {
        const vaultAddr = ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault as `0x${string}`;
        if (!vaultAddr || vaultAddr === zeroAddress) {
          throw new Error("MainMUSDVault address not configured.");
        }
        await ensureMusdApproval(userAddr, vaultAddr, amountWei);

        const sim = await publicClient.simulateContract({
          account: userAddr,
          address: vaultAddr,
          abi: MAIN_MUSD_VAULT_ABI,
          functionName: "depositMUSD",
          args: [amountWei],
        });
        const txHash = await writeContractAsync(sim.request);
        await publicClient.waitForTransactionReceipt({ hash: txHash });

        setNotice({
          type: "success",
          text: `Deployed ${formatNum(amount, 2)} MUSD into MainMUSDVault LP!`,
          txHash,
        });
      } else {
        const island = selectedDeployIsland;
        if (!island) {
          throw new Error("Selected Sub-Island vault not found.");
        }
        const vaultAddr = island.vaultAddress as `0x${string}`;
        await ensureMusdApproval(userAddr, vaultAddr, amountWei);

        const sim = await publicClient.simulateContract({
          account: userAddr,
          address: vaultAddr,
          abi: ISLAND_VAULT_ABI,
          functionName: "depositMusd",
          args: [amountWei],
        });
        const txHash = await writeContractAsync(sim.request);
        await publicClient.waitForTransactionReceipt({ hash: txHash });

        setNotice({
          type: "success",
          text: `Deployed ${formatNum(amount, 2)} MUSD into ${island.name} IslandVault!`,
          txHash,
        });
      }

      await fetchLoopState();
      onVaultChanged?.();
    } catch (err) {
      setNotice({
        type: "error",
        text: extractEvmRevertReason(err),
      });
    } finally {
      setBusyStep("");
    }
  };

  // Stage 3A: Withdraw MUSD from MainMUSDVault or IslandVault
  const executeWithdraw = useCallback(
    async (userAddr: `0x${string}`, targetAmountMusd: number): Promise<`0x${string}`> => {
      if (!publicClient) throw new Error("RPC client unavailable.");

      if (unwindSource === "main") {
        const vaultAddr = ISLAND_ECOSYSTEM_ADDRESSES.mainMusdVault as `0x${string}`;
        if ((user?.canWithdrawAfterSec ?? 0) > 0) {
          throw new Error(
            `MainMUSDVault anti-flashloan cooldown active (${user?.canWithdrawAfterSec}s remaining).`
          );
        }

        const userSharesWei = (await publicClient.readContract({
          address: vaultAddr,
          abi: MAIN_MUSD_VAULT_ABI,
          functionName: "shareBalances",
          args: [userAddr],
        })) as bigint;
        if (userSharesWei <= 0n) {
          throw new Error("You have 0 MainMUSDVault shares to withdraw.");
        }

        const requestedWei = parseEther(targetAmountMusd.toFixed(6));
        const neededSharesWei = (await publicClient.readContract({
          address: vaultAddr,
          abi: MAIN_MUSD_VAULT_ABI,
          functionName: "convertToShares",
          args: [requestedWei],
        })) as bigint;

        const sharesToBurn =
          neededSharesWei >= userSharesWei ||
          targetAmountMusd >= (user?.mainVaultAssetsMusd ?? 0) * 0.999
            ? userSharesWei
            : neededSharesWei;

        const sim = await publicClient.simulateContract({
          account: userAddr,
          address: vaultAddr,
          abi: MAIN_MUSD_VAULT_ABI,
          functionName: "withdrawMUSD",
          args: [sharesToBurn],
        });
        const txHash = await writeContractAsync(sim.request);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        return txHash;
      } else {
        const island = selectedUnwindIsland;
        if (!island) throw new Error("Selected Sub-Island vault not found.");
        const vaultAddr = island.vaultAddress as `0x${string}`;
        const withdrawWei = parseEther(targetAmountMusd.toFixed(6));

        const sim = await publicClient.simulateContract({
          account: userAddr,
          address: vaultAddr,
          abi: ISLAND_VAULT_ABI,
          functionName: "withdrawMusd",
          args: [withdrawWei],
        });
        const txHash = await writeContractAsync(sim.request);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        return txHash;
      }
    },
    [publicClient, selectedUnwindIsland, unwindSource, user, writeContractAsync]
  );

  // Stage 3B: Partial Repay MUSD to Trove
  const executeRepayMusd = useCallback(
    async (userAddr: `0x${string}`, repayAmountMusd: number): Promise<`0x${string}`> => {
      if (!publicClient) throw new Error("RPC client unavailable.");
      if (!user?.troveActive) {
        throw new Error("No active Mezo Trove to repay.");
      }

      const repayWei = parseEther(repayAmountMusd.toFixed(6));
      const currentCollWei = parseEther(user.troveCollBtc.toFixed(8));
      const currentDebtWei = parseEther(user.troveDebtMusd.toFixed(6));

      const remainingDebt = user.troveDebtMusd - repayAmountMusd;
      if (remainingDebt < minNetDebt + gasComp) {
        throw new Error(
          `Partial repay would leave ${formatNum(remainingDebt, 2)} MUSD debt (below ${formatNum(minNetDebt + gasComp, 0)} MUSD minimum). Use Full Close & Unlock BTC instead.`
        );
      }

      const targetDebtWei = currentDebtWei - repayWei;
      const [upperHint, lowerHint] = await computeMezoTroveHints(
        publicClient,
        currentCollWei,
        targetDebtWei
      );

      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
        abi: BORROWER_OPERATIONS_ABI,
        functionName: "repayMUSD",
        args: [repayWei, upperHint, lowerHint],
      });
      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    },
    [gasComp, minNetDebt, publicClient, user, writeContractAsync]
  );

  // Stage 3C: Close Trove & Unlock 100% BTC
  const executeCloseTrove = useCallback(
    async (userAddr: `0x${string}`): Promise<`0x${string}`> => {
      if (!publicClient) throw new Error("RPC client unavailable.");
      if (!user?.troveActive) {
        throw new Error("No active Mezo Trove to close.");
      }

      const requiredWalletMusd = Math.max(0, user.troveDebtMusd - gasComp);
      const liveMusdBalWei = (await publicClient.readContract({
        address: MEZO_TESTNET_LENDING_ADDRESSES.musdToken,
        abi: MUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [userAddr],
      })) as bigint;
      const liveMusdBal = Number(formatEther(liveMusdBalWei));

      if (liveMusdBal + 0.0001 < requiredWalletMusd) {
        throw new Error(
          `Need ${formatNum(requiredWalletMusd, 2)} MUSD in wallet to close Trove (you have ${formatNum(liveMusdBal, 2)} MUSD; ${formatNum(gasComp, 0)} MUSD gas reserve is auto-refunded).`
        );
      }

      const sim = await publicClient.simulateContract({
        account: userAddr,
        address: MEZO_TESTNET_LENDING_ADDRESSES.borrowerOperations,
        abi: BORROWER_OPERATIONS_ABI,
        functionName: "closeTrove",
        args: [],
      });
      const txHash = await writeContractAsync(sim.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    },
    [gasComp, publicClient, user, writeContractAsync]
  );

  const handleWithdrawClick = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureMezoWallet();
      const amount = Number(withdrawMusdInput);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a positive MUSD amount to withdraw.");
      }
      setBusyStep("withdraw");
      const txHash = await executeWithdraw(userAddr, amount);
      setNotice({
        type: "success",
        text: `Withdrew ~${formatNum(amount, 2)} MUSD to wallet.`,
        txHash,
      });
      await fetchLoopState();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyStep("");
    }
  };

  const handleRepayClick = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureMezoWallet();
      const amount = Number(repayMusdInput);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a positive MUSD amount to repay.");
      }
      setBusyStep("repay");
      const txHash = await executeRepayMusd(userAddr, amount);
      setNotice({
        type: "success",
        text: `Repaid ${formatNum(amount, 2)} MUSD to Mezo Trove.`,
        txHash,
      });
      await fetchLoopState();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyStep("");
    }
  };

  const handleCloseTroveClick = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureMezoWallet();
      setBusyStep("close");
      const txHash = await executeCloseTrove(userAddr);
      setNotice({
        type: "success",
        text: "Trove closed! 100% of your BTC collateral has been unlocked back to your wallet.",
        txHash,
      });
      await fetchLoopState();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyStep("");
    }
  };

  // 1-Click Full Unwind Sequence: Withdraw Yield -> Close or Repay Trove
  const handleOneClickFullUnwind = async () => {
    try {
      setNotice(null);
      const userAddr = await ensureMezoWallet();
      setBusyStep("unwind-all");

      const availableVaultMusd =
        unwindSource === "main"
          ? user?.mainVaultAssetsMusd ?? 0
          : selectedUnwindIsland?.trackedMusdBalance ?? 0;

      let lastHash: `0x${string}` | undefined;

      if (availableVaultMusd > 0.01) {
        setNotice({
          type: "info",
          text: `Step 1/2: Withdrawing ${formatNum(availableVaultMusd, 2)} MUSD from yield vault...`,
        });
        lastHash = await executeWithdraw(userAddr, availableVaultMusd);
      }

      if (user?.troveActive) {
        const netCloseNeeded = Math.max(0, user.troveDebtMusd - gasComp);
        const estimatedWalletAfter =
          (user?.walletMusd ?? 0) + availableVaultMusd;

        if (estimatedWalletAfter + 0.001 >= netCloseNeeded) {
          setNotice({
            type: "info",
            text: "Step 2/2: Closing Mezo Trove & unlocking 100% BTC collateral...",
          });
          lastHash = await executeCloseTrove(userAddr);
          setNotice({
            type: "success",
            text: "1-Click Full Unwind complete! Yield withdrawn, Trove closed, and 100% BTC unlocked.",
            txHash: lastHash,
          });
        } else {
          const maxSafeRepay = Math.max(
            0,
            Math.min(
              estimatedWalletAfter,
              user.troveDebtMusd - (minNetDebt + gasComp)
            )
          );
          if (maxSafeRepay > 1) {
            setNotice({
              type: "info",
              text: `Step 2/2: Repaying ${formatNum(maxSafeRepay, 2)} MUSD to deleverage Trove...`,
            });
            lastHash = await executeRepayMusd(userAddr, maxSafeRepay);
            setNotice({
              type: "success",
              text: `Unwind complete! Withdrew yield and repaid ${formatNum(maxSafeRepay, 2)} MUSD (remaining debt kept at ${formatNum(minNetDebt + gasComp, 0)} MUSD minimum).`,
              txHash: lastHash,
            });
          } else {
            setNotice({
              type: "info",
              text: `Yield withdrawn to wallet. Add ${formatNum(Math.max(0, netCloseNeeded - estimatedWalletAfter), 2)} MUSD to close the full Trove.`,
              txHash: lastHash,
            });
          }
        }
      } else if (lastHash) {
        setNotice({
          type: "success",
          text: "Yield withdrawn cleanly to your wallet!",
          txHash: lastHash,
        });
      } else {
        throw new Error("No active vault position or Trove found to unwind.");
      }

      await fetchLoopState();
      onVaultChanged?.();
    } catch (err) {
      setNotice({ type: "error", text: extractEvmRevertReason(err) });
    } finally {
      setBusyStep("");
    }
  };

  const totalSubIslandMusd = useMemo(
    () => ownedIslands.reduce((acc, i) => acc + i.trackedMusdBalance, 0),
    [ownedIslands]
  );

  return (
    <div className="space-y-6 text-[#231f20]">
      {/* Loop Hero / Strategy Strip */}
      <div className="rounded-2xl border border-indigo-300/60 bg-gradient-to-r from-indigo-950 via-slate-900 to-emerald-950 p-5 text-white shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-emerald-300 border border-emerald-400/30">
            <Zap className="h-3.5 w-3.5" />
            {proMode
              ? "Plan I • Autonomous Trove-to-Island Capital Loop"
              : "Guided Loop · Borrow & Earn Yield"}
          </div>
          <h2 className="text-xl font-black tracking-tight">
            {proMode
              ? "BTC Collateral → Mint MUSD → Earn Protocol Yield → 1-Click Unwind"
              : "Put Your Bitcoin to Work Without Selling It"}
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl">
            {proMode
              ? "Compose Mezo native BTC borrowing directly with MezoCity yield vaults in a single guided pipeline. Every rate, TCR guard, and share price is read live from Mezo Testnet (31611)."
              : "Follow 3 guided steps: lock BTC to borrow MUSD, deposit that MUSD to earn yield, and unwind anytime with 1 click."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isConnected && (
            <Button
              onClick={() => openConnectModal?.()}
              className="rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black"
            >
              <Wallet className="h-4 w-4 mr-1.5" />
              Connect Wallet
            </Button>
          )}
          <Button
            onClick={fetchLoopState}
            variant="secondary"
            disabled={loading}
            className="rounded-xl font-extrabold bg-white/95 text-slate-900 hover:bg-white"
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            {proMode ? "Refresh Loop" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Recovery Mode Warning Banner */}
      {protocol?.recoveryMode && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-900 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>
            {proMode
              ? `Mezo Recovery Mode is ACTIVE (System TCR: ${formatNum(protocol.systemTcrPct, 1)}% < 150%). New Troves and draws must maintain at least ${protocol.ccrPct}% Collateral Ratio.`
              : `Safety Buffer Active: loans currently require at least ${protocol.ccrPct}% Bitcoin collateral coverage.`}
          </span>
        </div>
      )}

      {/* Transaction / Error Notice */}
      {notice && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-bold flex flex-wrap items-center justify-between gap-2 ${
            notice.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : notice.type === "error"
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-indigo-300 bg-indigo-50 text-indigo-900"
          }`}
        >
          <span className="flex items-center gap-2">
            {notice.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : notice.type === "error" ? (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600 shrink-0" />
            )}
            {notice.text}
          </span>
          {notice.txHash && (
            <a
              href={`${EXPLORER_TX_BASE}${notice.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline font-black"
            >
              View on Mezo Explorer
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      {/* 4 Live Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span>{proMode ? "Your BTC Trove & HF" : "Your BTC Loan"}</span>
              <ShieldCheck className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-xl font-black text-slate-900">
              {user?.troveActive
                ? proMode
                  ? `${formatNum(user.troveIcrPct, 1)}% ICR`
                  : `${formatNum(user.troveCollBtc, 4)} BTC`
                : "No Loan Yet"}
            </div>
            <div className="text-xs font-semibold text-slate-600">
              {user?.troveActive
                ? proMode
                  ? `${formatNum(user.troveCollBtc, 4)} BTC • ${formatNum(user.troveDebtMusd, 0)} MUSD debt (HF ${formatNum(user.troveHf, 2)}x)`
                  : `Debt: ${formatNum(user.troveDebtMusd, 0)} MUSD • Safety ${formatNum(user.troveHf, 2)}x`
                : `Wallet: ${formatNum(user?.walletBtc ?? 0, 4)} BTC • ${formatNum(user?.walletMusd ?? 0, 2)} MUSD`}
            </div>
            {proMode && ((user?.walletVeBtc ?? 0) > 0 || (user?.walletMezo ?? 0) > 0) ? (
              <div className="text-[11px] font-bold text-amber-800">
                veBTC: {formatNum(user?.walletVeBtc ?? 0, 4)} • MEZO:{" "}
                {formatNum(user?.walletMezo ?? 0, 1)} ({user?.mezoTier?.tierName || "Base"})
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span>{proMode ? "MUSD Deployed in Yield" : "MUSD Earning Yield"}</span>
              <Vault className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-emerald-700">
              {formatNum(
                (user?.mainVaultAssetsMusd ?? 0) + totalSubIslandMusd,
                2
              )}{" "}
              MUSD
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Main Pool: {formatNum(user?.mainVaultAssetsMusd ?? 0, 2)} • Islands:{" "}
              {formatNum(totalSubIslandMusd, 2)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span>{proMode ? "Live Carry & LP Yield" : "Expected Interest"}</span>
              <Sparkles className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="text-xl font-black text-indigo-700">
              {formatNum(lpYieldPct, 2)}% APY
            </div>
            <div className="text-xs font-semibold text-slate-600">
              Borrow Fee: {formatNum(borrowingFeePct, 2)}% • Net:{" "}
              <span
                className={
                  netCarrySpreadPct >= 0 ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"
                }
              >
                {netCarrySpreadPct >= 0 ? "+" : ""}
                {formatNum(netCarrySpreadPct, 2)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500">
              <span>{proMode ? "Mezo System & Oracle" : "Live Bitcoin Price"}</span>
              <Coins className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-xl font-black text-slate-900">
              ${formatNum(btcPriceUsd, 0)} / BTC
            </div>
            <div className="text-xs font-semibold text-slate-600">
              {proMode
                ? `System TCR: ${formatNum(protocol?.systemTcrPct ?? 0, 1)}% • ${protocol?.recoveryMode ? "Recovery (150%)" : "Normal (110% MCR)"}`
                : protocol?.recoveryMode
                  ? "Extra collateral required (150%+)"
                  : "Standard rules (110%+ min collateral)"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Simple Mode 3-Step Guided Stepper */}
      {!proMode && (
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          {[
            { step: 1 as const, label: "1. Borrow MUSD", sub: "Lock BTC safely" },
            { step: 2 as const, label: "2. Earn Yield", sub: "Deposit MUSD" },
            { step: 3 as const, label: "3. Repay & Exit", sub: "Unlock 100% BTC" },
          ].map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={() => setGuidedStep(s.step)}
              className={`rounded-xl px-3 py-2 text-left transition-all ${
                guidedStep === s.step
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <div className="text-xs font-black">{s.label}</div>
              <div
                className={`text-[10.5px] font-medium ${
                  guidedStep === s.step ? "text-indigo-100" : "text-slate-400"
                }`}
              >
                {s.sub}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 3-Stage Guided Capital Loop Pipeline */}
      <div
        className={
          proMode
            ? "grid grid-cols-1 xl:grid-cols-3 gap-5"
            : "max-w-2xl mx-auto"
        }
      >
        {/* STAGE 1: LOCK BTC & BORROW MUSD */}
        {(proMode || guidedStep === 1) && (
        <Card className="rounded-2xl border-amber-200/90 bg-white shadow-sm flex flex-col">
          <CardHeader className="pb-3 border-b border-amber-100 bg-amber-50/50 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-black text-amber-900">
                <Lock className="h-3 w-3" />
                {proMode ? "STAGE 1 • BORROW" : "STEP 1 • BORROW MUSD"}
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                {user?.troveActive ? "Add to Loan" : "Start Loan"}
              </span>
            </div>
            <CardTitle className="text-base font-black pt-1">
              Lock BTC &amp; Mint MUSD
            </CardTitle>
            <CardDescription className="text-xs">
              {proMode ? (
                <>
                  Mint MUSD against native BTC via Mezo{" "}
                  <span className="font-mono">BorrowerOperations</span> with
                  live SortedTroves hints.
                </>
              ) : (
                "Lock Bitcoin as collateral and mint MUSD stablecoins without selling your BTC."
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>{proMode ? "Add BTC Collateral" : "Bitcoin to Lock"}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setBorrowCollBtcInput(
                        Math.max(0, (user?.walletBtc ?? 0) - 0.002).toFixed(4)
                      )
                    }
                    className="text-amber-700 hover:underline"
                  >
                    Avail: {formatNum(user?.walletBtc ?? 0, 4)} BTC
                  </button>
                </div>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={borrowCollBtcInput}
                  onChange={(e) => setBorrowCollBtcInput(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="0.05"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>{proMode ? "Mint MUSD Debt" : "MUSD to Borrow"}</span>
                  <span className="text-slate-500">
                    {user?.troveActive
                      ? "Any increment"
                      : `Min: ${formatNum(minNetDebt, 0)} MUSD`}
                  </span>
                </div>
                <input
                  type="number"
                  step="50"
                  min="0"
                  value={borrowMusdInput}
                  onChange={(e) => setBorrowMusdInput(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="1850"
                />
              </div>

              {/* Projected Trove Health */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">
                    One-time Borrow Fee ({formatNum(borrowingFeePct, 2)}%)
                  </span>
                  <span className="font-mono font-bold">
                    {formatNum(projectedFeeMusd, 2)} MUSD
                  </span>
                </div>
                {!user?.troveActive && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">
                      Refundable Safety Deposit
                    </span>
                    <span className="font-mono font-bold">
                      {formatNum(gasComp, 0)} MUSD
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-700 font-bold">
                    {proMode ? "Projected ICR" : "Collateral Ratio (110%+ needed)"}
                  </span>
                  <span
                    className={`font-mono font-black ${
                      stage1CrViolation
                        ? "text-rose-600"
                        : projectedIcrPct >= 200
                          ? "text-emerald-700"
                          : "text-amber-700"
                    }`}
                  >
                    {projectedIcrPct > 0
                      ? `${formatNum(projectedIcrPct, 1)}%`
                      : "—"}
                  </span>
                </div>
              </div>

              {(stage1MinDebtViolation || stage1CrViolation) && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-[11px] font-bold text-rose-800">
                  {stage1MinDebtViolation
                    ? `New loans require borrowing at least ${formatNum(minNetDebt, 0)} MUSD.`
                    : `Collateral ratio must be >= ${criticalCrPct}%.`}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Button
                onClick={handleStage1Borrow}
                disabled={
                  busyStep !== "" || stage1MinDebtViolation || stage1CrViolation
                }
                className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black"
              >
                {busyStep === "borrow" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Confirming in Wallet...
                  </>
                ) : (
                  <>
                    {user?.troveActive
                      ? "Borrow More MUSD"
                      : "Lock BTC & Mint MUSD"}
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </>
                )}
              </Button>
              {!proMode && (
                <button
                  type="button"
                  onClick={() => setGuidedStep(2)}
                  className="w-full text-center text-[11px] font-bold text-indigo-700 hover:underline pt-1"
                >
                  Already have MUSD? Skip to Step 2: Deposit &amp; Earn →
                </button>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {/* STAGE 2: DEPLOY BORROWED MUSD TO YIELD */}
        {(proMode || guidedStep === 2) && (
        <Card className="rounded-2xl border-emerald-200/90 bg-white shadow-sm flex flex-col">
          <CardHeader className="pb-3 border-b border-emerald-100 bg-emerald-50/50 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-black text-emerald-900">
                <Layers className="h-3 w-3" />
                {proMode ? "STAGE 2 • DEPLOY YIELD" : "STEP 2 • EARN YIELD"}
              </span>
              <span className="text-[11px] font-bold text-emerald-700">
                {formatNum(lpYieldPct, 2)}% Main Pool APY
              </span>
            </div>
            <CardTitle className="text-base font-black pt-1">
              {proMode ? "Route MUSD into Yield Vault" : "Put Borrowed MUSD to Work"}
            </CardTitle>
            <CardDescription className="text-xs">
              {proMode ? (
                <>
                  Deploy minted MUSD into{" "}
                  <span className="font-mono">MainMUSDVault</span> (credit pool)
                  or any owned Sub-Island treasury.
                </>
              ) : (
                "Deposit your MUSD into the Main Savings Pool or an automated strategy island to start earning."
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">
                  {proMode ? "Target Yield Destination" : "Choose Where to Earn"}
                </label>
                <select
                  value={deployTarget}
                  onChange={(e) => setDeployTarget(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="main">
                    {proMode
                      ? `MainMUSDVault LP (Weighted Loan APR: ${formatNum(weightedLoanAprPct, 2)}%)`
                      : `Main MUSD Savings Pool (${formatNum(lpYieldPct, 2)}% APY)`}
                  </option>
                  {ownedIslands.map((isl) => (
                    <option key={isl.islandId} value={isl.islandId}>
                      Island: {isl.name} ({formatNum(isl.trackedMusdBalance, 2)} MUSD)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>MUSD Amount to Deposit</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDeployMusdInput((user?.walletMusd ?? 0).toFixed(2))
                    }
                    className="text-emerald-700 hover:underline"
                  >
                    Wallet: {formatNum(user?.walletMusd ?? 0, 2)} MUSD
                  </button>
                </div>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={deployMusdInput}
                  onChange={(e) => setDeployMusdInput(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="500"
                />
              </div>

              <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-3 space-y-1 text-xs">
                {deployTarget === "main" ? (
                  <>
                    {proMode && (
                      <div className="flex justify-between">
                        <span className="text-slate-600 font-semibold">
                          Share Price
                        </span>
                        <span className="font-mono font-bold">
                          {formatNum(mainVault?.sharePriceMusd ?? 1, 4)} MUSD
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-semibold">
                        Your Current Savings
                      </span>
                      <span className="font-mono font-bold">
                        {formatNum(user?.mainVaultAssetsMusd ?? 0, 2)} MUSD
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-semibold">
                        Withdraw Cooldown
                      </span>
                      <span className="font-mono font-bold">
                        {mainVault?.minHoldSeconds ?? 60}s after deposit
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-semibold">
                        Island Vault Balance
                      </span>
                      <span className="font-mono font-bold">
                        {formatNum(selectedDeployIsland?.trackedMusdBalance ?? 0, 2)} MUSD
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-semibold">
                        Net Equity / Profit
                      </span>
                      <span className="font-mono font-bold">
                        ${formatNum(selectedDeployIsland?.netEquityUsd ?? 0, 2)}
                      </span>
                    </div>
                    {selectedDeployIsland && onSelectIsland && (
                      <button
                        type="button"
                        onClick={() => onSelectIsland(selectedDeployIsland.islandId)}
                        className="text-[11px] font-black text-emerald-700 hover:underline pt-1"
                      >
                        Open {selectedDeployIsland.name} Trading Desk →
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Button
                onClick={handleStage2Deploy}
                disabled={busyStep !== "" || (mainVault?.emergencyPause && deployTarget === "main")}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black"
              >
                {busyStep === "deploy" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Approving &amp; Depositing...
                  </>
                ) : (
                  <>
                    Approve &amp; Deposit MUSD
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </>
                )}
              </Button>
              {!proMode && (
                <div className="flex items-center justify-between pt-1 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setGuidedStep(1)}
                    className="text-slate-500 hover:underline"
                  >
                    ← Back to Borrow
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuidedStep(3)}
                    className="text-indigo-700 hover:underline"
                  >
                    Next: Repay &amp; Exit →
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {/* STAGE 3: UNWIND YIELD & REPAY / CLOSE TROVE */}
        {(proMode || guidedStep === 3) && (
        <Card className="rounded-2xl border-indigo-200/90 bg-white shadow-sm flex flex-col">
          <CardHeader className="pb-3 border-b border-indigo-100 bg-indigo-50/50 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-black text-indigo-900">
                <Unlock className="h-3 w-3" />
                {proMode ? "STAGE 3 • UNWIND" : "STEP 3 • REPAY & EXIT"}
              </span>
              <span className="text-[11px] font-bold text-indigo-700">
                1-Click Exit
              </span>
            </div>
            <CardTitle className="text-base font-black pt-1">
              Withdraw Yield &amp; Unlock BTC
            </CardTitle>
            <CardDescription className="text-xs">
              Pull your MUSD back out and pay down your loan—or close your loan
              completely to unlock 100% of your Bitcoin.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">
                  Withdraw From
                </label>
                <select
                  value={unwindSource}
                  onChange={(e) => setUnwindSource(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="main">
                    Main MUSD Pool ({formatNum(user?.mainVaultAssetsMusd ?? 0, 2)} MUSD)
                  </option>
                  {ownedIslands.map((isl) => (
                    <option key={isl.islandId} value={isl.islandId}>
                      Island: {isl.name} ({formatNum(isl.trackedMusdBalance, 2)} MUSD)
                    </option>
                  ))}
                </select>
              </div>

              {(user?.canWithdrawAfterSec ?? 0) > 0 && unwindSource === "main" && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-bold text-amber-900">
                  Short withdrawal cooldown: {user?.canWithdrawAfterSec}s remaining.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold mb-1">
                    Withdraw MUSD
                  </label>
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={withdrawMusdInput}
                    onChange={(e) => setWithdrawMusdInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs font-bold h-9 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">
                    Repay Loan MUSD
                  </label>
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={repayMusdInput}
                    onChange={(e) => setRepayMusdInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs font-bold h-9 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleWithdrawClick}
                  disabled={busyStep !== ""}
                  className="rounded-xl text-xs font-black h-9"
                >
                  {busyStep === "withdraw" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "1. Withdraw Yield"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRepayClick}
                  disabled={busyStep !== "" || !user?.troveActive}
                  className="rounded-xl text-xs font-black h-9"
                >
                  {busyStep === "repay" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "2. Repay Debt"
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                type="button"
                onClick={handleCloseTroveClick}
                disabled={busyStep !== "" || !user?.troveActive}
                variant="secondary"
                className="w-full rounded-xl text-xs font-black border border-slate-300"
              >
                {busyStep === "close" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Closing Loan...
                  </>
                ) : (
                  <>
                    <Flame className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                    Close Loan &amp; Unlock 100% BTC
                  </>
                )}
              </Button>

              <Button
                type="button"
                onClick={handleOneClickFullUnwind}
                disabled={busyStep !== ""}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black"
              >
                {busyStep === "unwind-all" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Executing Full Unwind...
                  </>
                ) : (
                  <>
                    <ArrowDownUp className="h-4 w-4 mr-1.5" />
                    1-Click Withdraw All &amp; Unlock BTC
                  </>
                )}
              </Button>

              {!proMode && (
                <button
                  type="button"
                  onClick={() => setGuidedStep(2)}
                  className="w-full text-center text-[11px] font-bold text-slate-500 hover:underline pt-1"
                >
                  ← Back to Step 2
                </button>
              )}
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}
