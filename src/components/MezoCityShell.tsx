"use client";

import React from "react";
import { Web3Providers } from "@/components/Web3Providers";
import { MezoCityApp } from "@/components/MezoCityApp";

export function MezoCityShell() {
  return (
    <Web3Providers>
      <MezoCityApp />
    </Web3Providers>
  );
}

