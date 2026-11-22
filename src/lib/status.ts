// 案件と手配明細のステータスのルール(設計書「用語と案件のライフサイクル」)
// 画面のボタン表示もサーバー側のチェックも、このファイルだけを見て判断する

export const PROJECT_STATUSES = [
  "inquiry",
  "quoting",
  "quoted",
  "arranging",
  "arranged",
  "operating",
  "settling",
  "completed",
  "lost",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const ARRANGEMENT_STATUSES = [
  "pending",
  "requested",
  "tentative",
  "confirmed",
  "cancelled",
] as const;
export type ArrangementStatus = (typeof ARRANGEMENT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  inquiry: "引合",
  quoting: "見積中",
  quoted: "見積提出",
  arranging: "手配中",
  arranged: "手配完了",
  operating: "催行",
  settling: "精算",
  completed: "完了",
  lost: "失注",
  cancelled: "キャンセル",
};

export const ARRANGEMENT_STATUS_LABEL: Record<ArrangementStatus, string> = {
  pending: "未手配",
  requested: "依頼中",
  tentative: "仮押さえ",
  confirmed: "確定",
  cancelled: "取消",
};

export const ARRANGEMENT_CATEGORIES = ["lodging", "bus", "taxi", "guide", "meal", "admission", "other"] as const;
export type ArrangementCategory = (typeof ARRANGEMENT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ArrangementCategory, string> = {
  lodging: "宿泊",
  bus: "貸切バス",
  taxi: "観光タクシー",
  guide: "ガイド",
  meal: "食事",
  admission: "施設入場",
  other: "その他",
};

// ステータスを進めるボタンの文言(遷移先ごと)
export const PROJECT_ACTION_LABEL: Partial<Record<ProjectStatus, string>> = {
  quoting: "見積を始める",
  quoted: "見積を提出した",
  arranging: "受注して手配を始める",
  operating: "催行を始める",
  settling: "精算に進む",
  completed: "完了にする",
  lost: "失注にする",
  cancelled: "キャンセルにする",
};

// 取り消しのきかない遷移(押す前に確認する)
export const DESTRUCTIVE_STATUSES: readonly ProjectStatus[] = ["lost", "cancelled"];

// 人が操作して進められる遷移。手配中⇔手配完了は手配明細から自動で決まるので含めない
const MANUAL_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  inquiry: ["quoting", "lost"],
  quoting: ["quoted", "lost"],
  quoted: ["arranging", "lost"], // arranging = 受注
  arranging: ["cancelled"],
  arranged: ["operating", "cancelled"],
  operating: ["settling"],
  settling: ["completed"],
  completed: [],
  lost: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly ProjectStatus[] = ["completed", "lost", "cancelled"];

export function nextProjectStatuses(from: ProjectStatus): readonly ProjectStatus[] {
  return MANUAL_TRANSITIONS[from];
}

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return MANUAL_TRANSITIONS[from].includes(to);
}

// 手配明細を「確定」にできるのは受注(手配中)以降だけ
const CONFIRMABLE_PROJECT_STATUSES: readonly ProjectStatus[] = [
  "arranging",
  "arranged",
  "operating",
  "settling",
];

export function canConfirmArrangement(projectStatus: ProjectStatus): boolean {
  return CONFIRMABLE_PROJECT_STATUSES.includes(projectStatus);
}

// 取消を除くすべての手配明細が確定しているか(取消以外が1件もなければ false)
export function isArrangementComplete(
  arrangements: readonly { status: ArrangementStatus }[],
): boolean {
  const active = arrangements.filter((a) => a.status !== "cancelled");
  return active.length > 0 && active.every((a) => a.status === "confirmed");
}

// 手配明細の状態から、手配中⇔手配完了を自動で決める。それ以外のステータスはそのまま
export function deriveProjectStatus(
  current: ProjectStatus,
  arrangements: readonly { status: ArrangementStatus }[],
): ProjectStatus {
  const complete = isArrangementComplete(arrangements);
  if (current === "arranging" && complete) return "arranged";
  if (current === "arranged" && !complete) return "arranging";
  return current;
}

// 案件の粗利(円)。取消の手配は粗利に含めない
// (取消料は依頼元へそのまま請求する前提。扱いが変わる場合はここだけ直す)
export function grossProfit(
  arrangements: readonly {
    status: ArrangementStatus;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    actualCost: number | null;
    cancelFee: number | null;
  }[],
): number {
  return arrangements.reduce((sum, a) => {
    if (a.status === "cancelled") return sum;
    const cost = a.actualCost ?? a.unitCost * a.quantity;
    return sum + a.unitPrice * a.quantity - cost;
  }, 0);
}
