import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for overview E2E tests.");

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

function chinaDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

test("老板从经营指标下钻到已应用筛选的明细，移动端可完整查看", async ({
  page,
}) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  const suffix = randomUUID();
  const now = new Date();
  const today = chinaDate(now);
  const todayCalendar = new Date(`${today}T00:00:00.000Z`);
  const yesterday = new Date(todayCalendar);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const sales = await prisma.user.findUniqueOrThrow({
    where: { email: "sales@example.local" },
  });
  const finance = await prisma.user.findUniqueOrThrow({
    where: { email: "finance@example.local" },
  });
  const customerId = `overview-customer-${suffix}`;
  const skuId = `overview-sku-${suffix}`;
  const salesOrderId = `overview-order-${suffix}`;
  const receivableId = `overview-receivable-${suffix}`;
  const paymentId = `overview-payment-${suffix}`;
  const salesOrderNumber = `XSD-OVERVIEW-${suffix}`;
  const receivableNumber = `YS-OVERVIEW-${suffix}`;
  const skuCode = `WJ-OV-${suffix.slice(0, 8)}`;

  try {
    await prisma.customer.create({
      data: {
        id: customerId,
        customerCode: `KH-OV-${suffix.slice(0, 8)}`,
        name: "经营总览下钻客户",
        contactName: "测试联系人",
        phone: "138 0000 0000",
        address: "广东省深圳市测试路 1 号",
        responsibleSalesId: sales.id,
        paymentTermDays: 0,
      },
    });
    await prisma.sku.create({
      data: {
        id: skuId,
        skuCode,
        name: "经营总览预警 SKU",
        category: "紧固件",
        inventoryUnit: "盒",
        referencePriceFen: 1_000,
        warningThreshold: 5,
        inventoryBalance: {
          create: { onHandQuantity: 6, reservedQuantity: 1 },
        },
      },
    });
    await prisma.salesOrder.create({
      data: {
        id: salesOrderId,
        salesOrderNumber,
        status: "OUTBOUND",
        customerId,
        creatorId: sales.id,
        customerCodeSnapshot: `KH-OV-${suffix.slice(0, 8)}`,
        customerNameSnapshot: "经营总览下钻客户",
        customerContactNameSnapshot: "测试联系人",
        customerPhoneSnapshot: "138 0000 0000",
        customerAddressSnapshot: "广东省深圳市测试路 1 号",
        responsibleSalesIdSnapshot: sales.id,
        responsibleSalesNameSnapshot: sales.name,
        paymentTermDaysSnapshot: 0,
        totalAmountFen: 120_000,
        receivable: {
          create: {
            id: receivableId,
            receivableNumber,
            customerId,
            customerCodeSnapshot: `KH-OV-${suffix.slice(0, 8)}`,
            customerNameSnapshot: "经营总览下钻客户",
            responsibleSalesIdSnapshot: sales.id,
            originalAmountFen: 120_000,
            receivedAmountFen: 20_000,
            remainingAmountFen: 100_000,
            paymentTermDaysSnapshot: 0,
            outboundAt: now,
            dueDate: yesterday,
            status: "PARTIAL",
          },
        },
      },
    });
    await prisma.payment.create({
      data: {
        id: paymentId,
        receivableId,
        paymentDate: todayCalendar,
        amountFen: 20_000,
        method: "BANK_TRANSFER",
        idempotencyKey: `overview-payment-${suffix}`,
        recordedAt: now,
        actorId: finance.id,
        actorName: finance.name,
      },
    });

    await signIn(page, "owner@example.local", /\/overview$/);
    await expect(
      page.getByRole("heading", { name: "经营总览", exact: true }),
    ).toBeVisible();
    const refreshButton = page.getByRole("button", {
      name: "刷新经营总览数据",
    });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();
    await expect(
      page.getByRole("heading", { name: "经营总览", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /今日销售额/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /今日收款额/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /未收金额/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /逾期金额/ })).toBeVisible();
    await expect(page.getByText("最近 30 天收款趋势", { exact: true })).toBeVisible();
    await expect(
      page.getByText("经营总览预警 SKU", { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole("link", { name: /今日销售额/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/sales-orders\\?status=OUTBOUND&outboundOn=${today}$`),
    );
    await expect(
      page.getByText(salesOrderNumber, { exact: true }).first(),
    ).toBeVisible();

    await page.goto("/overview");
    await page.getByRole("link", { name: /今日收款额/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/receivables\\?paymentRecordedOn=${today}$`),
    );
    await expect(
      page.getByText(receivableNumber, { exact: true }).first(),
    ).toBeVisible();

    await page.goto("/overview");
    await page.getByRole("link", { name: /未收金额/ }).click();
    await expect(page).toHaveURL(/\/receivables\?outstanding=1$/);
    await expect(
      page.getByText(receivableNumber, { exact: true }).first(),
    ).toBeVisible();

    await page.goto("/overview");
    await page.getByRole("link", { name: /逾期金额/ }).click();
    await expect(page).toHaveURL(/\/receivables\?overdue=1$/);
    await expect(
      page.getByText(receivableNumber, { exact: true }).first(),
    ).toBeVisible();

    await page.goto("/overview");
    await page.getByRole("link", { name: /个 SKU/ }).click();
    await expect(page).toHaveURL(/\/inventory\?status=enabled&warning=1$/);
    await expect(page.getByText(skuCode, { exact: true }).first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/overview");
    await expect(page.getByRole("link", { name: /今日销售额/ })).toBeVisible();
    await expect(page.getByText("最近 30 天收款趋势", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);

    for (const [email, home] of [
      ["sales@example.local", /\/sales-orders$/],
      ["warehouse@example.local", /\/warehouse\/outbound$/],
      ["finance@example.local", /\/receivables$/],
    ] as const) {
      await page.context().clearCookies();
      await signIn(page, email, home);
      await page.goto("/overview");
      await expect(page).toHaveURL(/\/forbidden$/);
    }

  } finally {
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        "SET LOCAL session_replication_role = replica",
      );
      await transaction.payment.deleteMany({ where: { id: paymentId } });
      await transaction.receivable.deleteMany({ where: { id: receivableId } });
      await transaction.salesOrder.deleteMany({ where: { id: salesOrderId } });
      await transaction.inventoryBalance.deleteMany({ where: { skuId } });
      await transaction.sku.deleteMany({ where: { id: skuId } });
      await transaction.customer.deleteMany({ where: { id: customerId } });
    });
    await prisma.$disconnect();
  }
});
