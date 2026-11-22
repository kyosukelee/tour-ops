import { describe, expect, it } from "vitest";
import {
  canConfirmArrangement,
  canTransitionProject,
  deriveProjectStatus,
  grossProfit,
  isArrangementComplete,
  nextProjectStatuses,
  PROJECT_STATUSES,
  TERMINAL_STATUSES,
} from "@/lib/status";

describe("案件ステータスの遷移", () => {
  it("受注は見積提出からだけ", () => {
    expect(canTransitionProject("quoted", "arranging")).toBe(true);
    expect(canTransitionProject("quoting", "arranging")).toBe(false);
  });

  it("失注は引合・見積中・見積提出から選べる", () => {
    expect(canTransitionProject("inquiry", "lost")).toBe(true);
    expect(canTransitionProject("quoting", "lost")).toBe(true);
    expect(canTransitionProject("quoted", "lost")).toBe(true);
    expect(canTransitionProject("arranging", "lost")).toBe(false);
  });

  it("キャンセルは催行前(手配中・手配完了)からだけ", () => {
    expect(canTransitionProject("arranging", "cancelled")).toBe(true);
    expect(canTransitionProject("arranged", "cancelled")).toBe(true);
    expect(canTransitionProject("operating", "cancelled")).toBe(false);
  });

  it("手配中→手配完了は手で進められない(手配明細から自動で決まる)", () => {
    expect(canTransitionProject("arranging", "arranged")).toBe(false);
  });

  it("終了状態からは進めない", () => {
    for (const s of TERMINAL_STATUSES) expect(nextProjectStatuses(s)).toEqual([]);
  });

  it("どのステータスにも遷移の定義がある", () => {
    for (const s of PROJECT_STATUSES) expect(Array.isArray(nextProjectStatuses(s))).toBe(true);
  });
});

describe("手配明細と手配完了", () => {
  it("取消を除いてすべて確定なら完了", () => {
    expect(isArrangementComplete([{ status: "confirmed" }, { status: "cancelled" }])).toBe(true);
    expect(isArrangementComplete([{ status: "confirmed" }, { status: "tentative" }])).toBe(false);
  });

  it("取消しかない、または空なら完了ではない", () => {
    expect(isArrangementComplete([{ status: "cancelled" }])).toBe(false);
    expect(isArrangementComplete([])).toBe(false);
  });

  it("手配中⇔手配完了を自動で切り替える", () => {
    expect(deriveProjectStatus("arranging", [{ status: "confirmed" }])).toBe("arranged");
    expect(deriveProjectStatus("arranged", [{ status: "confirmed" }, { status: "pending" }])).toBe("arranging");
    expect(deriveProjectStatus("quoted", [{ status: "confirmed" }])).toBe("quoted");
  });

  it("確定にできるのは受注後だけ", () => {
    expect(canConfirmArrangement("quoted")).toBe(false);
    expect(canConfirmArrangement("arranging")).toBe(true);
    expect(canConfirmArrangement("cancelled")).toBe(false);
  });
});

describe("粗利", () => {
  it("精算額があれば原価の代わりに使い、取消は含めない", () => {
    const profit = grossProfit([
      { status: "confirmed", quantity: 10, unitCost: 1000, unitPrice: 1200, actualCost: null, cancelFee: null },
      { status: "confirmed", quantity: 1, unitCost: 50000, unitPrice: 60000, actualCost: 52000, cancelFee: null },
      { status: "cancelled", quantity: 5, unitCost: 1000, unitPrice: 1500, actualCost: null, cancelFee: 3000 },
    ]);
    expect(profit).toBe(2000 + 8000);
  });
});
