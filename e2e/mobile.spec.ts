// スマホの幅での表示(上部のメニュー、手配明細のカード表示)
import { expect, test } from "@playwright/test";
import { login, openProject } from "./helpers";

test("スマホでは上部メニューと、手配明細のカード表示になる", async ({ page }) => {
  await login(page, "staff2");
  await expect(page.getByRole("navigation", { name: "メインメニュー" }).locator("visible=true")).toBeVisible();
  await openProject(page, "海外VIP 観光タクシーで巡る2日間");
  // 表はPCだけ。スマホはカードで、状態と金額が見える
  await expect(page.getByRole("table")).toBeHidden();
  await expect(page.locator("main ul li").filter({ hasText: "観光タクシー" }).first()).toBeVisible();
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "タスク", exact: true })).toBeVisible();
});
