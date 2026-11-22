// 日付(YYYY-MM-DD)の扱い。業務日付は日本時間で数える

export function todayInTokyo(now: Date = new Date()): string {
  // sv-SE は YYYY-MM-DD 形式で出力される
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 日本時間のその日の指定時刻を Date にする
export function tokyoDateTime(isoDate: string, time = "09:00"): Date {
  return new Date(`${isoDate}T${time}:00+09:00`);
}
