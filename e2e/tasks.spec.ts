// タスク(追加・完了・戻す・削除)、コメント、タスク一覧
import { expect, test } from "@playwright/test";
import { login, openProject, openTab } from "./helpers";

test("案件のタスクを追加・完了・戻す・削除でき、コメントを残せる", async ({ page }) => {
  await login(page, "staff1");
  await openProject(page, "中学校 校外学習");
  await openTab(page, "タスク");

  await page.getByRole("button", { name: "タスクを追加" }).click();
  await expect(page.getByText("内容を入力してください")).toBeVisible();
  await page.getByRole("textbox", { name: /^内容/ }).fill("バス会社へ座席表を送る");
  await page.getByRole("button", { name: "タスクを追加" }).click();
  await expect(page.getByText("バス会社へ座席表を送る")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^内容/ })).toHaveValue("");

  await page.getByRole("button", { name: "バス会社へ座席表を送る を完了にする" }).click();
  await page.getByRole("button", { name: "バス会社へ座席表を送る を未完了に戻す" }).click();
  await page.getByRole("button", { name: "バス会社へ座席表を送る を削除" }).click();
  await page.getByRole("button", { name: "はい" }).click();
  await expect(page.getByText("バス会社へ座席表を送る")).toHaveCount(0);

  await openTab(page, "コメント");
  await page.getByLabel("コメント").fill("雨天時は屋内プランに変更と連絡あり");
  await page.getByRole("button", { name: "コメントを残す" }).click();
  await expect(page.getByText("雨天時は屋内プランに変更と連絡あり")).toBeVisible();
  await expect(page.getByText(/デモ 太郎 ・ /)).toBeVisible();
});

test("タスク一覧: 自分の担当に絞り、完了にすると「完了」に移る", async ({ page }) => {
  await login(page, "staff1");
  await page.goto("/tasks");
  await page.getByLabel("担当").selectOption("me");
  await page.getByRole("button", { name: "表示" }).click();
  await expect(page).toHaveURL(/assignee=me/);
  await expect(page.locator("main ul li").filter({ hasText: "デモ 次郎" })).toHaveCount(0);

  const button = page.getByRole("button", { name: /を完了にする$/ }).first();
  const label = (await button.getAttribute("aria-label"))!;
  await button.click();
  await expect(page.getByRole("button", { name: label })).toHaveCount(0);
  await page.getByRole("link", { name: "完了", exact: true }).click();
  await expect(page.getByRole("button", { name: label.replace("を完了にする", "を未完了に戻す") })).toBeVisible();
});
