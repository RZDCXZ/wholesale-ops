import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for receivables E2E tests.");

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

test("财务登记多笔部分收款并自动结清，销售只看进度且仓库不能访问", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  const suffix = randomUUID().slice(0, 8);
  const customerId = `e2e-payment-customer-${suffix}`;
  const salesOrderId = `e2e-payment-order-${suffix}`;
  const receivableId = `e2e-payment-receivable-${suffix}`;
  const receivableNumber = `E2E-YS-${suffix}`;
  const salesOrderNumber = `E2E-XSD-${suffix}`;

  try {
    const [salesUser, financeUser] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "sales@example.local" } }),
      prisma.user.findUniqueOrThrow({ where: { email: "finance@example.local" } }),
    ]);
    await prisma.$transaction(async (transaction) => {
      await transaction.customer.create({
        data: {
          id: customerId,
          customerCode: `E2E-KH-${suffix}`,
          name: "E2E 部分收款客户",
          contactName: "李师傅",
          phone: "138 0000 5678",
          address: "广东省深圳市宝安区收款测试路 18 号",
          responsibleSalesId: salesUser.id,
          paymentTermDays: 30,
        },
      });
      await transaction.salesOrder.create({
        data: {
          id: salesOrderId,
          salesOrderNumber,
          status: "OUTBOUND",
          customerId,
          creatorId: salesUser.id,
          customerCodeSnapshot: `E2E-KH-${suffix}`,
          customerNameSnapshot: "E2E 部分收款客户",
          customerContactNameSnapshot: "李师傅",
          customerPhoneSnapshot: "138 0000 5678",
          customerAddressSnapshot: "广东省深圳市宝安区收款测试路 18 号",
          responsibleSalesIdSnapshot: salesUser.id,
          responsibleSalesNameSnapshot: salesUser.name,
          paymentTermDaysSnapshot: 30,
          totalAmountFen: 108_400,
        },
      });
      await transaction.receivable.create({
        data: {
          id: receivableId,
          receivableNumber,
          salesOrderId,
          customerId,
          customerCodeSnapshot: `E2E-KH-${suffix}`,
          customerNameSnapshot: "E2E 部分收款客户",
          responsibleSalesIdSnapshot: salesUser.id,
          originalAmountFen: 108_400,
          receivedAmountFen: 0,
          remainingAmountFen: 108_400,
          paymentTermDaysSnapshot: 30,
          outboundAt: new Date("2026-08-13T02:00:00.000Z"),
          dueDate: new Date("2026-09-12T00:00:00.000Z"),
          status: "PENDING",
        },
      });
      await transaction.businessAudit.create({
        data: {
          id: `e2e-payment-outbound-audit-${suffix}`,
          actorId: financeUser.id,
          actorName: financeUser.name,
          action: "SALES_ORDER_OUTBOUND",
          objectType: "SALES_ORDER",
          objectId: salesOrderId,
          referenceCode: salesOrderNumber,
        },
      });
    });

    await signIn(page, "finance@example.local", /\/receivables$/);
    await expect(page.getByRole("heading", { name: "应收", exact: true })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: receivableNumber });
    await expect(row).toContainText("E2E 部分收款客户");
    await expect(row).toContainText("¥1,084.00");
    await expect(row).toContainText("¥0.00");
    await expect(row).toContainText("待收款");
    await row.getByRole("link", { name: "查看详情" }).click();
    await expect(page).toHaveURL(new RegExp(`/receivables/${receivableId}$`));
    await expect(
      page.getByRole("button", { name: "登记第一笔收款" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.innerText,
      ),
    ).not.toBe("登记第一笔收款");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("aside")).not.toBeInViewport();
    await page.getByRole("button", { name: "登记收款", exact: true }).click();
    let drawer = page.getByRole("dialog", { name: "登记收款" });
    await expect(drawer).toContainText("当前未收金额");
    await expect(drawer).toContainText("¥1,084.00");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await drawer.getByLabel("金额 *").fill("2000.00");
    await drawer.getByRole("button", { name: "登记收款", exact: true }).click();
    await expect(drawer.getByRole("alert")).toContainText("不能超过当前未收金额");

    await drawer.getByLabel("金额 *").fill("400.00");
    await drawer.getByLabel("参考号").fill("E2E-SK-001");
    await drawer.getByLabel("备注").fill("E2E 首笔部分收款");
    await drawer.getByRole("button", { name: "登记收款", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/receivables/${receivableId}\\?notice=payment-recorded`));
    await expect(page.getByRole("status")).toContainText("同一事务中写入");
    await expect(page.getByText("部分收款", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("收款 ¥400.00", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E-SK-001", { exact: false })).toBeVisible();
    await expect(page.getByText("E2E 首笔部分收款", { exact: false })).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.getByRole("button", { name: "登记收款", exact: true }).click();
    drawer = page.getByRole("dialog", { name: "登记收款" });
    await drawer.getByRole("button", { name: "填入全部未收金额" }).click();
    await expect(drawer.getByLabel("金额 *")).toHaveValue("684.00");
    await drawer.getByRole("button", { name: "登记收款", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("应收已自动结清");
    await expect(page.getByText("已结清", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "登记收款", exact: true })).toHaveCount(0);

    const finalPayment = page.getByRole("article", { name: "收款 ¥684.00" });
    await finalPayment.getByRole("button", { name: "撤销收款" }).click();
    const reversalDialog = page.getByRole("dialog", { name: "撤销这笔收款" });
    await expect(reversalDialog).toContainText("原收款金额与方式");
    await expect(reversalDialog).toContainText("¥684.00 · 银行转账");
    await expect(reversalDialog).toContainText("撤销后累计收款");
    await expect(reversalDialog).toContainText("¥400.00");
    await expect(reversalDialog).toContainText("撤销后未收金额");
    await expect(reversalDialog).toContainText("部分收款");
    await reversalDialog.getByRole("button", { name: "撤销这笔收款" }).click();
    await expect(reversalDialog.getByLabel("撤销原因 *")).toBeFocused();
    await reversalDialog.getByLabel("撤销原因 *").fill("E2E 金额录入错误");
    await reversalDialog.getByRole("button", { name: "撤销这笔收款" }).click();
    await expect(page).toHaveURL(new RegExp(`/receivables/${receivableId}\\?notice=payment-reversed`));
    await expect(page.getByRole("status")).toContainText("原收款仍完整保留");
    await expect(page.getByText("部分收款", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("article", { name: "收款 ¥684.00", exact: true })).toContainText("已撤销");
    const reversalRecord = page.getByRole("article", { name: "撤销收款 ¥684.00", exact: true });
    await expect(reversalRecord).toContainText("撤销收款 +¥684.00 未收金额");
    await expect(reversalRecord).toContainText("E2E 金额录入错误");
    await expect(page.getByRole("button", { name: "撤销收款" })).toHaveCount(1);

    await switchSession(page, "sales@example.local");
    await page.goto(`/receivables/${receivableId}`);
    await expect(page.getByText("当前销售账号只查看自己负责客户的收款进度摘要", { exact: false })).toBeVisible();
    await expect(page.getByText("¥1,084.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("¥400.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("¥684.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("E2E-SK-001", { exact: false })).toHaveCount(0);
    await expect(page.getByText("E2E 金额录入错误", { exact: false })).toHaveCount(0);
    await expect(page.getByText("收款方式", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "登记收款", exact: true })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("aside")).not.toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await switchSession(page, "warehouse@example.local");
    await page.goto(`/receivables/${receivableId}`);
    await expect(page).toHaveURL(/\/forbidden$/);
  } finally {
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        "SET LOCAL session_replication_role = 'replica'",
      );
      await transaction.paymentReversal.deleteMany({ where: { receivableId } });
      await transaction.payment.deleteMany({ where: { receivableId } });
      await transaction.businessAudit.deleteMany({
        where: {
          OR: [
            { objectType: "PAYMENT", referenceCode: receivableNumber },
            { objectType: "SALES_ORDER", objectId: salesOrderId },
          ],
        },
      });
      await transaction.receivable.deleteMany({ where: { id: receivableId } });
      await transaction.salesOrder.deleteMany({ where: { id: salesOrderId } });
      await transaction.customer.deleteMany({ where: { id: customerId } });
    });
    await prisma.$disconnect();
  }
});
