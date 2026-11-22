"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { agencyInput, supplierInput } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action-utils";
import { createAgency, createSupplier, updateAgency, updateSupplier } from "@/server/masters";

const id = z.uuid();

export async function createAgencyAction(_prev: ActionResult, formData: FormData) {
  const result = await runAction(agencyInput, formToObject(formData), async (db, ctx, input) => ({ id: (await createAgency(db, ctx, input)).id }));
  if (result.ok) refresh();
  return result;
}

export async function updateAgencyAction(agencyId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(agencyInput, formToObject(formData), async (db, ctx, input) => ({ id: (await updateAgency(db, ctx, id.parse(agencyId), input)).id }));
  if (result.ok) refresh();
  return result;
}

export async function createSupplierAction(_prev: ActionResult, formData: FormData) {
  const result = await runAction(supplierInput, formToObject(formData), async (db, ctx, input) => ({ id: (await createSupplier(db, ctx, input)).id }));
  if (result.ok) refresh();
  return result;
}

export async function updateSupplierAction(supplierId: string, _prev: ActionResult, formData: FormData) {
  const result = await runAction(supplierInput, formToObject(formData), async (db, ctx, input) => ({ id: (await updateSupplier(db, ctx, id.parse(supplierId), input)).id }));
  if (result.ok) refresh();
  return result;
}
