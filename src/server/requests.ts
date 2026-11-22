// 手配依頼(照会・手配・変更・取消)の送付と、仕入先からの回答の入力
// 依頼書 PDF を作り、メールなら送ってから記録する。FAX は自社の FAX で送ったあとに記録だけ行う
import { and, asc, count, eq, inArray, lt, or } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db } from "@/db/types";
import {
  allowedRequestKinds,
  CATEGORY_LABEL,
  REQUEST_KIND_LABEL,
  REQUEST_TITLE,
  statusAfterRequest,
  type ArrangementStatus,
  type ProjectStatus,
  type RequestKind,
} from "@/lib/status";
import { COMPANY } from "@/lib/company";
import { formatDate } from "@/lib/utils";
import { arrangementInput, type ReplyInput, type RequestInput } from "@/lib/validation";
import { syncAutoTasks, syncProjectStatus, updateArrangement } from "./arrangements";
import { recordAudit } from "./audit";
import { AppError, assertCan, type Ctx } from "./core";
import type { Mailer, MailResult } from "./mailer";
import { renderRequestPdf, requestPdfFilename, type RequestPdfData } from "./pdf/request-pdf";

type CtxWithToday = Ctx & { today?: string };

// 依頼の対象(案件・仕入先・手配明細)を読み、組み合わせが正しいか確かめる
async function loadTargets(db: Db, projectId: string, input: Pick<RequestInput, "supplierId" | "kind" | "arrangementIds">) {
  const [row] = await db
    .select({ project: s.projects, agencyName: s.agencies.name })
    .from(s.projects)
    .innerJoin(s.agencies, eq(s.projects.agencyId, s.agencies.id))
    .where(eq(s.projects.id, projectId))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "案件が見つかりません");
  const [supplier] = await db.select().from(s.suppliers).where(eq(s.suppliers.id, input.supplierId)).limit(1);
  if (!supplier) throw new AppError("NOT_FOUND", "仕入先が見つかりません");

  const projectStatus = row.project.status as ProjectStatus;
  if (!allowedRequestKinds(projectStatus).includes(input.kind)) {
    throw new AppError("INVALID", `今の案件の状態では「${REQUEST_KIND_LABEL[input.kind]}」の依頼は送れません`, {
      kind: ["受注前は照会、受注後は手配・変更、終了した案件は取消だけ送れます"],
    });
  }

  const ids = [...new Set(input.arrangementIds)];
  const arrangements = await db
    .select()
    .from(s.arrangements)
    .where(and(eq(s.arrangements.projectId, projectId), inArray(s.arrangements.id, ids)))
    .orderBy(asc(s.arrangements.serviceDate), asc(s.arrangements.serviceTime));
  if (arrangements.length !== ids.length || arrangements.some((a) => a.supplierId !== supplier.id)) {
    throw new AppError("INVALID", "選んだ手配がこの案件・仕入先のものではありません。画面を更新してやり直してください");
  }
  if (input.kind !== "cancel" && arrangements.some((a) => a.status === "cancelled")) {
    throw new AppError("INVALID", "取消済みの手配は、取消依頼でしか送れません", { arrangementIds: ["取消済みの手配を外してください"] });
  }
  return { project: row.project, agencyName: row.agencyName, supplier, arrangements };
}

type Targets = Awaited<ReturnType<typeof loadTargets>>;

function toPdfData(t: Targets, opts: { kind: RequestKind; requestNo: string | null; issuedAt: Date; senderName: string; note: string | null }): RequestPdfData {
  // 回答期限は、選んだ手配の中でいちばん早い日
  const dues = t.arrangements.map((a) => a.replyDue).filter((d): d is string => !!d).sort();
  return {
    kind: opts.kind,
    requestNo: opts.requestNo,
    issuedAt: opts.issuedAt,
    project: {
      code: t.project.code,
      title: t.project.title,
      agencyName: t.agencyName,
      startDate: t.project.startDate,
      endDate: t.project.endDate,
      paxAdult: t.project.paxAdult,
      paxChild: t.project.paxChild,
      language: t.project.language,
    },
    supplier: { name: t.supplier.name, contactName: t.supplier.contactName, fax: t.supplier.fax, email: t.supplier.email },
    senderName: opts.senderName,
    replyDue: opts.kind === "cancel" ? null : (dues[0] ?? null),
    note: opts.note,
    items: t.arrangements.map((a) => ({
      serviceDate: a.serviceDate,
      serviceTime: a.serviceTime,
      category: CATEGORY_LABEL[a.category],
      description: a.description,
      quantity: a.quantity,
      meetingPlace: a.meetingPlace,
      supplierNote: a.supplierNote,
      confirmationNo: a.confirmationNo,
    })),
  };
}

