import type { Metadata } from "next";
import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";

export const metadata: Metadata = {
  title: "MezoCity",
  description:
    "MezoCity autonomous AI agent islands, policy-locked BTC/MUSD vaults, and credit council on Mezo Testnet (Chain ID: 31611).",
  icons: {
    icon: [{ url: "/mezo-logo.svg", type: "image/svg+xml" }],
    shortcut: ["/mezo-logo.svg"],
    apple: [{ url: "/mezo-logo.svg", type: "image/svg+xml" }],
  },
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

