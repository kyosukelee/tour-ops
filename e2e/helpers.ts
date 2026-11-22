import { expect, type Locator, type Page } from "@playwright/test";

export const ACCOUNTS = {
  admin: { email: "admin@tour-ops.example", name: "デモ 花子" },
  staff1: { email: "staff1@tour-ops.example", name: "デモ 太郎" },
  staff2: { email: "staff2@tour-ops.example", name: "デモ 次郎" },
} as const;

export async function login(page: Page, who: keyof typeof ACCOUNTS, password = "tour-ops-demo") {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(ACCOUNTS[who].email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
}

export async function openProject(page: Page, title: string) {
  await page.goto(`/projects?status=all&q=${encodeURIComponent(title)}`);
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
}

export async function openTab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "案件の内容" }).getByRole("link", { name: new RegExp(`^${name}`) }).click();
}

// HTML5 のドラッグ&ドロップをイベントで再現する(ヘッドレスのブラウザではマウス操作のドラッグが安定しないため)
export async function dragAndDrop(page: Page, source: Locator, target: Locator) {
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer: dt });
  await page.waitForTimeout(100);
  await target.dispatchEvent("dragover", { dataTransfer: dt });
  await page.waitForTimeout(100);
  await target.dispatchEvent("drop", { dataTransfer: dt });
  await source.dispatchEvent("dragend", { dataTransfer: dt });
}

// 添付用の小さなファイル(中身の先頭だけ本物と同じ)
export const FILES = {
  pdf: { name: "回答.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% e2e\n") },
  png: {
    name: "fax.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  },
  fake: { name: "偽物.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>alert(1)</script></html>") },
};
