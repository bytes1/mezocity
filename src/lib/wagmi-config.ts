"use client";

import { createConfig, http } from "wagmi";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  coinbaseWallet,
  frameWallet,
  injectedWallet,
  ledgerWallet,
  metaMaskWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
  rainbowWallet,
  safeWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { mezoTestnet } from "@/lib/mezo-chain";

const MEZO_CHAIN = {
  ...mezoTestnet,
  iconBackground: "#FF083B",
} as const;

/**
 * Builds the Wagmi v2 + RainbowKit configuration for Mezo Testnet (Chain ID 31611).
 * Supports EIP-6963 multi-injected wallet discovery out of the box (MetaMask, Rabby,
 * Phantom, OKX, Brave, Trust, Coinbase) and unlocks WalletConnect QR + mobile wallets
 * automatically when NEXT_PUBLIC_WC_PROJECT_ID is configured.
 */
export function createMezoWagmiConfig() {
  const wcProjectId = (process.env.NEXT_PUBLIC_WC_PROJECT_ID || "").trim();

  const walletGroups = wcProjectId
    ? [
        {
          groupName: "Popular Wallets",
          wallets: [
            metaMaskWallet,
            rabbyWallet,
            phantomWallet,
            okxWallet,
            coinbaseWallet,
            rainbowWallet,
            walletConnectWallet,
          ],
        },
        {
          groupName: "More Wallets",
          wallets: [
            trustWallet,
            braveWallet,
            ledgerWallet,
            frameWallet,
            injectedWallet,
            safeWallet,
          ],
        },
      ]
    : [
        {
          groupName: "Browser & Hardware Wallets",
          wallets: [
            injectedWallet,
            rabbyWallet,
            coinbaseWallet,
            braveWallet,
            frameWallet,
            safeWallet,
          ],
        },
      ];

  const connectors = connectorsForWallets(walletGroups, {
    appName: "MezoCity AI Vault",
    appDescription:
      "Autonomous Transformers AI Crew & PolicyVault DCA on Mezo Testnet (31611)",
    projectId: wcProjectId || "eip6963-browser-wallets",
  });

  return createConfig({
    connectors,
    chains: [MEZO_CHAIN],
    transports: {
      [MEZO_CHAIN.id]: http("https://rpc.test.mezo.org"),
    },
    multiInjectedProviderDiscovery: true,
    ssr: true,
  });
}