// 依頼番号: 案件番号-R連番(案件の中で送った順)
async function nextRequestNo(db: Db, project: { id: string; code: string }) {
  const [{ n }] = await db.select({ n: count() }).from(s.supplierRequests).where(eq(s.supplierRequests.projectId, project.id));
  return `${project.code}-R${n + 1}`;
}

export async function requestNoOf(db: Db, request: { id: string; projectId: string; sentAt: Date }, projectCode: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(s.supplierRequests)
    .where(
      and(
        eq(s.supplierRequests.projectId, request.projectId),
        or(lt(s.supplierRequests.sentAt, request.sentAt), and(eq(s.supplierRequests.sentAt, request.sentAt), lt(s.supplierRequests.id, request.id))),
      ),
    );
  return `${projectCode}-R${n + 1}`;
}

// 送る前の確認用 PDF(記録しない)
export async function previewRequestPdf(db: Db, ctx: Ctx, projectId: string, input: Pick<RequestInput, "supplierId" | "kind" | "arrangementIds" | "note">) {
  const t = await loadTargets(db, projectId, input);
  const data = toPdfData(t, { kind: input.kind, requestNo: null, issuedAt: new Date(), senderName: ctx.actor.name, note: input.note ?? null });
  return { pdf: await renderRequestPdf(data), filename: requestPdfFilename(data) };
}

// 記録済みの依頼の PDF(送ったときと同じ内容。手配明細のその後の変更は反映する)
export async function recordedRequestPdf(db: Db, requestId: string) {
  const [req] = await db
    .select({ r: s.supplierRequests, senderName: s.users.name })
    .from(s.supplierRequests)
    .leftJoin(s.users, eq(s.supplierRequests.sentBy, s.users.id))
    .where(eq(s.supplierRequests.id, requestId))
    .limit(1);
  if (!req) throw new AppError("NOT_FOUND", "手配依頼が見つかりません");
  const items = await db.select({ id: s.requestItems.arrangementId }).from(s.requestItems).where(eq(s.requestItems.requestId, requestId));
  const t = await loadTargetsForRecorded(db, req.r.projectId, req.r.supplierId, items.map((i) => i.id));
  const data = toPdfData(t, {
    kind: req.r.kind,
    requestNo: await requestNoOf(db, req.r, t.project.code),
    issuedAt: req.r.sentAt,
    senderName: req.senderName ?? "—",
    note: req.r.note,
  });
  return { pdf: await renderRequestPdf(data), filename: requestPdfFilename(data), projectId: req.r.projectId };
}

// 記録済みの依頼は、案件の今の状態に関係なく表示できるようにする
async function loadTargetsForRecorded(db: Db, projectId: string, supplierId: string, arrangementIds: string[]): Promise<Targets> {
  const [row] = await db
    .select({ project: s.projects, agencyName: s.agencies.name })
    .from(s.projects)
    .innerJoin(s.agencies, eq(s.projects.agencyId, s.agencies.id))
    .where(eq(s.projects.id, projectId))
    .limit(1);
  const [supplier] = await db.select().from(s.suppliers).where(eq(s.suppliers.id, supplierId)).limit(1);
  const arrangements = arrangementIds.length
    ? await db
        .select()
        .from(s.arrangements)
        .where(inArray(s.arrangements.id, arrangementIds))
        .orderBy(asc(s.arrangements.serviceDate), asc(s.arrangements.serviceTime))
    : [];
  return { project: row.project, agencyName: row.agencyName, supplier, arrangements };
}

export type SendRequestResult = { requestId: string; requestNo: string; mail: MailResult | null };

