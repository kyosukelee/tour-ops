// 管理者: 依頼元・仕入先マスタ、担当者管理、操作ログ、毎朝の通知の手動実行
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, "admin");
});

test("依頼元を追加(入力エラー → 成功)し、利用停止にすると一覧と選択肢から消える", async ({ page }) => {
  await page.goto("/agencies");
  await page.getByRole("button", { name: "依頼元を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("FAX").fill("abc");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(dialog.getByText("会社名を入力してください")).toBeVisible();
  await expect(dialog.getByText("電話・FAX番号の形式が正しくありません")).toBeVisible();
  await dialog.getByLabel("会社名").fill("画面テスト旅行株式会社");
  await dialog.getByLabel("FAX").fill("000-9999-0001");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("画面テスト旅行株式会社")).toBeVisible();

  await page.getByRole("button", { name: "画面テスト旅行株式会社 を編集" }).click();
  await page.getByRole("dialog").getByLabel("状態").selectOption("false");
  await page.getByRole("dialog").getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("画面テスト旅行株式会社")).toHaveCount(0);
  await page.getByRole("link", { name: /利用停止の1件も表示/ }).click();
  await expect(page.getByText("画面テスト旅行株式会社")).toBeVisible();

  await page.goto("/projects/new");
  await expect(page.getByLabel("依頼元")).not.toContainText("画面テスト旅行株式会社");
});

test("仕入先を種別で絞り込み、追加できる", async ({ page }) => {
  await page.goto("/suppliers");
  await page.getByRole("navigation", { name: "種別" }).getByRole("link", { name: "観光タクシー" }).click();
  await expect(page).toHaveURL(/category=taxi/);
  await page.getByRole("button", { name: "仕入先を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("仕入先名").fill("画面テストタクシー");
  await dialog.getByLabel("種別").selectOption("taxi");
  await dialog.getByLabel("メールアドレス").fill("ops@e2e-taxi.example");
  await dialog.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("画面テストタクシー")).toBeVisible();
});

test("担当者を追加して利用停止にすると、その人はログインできない。自分は利用停止にできない", async ({ page, browser }) => {
  await page.goto("/users");
  await page.getByRole("button", { name: "担当者を追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("氏名").fill("デモ 三郎");
  await dialog.getByLabel("メールアドレス(ログインID)").fill("staff3@tour-ops.example");
  await dialog.getByLabel("初期パスワード").fill("short");
  await dialog.getByRole("button", { name: "追加する" }).click();
  await expect(dialog.getByText("パスワードは10文字以上にしてください")).toBeVisible();
  await dialog.getByLabel("初期パスワード").fill("staff3-pass-01");
  await dialog.getByRole("button", { name: "追加する" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("staff3@tour-ops.example")).toBeVisible();

  await page.getByRole("button", { name: "デモ 花子 を編集" }).click();
  await page.getByRole("dialog").getByLabel("状態").selectOption("false");
  await page.getByRole("dialog").getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("dialog").getByText("自分自身の利用停止や、管理者からの変更はできません")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "デモ 三郎 を編集" }).click();
  await page.getByRole("dialog").getByLabel("状態").selectOption("false");
  await page.getByRole("dialog").getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const other = await browser.newPage();
  await other.goto("/login");
  await other.getByLabel("メールアドレス").fill("staff3@tour-ops.example");
  await other.getByLabel("パスワード").fill("staff3-pass-01");
  await other.getByRole("button", { name: "ログイン" }).click();
  await expect(other.getByText("この担当者は利用停止になっています")).toBeVisible();
  await other.close();
});

test("操作ログを種類で絞り込める", async ({ page }) => {
  await page.goto("/audit");
  await expect(page.getByText("ログイン").first()).toBeVisible();
  await page.getByLabel("種類").selectOption("auth");
  await page.getByRole("button", { name: "絞り込む" }).click();
  await expect(page).toHaveURL(/kind=auth/);
  await expect(page.getByRole("cell", { name: "ログイン", exact: true }).first()).toBeVisible();
});

test("毎朝の通知メールを手動で送ると、前回の実行が更新される", async ({ page }) => {
  await expect(page.getByText("毎朝の通知メール")).toBeVisible();
  await page.getByRole("button", { name: "今すぐ送る" }).click();
  await page.getByRole("button", { name: "はい" }).click();
  await expect(page.getByText(/前回: .*手動・\d+通/)).toBeVisible();
});
