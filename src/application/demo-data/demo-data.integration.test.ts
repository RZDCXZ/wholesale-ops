import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma/client";
import { listAccounts } from "../accounts/account-service";
import type { Actor } from "../auth/resolve-actor";
import { listCustomersPage } from "../customers/customer-service";
import { listInventoryPage } from "../inventory/inventory-service";
import { getOperationsOverview } from "../overview/operations-overview-service";
import {
  listPendingOutboundSalesOrders,
  outboundSalesOrder,
} from "../outbound/outbound-service";
import {
  getReceivableDetail,
  listReceivablesPage,
  recordPayment,
} from "../receivables/receivable-service";
import {
  confirmSalesOrder,
  createSalesOrderDraft,
  getSalesOrderDetail,
  listSalesOrdersPage,
} from "../sales-orders/sales-order-service";
import { listSkusPage } from "../skus/sku-service";

const execFileAsync = promisify(execFile);
const demoNow = new Date("2026-08-14T16:30:00.000Z");
const owner: Actor = {
  id: "demo-user-owner",
  name: "张伟",
  email: "owner@example.local",
  roles: ["OWNER"],
};
const sales: Actor = {
  id: "demo-user-sales",
  name: "陈敏",
  email: "sales@example.local",
  roles: ["SALES"],
};
const warehouse: Actor = {
  id: "demo-user-warehouse",
  name: "王强",
  email: "warehouse@example.local",
  roles: ["WAREHOUSE"],
};
const finance: Actor = {
  id: "demo-user-finance",
  name: "刘芳",
  email: "finance@example.local",
  roles: ["FINANCE"],
};

function demoCommandEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
    WHOLESALE_OPS_DEMO_NOW: demoNow.toISOString(),
  };
}

async function resetDemoDatabase(databaseUrl: string): Promise<void> {
  await execFileAsync("pnpm", ["demo:reset", "--", "--yes"], {
    cwd: process.cwd(),
    env: demoCommandEnvironment(databaseUrl),
  });
}

