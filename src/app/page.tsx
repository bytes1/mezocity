"use client";

import dynamic from "next/dynamic";

const MezoCityShell = dynamic(
  () =>
    import("@/components/MezoCityShell").then((mod) => mod.MezoCityShell),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff] text-[#231f20]">
        <div className="h-12 w-12 rounded-full bg-[#8b5cf6] animate-bounce flex items-center justify-center text-white font-black shadow-lg mb-3">
          4α
        </div>
        <p className="text-sm font-extrabold tracking-tight">
          Loading MezoCity & Multi-Wallet Providers (Chain ID: 31611)...
        </p>
      </div>
    ),
  }
);

export default function HomePage() {
  return <MezoCityShell />;
}
