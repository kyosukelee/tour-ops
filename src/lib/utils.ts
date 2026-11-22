import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
export function formatYen(value: number): string {
  return yen.format(value);
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// "2026-11-22" → "11/22(日)"。年が違うときや withYear のときは年も付ける
export function formatDate(iso: string | null | undefined, opts: { withYear?: boolean } = {}): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${opts.withYear ? `${y}/` : ""}${m}/${d}(${w})`;
}

export function formatDateRange(start: string, end: string): string {
  return start === end ? formatDate(start, { withYear: true }) : `${formatDate(start, { withYear: true })}〜${formatDate(end)}`;
}

// 日時(タイムスタンプ)を日本時間で "2026/11/22 09:05" にする
const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
export function formatDateTime(value: Date | string): string {
  return dateTimeFormat.format(typeof value === "string" ? new Date(value) : value);
}