describe("演示数据命令", () => {
  let container: StartedTestContainer;
  let databaseUrl: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({
        POSTGRES_DB: "wholesale_ops",
        POSTGRES_USER: "wholesale_ops",
        POSTGRES_PASSWORD: "wholesale_ops",
      })
      .withExposedPorts(5432)
      .start();
    databaseUrl = `postgresql://wholesale_ops:wholesale_ops@${container.getHost()}:${container.getMappedPort(5432)}/wholesale_ops?schema=public`;
    await execFileAsync("pnpm", ["prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("拒绝重置非本机数据库目标", async () => {
    const command = execFileAsync("pnpm", ["demo:reset", "--", "--yes"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL:
          "postgresql://wholesale_ops:wholesale_ops@db.example.com:5432/wholesale_ops?schema=public",
      },
    });

    await expect(command).rejects.toMatchObject({
      stderr: expect.stringContaining("只允许操作本机 PostgreSQL"),
    });
  });

  it("恢复命令在读取备份前拒绝非本机数据库目标", async () => {
    const command = execFileAsync(
      "pnpm",
      ["db:restore", "--", "--input", "/tmp/not-read.dump", "--yes"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL:
            "postgresql://wholesale_ops:wholesale_ops@db.example.com:5432/wholesale_ops?schema=public",
        },
      },
    );

    await expect(command).rejects.toMatchObject({
      stderr: expect.stringContaining("只允许操作本机 PostgreSQL"),
    });
  });

  it("重置后提供完整且相对中国当天有效的经营场景", async () => {
    await resetDemoDatabase(databaseUrl);

    const [
      accounts,
      skus,
      customers,
      draftOrders,
      confirmedOrders,
      outboundOrders,
      cancelledOrders,
      pendingOutbound,
      partialReceivables,
      overdueReceivables,
      warningInventory,
      overview,
      exactStockDraft,
      shortageDraft,
      reversedPaymentReceivable,
    ] = await Promise.all([
      listAccounts(prisma, owner, {}),
      listSkusPage(prisma, owner, {}, { page: 1, pageSize: 100 }),
      listCustomersPage(prisma, owner, {}, { page: 1, pageSize: 100 }),
      listSalesOrdersPage(prisma, owner, { status: "DRAFT" }, { page: 1, pageSize: 100 }),
      listSalesOrdersPage(prisma, owner, { status: "CONFIRMED" }, { page: 1, pageSize: 100 }),
      listSalesOrdersPage(prisma, owner, { status: "OUTBOUND" }, { page: 1, pageSize: 100 }),
      listSalesOrdersPage(prisma, owner, { status: "CANCELLED" }, { page: 1, pageSize: 100 }),
      listPendingOutboundSalesOrders(prisma, owner, {}),
      listReceivablesPage(prisma, owner, { status: "PARTIAL" }, { page: 1, pageSize: 100 }, demoNow),
      listReceivablesPage(prisma, owner, { overdueOnly: true }, { page: 1, pageSize: 100 }, demoNow),
      listInventoryPage(
        prisma,
        owner,
        { enabled: true, inventoryWarning: true },
        { page: 1, pageSize: 100, sort: "skuCode", direction: "asc" },
      ),
      getOperationsOverview(prisma, owner, demoNow),
      getSalesOrderDetail(prisma, owner, "demo-sales-order-01"),
      getSalesOrderDetail(prisma, owner, "demo-sales-order-02"),
      getReceivableDetail(prisma, owner, "demo-receivable-08", demoNow),
    ]);

    expect({
      accounts: accounts.map(({ email, roles }) => ({ email, roles })),
      skuCount: skus.total,
      customerCount: customers.total,
      stableDemoReferences: {
        customer: customers.items.find(
          ({ customerCode }) => customerCode === "KH-0003",
        ),
        bolt: skus.items.find(({ skuCode }) => skuCode === "WJ-LS-001"),
        cuttingDisc: skus.items.find(
          ({ skuCode }) => skuCode === "WJ-QP-004",
        ),
      },
      statusCounts: {
        draft: draftOrders.total,
        confirmed: confirmedOrders.total,
        outbound: outboundOrders.total,
        cancelled: cancelledOrders.total,
      },
      pendingOutboundCount: pendingOutbound.length,
      partialReceivableCount: partialReceivables.total,
      overdueReceivableCount: overdueReceivables.total,
      warningSkuCodes: warningInventory.items.map(({ skuCode }) => skuCode),
      exactStock: {
        quantity: exactStockDraft.items[0]?.quantity,
        availableQuantity:
          exactStockDraft.items[0]?.currentInventory.availableQuantity,
      },
      shortage: {
        quantity: shortageDraft.items[0]?.quantity,
        availableQuantity:
          shortageDraft.items[0]?.currentInventory.availableQuantity,
      },
      reversedPaymentTimeline:
        reversedPaymentReceivable.visibility === "financial"
          ? {
              paymentAuditId: reversedPaymentReceivable.payments[0]?.auditId,
              reversalAuditId:
                reversedPaymentReceivable.payments[0]?.reversal?.auditId,
            }
          : null,
      overview: {
        asOfDate: overview.asOfDate,
        todaySales: overview.todaySales,
        todayPayments: overview.todayPayments,
        receivables: overview.receivables,
        warningCount: overview.inventoryWarnings.count,
        trendTotal: overview.paymentTrend.reduce(
          (total, day) => total + day.amountFen,
          0,
        ),
      },
    }).toEqual({
      accounts: [
        { email: "owner@example.local", roles: ["OWNER"] },
        { email: "sales@example.local", roles: ["SALES"] },
        { email: "warehouse@example.local", roles: ["WAREHOUSE"] },
        { email: "finance@example.local", roles: ["FINANCE"] },
        { email: "multi@example.local", roles: ["SALES", "WAREHOUSE"] },
      ],
      skuCount: 30,
      customerCount: 8,
      stableDemoReferences: {
        customer: expect.objectContaining({
          id: "demo-customer-kh-0003",
          customerCode: "KH-0003",
          name: "广顺五金商行",
          phone: "138 0000 0000",
        }),
        bolt: expect.objectContaining({
          id: "demo-sku-wj-ls-001",
          skuCode: "WJ-LS-001",
        }),
        cuttingDisc: expect.objectContaining({
          id: "demo-sku-wj-qp-004",
          skuCode: "WJ-QP-004",
          availableQuantity: 50,
        }),
      },
      statusCounts: { draft: 3, confirmed: 3, outbound: 12, cancelled: 2 },
      pendingOutboundCount: 3,
      partialReceivableCount: 2,
      overdueReceivableCount: 2,
      warningSkuCodes: ["WJ-BS-004", "WJ-BS-007", "WJ-JD-005", "WJ-LM-006", "WJ-ZT-003"],
      exactStock: { quantity: 3, availableQuantity: 3 },
      shortage: { quantity: 4, availableQuantity: 0 },
      reversedPaymentTimeline: {
        paymentAuditId: "demo-payment-audit-06",
        reversalAuditId: "demo-payment-reversal-audit-06",
      },
      overview: {
        asOfDate: "2026-08-15",
        todaySales: { amountFen: 17_500, count: 2 },
        todayPayments: { amountFen: 15_700, count: 2 },
        receivables: {
          remainingAmountFen: 67_150,
          unsettledCount: 9,
          overdueAmountFen: 12_700,
          overdueCount: 2,
        },
        warningCount: 5,
        trendTotal: 38_400,
      },
    });
  });

  it("当天业务事件不会晚于演示重置时刻", async () => {
    await resetDemoDatabase(databaseUrl);
    const [todayOrder, todayReceivable, reversedReceivable] = await Promise.all([
      getSalesOrderDetail(prisma, owner, "demo-sales-order-17"),
      getReceivableDetail(prisma, owner, "demo-receivable-17", demoNow),
      getReceivableDetail(prisma, owner, "demo-receivable-08", demoNow),
    ]);
    if (
      todayReceivable.visibility !== "financial" ||
      reversedReceivable.visibility !== "financial"
    ) {
      throw new Error("老板应能读取演示应收的财务时间线。");
    }
    const eventTimes = [
      todayOrder.createdAt,
      todayOrder.updatedAt,
      todayOrder.outbound!.occurredAt,
      todayReceivable.outboundAt,
      ...todayReceivable.payments.flatMap((payment) => [
        payment.recordedAt,
        ...(payment.reversal ? [payment.reversal.reversedAt] : []),
      ]),
      ...reversedReceivable.payments.flatMap((payment) => [
        payment.recordedAt,
        ...(payment.reversal ? [payment.reversal.reversedAt] : []),
      ]),
    ];

    expect(eventTimes.every((eventTime) => eventTime <= demoNow)).toBe(true);
  });

  it("从空数据库初始化后演示老板可以登录", async () => {
    await prisma.$executeRawUnsafe("DROP SCHEMA public CASCADE");
    await prisma.$executeRawUnsafe("CREATE SCHEMA public");

    await execFileAsync(
      "node",
      ["scripts/setup.mjs", "--database-already-running"],
      {
        cwd: process.cwd(),
        env: demoCommandEnvironment(databaseUrl),
        timeout: 120_000,
      },
    );

    const testAuth = betterAuth({
      baseURL: "http://localhost:3000",
      secret: "test-secret-at-least-32-characters-long",
      database: prismaAdapter(prisma, {
        provider: "postgresql",
        transaction: true,
      }),
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        requireEmailVerification: false,
      },
    });
    const login = await testAuth.api.signInEmail({
      body: { email: "owner@example.local", password: "demo123456" },
    });
    const [skus, customers, orders] = await Promise.all([
      listSkusPage(prisma, owner, {}, { page: 1, pageSize: 100 }),
      listCustomersPage(prisma, owner, {}, { page: 1, pageSize: 100 }),
      listSalesOrdersPage(prisma, owner, {}, { page: 1, pageSize: 100 }),
    ]);

    expect({
      loginEmail: login.user.email,
      skuCount: skus.total,
      customerCount: customers.total,
      salesOrderCount: orders.total,
    }).toEqual({
      loginEmail: "owner@example.local",
      skuCount: 30,
      customerCount: 8,
      salesOrderCount: 20,
    });
  });

  it("连续重置三次后账号、业务编号、数量、金额、状态和经营总览一致", async () => {
    const snapshots = [];

    for (let reset = 0; reset < 3; reset += 1) {
      await resetDemoDatabase(databaseUrl);
      const [accounts, inventory, salesOrders, overview] = await Promise.all([
        listAccounts(prisma, owner, {}),
        listInventoryPage(
          prisma,
          owner,
          {},
          { page: 1, pageSize: 100, sort: "skuCode", direction: "asc" },
        ),
        listSalesOrdersPage(prisma, owner, {}, { page: 1, pageSize: 100 }),
        getOperationsOverview(prisma, owner, demoNow),
      ]);
      snapshots.push({
        accounts: accounts.map(({ email, roles, enabled }) => ({
          email,
          roles,
          enabled,
        })),
        inventory: inventory.items.map(
          ({ skuCode, onHandQuantity, reservedQuantity, availableQuantity }) => ({
            skuCode,
            onHandQuantity,
            reservedQuantity,
            availableQuantity,
          }),
        ),
        salesOrders: salesOrders.items.map(
          ({ salesOrderNumber, status, totalAmountFen }) => ({
            salesOrderNumber,
            status,
            totalAmountFen,
          }),
        ),
        overview,
      });
    }

    expect(snapshots.slice(1)).toEqual([snapshots[0], snapshots[0]]);
  });

  it("标准 PostgreSQL 备份恢复后仍可完成销售闭环", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "wholesale-ops-backup-test-"),
    );
    const backupPath = join(temporaryDirectory, "demo.dump");
    const commandEnvironment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
    };

    try {
      const backup = await execFileAsync(
        "pnpm",
        ["db:backup", "--", "--output", backupPath],
        {
          cwd: process.cwd(),
          env: commandEnvironment,
          timeout: 120_000,
        },
      );
      const extraSku = await createSalesOrderDraft(prisma, sales, {
        customerId: "demo-customer-kh-0003",
        items: [
          {
            skuId: "demo-sku-21",
            quantity: 1,
            transactionPrice: "6.80",
          },
        ],
      });
      await expect(
        listSalesOrdersPage(prisma, owner, {}, { page: 1, pageSize: 100 }),
      ).resolves.toMatchObject({ total: 21 });

      const restore = await execFileAsync(
        "pnpm",
        ["db:restore", "--", "--input", backupPath, "--yes"],
        {
          cwd: process.cwd(),
          env: commandEnvironment,
          timeout: 120_000,
        },
      );
      const restoredOrders = await listSalesOrdersPage(
        prisma,
        owner,
        {},
        { page: 1, pageSize: 100 },
      );

      const draft = await createSalesOrderDraft(prisma, sales, {
        customerId: "demo-customer-kh-0003",
        items: [
          {
            skuId: "demo-sku-21",
            quantity: 1,
            transactionPrice: "6.80",
          },
        ],
      });
      await confirmSalesOrder(prisma, sales, draft.id);
      await outboundSalesOrder(prisma, warehouse, draft.id, demoNow);
      const outboundDetail = await getSalesOrderDetail(prisma, owner, draft.id);
      const payment = await recordPayment(
        prisma,
        finance,
        {
          receivableId: outboundDetail.receivable!.id,
          paymentDate: new Date("2026-08-15T00:00:00.000Z"),
          amountFen: outboundDetail.receivable!.remainingAmountFen,
          method: "BANK_TRANSFER",
          idempotencyKey: "backup-restore-sales-loop",
        },
        demoNow,
      );

      expect({
        backupOutput: backup.stdout,
        restoreOutput: restore.stdout,
        restoredOrderCount: restoredOrders.total,
        restoredAbsentOrderId: restoredOrders.items.some(
          ({ id }) => id === extraSku.id,
        ),
        completedOrderStatus: payment.receivable.status,
      }).toEqual({
        backupOutput: expect.stringContaining("PostgreSQL 自定义格式备份"),
        restoreOutput: expect.stringContaining("恢复完成"),
        restoredOrderCount: 20,
        restoredAbsentOrderId: false,
        completedOrderStatus: "SETTLED",
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
