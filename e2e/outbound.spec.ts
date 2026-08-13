import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";

import type { Actor } from "../src/application/auth/resolve-actor";
import {
  confirmSalesOrder,
  createSalesOrderDraft,
} from "../src/application/sales-orders/sales-order-service";
import { PrismaClient } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for outbound E2E tests.");

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

async function switchSession(page: Page, email: string) {
  const status = await page.evaluate(
    async ({ nextEmail, nextPassword }) => {
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
    },
    { nextEmail: email, nextPassword: password },
  );
  expect(status).toBe(200);
}

test("仓库从隐私受限工作台核对全部 SKU 并完成整单出库", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  const suffix = randomUUID().slice(0, 8);
  const customerId = `e2e-outbound-customer-${suffix}`;
  const skus = [
    {
      id: `e2e-outbound-sku-a-${suffix}`,
      skuCode: `E2E-CK-A-${suffix}`,
      name: "E2E 出库测试内六角扳手",
      category: "E2E 测试",
      inventoryUnit: "套",
      referencePriceFen: 3_680,
      warningThreshold: 0,
      onHandQuantity: 12,
      quantity: 2,
    },
    {
      id: `e2e-outbound-sku-b-${suffix}`,
      skuCode: `E2E-CK-B-${suffix}`,
      name: "E2E 出库测试钻头",
      category: "E2E 测试",
      inventoryUnit: "支",
      referencePriceFen: 860,
      warningThreshold: 0,
      onHandQuantity: 20,
      quantity: 3,
    },
  ];
  let salesOrderId: string | undefined;

  try {
    const salesUser = await prisma.user.findUniqueOrThrow({
      where: { email: "sales@example.local" },
    });
    const salesActor: Actor = {
      id: salesUser.id,
      name: salesUser.name,
      email: salesUser.email,
      roles: ["SALES"],
    };
    await prisma.$transaction(async (transaction) => {
      await transaction.customer.create({
        data: {
          id: customerId,
          customerCode: `E2E-KH-${suffix}`,
          name: "E2E 出库客户",
          contactName: "周师傅",
          phone: "137 0000 1234",
          address: "广东省深圳市南山区测试大道 88 号 A 栋",
          responsibleSalesId: salesUser.id,
          paymentTermDays: 15,
        },
      });
      await transaction.sku.createMany({
        data: skus.map((sku) => ({
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
        data: skus.map((sku) => ({
          skuId: sku.id,
          onHandQuantity: sku.onHandQuantity,
          reservedQuantity: 0,
        })),
      });
    });
    const draft = await createSalesOrderDraft(prisma, salesActor, {
      customerId,
      items: skus.map((sku) => ({
        skuId: sku.id,
        quantity: sku.quantity,
        transactionPrice: (sku.referencePriceFen / 100).toFixed(2),
      })),
    });
    salesOrderId = draft.id;
    await confirmSalesOrder(prisma, salesActor, draft.id);

    await signIn(page, "warehouse@example.local", /\/warehouse\/outbound$/);
    await expect(
      page.getByRole("heading", { name: "待出库工作台", exact: true }),
    ).toBeVisible();
    const taskRow = page
      .getByRole("row")
      .filter({ hasText: draft.salesOrderNumber });
    await expect(taskRow).toContainText("E2E 出库客户");
    await expect(taskRow).toContainText("周师傅");
    await expect(taskRow).toContainText("137 0000 1234");
    await expect(taskRow).toContainText("测试大道 88 号 A 栋");
    await expect(page.locator("main")).not.toContainText("¥");
    await expect(page.locator("main")).not.toContainText("成交价");
    await expect(page.locator("main")).not.toContainText("成交金额");
    await expect(page.locator("main")).not.toContainText("账期");
    await expect(page.locator("main")).not.toContainText("应收编号");
    await expect(page.locator("main")).not.toContainText("收款金额");
    await expect(page.locator("main")).not.toContainText("累计收款");

    await taskRow.getByRole("button", { name: "查看并出库" }).click();
    const dialog = page.getByRole("dialog", { name: "完成整单出库" });
    await expect(dialog).toContainText(draft.salesOrderNumber);
    await expect(dialog).toContainText("E2E 出库客户");
    await expect(dialog).toContainText(`${skus[0]!.quantity} 套`);
    await expect(dialog).toContainText(`${skus[1]!.quantity} 支`);
    await expect(dialog).toContainText("必须整单出库，不能修改数量");
    await expect(dialog).toContainText("现存量与预占量同时减少");
    await expect(dialog).toContainText("自动生成一笔经营应收");
    await expect(dialog).not.toContainText("¥");

    await switchSession(page, "sales@example.local");
    await dialog.getByRole("button", { name: "完成整单出库" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "没有访问待出库工作台的权限",
    );

    await switchSession(page, "warehouse@example.local");
    await dialog.getByRole("button", { name: "完成整单出库" }).click();
    await expect(page).toHaveURL(/\/warehouse\/outbound\?notice=outbound/);
    await expect(page.getByRole("status")).toContainText("已完成整单出库");
    await expect(page.getByText("E2E 出库客户", { exact: true })).toHaveCount(0);
    await expect(
      prisma.receivable.count({ where: { salesOrderId: draft.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.inventoryBalance.findMany({
        where: { skuId: { in: skus.map(({ id }) => id) } },
        orderBy: { skuId: "asc" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ onHandQuantity: 10, reservedQuantity: 0 }),
      expect.objectContaining({ onHandQuantity: 17, reservedQuantity: 0 }),
    ]);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await switchSession(page, "owner@example.local");
    await page.goto("/warehouse/outbound");
    await expect(
      page.getByRole("heading", { name: "待出库工作台", exact: true }),
    ).toBeVisible();
    for (const email of [
      "sales@example.local",
      "finance@example.local",
    ] as const) {
      await switchSession(page, email);
      await page.goto("/warehouse/outbound");
      await expect(page).toHaveURL(/\/forbidden$/);
    }
  } finally {
    if (salesOrderId) {
      await prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL session_replication_role = 'replica'",
        );
        await transaction.receivable.deleteMany({
          where: { salesOrderId },
        });
        await transaction.inventoryMovement.deleteMany({
          where: { relatedType: "SALES_ORDER", relatedId: salesOrderId },
        });
        await transaction.businessAudit.deleteMany({
          where: { objectType: "SALES_ORDER", objectId: salesOrderId },
        });
        await transaction.salesOrderItem.deleteMany({
          where: { salesOrderId },
        });
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
