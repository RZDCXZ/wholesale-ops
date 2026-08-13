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

function createCustomerWorkbookFile(rows: unknown[][], suffix: string): string {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        "客户编码",
        "名称",
        "联系人",
        "电话",
        "地址",
        "客户负责人",
        "默认账期",
        "启用状态",
      ],
      ...rows,
    ]),
    "客户导入",
  );
  const path = join(tmpdir(), `wholesale-ops-customer-import-${suffix}.xlsx`);
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
    await page.setViewportSize({ width: 1440, height: 1024 });
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

test("老板复用导入工作流批量创建客户", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const invalidFile = createCustomerWorkbookFile(
    [
      [
        `E2E-CUSTOMER-INVALID-${suffix}`,
        "无效负责人客户",
        "联系人",
        "138 0000 0000",
        "广东省深圳市测试地址 1 号",
        "missing-sales@example.local",
        "现结",
        "启用",
      ],
    ],
    `invalid-${suffix}`,
  );
  const customerCodes = [
    `E2E-CUSTOMER-A-${suffix}`,
    `E2E-CUSTOMER-B-${suffix}`,
  ];
  const validFile = createCustomerWorkbookFile(
    [
      [
        customerCodes[0],
        "E2E 广源机电商行",
        "李海峰",
        "138 0000 0000",
        "广东省深圳市宝安区工业路 18 号",
        "sales@example.local",
        "现结",
        "启用",
      ],
      [
        customerCodes[1],
        "E2E 华南工程部",
        "周志成",
        "136 0000 0000",
        "广东省深圳市龙华区民治大道 27 号",
        "multi@example.local",
        30,
        "停用",
      ],
    ],
    `valid-${suffix}`,
  );
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

  try {
    await signIn(page, "owner@example.local", /\/overview$/);
    await page.goto("/imports");
    await page.getByRole("button", { name: /客户\s+建立客户资料/ }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "下载客户模板" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("customer-import-template.xlsx");

    await page.getByLabel("选择客户 Excel 文件").setInputFiles(invalidFile);
    await expect(page.getByText(/发现 1 条错误（1 行），整批不会写入/)).toBeVisible();
    await expect(page.getByText("missing-sales@example.local", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /确认导入/ })).toHaveCount(0);

    await page.getByRole("button", { name: "重新选择文件" }).click();
    await page.getByLabel("选择客户 Excel 文件").setInputFiles(validFile);
    await expect(page.getByText("2 行数据全部通过校验", { exact: true })).toBeVisible();

    const confirmRequestPromise = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/imports/customer/confirm") &&
        request.method() === "POST",
    );
    const confirmResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/imports/customer/confirm") &&
        response.request().method() === "POST" &&
        response.status() === 200,
    );
    await page.getByRole("button", { name: "确认导入 2 个客户" }).click();
    const confirmRequest = await confirmRequestPromise;
    await (await confirmResponsePromise).json();
    const previewToken = (confirmRequest.postDataJSON() as { previewToken: string }).previewToken;
    await expect(page.getByRole("heading", { name: "成功导入 2 个客户" })).toBeVisible();

    const duplicate = await page.evaluate(async (token) => {
      const response = await fetch("/api/imports/customer/confirm", {
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

    await page.getByRole("link", { name: "查看客户" }).click();
    await expect(page.getByText(customerCodes[0], { exact: true }).first()).toBeVisible();
    await expect(page.getByText(customerCodes[1], { exact: true }).first()).toBeVisible();
  } finally {
    await prisma.customer.deleteMany({ where: { customerCode: { in: customerCodes } } });
    await prisma.$disconnect();
    unlinkSync(invalidFile);
    unlinkSync(validFile);
  }
});

test("销售不能打开或调用任何导入入口", async ({ page }) => {
  await signIn(page, "sales@example.local", /\/sales-orders$/);
  await page.goto("/imports");
  await expect(page).toHaveURL(/\/forbidden$/);

  const statuses = await page.evaluate(async () => {
    const [skuTemplate, skuPreview, skuConfirm, customerTemplate, customerPreview, customerConfirm, openingTemplate, openingPreview, openingConfirm] = await Promise.all([
      fetch("/api/imports/sku/template"),
      fetch("/api/imports/sku/preview", { method: "POST" }),
      fetch("/api/imports/sku/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewToken: "invalid" }),
      }),
      fetch("/api/imports/customer/template"),
      fetch("/api/imports/customer/preview", { method: "POST" }),
      fetch("/api/imports/customer/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewToken: "invalid" }),
      }),
      fetch("/api/imports/opening-inventory/template"),
      fetch("/api/imports/opening-inventory/preview", { method: "POST" }),
      fetch("/api/imports/opening-inventory/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewToken: "invalid" }),
      }),
    ]);
    return [
      skuTemplate.status,
      skuPreview.status,
      skuConfirm.status,
      customerTemplate.status,
      customerPreview.status,
      customerConfirm.status,
      openingTemplate.status,
      openingPreview.status,
      openingConfirm.status,
    ];
  });
  expect(statuses).toEqual([403, 403, 403, 403, 403, 403, 403, 403, 403]);
});

test("确认请求暂时失败时保留预览并允许直接重试", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const validFile = createWorkbookFile(
    [[`E2E-RETRY-${suffix}`, "可重试 SKU", "测试", "个", 1, 0, "启用"]],
    `retry-${suffix}`,
  );

  try {
    await signIn(page, "owner@example.local", /\/overview$/);
    await page.goto("/imports");
    await expect(async () => {
      const chooserPromise = page.waitForEvent("filechooser", { timeout: 1_000 });
      await page.getByRole("button", { name: "选择文件", exact: true }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles(validFile);
    }).toPass({ timeout: 10_000 });
    await expect(page.getByText("1 行数据全部通过校验", { exact: true })).toBeVisible();

    await page.route("**/api/imports/sku/confirm", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "服务暂时不可用。" }),
      });
    });
    await page.getByRole("button", { name: "确认导入 1 个 SKU" }).click();

    await expect(page.getByText("服务暂时不可用。", { exact: true })).toBeVisible();
    await expect(page.getByText(`E2E-RETRY-${suffix}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "重试确认" })).toBeVisible();
  } finally {
    unlinkSync(validFile);
  }
});

test("导入工作台在 390px 宽度下没有页面级横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "owner@example.local", /\/overview$/);
  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "导入工作台" })).toBeVisible();
  await page.getByRole("button", { name: /客户\s+建立客户资料/ }).click();
  await expect(page.getByRole("link", { name: "下载客户模板" })).toBeVisible();

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
});
