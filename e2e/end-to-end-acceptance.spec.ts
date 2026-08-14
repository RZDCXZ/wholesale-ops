import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for end-to-end acceptance tests.");
}

async function signIn(
  page: Page,
  email: string,
  expectedPath: RegExp,
): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("四类角色从真实登录完成销售、库存、应收和业务审计旅程", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1024 });

  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  const suffix = randomUUID().slice(0, 8);
  const customerId = `e2e-acceptance-customer-${suffix}`;
  const customerName = `E2E 验收客户 ${suffix}`;
  const skus = [
    {
      id: `e2e-acceptance-sku-a-${suffix}`,
      skuCode: `E2E-YS-A-${suffix}`,
      name: "E2E 验收六角扳手",
      inventoryUnit: "套",
      referencePriceFen: 4_850,
      onHandQuantity: 12,
      quantity: 2,
    },
    {
      id: `e2e-acceptance-sku-b-${suffix}`,
      skuCode: `E2E-YS-B-${suffix}`,
      name: "E2E 验收切割片",
      inventoryUnit: "片",
      referencePriceFen: 380,
      onHandQuantity: 20,
      quantity: 3,
    },
  ];
  const browserErrors: string[] = [];
  let salesOrderId: string | undefined;
  let receivableId: string | undefined;
  let receivableNumber: string | undefined;

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  try {
    const salesUser = await prisma.user.findUniqueOrThrow({
      where: { email: "sales@example.local" },
    });
    await prisma.$transaction(async (transaction) => {
      await transaction.customer.create({
        data: {
          id: customerId,
          customerCode: `E2E-KH-${suffix}`,
          name: customerName,
          contactName: "验收联系人",
          phone: "138 0000 1717",
          address: "广东省深圳市验收路 17 号",
          responsibleSalesId: salesUser.id,
          paymentTermDays: 30,
        },
      });
      await transaction.sku.createMany({
        data: skus.map((sku) => ({
          id: sku.id,
          skuCode: sku.skuCode,
          name: sku.name,
          category: "E2E 验收",
          inventoryUnit: sku.inventoryUnit,
          referencePriceFen: sku.referencePriceFen,
          warningThreshold: 0,
        })),
      });
      await transaction.inventoryBalance.createMany({
        data: skus.map((sku) => ({
          skuId: sku.id,
          onHandQuantity: sku.onHandQuantity,
          reservedQuantity: 0,
        })),
      });
    });

    await signIn(page, "sales@example.local", /\/sales-orders$/);
    const salesNavigation = page.getByRole("navigation", { name: "主导航" });
    await expect(salesNavigation.getByRole("link", { name: "销售单" })).toBeVisible();
    await expect(salesNavigation.getByRole("link", { name: "客户" })).toBeVisible();
    await expect(salesNavigation.getByRole("link", { name: "待出库" })).toHaveCount(0);
    await expect(salesNavigation.getByRole("link", { name: "应收" })).toHaveCount(0);

    await page.getByRole("link", { name: "新建销售单" }).first().click();
    await expect(page).toHaveURL(/\/sales-orders\/new$/);
    await page.getByLabel("客户", { exact: true }).selectOption(customerId);
    const firstItem = page.getByTestId("sales-order-item").nth(0);
    await firstItem.getByLabel("SKU", { exact: true }).selectOption(skus[0]!.id);
    await firstItem.getByLabel("数量").fill(String(skus[0]!.quantity));
    await page.getByRole("button", { name: "添加明细" }).click();
    const secondItem = page.getByTestId("sales-order-item").nth(1);
    await secondItem.getByLabel("SKU", { exact: true }).selectOption(skus[1]!.id);
    await secondItem.getByLabel("数量").fill(String(skus[1]!.quantity));
    await expect(page.getByText("¥108.40", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page).toHaveURL(/\/sales-orders\/[^/?]+\/edit\?notice=created$/);
    salesOrderId = new URL(page.url()).pathname.split("/")[2];
    await page.getByRole("link", { name: "查看并确认" }).click();
    await expect(page).toHaveURL(new RegExp(`/sales-orders/${salesOrderId}$`));
    const salesOrderNumber = (await page.locator("h1").innerText()).trim();

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoPageOverflow(page);
    await page.getByRole("button", { name: "确认销售单" }).click();
    const confirmDialog = page.getByRole("dialog", { name: "确认销售单" });
    await expect(confirmDialog).toContainText(customerName);
    await expect(confirmDialog).toContainText("2 行");
    await expect(confirmDialog).toContainText("¥108.40");
    await expectNoPageOverflow(page);
    await confirmDialog
      .getByRole("button", { name: "确认并预占库存" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/sales-orders/${salesOrderId}\\?notice=confirmed`),
    );
    await expect(page.getByRole("status")).toContainText("销售单已确认");
    await expect(page.getByText("0 → 2 +2", { exact: true })).toBeVisible();
    await expect(page.getByText("0 → 3 +3", { exact: true })).toBeVisible();
    await expect(
      prisma.inventoryBalance.findMany({
        where: { skuId: { in: skus.map(({ id }) => id) } },
        orderBy: { skuId: "asc" },
        select: { onHandQuantity: true, reservedQuantity: true },
      }),
    ).resolves.toEqual([
      { onHandQuantity: 12, reservedQuantity: 2 },
      { onHandQuantity: 20, reservedQuantity: 3 },
    ]);

    await page.setViewportSize({ width: 1440, height: 1024 });
    await signIn(page, "warehouse@example.local", /\/warehouse\/outbound$/);
    const warehouseNavigation = page.getByRole("navigation", { name: "主导航" });
    await expect(warehouseNavigation.getByRole("link", { name: "待出库" })).toBeVisible();
    await expect(warehouseNavigation.getByRole("link", { name: "库存" })).toBeVisible();
    await expect(warehouseNavigation.getByRole("link", { name: "销售单" })).toHaveCount(0);
    await expect(warehouseNavigation.getByRole("link", { name: "应收" })).toHaveCount(0);
    const outboundRow = page.getByRole("row").filter({ hasText: salesOrderNumber });
    await expect(outboundRow).toContainText(customerName);
    await expect(page.locator("main")).not.toContainText("¥");
    await expect(page.locator("main")).not.toContainText("成交价");
    await expect(page.locator("main")).not.toContainText("应收编号");
    await expect(page.locator("main")).not.toContainText("累计收款");
    await outboundRow.getByRole("button", { name: "查看并出库" }).click();
    const outboundDialog = page.getByRole("dialog", { name: "完成整单出库" });
    await expect(outboundDialog).toContainText(`${skus[0]!.quantity} 套`);
    await expect(outboundDialog).toContainText(`${skus[1]!.quantity} 片`);
    await expect(outboundDialog).not.toContainText("¥");
    await outboundDialog
      .getByRole("button", { name: "完成整单出库" })
      .click();
    await expect(page.getByRole("status")).toContainText("已完成整单出库");

    const receivable = await prisma.receivable.findUniqueOrThrow({
      where: { salesOrderId },
    });
    receivableId = receivable.id;
    receivableNumber = receivable.receivableNumber;
    expect(receivable.originalAmountFen).toBe(10_840);
    await expect(
      prisma.inventoryBalance.findMany({
        where: { skuId: { in: skus.map(({ id }) => id) } },
        orderBy: { skuId: "asc" },
        select: { onHandQuantity: true, reservedQuantity: true },
      }),
    ).resolves.toEqual([
      { onHandQuantity: 10, reservedQuantity: 0 },
      { onHandQuantity: 17, reservedQuantity: 0 },
    ]);

    await signIn(page, "finance@example.local", /\/receivables$/);
    const financeNavigation = page.getByRole("navigation", { name: "主导航" });
    await expect(financeNavigation.getByRole("link", { name: "应收" })).toBeVisible();
    await expect(financeNavigation.getByRole("link", { name: "客户" })).toBeVisible();
    await expect(financeNavigation.getByRole("link", { name: "库存" })).toHaveCount(0);
    await expect(financeNavigation.getByRole("link", { name: "业务审计" })).toHaveCount(0);
    await page.goto(`/receivables/${receivable.id}`);
    await expect(page.getByRole("heading", { name: receivable.receivableNumber })).toBeVisible();
    await expect(page.getByText("¥108.40", { exact: true }).first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoPageOverflow(page);
    await page.getByRole("button", { name: "登记收款", exact: true }).click();
    const paymentDrawer = page.getByRole("dialog", { name: "登记收款" });
    await expect(paymentDrawer).toContainText("当前未收金额");
    await expectNoPageOverflow(page);
    await paymentDrawer.getByLabel("金额 *").fill("40.00");
    await paymentDrawer.getByLabel("参考号").fill(`E2E-SK-${suffix}`);
    await paymentDrawer.getByRole("button", { name: "登记收款", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("同一事务中写入");
    await expect(page.getByText("部分收款", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("¥68.40", { exact: true }).first()).toBeVisible();

    const payment = page.getByRole("article", { name: "收款 ¥40.00" });
    await payment.getByRole("button", { name: "撤销收款" }).click();
    const reversalDialog = page.getByRole("dialog", { name: "撤销这笔收款" });
    await expect(reversalDialog).toContainText("撤销后未收金额");
    await expect(reversalDialog).toContainText("¥108.40");
    await expectNoPageOverflow(page);
    await reversalDialog.getByLabel("撤销原因 *").fill("完整旅程验收撤销");
    await reversalDialog.getByRole("button", { name: "撤销这笔收款" }).click();
    await expect(page.getByRole("status")).toContainText("原收款仍完整保留");
    await expect(page.getByText("待收款", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("article", { name: "收款 ¥40.00", exact: true }),
    ).toContainText("已撤销");

    await page.setViewportSize({ width: 1440, height: 1024 });
    await signIn(page, "owner@example.local", /\/overview$/);
    const ownerNavigation = page.getByRole("navigation", { name: "主导航" });
    await expect(ownerNavigation.getByRole("link", { name: "经营总览" })).toBeVisible();
    await expect(ownerNavigation.getByRole("link", { name: "业务审计" })).toBeVisible();
    await expect(page.getByRole("link", { name: /今日销售额/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /今日收款额/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /未收金额/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /逾期金额/ })).toBeVisible();

    await page.goto(`/audit?reference=${encodeURIComponent(salesOrderNumber)}`);
    await expect(
      page.getByRole("row").filter({ hasText: salesOrderNumber }).filter({ hasText: "确认销售单" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: salesOrderNumber }).filter({ hasText: "完成整单出库" }),
    ).toBeVisible();
    await page.goto(
      `/audit?reference=${encodeURIComponent(receivable.receivableNumber)}`,
    );
    await expect(
      page.getByRole("row").filter({ hasText: receivable.receivableNumber }).filter({ hasText: "登记收款" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: receivable.receivableNumber }).filter({ hasText: "撤销收款" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/overview");
    await expectNoPageOverflow(page);
    await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();

    await expect(
      prisma.businessAudit.count({
        where: {
          action: {
            in: [
              "SALES_ORDER_CONFIRMED",
              "SALES_ORDER_OUTBOUND",
              "PAYMENT_RECORDED",
              "PAYMENT_REVERSED",
            ],
          },
          OR: [
            { objectId: salesOrderId },
            { referenceCode: receivable.receivableNumber },
          ],
        },
      }),
    ).resolves.toBe(4);
    expect(browserErrors).toEqual([]);
  } finally {
    if (salesOrderId) {
      await prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL session_replication_role = 'replica'",
        );
        if (receivableId) {
          await transaction.paymentReversal.deleteMany({
            where: { receivableId },
          });
          await transaction.payment.deleteMany({ where: { receivableId } });
          await transaction.receivable.deleteMany({ where: { id: receivableId } });
        }
        await transaction.inventoryMovement.deleteMany({
          where: { relatedType: "SALES_ORDER", relatedId: salesOrderId },
        });
        await transaction.businessAudit.deleteMany({
          where: {
            OR: [
              { objectType: "SALES_ORDER", objectId: salesOrderId },
              ...(receivableNumber
                ? [{ objectType: "PAYMENT" as const, referenceCode: receivableNumber }]
                : []),
            ],
          },
        });
        await transaction.salesOrderItem.deleteMany({ where: { salesOrderId } });
        await transaction.salesOrder.deleteMany({ where: { id: salesOrderId } });
      });
    }
    await prisma.inventoryBalance.deleteMany({
      where: { skuId: { in: skus.map(({ id }) => id) } },
    });
    await prisma.sku.deleteMany({
      where: { id: { in: skus.map(({ id }) => id) } },
    });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  }
});
