// 手配依頼: 確認用PDF、メールで送る(デモの宛先差し替え)、FAX送付の記録、回答の入力
import { expect, test } from "@playwright/test";
import { login, openProject, openTab } from "./helpers";

test("手配依頼を作って送り、回答を入力すると手配明細に反映される", async ({ page }) => {
  await login(page, "staff1");
  await openProject(page, "韓国団体 2泊3日 温泉と街歩き");
  await openTab(page, "手配依頼");
  await expect(page.getByText("回答待ち 3件")).toBeVisible();

  // メールの仕入先には、メールで送る
  await page.getByRole("button", { name: "手配依頼を作成" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("仕入先").selectOption({ label: "体験工房 あかね" });
  await expect(dialog.getByRole("checkbox", { name: /工芸体験/ })).toBeChecked();
  await expect(dialog.getByLabel("送り方")).toHaveValue("email");
  await dialog.getByLabel("通信欄").fill("材料費込みでお願いします");

  const preview = await page.request.get((await dialog.getByRole("link", { name: "PDFを確認" }).getAttribute("href"))!);
  expect(preview.status()).toBe(200);
  expect(preview.headers()["content-type"]).toBe("application/pdf");

  await dialog.getByRole("checkbox", { name: /工芸体験/ }).uncheck();
  await expect(dialog.getByRole("button", { name: "メールで送る" })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /工芸体験/ }).check();
  await dialog.getByRole("button", { name: "メールで送る" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("e2e@example.com");
  await expect(page.getByText("回答待ち 4件")).toBeVisible();

  // FAX の仕入先は、送った記録だけをつける
  await page.getByRole("button", { name: "手配依頼を作成" }).click();
  const fax = page.getByRole("dialog");
  await fax.getByLabel("仕入先").selectOption({ label: "旅館 つばき荘" });
  await expect(fax.getByLabel("送り方")).toHaveValue("fax");
  await fax.getByLabel("依頼の種類").selectOption("change");
  await fax.getByRole("button", { name: "FAXで送った記録をつける" }).click();
  await expect(page.getByRole("status")).toContainText("FAX送付を記録しました");

  // 記録済みの依頼書PDF
  const pdfHref = await page.getByRole("link", { name: /のPDFを開く$/ }).first().getAttribute("href");
  expect((await page.request.get(pdfHref!)).status()).toBe(200);

  // 体験工房 あかね の回答: 確定・確定番号・原価
  const requestNo = await page.locator("li").filter({ hasText: "体験工房 あかね" }).locator("p.font-mono").first().innerText();
  await page.getByRole("button", { name: `${requestNo} の回答を入力` }).click();
  const reply = page.getByRole("dialog");
  await reply.getByLabel("工芸体験 の確定番号").fill("AK-777");
  await reply.getByLabel("工芸体験 の原価").fill("1900");
  await reply.getByRole("button", { name: "回答を反映する" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("確定番号 AK-777")).toBeVisible();

  await openTab(page, "手配明細");
  await expect(page.getByText("確定番号 AK-777").locator("visible=true")).toBeVisible();
});
