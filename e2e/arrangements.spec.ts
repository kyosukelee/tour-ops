// 手配明細の追加・編集と、履歴
import { expect, test } from "@playwright/test";
import { login, openProject, openTab } from "./helpers";

test("手配を追加(必須の空欄でエラー → 入力を直して保存)し、確定にして確定番号を入れる", async ({ page }) => {
  await login(page, "staff1");
  await openProject(page, "中学校 校外学習");

  await page.getByRole("button", { name: "手配を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("種別").selectOption("meal");
  await dialog.getByLabel("原価(単価・税込)").fill("3500");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog.getByText("内容を入力してください")).toBeVisible();
  await expect(dialog.getByLabel("原価(単価・税込)")).toHaveValue("3500");
  await dialog.getByLabel("内容").fill("夕食 お好み焼き");
  await dialog.getByLabel("数量").fill("30");
  await dialog.getByLabel("販売単価(税込)").fill("4000");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("夕食 お好み焼き").locator("visible=true")).toBeVisible();

  await page.getByRole("button", { name: "夕食 お好み焼き を編集" }).locator("visible=true").click();
  const edit = page.getByRole("dialog");
  await expect(edit.getByLabel("内容")).toHaveValue("夕食 お好み焼き");
  await edit.getByLabel("状態").selectOption("confirmed");
  await edit.getByLabel("確定番号(仕入先の予約番号)").fill("OK-123");
  await edit.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("確定番号 OK-123").locator("visible=true")).toBeVisible();

  await openTab(page, "履歴");
  await expect(page.getByText(/夕食 お好み焼き」: 未手配 → 確定/)).toBeVisible();
});
