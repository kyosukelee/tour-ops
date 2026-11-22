import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
export function formatYen(value: number): string {
  return yen.format(value);
}