export async function sendRequest(
  db: Db,
  ctx: CtxWithToday,
  projectId: string,
  input: RequestInput,
  deps: { mailer: Mailer; now?: Date },
): Promise<SendRequestResult> {
  assertCan(ctx.actor, "arrangements.write");
  const t = await loadTargets(db, projectId, input);
  if (input.method === "email" && !t.supplier.email) {
    throw new AppError("INVALID", "この仕入先はメールアドレスが登録されていません。FAXで送るか、仕入先マスタにメールアドレスを登録してください", {
      method: ["メールアドレスが未登録です"],
    });
  }
  const now = deps.now ?? new Date();
  const requestNo = await nextRequestNo(db, t.project);

  // メールは先に送る(送れなかったときは記録しない)
  let mail: MailResult | null = null;
  if (input.method === "email") {
    const data = toPdfData(t, { kind: input.kind, requestNo, issuedAt: now, senderName: ctx.actor.name, note: input.note });
    const pdf = await renderRequestPdf(data);
    const title = REQUEST_TITLE[input.kind];
    mail = await deps.mailer.send({
      to: t.supplier.email!,
      subject: `【${title}】${t.project.title}(${formatDate(t.project.startDate, { withYear: true })}〜)${COMPANY.name}`,
      text: [
        `${t.supplier.name} ご担当者様`,
        "",
        `いつもお世話になっております。${COMPANY.name}の${ctx.actor.name}です。`,
        `${title}をお送りします。添付のPDFをご確認のうえ、回答欄にご記入いただき、FAXまたはこのメールへの返信でご回答ください。`,
        "",
        `依頼番号: ${requestNo}`,
        `ツアー: ${t.project.title}`,
        ...(input.note ? ["", input.note] : []),
        "",
        "--",
        `${COMPANY.name} ${COMPANY.department} ${ctx.actor.name}`,
        `TEL ${COMPANY.tel} / FAX ${COMPANY.fax}`,
      ].join("\n"),
      attachments: [{ filename: requestPdfFilename(data), content: pdf }],
    });
  }

  const requestId = await db.transaction(async (tx) => {
    const [req] = await tx
      .insert(s.supplierRequests)
      .values({
        projectId,
        supplierId: t.supplier.id,
        kind: input.kind,
        method: input.method,
        sentAt: now,
        sentBy: ctx.actor.id,
        note: input.note,
      })
      .returning();
    await tx.insert(s.requestItems).values(t.arrangements.map((a) => ({ requestId: req.id, arrangementId: a.id })));

    // 送った依頼に合わせて手配ステータスを進める(未手配 → 依頼中 など)
    for (const a of t.arrangements) {
      const next = statusAfterRequest(input.kind, a.status as ArrangementStatus);
      if (!next || next === a.status) continue;
      const [after] = await tx.update(s.arrangements).set({ status: next }).where(eq(s.arrangements.id, a.id)).returning();
      await tx.insert(s.statusHistory).values({
        projectId, arrangementId: a.id, fromStatus: a.status, toStatus: next, changedBy: ctx.actor.id,
      });
      await syncAutoTasks(tx, after, t.project, ctx.today);
    }
    await syncProjectStatus(tx, ctx, projectId);

    await recordAudit(tx, {
      userId: ctx.actor.id, action: "request.send", targetType: "supplier_request", targetId: req.id, projectId,
      extra: {
        requestNo,
        supplier: t.supplier.name,
        kind: REQUEST_KIND_LABEL[input.kind],
        method: input.method === "email" ? "メール" : "FAX",
        items: t.arrangements.map((a) => a.description),
        ...(mail ? { mailTo: mail.deliveredTo, mailRedirected: mail.redirected, mailTransport: mail.transport } : {}),
      },
      request: ctx.request,
    });
    return req.id;
  });

  return { requestId, requestNo, mail };
}

// 仕入先からの回答を手配明細に反映する(仮押さえ・確定・手配不可)
export async function recordReply(db: Db, ctx: CtxWithToday, requestId: string, input: ReplyInput) {
  assertCan(ctx.actor, "arrangements.write");
  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(s.supplierRequests).where(eq(s.supplierRequests.id, requestId)).limit(1);
    if (!req) throw new AppError("NOT_FOUND", "手配依頼が見つかりません");
    if (req.kind === "cancel") throw new AppError("INVALID", "取消依頼の回答(取消料)は、手配明細の編集から入力してください");

    const itemIds = new Set(
      (await tx.select({ id: s.requestItems.arrangementId }).from(s.requestItems).where(eq(s.requestItems.requestId, requestId))).map((r) => r.id),
    );
    if (input.items.some((i) => !itemIds.has(i.arrangementId))) {
      throw new AppError("INVALID", "この依頼に含まれない手配があります。画面を更新してやり直してください");
    }

    const summary: string[] = [];
    for (const item of input.items) {
      const [current] = await tx.select().from(s.arrangements).where(eq(s.arrangements.id, item.arrangementId)).limit(1);
      if (current.status === "cancelled") continue; // 取消済みの手配は回答で戻さない
      const status: ArrangementStatus = item.result === "declined" ? "pending" : item.result;
      const base = arrangementInput.parse(current);
      await updateArrangement(tx, ctx, current.id, {
        ...base,
        status,
        confirmationNo: item.confirmationNo ?? base.confirmationNo,
        unitCost: item.unitCost ?? base.unitCost,
      });
      summary.push(`${current.description}: ${item.result === "declined" ? "手配不可" : item.result === "confirmed" ? "確定" : "仮押さえ"}`);
    }

    await recordAudit(tx, {
      userId: ctx.actor.id, action: "request.reply", targetType: "supplier_request", targetId: requestId,
      projectId: req.projectId, extra: { replies: summary }, request: ctx.request,
    });
    return { count: summary.length };
  });
}
