// 画面表示用の読み取り処理。書き込みは projects.ts / arrangements.ts などのサービスで行う
// DB を引数で受け取るので、テストから PGlite でそのまま呼べる
import { and, asc, count, desc, eq, gte, ilike, inArray, like, lt, lte, max, notInArray, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import { addDays } from "@/lib/dates";
import {
  grossProfit,
  PROJECT_STATUSES,
  TERMINAL_STATUSES,
  type ArrangementStatus,
  type ProjectStatus,
} from "@/lib/status";

// ---------- 選択肢(フォーム用) ----------

export async function listAgencyOptions(db: Db, includeId?: string | null) {
  const rows = await db
    .select({ id: s.agencies.id, name: s.agencies.name, active: s.agencies.active })
    .from(s.agencies)
    .orderBy(asc(s.agencies.name));
  // 利用停止の依頼元は、編集中の案件で使っているときだけ残す
  return rows.filter((r) => r.active || r.id === includeId);
}

export async function listSupplierOptions(db: Db) {
  return db
    .select({
      id: s.suppliers.id,
      name: s.suppliers.name,
      category: s.suppliers.category,
      active: s.suppliers.active,
      email: s.suppliers.email,
      fax: s.suppliers.fax,
    })
    .from(s.suppliers)
    .orderBy(asc(s.suppliers.category), asc(s.suppliers.name));
}

export async function listUserOptions(db: Db) {
  return db
    .select({ id: s.users.id, name: s.users.name, active: s.users.active })
    .from(s.users)
    .orderBy(asc(s.users.name));
}

// ---------- 案件一覧 ----------

export type ProjectFilter = {
  status?: string; // "open"(既定: 進行中)| "all" | 各ステータス
  agencyId?: string;
  ownerId?: string;
  q?: string;
};

export async function listProjects(db: Db, filter: ProjectFilter = {}) {
  const where: SQL[] = [];
  const status = filter.status || "open";
  if (status === "open") where.push(notInArray(s.projects.status, [...TERMINAL_STATUSES]));
  else if ((PROJECT_STATUSES as readonly string[]).includes(status)) {
    where.push(eq(s.projects.status, status as ProjectStatus));
  }
  if (filter.agencyId) where.push(eq(s.projects.agencyId, filter.agencyId));
  if (filter.ownerId) where.push(eq(s.projects.ownerUserId, filter.ownerId));
  const q = filter.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(s.projects.title, pattern), ilike(s.projects.code, pattern))!);
  }

  const projects = await db
    .select({
      id: s.projects.id,
      code: s.projects.code,
      title: s.projects.title,
      status: s.projects.status,
      startDate: s.projects.startDate,
      endDate: s.projects.endDate,
      paxAdult: s.projects.paxAdult,
      paxChild: s.projects.paxChild,
      agencyName: s.agencies.name,
      ownerName: s.users.name,
    })
    .from(s.projects)
    .innerJoin(s.agencies, eq(s.projects.agencyId, s.agencies.id))
    .leftJoin(s.users, eq(s.projects.ownerUserId, s.users.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(s.projects.startDate), asc(s.projects.code));

  const ids = projects.map((p) => p.id);
  const arrs = ids.length
    ? await db.select().from(s.arrangements).where(inArray(s.arrangements.projectId, ids))
    : [];

  return projects.map((p) => {
    const mine = arrs.filter((a) => a.projectId === p.id);
    const active = mine.filter((a) => a.status !== "cancelled");
    return {
      ...p,
      status: p.status as ProjectStatus,
      activeCount: active.length,
      confirmedCount: active.filter((a) => a.status === "confirmed").length,
      profit: grossProfit(mine as ArrangementForCalc[]),
    };
  });
}

type ArrangementForCalc = Parameters<typeof grossProfit>[0][number];

// ---------- 案件詳細 ----------

