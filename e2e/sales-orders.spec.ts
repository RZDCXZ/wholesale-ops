import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for sales order E2E tests.");

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function switchSession(page: Page, email: string) {
  const status = await page.evaluate(async ({ nextEmail, nextPassword }) => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: nextEmail, password: nextPassword }),
    });
    return response.status;
  }, { nextEmail: email, nextPassword: password });
  expect(status).toBe(200);
}

test("销售创建、校验、编辑并删除库存不足的多 SKU 草稿", async ({ page }) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  let salesOrderId: string | undefined;
  try {
    await signIn(page, "sales@example.local", /\/sales-orders$/);
    await page.getByRole("link", { name: "新建销售单" }).first().click();
    await expect(page).toHaveURL(/\/sales-orders\/new$/);
    await page.getByLabel("客户").selectOption("demo-customer-kh-0003");
    await expect(page.getByText("李海峰 · 138 0000 0000", { exact: true })).toBeVisible();
    await expect(page.getByText("30 天", { exact: true })).toBeVisible();

    const firstItem = page.getByTestId("sales-order-item").nth(0);
    await firstItem.getByLabel("SKU", { exact: true }).selectOption("demo-sku-wj-ls-001");
    await firstItem.getByLabel("数量").fill("20");
    await expect(firstItem.getByLabel("成交价")).toHaveValue("48.50");
    await page.getByRole("button", { name: "添加明细" }).click();
    const secondItem = page.getByTestId("sales-order-item").nth(1);
    await secondItem.getByLabel("搜索 SKU").fill("切割片");
    await expect(secondItem.getByLabel("SKU", { exact: true }).locator("option")).toHaveCount(2);
    await secondItem.getByLabel("SKU", { exact: true }).selectOption("demo-sku-wj-qp-004");
    await secondItem.getByLabel("数量").fill("70");
    await expect(secondItem.getByLabel("成交价")).toHaveValue("3.80");
    await expect(secondItem.getByText(/当前可用量 50 片/)).toBeVisible();
    await expect(secondItem.getByText(/缺少 20 片/)).toBeVisible();
    await expect(page.getByText("¥1,236.00", { exact: true })).toBeVisible();

    await secondItem.getByLabel("成交价").fill("1.234");
    await page.getByRole("button", { name: "保存草稿" }).click();
    const priceError = page.getByText("成交价必须是最多两位小数的非负人民币金额。", { exact: true });
    await expect(priceError).toBeVisible();
    const priceErrorId = await priceError.getAttribute("id");
    expect(priceErrorId).not.toBeNull();
    await expect(secondItem.getByLabel("成交价")).toHaveAttribute("aria-describedby", priceErrorId!);
    await expect(secondItem.getByLabel("数量")).toHaveValue("70");
    await expect(secondItem.getByLabel("成交价")).toHaveValue("1.234");

    await secondItem.getByLabel("成交价").fill("3.80");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page).toHaveURL(/\/sales-orders\/[^/?]+\/edit\?notice=created$/);
    salesOrderId = new URL(page.url()).pathname.split("/")[2];
    await expect(page.getByRole("status")).toContainText("销售单草稿已保存");
    await expect(page.getByText("¥1,236.00", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText("缺少 20 片", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "查看并确认" }).click();
    await expect(page).toHaveURL(new RegExp(`/sales-orders/${salesOrderId}$`));
    await page.getByRole("button", { name: "确认销售单" }).click();
    const confirmDialog = page.getByRole("dialog", { name: "确认销售单" });
    await expect(confirmDialog).toContainText("广顺五金商行");
    await expect(confirmDialog).toContainText("¥1,236.00");
    await confirmDialog.getByRole("button", { name: "确认并预占库存" }).click();
    await expect(confirmDialog.getByRole("alert")).toContainText("销售单未确认");
    await expect(confirmDialog.getByRole("alert")).toContainText(
      "WJ-QP-004 需要 70 片，当前可用量 50 片，缺少 20 片",
    );
    await confirmDialog.getByRole("button", { name: "返回核对" }).click();
    await page.getByRole("link", { name: "编辑草稿" }).click();
    await secondItem.getByLabel("数量").fill("30");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page).toHaveURL(/notice=updated$/);
    await expect(page.getByText("¥1,084.00", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "返回销售单列表" }).first().click();
    const row = page.getByRole("row").filter({ hasText: "广顺五金商行" }).first();
    await expect(row).toContainText("¥1,084.00");
    const deleteButton = row.getByRole("button", { name: "删除" });
    await deleteButton.click();
    await expect(page.getByRole("dialog", { name: "删除销售单草稿" })).toBeVisible();
    await page.getByRole("button", { name: "返回" }).click();
    await expect(deleteButton).toBeFocused();
    await deleteButton.click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByRole("status")).toContainText("销售单草稿已删除");
    await expect(prisma.salesOrder.count({ where: { id: salesOrderId } })).resolves.toBe(0);
    await expect(
      prisma.businessAudit.count({
        where: { objectId: salesOrderId, action: { startsWith: "SALES_ORDER_DRAFT_" } },
      }),
    ).resolves.toBe(3);
  } finally {
    if (salesOrderId) {
      await prisma.salesOrder.deleteMany({ where: { id: salesOrderId } });
    }
    await prisma.$disconnect();
  }
});

