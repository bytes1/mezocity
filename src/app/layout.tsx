import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MezoCity // 4LPHA.TECH × Polly.town on Mezo Testnet (31611)",
  description:
    "Autonomous AI Agent Clay Island & Policy-Locked Execution Vaults on Mezo Testnet (Chain ID: 31611, Native BTC 18 Decimals).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