export async function getProjectDetail(db: Db, id: string) {
  const [project] = await db
    .select({
      project: s.projects,
      agencyName: s.agencies.name,
      agencyFax: s.agencies.fax,
      agencyEmail: s.agencies.email,
      agencyContact: s.agencies.contactName,
      ownerName: s.users.name,
    })
    .from(s.projects)
    .innerJoin(s.agencies, eq(s.projects.agencyId, s.agencies.id))
    .leftJoin(s.users, eq(s.projects.ownerUserId, s.users.id))
    .where(eq(s.projects.id, id))
    .limit(1);
  if (!project) return null;

  const changer = alias(s.users, "changer");
  const author = alias(s.users, "author");
  const [arrangements, tasks, history, comments] = await Promise.all([
    db
      .select({ a: s.arrangements, supplierName: s.suppliers.name })
      .from(s.arrangements)
      .leftJoin(s.suppliers, eq(s.arrangements.supplierId, s.suppliers.id))
      .where(eq(s.arrangements.projectId, id))
      .orderBy(asc(s.arrangements.serviceDate), asc(s.arrangements.serviceTime), asc(s.arrangements.createdAt)),
    db
      .select({ t: s.tasks, assigneeName: s.users.name })
      .from(s.tasks)
      .leftJoin(s.users, eq(s.tasks.assigneeUserId, s.users.id))
      .where(eq(s.tasks.projectId, id))
      .orderBy(asc(s.tasks.done), asc(s.tasks.dueDate)),
    db
      .select({
        h: s.statusHistory,
        changedByName: changer.name,
        arrangementDescription: s.arrangements.description,
      })
      .from(s.statusHistory)
      .leftJoin(changer, eq(s.statusHistory.changedBy, changer.id))
      .leftJoin(s.arrangements, eq(s.statusHistory.arrangementId, s.arrangements.id))
      .where(eq(s.statusHistory.projectId, id))
      .orderBy(desc(s.statusHistory.changedAt)),
    db
      .select({ c: s.comments, authorName: author.name })
      .from(s.comments)
      .leftJoin(author, eq(s.comments.authorUserId, author.id))
      .where(eq(s.comments.projectId, id))
      .orderBy(desc(s.comments.createdAt)),
  ]);

  const arrs = arrangements.map((r) => ({ ...r.a, status: r.a.status as ArrangementStatus, supplierName: r.supplierName }));
  const active = arrs.filter((a) => a.status !== "cancelled");
  const sales = active.reduce((sum, a) => sum + a.unitPrice * a.quantity, 0);
  const profit = grossProfit(arrs);

  return {
    ...project.project,
    status: project.project.status as ProjectStatus,
    agencyName: project.agencyName,
    agencyContact: project.agencyContact,
    agencyFax: project.agencyFax,
    agencyEmail: project.agencyEmail,
    ownerName: project.ownerName,
    arrangements: arrs,
    tasks: tasks.map((r) => ({ ...r.t, assigneeName: r.assigneeName })),
    comments: comments.map((r) => ({ ...r.c, authorName: r.authorName })),
    history: history.map((r) => ({ ...r.h, changedByName: r.changedByName, arrangementDescription: r.arrangementDescription })),
    totals: {
      sales,
      cost: sales - profit,
      profit,
      activeCount: active.length,
      confirmedCount: active.filter((a) => a.status === "confirmed").length,
      cancelledCount: arrs.length - active.length,
    },
  };
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

// ---------- ダッシュボード ----------

export async function getDashboard(db: Db, opts: { today: string; userId?: string }) {
  const { today, userId } = opts;
  const soon = addDays(today, 7);

  const taskWhere: SQL[] = [eq(s.tasks.done, false), lte(s.tasks.dueDate, soon)];
  if (userId) taskWhere.push(eq(s.tasks.assigneeUserId, userId));

  const [statusRows, tasks, departures] = await Promise.all([
    db.select({ status: s.projects.status }).from(s.projects),
    db
      .select({
        id: s.tasks.id,
        title: s.tasks.title,
        dueDate: s.tasks.dueDate,
        source: s.tasks.source,
        projectId: s.projects.id,
        projectCode: s.projects.code,
        projectTitle: s.projects.title,
        assigneeName: s.users.name,
      })
      .from(s.tasks)
      .innerJoin(s.projects, eq(s.tasks.projectId, s.projects.id))
      .leftJoin(s.users, eq(s.tasks.assigneeUserId, s.users.id))
      .where(and(...taskWhere))
      .orderBy(asc(s.tasks.dueDate))
      .limit(30),
    db
      .select({
        id: s.projects.id,
        code: s.projects.code,
        title: s.projects.title,
        status: s.projects.status,
        startDate: s.projects.startDate,
        endDate: s.projects.endDate,
        agencyName: s.agencies.name,
      })
      .from(s.projects)
      .innerJoin(s.agencies, eq(s.projects.agencyId, s.agencies.id))
      .where(
        and(
          gte(s.projects.startDate, today),
          lte(s.projects.startDate, addDays(today, 14)),
          notInArray(s.projects.status, [...TERMINAL_STATUSES]),
        ),
      )
      .orderBy(asc(s.projects.startDate)),
  ]);

  const statusCounts = Object.fromEntries(PROJECT_STATUSES.map((st) => [st, 0])) as Record<ProjectStatus, number>;
  for (const r of statusRows) statusCounts[r.status as ProjectStatus]++;

  return {
    statusCounts,
    openCount: statusRows.filter((r) => !TERMINAL_STATUSES.includes(r.status as ProjectStatus)).length,
    overdueTasks: tasks.filter((t) => t.dueDate < today),
    upcomingTasks: tasks.filter((t) => t.dueDate >= today),
    departures: departures.map((d) => ({ ...d, status: d.status as ProjectStatus })),
  };
}

// 今月の売上・粗利見込みと、手配の注意(回答期限切れ・受注後なのに未手配)
export async function getArrangementAlerts(db: Db, opts: { today: string }) {
  const { today } = opts;
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = addDays(`${today.slice(0, 7)}-28`, 4).slice(0, 7) + "-01";

  // 今月出発の案件(失注・キャンセルを除く)
  const monthProjects = await db
    .select({ id: s.projects.id })
    .from(s.projects)
    .where(and(gte(s.projects.startDate, monthStart), lt(s.projects.startDate, nextMonth), notInArray(s.projects.status, ["lost", "cancelled"])));
  const monthArrs = monthProjects.length
    ? await db.select().from(s.arrangements).where(inArray(s.arrangements.projectId, monthProjects.map((p) => p.id)))
    : [];
  const monthSales = monthArrs.filter((a) => a.status !== "cancelled").reduce((n, a) => n + a.unitPrice * a.quantity, 0);
  const monthProfit = grossProfit(monthArrs as ArrangementForCalc[]);

  const base = {
    id: s.arrangements.id,
    description: s.arrangements.description,
    serviceDate: s.arrangements.serviceDate,
    replyDue: s.arrangements.replyDue,
    status: s.arrangements.status,
    supplierName: s.suppliers.name,
    projectId: s.projects.id,
    projectCode: s.projects.code,
    projectTitle: s.projects.title,
  };
  const [overdueReplies, unarranged] = await Promise.all([
    // 依頼中のまま回答期限を過ぎた手配
    db
      .select(base)
      .from(s.arrangements)
      .innerJoin(s.projects, eq(s.arrangements.projectId, s.projects.id))
      .leftJoin(s.suppliers, eq(s.arrangements.supplierId, s.suppliers.id))
      .where(and(eq(s.arrangements.status, "requested"), lt(s.arrangements.replyDue, today), notInArray(s.projects.status, [...TERMINAL_STATUSES])))
      .orderBy(asc(s.arrangements.replyDue))
      .limit(20),
    // 受注したのに、まだ依頼もしていない手配
    db
      .select(base)
      .from(s.arrangements)
      .innerJoin(s.projects, eq(s.arrangements.projectId, s.projects.id))
      .leftJoin(s.suppliers, eq(s.arrangements.supplierId, s.suppliers.id))
      .where(and(eq(s.arrangements.status, "pending"), inArray(s.projects.status, ["arranging", "arranged", "operating"])))
      .orderBy(asc(s.arrangements.serviceDate))
      .limit(20),
  ]);
  return { monthStart, monthSales, monthProfit, monthProjectCount: monthProjects.length, overdueReplies, unarranged };
}

// ---------- タスク一覧 ----------

export type TaskFilter = { show?: string; assignee?: string };

export async function listTasks(db: Db, filter: TaskFilter & { today: string; userId: string }) {
  const where: SQL[] = [];
  const show = filter.show === "done" ? "done" : "open";
  where.push(eq(s.tasks.done, show === "done"));
  if (filter.assignee === "me") where.push(eq(s.tasks.assigneeUserId, filter.userId));
  else if (filter.assignee) where.push(eq(s.tasks.assigneeUserId, filter.assignee));

  const rows = await db
    .select({
      t: s.tasks,
      assigneeName: s.users.name,
      projectCode: s.projects.code,
      projectTitle: s.projects.title,
      projectStatus: s.projects.status,
    })
    .from(s.tasks)
    .innerJoin(s.projects, eq(s.tasks.projectId, s.projects.id))
    .leftJoin(s.users, eq(s.tasks.assigneeUserId, s.users.id))
    .where(and(...where))
    // 未完了は期限の近い順、完了は新しい順
    .orderBy(show === "done" ? desc(s.tasks.dueDate) : asc(s.tasks.dueDate), asc(s.projects.code))
    .limit(show === "done" ? 100 : 500);

  return rows.map((r) => ({
    ...r.t,
    assigneeName: r.assigneeName,
    projectCode: r.projectCode,
    projectTitle: r.projectTitle,
    projectStatus: r.projectStatus as ProjectStatus,
  }));
}

// ---------- マスタ ----------

export async function listAgencies(db: Db) {
  const [rows, counts] = await Promise.all([
    db.select().from(s.agencies).orderBy(asc(s.agencies.name)),
    db
      .select({ agencyId: s.projects.agencyId, n: count() })
      .from(s.projects)
      .where(notInArray(s.projects.status, [...TERMINAL_STATUSES]))
      .groupBy(s.projects.agencyId),
  ]);
  return rows.map((r) => ({ ...r, openProjects: counts.find((c) => c.agencyId === r.id)?.n ?? 0 }));
}

export async function listSuppliers(db: Db) {
  const [rows, counts] = await Promise.all([
    db.select().from(s.suppliers).orderBy(asc(s.suppliers.category), asc(s.suppliers.name)),
    db
      .select({ supplierId: s.arrangements.supplierId, n: count() })
      .from(s.arrangements)
      .where(notInArray(s.arrangements.status, ["cancelled"]))
      .groupBy(s.arrangements.supplierId),
  ]);
  return rows.map((r) => ({ ...r, arrangementCount: counts.find((c) => c.supplierId === r.id)?.n ?? 0 }));
}

// ---------- 担当者 ----------

export async function listUsers(db: Db) {
  const [rows, logins] = await Promise.all([
    db
      .select({ id: s.users.id, name: s.users.name, email: s.users.email, role: s.users.role, active: s.users.active, createdAt: s.users.createdAt })
      .from(s.users)
      .orderBy(desc(s.users.active), asc(s.users.name)),
    db
      .select({ userId: s.auditLogs.userId, at: max(s.auditLogs.createdAt) })
      .from(s.auditLogs)
      .where(eq(s.auditLogs.action, "auth.login"))
      .groupBy(s.auditLogs.userId),
  ]);
  return rows.map((r) => ({ ...r, lastLoginAt: logins.find((l) => l.userId === r.id)?.at ?? null }));
}

// ---------- 操作ログ ----------

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilter = { kind?: string; userId?: string; date?: string; page?: number };

export async function listAuditLogs(db: Db, filter: AuditFilter = {}) {
  const where: SQL[] = [];
  if (filter.kind) where.push(like(s.auditLogs.action, `${filter.kind.replace(/[\\%_]/g, "")}.%`));
  if (filter.userId) where.push(eq(s.auditLogs.userId, filter.userId));
  if (filter.date && /^\d{4}-\d{2}-\d{2}$/.test(filter.date)) {
    // 日本時間のその日
    where.push(gte(s.auditLogs.createdAt, new Date(`${filter.date}T00:00:00+09:00`)));
    where.push(lt(s.auditLogs.createdAt, new Date(`${addDays(filter.date, 1)}T00:00:00+09:00`)));
  }
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const cond = where.length ? and(...where) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        log: s.auditLogs,
        userName: s.users.name,
        projectCode: s.projects.code,
        projectTitle: s.projects.title,
      })
      .from(s.auditLogs)
      .leftJoin(s.users, eq(s.auditLogs.userId, s.users.id))
      .leftJoin(s.projects, eq(s.auditLogs.projectId, s.projects.id))
      .where(cond)
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ total: count() }).from(s.auditLogs).where(cond),
  ]);

  return {
    page,
    total,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    rows: rows.map((r) => ({ ...r.log, userName: r.userName, projectCode: r.projectCode, projectTitle: r.projectTitle })),
  };
}

