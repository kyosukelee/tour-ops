// 案件票・行程表の PDF と、添付書類(追加・偽物の拒否・表示・削除)
import { expect, test } from "@playwright/test";
import { FILES, login, openProject, openTab } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, "staff1");
  await openProject(page, "韓国団体 2泊3日 温泉と街歩き");
});

test("案件票(社内・依頼元向け)と行程表の PDF が開く", async ({ page }) => {
  for (const name of ["案件票(社内)", "案件票(依頼元向け)", "行程表"]) {
    const res = await page.request.get((await page.getByRole("link", { name }).getAttribute("href"))!);
    expect(res.status(), name).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
  }
});

test("添付書類を追加して開き、削除できる。PDF・画像以外は受け付けない", async ({ page }) => {
  await openTab(page, "添付書類");
  const file = page.getByLabel(/^ファイル/);

  await page.getByRole("button", { name: "添付する" }).click();
  await expect(page.getByText("ファイルを選んでください").first()).toBeVisible();

  await file.setInputFiles(FILES.fake);
  await page.getByRole("button", { name: "添付する" }).click();
  await expect(page.getByText("PDF・JPEG・PNG・WebP のファイルだけ添付できます")).toBeVisible();

  await file.setInputFiles(FILES.png);
  await page.getByLabel("メモ").fill("人数変更のFAX");
  await page.getByRole("button", { name: "添付する" }).click();
  await expect(page.getByRole("link", { name: "fax.png" })).toBeVisible();

  await file.setInputFiles(FILES.pdf);
  await page.getByLabel("書類の種類").selectOption("supplier_reply");
  await page.getByLabel("どの手配依頼への回答か").selectOption({ index: 1 });
  await page.getByRole("button", { name: "添付する" }).click();
  await expect(page.getByRole("link", { name: "回答.pdf" })).toBeVisible();
  await expect(page.getByText(/回答元: T-\d{4}-\d{4}-R\d+/)).toBeVisible();

  const href = (await page.getByRole("link", { name: "fax.png" }).getAttribute("href"))!;
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");

  await page.getByRole("button", { name: "fax.png を削除" }).click();
  await page.getByRole("button", { name: "はい" }).click();
  await expect(page.getByRole("link", { name: "fax.png" })).toHaveCount(0);
  expect((await page.request.get(href)).status()).toBe(404);
});
