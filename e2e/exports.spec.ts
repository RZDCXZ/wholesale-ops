import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";
import * as XLSX from "xlsx";

import { PrismaClient } from "../src/generated/prisma/client";

const password = "demo123456";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for export E2E tests.");

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, email: string, expectedPath: RegExp) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expectedPath);
}

test("下载入口使用当前会话与筛选，越权和空结果不会留下成功审计", async ({
  page,
}) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  const suffix = randomUUID();
  const customerId = `export-customer-${suffix}`;
  const salesOrderId = `export-order-${suffix}`;
  const customerName = `导出筛选客户-${suffix.slice(0, 8)}`;
  const salesOrderNumber = `XSD-EXPORT-${suffix}`;
  const sales = await prisma.user.findUniqueOrThrow({
    where: { email: "sales@example.local" },
  });

  try {
    await prisma.customer.create({
      data: {
        id: customerId,
        customerCode: `KH-EX-${suffix.slice(0, 8)}`,
        name: customerName,
        contactName: "测试联系人",
        phone: "138 0000 0000",
        address: "深圳市导出测试路 1 号",
        responsibleSalesId: sales.id,
        paymentTermDays: 30,
      },
    });
    await prisma.salesOrder.create({
      data: {
        id: salesOrderId,
        salesOrderNumber,
        status: "OUTBOUND",
        customerId,
        creatorId: sales.id,
        customerCodeSnapshot: `KH-EX-${suffix.slice(0, 8)}`,
        customerNameSnapshot: customerName,
        customerContactNameSnapshot: "测试联系人",
        customerPhoneSnapshot: "138 0000 0000",
        customerAddressSnapshot: "深圳市导出测试路 1 号",
        responsibleSalesIdSnapshot: sales.id,
        responsibleSalesNameSnapshot: sales.name,
        paymentTermDaysSnapshot: 30,
        totalAmountFen: 54_321,
      },
    });

    await page.setViewportSize({ width: 1440, height: 1024 });
    await signIn(page, "sales@example.local", /\/sales-orders$/);
    await page.goto(
      `/sales-orders?q=${encodeURIComponent(customerName)}&status=OUTBOUND&actorId=other-user&scope=all`,
    );
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出当前筛选" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const workbook = XLSX.read(await readFile(downloadPath!), { type: "buffer" });
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["销售单"]!, {
        header: 1,
        raw: true,
      }),
    ).toEqual([
      [
        "销售单编号",
        "客户名称",
        "客户负责人",
        "明细数",
        "成交金额（人民币元）",
        "履约状态",
        "创建日期",
        "更新时间",
      ],
      expect.arrayContaining([salesOrderNumber, customerName, sales.name]),
    ]);
    await expect(
      page.getByText("已导出 1 条销售单。", { exact: true }),
    ).toBeVisible();
    await expect(
      prisma.businessAudit.count({
        where: {
          actorId: sales.id,
          action: "DATA_EXPORTED",
          objectType: "SALES_ORDER_EXPORT",
          summary: { contains: customerName },
        },
      }),
    ).resolves.toBe(1);

    const auditCountBeforeFailures = await prisma.businessAudit.count({
      where: { action: "DATA_EXPORTED" },
    });

    await signIn(page, "finance@example.local", /\/receivables$/);
    const forbidden = await page.evaluate(async () => {
      const response = await fetch("/api/exports/sales-orders?scope=all");
      return { status: response.status, body: await response.json() };
    });
    expect(forbidden).toEqual({
      status: 403,
      body: {
        code: "FORBIDDEN",
        message: "没有导出该类业务数据的权限。",
      },
    });

    await signIn(page, "sales@example.local", /\/sales-orders$/);
    const empty = await page.evaluate(async () => {
      const response = await fetch(
        "/api/exports/sales-orders?q=%E4%B8%8D%E5%AD%98%E5%9C%A8%E7%9A%84%E8%AE%B0%E5%BD%95",
      );
      return { status: response.status, body: await response.json() };
    });
    expect(empty).toEqual({
      status: 422,
      body: {
        code: "EMPTY_RESULT",
        message: "当前权限与筛选条件下没有可导出的销售单。",
      },
    });
    await expect(
      prisma.businessAudit.count({ where: { action: "DATA_EXPORTED" } }),
    ).resolves.toBe(auditCountBeforeFailures);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/sales-orders?q=${encodeURIComponent(customerName)}&status=OUTBOUND`,
    );
    await expect(
      page.getByRole("button", { name: "导出当前筛选" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  } finally {
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        "SET LOCAL session_replication_role = replica",
      );
      await transaction.businessAudit.deleteMany({
        where: {
          action: "DATA_EXPORTED",
          summary: { contains: customerName },
        },
      });
      await transaction.salesOrder.deleteMany({ where: { id: salesOrderId } });
      await transaction.customer.deleteMany({ where: { id: customerId } });
    });
    await prisma.$disconnect();
  }
});
