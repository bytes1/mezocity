"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { createMezoWagmiConfig } from "@/lib/wagmi-config";
import { mezoTestnet } from "@/lib/mezo-chain";

export function Web3Providers({ children }: { children: React.ReactNode }) {
  const [wagmiConfig] = useState(() => createMezoWagmiConfig());
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={mezoTestnet.id}
          modalSize="compact"
          theme={lightTheme({
            accentColor: "#8b5cf6",
            accentColorForeground: "#ffffff",
            borderRadius: "large",
            fontStack: "rounded",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

