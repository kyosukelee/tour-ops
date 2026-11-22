// ログイン・ログアウトと、権限による画面の出し分け
import { expect, test } from "@playwright/test";
import { ACCOUNTS, login } from "./helpers";

test("未ログインで開くとログイン画面に移る", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("デモ用アカウント")).toBeVisible();
});

test("パスワードを間違えるとエラーが出て、メールアドレスは消えない", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(ACCOUNTS.admin.email);
  await page.getByLabel("パスワード").fill("wrong-password");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByText("メールアドレスまたはパスワードが違います")).toBeVisible();
  await expect(page.getByLabel("メールアドレス")).toHaveValue(ACCOUNTS.admin.email);
});

test("手配担当には管理者の画面が出ず、URLを直接開いても使えない。ログアウトできる", async ({ page }) => {
  await login(page, "staff1");
  await expect(page.locator("aside").getByText(ACCOUNTS.staff1.name)).toBeVisible();
  await expect(page.getByRole("link", { name: "操作ログ" })).toHaveCount(0);
  await expect(page.getByText("毎朝の通知メール")).toHaveCount(0);
  for (const url of ["/audit", "/users"]) {
    await page.goto(url);
    await expect(page.getByText("この画面は管理者だけが使えます")).toBeVisible();
  }
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("ログインしていないと、PDF・添付書類・毎朝の処理は開けない", async ({ request }) => {
  const id = "00000000-0000-0000-0000-000000000000";
  for (const url of [`/api/requests/${id}/pdf`, `/api/attachments/${id}`, `/api/projects/${id}/pdf/internal`]) {
    const res = await request.get(url, { maxRedirects: 0 });
    expect([307, 401]).toContain(res.status());
  }
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
  expect((await request.get("/api/cron/daily", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
});
