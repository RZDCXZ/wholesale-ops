import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";
import * as XLSX from "xlsx";

import { PrismaClient } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for import E2E tests.");

async function signIn(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

function createWorkbookFile(rows: unknown[][], suffix: string): string {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["SKU 编码", "名称", "分类", "库存单位", "参考售价", "预警值", "启用状态"],
      ...rows,
    ]),
    "SKU导入",
  );
  const path = join(tmpdir(), `wholesale-ops-sku-import-${suffix}.xlsx`);
  writeFileSync(path, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  return path;
}

test("老板可以下载模板、预览错误并确认整批 SKU 导入", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const invalidFile = createWorkbookFile(
    [
      [`E2E-DUP-${suffix}`, "重复一", "测试", "个", 1, 0, "启用"],
      [`E2E-DUP-${suffix}`, "重复二", "测试", "个", "四十八元", 0, "启用"],
    ],
    `invalid-${suffix}`,
  );
  const skuCodes = [`E2E-IMPORT-A-${suffix}`, `E2E-IMPORT-B-${suffix}`];
  const validFile = createWorkbookFile(
    [
      [skuCodes[0], "E2E 导入螺栓", "紧固件", "盒", 48.5, 20, "启用"],
      [skuCodes[1], "E2E 导入切割片", "切削耗材", "片", 3.8, 10, "停用"],
    ],
    `valid-${suffix}`,
  );
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

  try {
    await signIn(page, "owner@example.local", /\/overview$/);
    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: "导入工作台" })).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "下载 SKU 模板" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("sku-import-template.xlsx");

    await page.getByLabel("选择 SKU Excel 文件").setInputFiles(invalidFile);
    await expect(page.getByText(/发现 3 条错误（2 行），整批不会写入/)).toBeVisible();
    await expect(page.getByText("四十八元", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /确认导入/ })).toHaveCount(0);

    await page.getByRole("button", { name: "重新选择文件" }).click();
    await page.getByLabel("选择 SKU Excel 文件").setInputFiles(validFile);
    await expect(page.getByText("2 行数据全部通过校验", { exact: true })).toBeVisible();

    const confirmRequestPromise = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/imports/sku/confirm") &&
        request.method() === "POST",
    );
    await page.getByRole("button", { name: "确认导入 2 个 SKU" }).click();
    const confirmRequest = await confirmRequestPromise;
    const previewToken = (confirmRequest.postDataJSON() as { previewToken: string }).previewToken;
    await expect(page.getByRole("heading", { name: "成功导入 2 个 SKU" })).toBeVisible();

    const duplicate = await page.evaluate(async (token) => {
      const response = await fetch("/api/imports/sku/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewToken: token }),
      });
      return { status: response.status, body: await response.json() };
    }, previewToken);
    expect(duplicate).toMatchObject({
      status: 409,
      body: { code: "DUPLICATE_SUBMISSION" },
    });

    await page.getByRole("link", { name: "查看 SKU" }).click();
    await expect(page.getByText(skuCodes[0], { exact: true }).first()).toBeVisible();
    await expect(page.getByText(skuCodes[1], { exact: true }).first()).toBeVisible();
  } finally {
    await prisma.sku.deleteMany({ where: { skuCode: { in: skuCodes } } });
    await prisma.$disconnect();
    unlinkSync(invalidFile);
    unlinkSync(validFile);
  }
});

test("销售不能打开或调用 SKU 导入入口", async ({ page }) => {
  await signIn(page, "sales@example.local", /\/sales-orders$/);
  await page.goto("/imports");
  await expect(page).toHaveURL(/\/forbidden$/);

  const statuses = await page.evaluate(async () => {
    const [template, preview, confirm] = await Promise.all([
      fetch("/api/imports/sku/template"),
      fetch("/api/imports/sku/preview", { method: "POST" }),
      fetch("/api/imports/sku/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewToken: "invalid" }),
      }),
    ]);
    return [template.status, preview.status, confirm.status];
  });
  expect(statuses).toEqual([403, 403, 403]);
});

test("导入工作台在 390px 宽度下没有页面级横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "导入工作台" })).toBeVisible();

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
});
