import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBtc(amount: number, preferredDecimals = 4): string {
  if (!Number.isFinite(amount) || amount === 0) return "0.0000 BTC";
  const abs = Math.abs(amount);
  if (abs >= 0.01) {
    return `${amount.toFixed(preferredDecimals)} BTC`;
  }
  if (abs >= 0.0001) {
    return `${amount.toFixed(6)} BTC`;
  }
  if (abs >= 0.00000001) {
    return `${amount.toFixed(8)} BTC`;
  }
  return `${amount.toExponential(2)} BTC`;
}

export function formatBtcNumber(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "0.0000";
  const abs = Math.abs(amount);
  if (abs >= 0.01) return amount.toFixed(4);
  if (abs >= 0.0001) return amount.toFixed(6);
  if (abs >= 0.00000001) return amount.toFixed(8);
  return amount.toExponential(2);
}

export function shortenHex(hex: string, chars = 6): string {
  if (!hex || hex.length < chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}
