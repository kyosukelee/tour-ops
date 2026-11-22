"use server";

import { z } from "zod";
import { password, userCreateInput, userUpdateInput } from "@/lib/validation";
import { formToObject, runAction, type ActionResult } from "@/server/action-utils";
import { createUser, resetPassword, updateUser } from "@/server/users";

const id = z.string().min(1);

export async function createUserAction(_prev: ActionResult, formData: FormData) {
  return runAction(userCreateInput, formToObject(formData), async (db, ctx, input) => ({ id: (await createUser(db, ctx, input)).id }));
}

export async function updateUserAction(userId: string, _prev: ActionResult, formData: FormData) {
  return runAction(userUpdateInput, formToObject(formData), async (db, ctx, input) => ({ id: (await updateUser(db, ctx, id.parse(userId), input)).id }));
}

export async function resetPasswordAction(userId: string, _prev: ActionResult, formData: FormData) {
  return runAction(z.object({ password }), formToObject(formData), async (db, ctx, input) => {
    await resetPassword(db, ctx, id.parse(userId), input.password);
    return { id: userId };
  });
}
