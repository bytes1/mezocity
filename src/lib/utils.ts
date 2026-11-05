import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBtc(amount: number, decimals = 4): string {
  return `${amount.toFixed(decimals)} BTC`;
}

export function shortenHex(hex: string, chars = 6): string {
  if (!hex || hex.length < chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

