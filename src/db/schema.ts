// tour-ops のデータベース定義(Drizzle ORM / PostgreSQL)
// 設計書「データモデル」の12テーブル + Better Auth が使う認証用テーブル(session・account・verification)
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- 列挙型 ----------

export const userRole = pgEnum("user_role", ["admin", "staff"]);

export const projectStatus = pgEnum("project_status", [
  "inquiry", // 引合
  "quoting", // 見積中
  "quoted", // 見積提出
  "arranging", // 手配中
  "arranged", // 手配完了
  "operating", // 催行
  "settling", // 精算
  "completed", // 完了
  "lost", // 失注
  "cancelled", // キャンセル
]);

export const arrangementStatus = pgEnum("arrangement_status", [
  "pending", // 未手配
  "requested", // 依頼中
  "tentative", // 仮押さえ
  "confirmed", // 確定
  "cancelled", // 取消
]);

export const arrangementCategory = pgEnum("arrangement_category", [
  "lodging", // 宿泊
  "bus", // 貸切バス
  "taxi", // 観光タクシー
  "guide", // ガイド
  "meal", // 食事
  "admission", // 施設入場
  "other", // その他
]);

export const requestKind = pgEnum("request_kind", [
  "inquiry", // 照会
  "booking", // 手配
  "change", // 変更
  "cancel", // 取消
]);

export const requestMethod = pgEnum("request_method", ["fax", "email"]);

export const attachmentKind = pgEnum("attachment_kind", [
  "request", // 依頼書
  "change_request", // 変更依頼
  "supplier_reply", // 仕入先の回答
  "other", // その他
]);

export const taskSource = pgEnum("task_source", ["manual", "auto"]);

// 自動生成タスクの種類(回答期限 / 取消料発生日)。日付の変更に追従させるために持つ
export const taskAutoType = pgEnum("task_auto_type", ["reply_due", "cancel_fee"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------- 担当者(Better Auth の user テーブルを拡張) ----------

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("staff"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

// ---------- Better Auth の認証用テーブル(テーブル数には含めない) ----------

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------- マスタ ----------

export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  fax: text("fax"),
  note: text("note"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: arrangementCategory("category").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  fax: text("fax"),
  cancelPolicyNote: text("cancel_policy_note"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

// ---------- 案件と手配 ----------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(), // 例: T-2027-0012
    title: text("title").notNull(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    status: projectStatus("status").notNull().default("inquiry"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    paxAdult: integer("pax_adult").notNull().default(0),
    paxChild: integer("pax_child").notNull().default(0),
    language: text("language"),
    ownerUserId: text("owner_user_id").references(() => users.id),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("projects_status_idx").on(t.status),
    index("projects_start_date_idx").on(t.startDate),
  ],
);

export const arrangements = pgTable(
  "arrangements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    category: arrangementCategory("category").notNull(),
    serviceDate: date("service_date").notNull(),
    serviceTime: time("service_time"),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitCost: integer("unit_cost").notNull().default(0), // 原価(円・税込)
    unitPrice: integer("unit_price").notNull().default(0), // 販売単価(円・税込)
    status: arrangementStatus("status").notNull().default("pending"),
    replyDue: date("reply_due"),
    cancelFeeFrom: date("cancel_fee_from"),
    confirmationNo: text("confirmation_no"),
    actualCost: integer("actual_cost"), // 精算額
    invoiceReceived: boolean("invoice_received").notNull().default(false), // 請求の受領
    cancelFee: integer("cancel_fee"), // 取消料
    meetingPlace: text("meeting_place"),
    supplierNote: text("supplier_note"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("arrangements_project_id_idx").on(t.projectId),
    index("arrangements_reply_due_idx").on(t.replyDue),
  ],
);

export const supplierRequests = pgTable(
  "supplier_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    kind: requestKind("kind").notNull(),
    method: requestMethod("method").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    sentBy: text("sent_by").references(() => users.id),
    note: text("note"),
  },
  (t) => [index("supplier_requests_project_id_idx").on(t.projectId)],
);

export const requestItems = pgTable(
  "request_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => supplierRequests.id, { onDelete: "cascade" }),
    arrangementId: uuid("arrangement_id")
      .notNull()
      .references(() => arrangements.id),
  },
  (t) => [
    uniqueIndex("request_items_request_arrangement_uq").on(t.requestId, t.arrangementId),
    index("request_items_arrangement_id_idx").on(t.arrangementId),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    requestId: uuid("request_id").references(() => supplierRequests.id), // 仕入先の回答のとき
    kind: attachmentKind("kind").notNull(),
    filePath: text("file_path").notNull(), // Cloudflare R2 上のキー
    receivedAt: timestamp("received_at", { withTimezone: true }),
    note: text("note"),
    uploadedBy: text("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachments_project_id_idx").on(t.projectId)],
);

// ---------- タスク・コメント・履歴・ログ ----------

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    arrangementId: uuid("arrangement_id").references(() => arrangements.id),
    title: text("title").notNull(),
    dueDate: date("due_date").notNull(),
    assigneeUserId: text("assignee_user_id").references(() => users.id),
    done: boolean("done").notNull().default(false),
    source: taskSource("source").notNull().default("manual"),
    autoType: taskAutoType("auto_type"),
    ...timestamps,
  },
  (t) => [
    index("tasks_due_date_idx").on(t.dueDate),
    index("tasks_project_id_idx").on(t.projectId),
    // 自動タスクは「手配明細 × 種類」で1件だけ
    uniqueIndex("tasks_auto_uq")
      .on(t.arrangementId, t.autoType)
      .where(sql`${t.source} = 'auto'`),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    body: text("body").notNull(),
    authorUserId: text("author_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_project_id_idx").on(t.projectId)],
);

export const statusHistory = pgTable(
  "status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    arrangementId: uuid("arrangement_id").references(() => arrangements.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedBy: text("changed_by").references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("status_history_project_id_idx").on(t.projectId)],
);

// 操作ログ: 追記のみ。外部キーは張らず、対象が利用停止になっても記録を残す
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id"),
    action: text("action").notNull(), // 例: project.update, auth.login_failed
    targetType: text("target_type"),
    targetId: text("target_id"),
    projectId: uuid("project_id"),
    changes: jsonb("changes"), // { before: {...}, after: {...} }
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt),
    index("audit_logs_user_id_idx").on(t.userId),
    index("audit_logs_project_id_idx").on(t.projectId),
  ],
);

// テーブル数の確認用(設計書の12テーブル)
export const appTables = {
  projects,
  arrangements,
  supplierRequests,
  requestItems,
  attachments,
  tasks,
  comments,
  statusHistory,
  agencies,
  suppliers,
  users,
  auditLogs,
} as const;
