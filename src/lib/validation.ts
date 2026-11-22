// 入力チェック(Zod)。画面のフォームとサーバー処理で同じ定義を使う
import { z } from "zod";
import { ARRANGEMENT_CATEGORIES as CATEGORIES, ARRANGEMENT_STATUSES, PROJECT_STATUSES, REQUEST_KINDS, REQUEST_METHODS } from "./status";

// フォームの空欄は null として扱う
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `${max}文字以内で入力してください`)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null);

const requiredText = (label: string, max = 200) =>
  z.string({ error: `${label}を入力してください` }).trim().min(1, `${label}を入力してください`).max(max, `${max}文字以内で入力してください`);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式で入力してください");
const optionalDate = z
  .union([isoDate, z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));
// 画面からは HH:MM、DBからは HH:MM:SS で来るので、どちらも受けて HH:MM にそろえる
const optionalTime = z
  .union([z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "時刻は HH:MM 形式で入力してください"), z.literal("")])
  .nullish()
  .transform((v) => (v ? v.slice(0, 5) : null));

const yen = (label: string) =>
  z.coerce.number({ error: `${label}は数字で入力してください` }).int(`${label}は整数で入力してください`).min(0, `${label}は0以上にしてください`);
const optionalYen = (label: string) =>
  z
    .union([z.literal(""), z.coerce.number().int(`${label}は整数で入力してください`).min(0, `${label}は0以上にしてください`)])
    .nullish()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v));

const checkbox = z
  .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .nullish()
  .transform((v) => v === true || v === "on" || v === "true");

// ---------- 案件 ----------

export const projectInput = z
  .object({
    title: requiredText("ツアー名"),
    agencyId: z.uuid("依頼元を選んでください"),
    startDate: isoDate,
    endDate: isoDate,
    paxAdult: z.coerce.number().int().min(0, "人数は0以上にしてください").max(9999),
    paxChild: z.coerce.number().int().min(0, "人数は0以上にしてください").max(9999),
    language: optionalText(50),
    // 担当者の空欄は「登録した人」(更新のときは今の担当者のまま)
    ownerUserId: z.union([z.literal(""), z.string().min(1)]).nullish().transform((v) => (v ? v : null)),
    note: optionalText(2000),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "帰着日は出発日以降にしてください",
    // ほかの項目にエラーがあっても、日付が2つとも正しければ前後関係も同時に知らせる
    when: (payload) => z.object({ startDate: isoDate, endDate: isoDate }).safeParse(payload.value).success,
  });
export type ProjectInput = z.infer<typeof projectInput>;

export const projectStatusInput = z.object({
  to: z.enum(PROJECT_STATUSES, { error: "ステータスが正しくありません" }),
});

// ---------- 手配明細 ----------

export const arrangementInput = z.object({
  category: z.enum(CATEGORIES, { error: "種別を選んでください" }),
  serviceDate: isoDate,
  serviceTime: optionalTime,
  supplierId: z.uuid().nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  description: requiredText("内容"),
  quantity: z.coerce.number().int().min(1, "数量は1以上にしてください").max(99999),
  unitCost: yen("原価"),
  unitPrice: yen("販売単価"),
  status: z.enum(ARRANGEMENT_STATUSES).default("pending"),
  replyDue: optionalDate,
  cancelFeeFrom: optionalDate,
  confirmationNo: optionalText(100),
  actualCost: optionalYen("精算額"),
  invoiceReceived: checkbox,
  cancelFee: optionalYen("取消料"),
  meetingPlace: optionalText(200),
  supplierNote: optionalText(2000),
  note: optionalText(2000),
});
export type ArrangementInput = z.infer<typeof arrangementInput>;

// ---------- タスク・コメント ----------

export const taskInput = z.object({
  title: requiredText("内容", 200),
  dueDate: isoDate,
  assigneeUserId: z.union([z.literal(""), z.string().min(1)]).nullish().transform((v) => (v ? v : null)),
});
export type TaskInput = z.infer<typeof taskInput>;

export const taskDoneInput = z.object({ done: checkbox });

export const commentInput = z.object({ body: requiredText("コメント", 2000) });
export type CommentInput = z.infer<typeof commentInput>;

// ---------- 手配依頼 ----------

// チェックボックスの複数選択(1件なら文字列、複数なら配列で届く)
const idList = (message: string) =>
  z
    .union([z.uuid(), z.array(z.uuid())], { error: message })
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .pipe(z.array(z.uuid()).min(1, message));

export const requestInput = z.object({
  supplierId: z.uuid("仕入先を選んでください"),
  kind: z.enum(REQUEST_KINDS, { error: "依頼の種類を選んでください" }),
  method: z.enum(REQUEST_METHODS, { error: "送り方を選んでください" }),
  arrangementIds: idList("依頼する手配を1件以上選んでください"),
  note: optionalText(1000),
});
export type RequestInput = z.infer<typeof requestInput>;

// 仕入先からの回答: 手配ごとに 仮押さえ / 確定 / 手配不可
export const REPLY_RESULTS = ["tentative", "confirmed", "declined"] as const;
export const replyInput = z.object({
  items: z
    .array(
      z.object({
        arrangementId: z.uuid(),
        result: z.enum(REPLY_RESULTS, { error: "回答を選んでください" }),
        confirmationNo: optionalText(100),
        unitCost: optionalYen("原価"),
      }),
    )
    .min(1, "回答を入力する手配がありません"),
});
export type ReplyInput = z.infer<typeof replyInput>;

// ---------- マスタ ----------

const optionalEmail = z
  .union([z.email("メールアドレスの形式が正しくありません"), z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));
const optionalPhone = z
  .union([z.string().regex(/^[0-9+\-() ]{6,20}$/, "電話・FAX番号の形式が正しくありません"), z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

export const agencyInput = z.object({
  name: requiredText("会社名"),
  contactName: optionalText(100),
  email: optionalEmail,
  phone: optionalPhone,
  fax: optionalPhone,
  note: optionalText(2000),
  active: checkbox.default(true),
});
export type AgencyInput = z.infer<typeof agencyInput>;

export const supplierInput = z.object({
  name: requiredText("仕入先名"),
  category: z.enum(CATEGORIES, { error: "種別を選んでください" }),
  contactName: optionalText(100),
  email: optionalEmail,
  phone: optionalPhone,
  fax: optionalPhone,
  cancelPolicyNote: optionalText(2000),
  active: checkbox.default(true),
});
export type SupplierInput = z.infer<typeof supplierInput>;

// ---------- 担当者・ログイン ----------

export const password = z.string().min(10, "パスワードは10文字以上にしてください").max(128);

export const userCreateInput = z.object({
  name: requiredText("氏名", 100),
  email: z.email("メールアドレスの形式が正しくありません"),
  role: z.enum(["admin", "staff"]),
  password,
});
export type UserCreateInput = z.infer<typeof userCreateInput>;

export const userUpdateInput = z.object({
  name: requiredText("氏名", 100),
  role: z.enum(["admin", "staff"]),
  active: checkbox,
});
export type UserUpdateInput = z.infer<typeof userUpdateInput>;

export const loginInput = z.object({
  email: z.email("メールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

// Zod のエラーを { 項目名: [メッセージ] } にする
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
