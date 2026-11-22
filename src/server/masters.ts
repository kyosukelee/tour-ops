// 依頼元・仕入先マスタ。削除はせず、active=false(利用停止)で隠す
import { eq } from "drizzle-orm";
import { agencies, suppliers } from "@/db/schema";
import type { Db } from "@/db/types";
import type { AgencyInput, SupplierInput } from "@/lib/validation";
import { recordAudit } from "./audit";
import { AppError, assertCan, type Ctx } from "./core";

export async function createAgency(db: Db, ctx: Ctx, input: AgencyInput) {
  assertCan(ctx.actor, "masters.write");
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(agencies).values(input).returning();
    await recordAudit(tx, { userId: ctx.actor.id, action: "agency.create", targetType: "agency", targetId: created.id, after: created, request: ctx.request });
    return created;
  });
}

export async function updateAgency(db: Db, ctx: Ctx, id: string, input: AgencyInput) {
  assertCan(ctx.actor, "masters.write");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(agencies).where(eq(agencies.id, id)).limit(1);
    if (!before) throw new AppError("NOT_FOUND", "依頼元が見つかりません");
    const [after] = await tx.update(agencies).set(input).where(eq(agencies.id, id)).returning();
    await recordAudit(tx, { userId: ctx.actor.id, action: "agency.update", targetType: "agency", targetId: id, before, after, request: ctx.request });
    return after;
  });
}

export async function createSupplier(db: Db, ctx: Ctx, input: SupplierInput) {
  assertCan(ctx.actor, "masters.write");
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(suppliers).values(input).returning();
    await recordAudit(tx, { userId: ctx.actor.id, action: "supplier.create", targetType: "supplier", targetId: created.id, after: created, request: ctx.request });
    return created;
  });
}

export async function updateSupplier(db: Db, ctx: Ctx, id: string, input: SupplierInput) {
  assertCan(ctx.actor, "masters.write");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!before) throw new AppError("NOT_FOUND", "仕入先が見つかりません");
    const [after] = await tx.update(suppliers).set(input).where(eq(suppliers.id, id)).returning();
    await recordAudit(tx, { userId: ctx.actor.id, action: "supplier.update", targetType: "supplier", targetId: id, before, after, request: ctx.request });
    return after;
  });
}
