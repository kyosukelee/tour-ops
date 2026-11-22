// 案件: 一覧・絞り込み、登録(入力エラー → 成功)、ステータス変更、編集、カンバン
import { expect, test } from "@playwright/test";
import { dragAndDrop, login, openProject } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, "staff1");
});

test("一覧は進行中の9件。キーワードで絞り込める", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByText("9件", { exact: true })).toBeVisible();
  await page.getByLabel("ステータス").selectOption("all");
  await page.getByLabel("キーワード(ツアー名・案件番号)").fill("韓国");
  await page.getByRole("button", { name: "絞り込む" }).click();
  await expect(page.getByText("1件", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "韓国団体 2泊3日 温泉と街歩き" })).toBeVisible();
});

test("案件を登録し、見積を始めてから失注にする(失注は確認してから)", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("ツアー名").fill("画面テスト 日帰り");
  await page.getByLabel("出発日").fill("2027-02-10");
  await page.getByLabel("帰着日").fill("2027-02-09");
  await page.getByRole("button", { name: "登録する" }).click();
  // 依頼元の未選択と日付の前後を同時に知らせ、入力は消えない
  await expect(page.getByText("依頼元を選んでください")).toBeVisible();
  await expect(page.getByText("帰着日は出発日以降にしてください")).toBeVisible();
  await expect(page.getByLabel("ツアー名")).toHaveValue("画面テスト 日帰り");

  await page.getByLabel("依頼元").selectOption({ index: 1 });
  await page.getByLabel("帰着日").fill("2027-02-10");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^T-\d{4}-\d{4}$/)).toBeVisible();

  await page.getByRole("button", { name: "見積を始める" }).click();
  await expect(page.getByRole("button", { name: "見積を提出した" })).toBeVisible();
  await page.getByRole("button", { name: "失注にする" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("元に戻せません");
  await page.getByRole("alertdialog").getByRole("button", { name: "失注にする" }).click();
  await expect(page.getByRole("button", { name: "見積を提出した" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "編集" })).toHaveCount(0);
});

test("案件を編集できる", async ({ page }) => {
  await openProject(page, "韓国団体 2泊3日 温泉と街歩き");
  await page.getByRole("link", { name: "編集" }).click();
  await page.getByLabel("案内言語").fill("韓国語・日本語");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByText("韓国語・日本語")).toBeVisible();
});

test("カンバン: 許された列にだけカードを移せる", async ({ page }) => {
  await page.goto("/projects?view=kanban");
  const column = (name: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^${name}`) }) });
  const card = page.locator("li[draggable=true]").filter({ hasText: "社員旅行 1泊2日" });
  await expect(column("引合").locator("li").filter({ hasText: "社員旅行 1泊2日" })).toBeVisible();

  await dragAndDrop(page, card, column("催行")); // 引合 → 催行 は許されない
  await page.waitForTimeout(500);
  await expect(column("引合").locator("li").filter({ hasText: "社員旅行 1泊2日" })).toBeVisible();

  await dragAndDrop(page, card, column("見積中"));
  await expect(column("見積中").locator("li").filter({ hasText: "社員旅行 1泊2日" })).toBeVisible();
  await page.reload();
  await expect(column("見積中").locator("li").filter({ hasText: "社員旅行 1泊2日" })).toBeVisible();
});