test("销售从详情确认后填写原因取消销售单，并看到预占释放和永久取消轨迹", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  let salesOrderId: string | undefined;
  const testSuffix = Date.now().toString(36);
  const testSkus = [
    {
      id: `e2e-confirm-sku-a-${testSuffix}`,
      skuCode: `E2E-CF-A-${testSuffix}`,
      name: "E2E 确认测试扳手",
      category: "E2E 测试",
      inventoryUnit: "把",
      referencePriceFen: 1_234,
      warningThreshold: 0,
      onHandQuantity: 10,
    },
    {
      id: `e2e-confirm-sku-b-${testSuffix}`,
      skuCode: `E2E-CF-B-${testSuffix}`,
      name: "E2E 确认测试钻头",
      category: "E2E 测试",
      inventoryUnit: "支",
      referencePriceFen: 250,
      warningThreshold: 0,
      onHandQuantity: 20,
    },
  ];
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.sku.createMany({
        data: testSkus.map((sku) => ({
          id: sku.id,
          skuCode: sku.skuCode,
          name: sku.name,
          category: sku.category,
          inventoryUnit: sku.inventoryUnit,
          referencePriceFen: sku.referencePriceFen,
          warningThreshold: sku.warningThreshold,
        })),
      });
      await transaction.inventoryBalance.createMany({
        data: testSkus.map((sku) => ({
          skuId: sku.id,
          onHandQuantity: sku.onHandQuantity,
          reservedQuantity: 0,
        })),
      });
    });
    await signIn(page, "sales@example.local", /\/sales-orders$/);
    await page.goto("/sales-orders/new");
    await page.getByLabel("客户").selectOption("demo-customer-kh-0003");
    const firstItem = page.getByTestId("sales-order-item").nth(0);
    await firstItem.getByLabel("SKU", { exact: true }).selectOption(testSkus[0]!.id);
    await firstItem.getByLabel("数量").fill("2");
    await page.getByRole("button", { name: "添加明细" }).click();
    const secondItem = page.getByTestId("sales-order-item").nth(1);
    await secondItem.getByLabel("SKU", { exact: true }).selectOption(testSkus[1]!.id);
    await secondItem.getByLabel("数量").fill("3");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page).toHaveURL(/\/sales-orders\/[^/?]+\/edit\?notice=created$/);
    salesOrderId = new URL(page.url()).pathname.split("/")[2];

    await page.getByRole("link", { name: "查看并确认" }).click();
    await expect(page.getByText("草稿", { exact: true }).first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "确认销售单" }).click();
    const dialog = page.getByRole("dialog", { name: "确认销售单" });
    await expect(dialog).toContainText("广顺五金商行");
    await expect(dialog).toContainText("¥32.18");
    await expect(dialog.getByText("2 行", { exact: true })).toBeVisible();
    await expect(dialog).toContainText(testSkus[0]!.skuCode);
    await expect(dialog).toContainText(testSkus[1]!.skuCode);

    await prisma.inventoryBalance.update({
      where: { skuId: testSkus[0]!.id },
      data: { reservedQuantity: 9 },
    });
    await dialog.getByRole("button", { name: "确认并预占库存" }).click();
    await expect(dialog.getByRole("alert")).toContainText("销售单未确认");
    await expect(dialog.getByRole("alert")).toContainText(
      `${testSkus[0]!.skuCode} 需要 2 把，当前可用量 1 把，缺少 1 把`,
    );
    const dialogShortageRow = dialog.getByTestId(
      `sales-order-confirm-dialog-inventory-${testSkus[0]!.id}`,
    );
    await expect(dialogShortageRow.getByText("10 → 10", { exact: true })).toBeVisible();
    await expect(dialogShortageRow.getByText("9 → 11", { exact: true })).toBeVisible();
    await expect(dialogShortageRow.getByText("1 → -1", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "返回核对" }).click();
    const confirmationFeedback = page.getByTestId("sales-order-confirmation-feedback");
    await expect(confirmationFeedback).toContainText("销售单未确认");
    await expect(confirmationFeedback).toContainText(
      `${testSkus[0]!.skuCode} 需要 2 把，当前可用量 1 把，缺少 1 把`,
    );
    const shortageRow = page.getByTestId(`sales-order-inventory-${testSkus[0]!.id}`);
    await expect(shortageRow).toContainText("需要 2，当前可用 1，缺少 1 把");
    await expect(shortageRow.getByText("9 → 11 +2", { exact: true })).toBeVisible();
    await expect(shortageRow.getByText("1 → -1 -2", { exact: true })).toBeVisible();

    await prisma.inventoryBalance.update({
      where: { skuId: testSkus[0]!.id },
      data: { reservedQuantity: 0 },
    });
    await page.getByRole("button", { name: "确认销售单" }).click();
    await page
      .getByRole("dialog", { name: "确认销售单" })
      .getByRole("button", { name: "确认并预占库存" })
      .click();

    await expect(page).toHaveURL(new RegExp(`/sales-orders/${salesOrderId}\\?notice=confirmed`));
    await page.setViewportSize({ width: 1440, height: 1024 });
    await expect(page.getByRole("status")).toContainText("销售单已确认");
    await expect(page.getByText("已确认", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("内容已冻结", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "确认销售单" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "编辑草稿" })).toHaveCount(0);
    await expect(page.getByText("0 → 2 +2", { exact: true })).toBeVisible();
    await expect(page.getByText("0 → 3 +3", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const cancelButton = page.getByRole("button", { name: "取消销售单" });
    await cancelButton.click();
    let cancelDialog = page.getByRole("dialog", { name: "取消销售单" });
    await expect(cancelDialog).toContainText(testSkus[0]!.skuCode);
    await expect(cancelDialog).toContainText("释放 2 把");
    await expect(cancelDialog).toContainText(testSkus[1]!.skuCode);
    await expect(cancelDialog).toContainText("释放 3 支");
    await expect(cancelDialog).toContainText("销售单永久保留");
    await expect(cancelDialog.getByLabel("取消原因")).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await cancelDialog.getByRole("button", { name: "返回" }).click();
    await expect(cancelButton).toBeFocused();

    await cancelButton.click();
    cancelDialog = page.getByRole("dialog", { name: "取消销售单" });
    await expect(
      cancelDialog.getByLabel("取消原因").evaluate((field) =>
        (field as HTMLTextAreaElement).checkValidity(),
      ),
    ).resolves.toBe(false);
    await cancelDialog.getByLabel("取消原因").fill("   ");
    await cancelDialog.getByRole("button", { name: "取消并释放预占" }).click();
    await expect(cancelDialog.getByRole("alert")).toContainText("请填写取消原因");
    await expect(cancelDialog.getByLabel("取消原因")).toHaveValue("   ");
    await cancelDialog.getByLabel("取消原因").fill("客户项目延期，停止本次采购");
    await cancelDialog.getByRole("button", { name: "取消并释放预占" }).click();

    await expect(page).toHaveURL(new RegExp(`/sales-orders/${salesOrderId}\\?notice=cancelled`));
    await expect(page.getByRole("status")).toContainText("销售单已取消");
    await expect(page.getByText("已取消", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("原因：客户项目延期，停止本次采购", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1024 });
    await expect(page.getByRole("button", { name: "取消销售单" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "编辑草稿" })).toHaveCount(0);
    await expect(page.getByText("2 → 0 -2", { exact: true })).toBeVisible();
    await expect(page.getByText("8 → 10 +2", { exact: true })).toBeVisible();
    await expect(page.getByText("3 → 0 -3", { exact: true })).toBeVisible();
    await expect(page.getByText("17 → 20 +3", { exact: true })).toBeVisible();

    await switchSession(page, "owner@example.local");
    await page.reload();
    await expect(page.getByRole("link", { name: "查看相关库存流水" })).toBeVisible();
    await expect(page.getByRole("link", { name: "查看取消审计" })).toBeVisible();
    await page.getByRole("link", { name: "查看取消审计" }).click();
    const auditDetail = page.getByRole("dialog", { name: /取消销售单/ });
    await expect(auditDetail).toContainText("客户项目延期，停止本次采购");
    await auditDetail.getByRole("button", { name: "关闭" }).click();
    await page.goto(`/skus/${testSkus[0]!.id}`);
    await expect(page.getByText("释放预占", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/预占 -2/).first()).toBeVisible();
  } finally {
    if (salesOrderId) {
      await prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL session_replication_role = 'replica'",
        );
        await transaction.inventoryMovement.deleteMany({
          where: { relatedType: "SALES_ORDER", relatedId: salesOrderId },
        });
        await transaction.businessAudit.deleteMany({ where: { objectId: salesOrderId } });
        await transaction.salesOrderItem.deleteMany({ where: { salesOrderId } });
        await transaction.salesOrder.deleteMany({ where: { id: salesOrderId } });
      });
    }
    await prisma.inventoryBalance.deleteMany({
      where: { skuId: { in: testSkus.map(({ id }) => id) } },
    });
    await prisma.sku.deleteMany({
      where: { id: { in: testSkus.map(({ id }) => id) } },
    });
    await prisma.$disconnect();
  }
});