// ---------- 手配依頼(案件ごと) ----------

export async function listRequests(db: Db, projectId: string) {
  const [project] = await db.select({ code: s.projects.code }).from(s.projects).where(eq(s.projects.id, projectId)).limit(1);
  if (!project) return [];
  const reqs = await db
    .select({ r: s.supplierRequests, supplierName: s.suppliers.name, senderName: s.users.name })
    .from(s.supplierRequests)
    .innerJoin(s.suppliers, eq(s.supplierRequests.supplierId, s.suppliers.id))
    .leftJoin(s.users, eq(s.supplierRequests.sentBy, s.users.id))
    .where(eq(s.supplierRequests.projectId, projectId))
    .orderBy(asc(s.supplierRequests.sentAt), asc(s.supplierRequests.id));
  const ids = reqs.map((r) => r.r.id);
  const items = ids.length
    ? await db
        .select({
          requestId: s.requestItems.requestId,
          id: s.arrangements.id,
          description: s.arrangements.description,
          serviceDate: s.arrangements.serviceDate,
          status: s.arrangements.status,
          confirmationNo: s.arrangements.confirmationNo,
          unitCost: s.arrangements.unitCost,
        })
        .from(s.requestItems)
        .innerJoin(s.arrangements, eq(s.requestItems.arrangementId, s.arrangements.id))
        .where(inArray(s.requestItems.requestId, ids))
        .orderBy(asc(s.arrangements.serviceDate), asc(s.arrangements.serviceTime))
    : [];
  // 依頼番号は送った順の連番。一覧は新しい順で返す
  return reqs
    .map((r, i) => ({
      ...r.r,
      requestNo: `${project.code}-R${i + 1}`,
      supplierName: r.supplierName,
      senderName: r.senderName,
      items: items.filter((it) => it.requestId === r.r.id).map((it) => ({ ...it, status: it.status as ArrangementStatus })),
    }))
    .reverse();
}

export type RequestRow = Awaited<ReturnType<typeof listRequests>>[number];

// ---------- 毎朝の処理 ----------

export async function lastDailyRun(db: Db) {
  const [row] = await db
    .select({ createdAt: s.auditLogs.createdAt, changes: s.auditLogs.changes })
    .from(s.auditLogs)
    .where(eq(s.auditLogs.action, "system.daily"))
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(1);
  return row ? { at: row.createdAt, ...(row.changes as { trigger?: string; mailsSent?: number; mailsFailed?: number }) } : null;
}

// ---------- 添付書類 ----------

export async function listAttachments(db: Db, projectId: string) {
  const rows = await db
    .select({ a: s.attachments, uploaderName: s.users.name })
    .from(s.attachments)
    .leftJoin(s.users, eq(s.attachments.uploadedBy, s.users.id))
    .where(eq(s.attachments.projectId, projectId))
    .orderBy(desc(s.attachments.createdAt));
  return rows.map((r) => ({ ...r.a, uploaderName: r.uploaderName }));
}

export type AttachmentRow = Awaited<ReturnType<typeof listAttachments>>[number];