test("移动端通过全屏筛选抽屉筛选销售单并看到已启用条件", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "sales@example.local", /\/sales-orders$/);

  await page.getByRole("button", { name: "打开销售单筛选" }).click();
  const filters = page.getByRole("dialog", { name: "筛选销售单" });
  await expect(filters).toBeVisible();
  await filters.getByLabel("履约状态").selectOption("DRAFT");
  await filters.getByRole("button", { name: "应用筛选" }).click();

  await expect(page).toHaveURL(/status=DRAFT/);
  await expect(page.getByText("履约状态：草稿", { exact: true })).toBeVisible();
});

test("销售单草稿表单提示未保存离开并在提交时重新校验会话", async ({ page }) => {
  await signIn(page, "sales@example.local", /\/sales-orders$/);
  await page.goto("/sales-orders/new");
  await page.getByLabel("客户").selectOption("demo-customer-kh-0003");

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "客户", exact: true }).click();
  await expect(page).toHaveURL(/\/sales-orders\/new$/);

  const item = page.getByTestId("sales-order-item").first();
  await item.getByLabel("SKU", { exact: true }).selectOption("demo-sku-wj-ls-001");
  await item.getByLabel("数量").fill("7");
  await switchSession(page, "finance@example.local");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText("没有访问销售单的权限。", { exact: true })).toBeVisible();
  await expect(item.getByLabel("数量")).toHaveValue("7");
  await expect(page).toHaveURL(/\/sales-orders\/new$/);
});
