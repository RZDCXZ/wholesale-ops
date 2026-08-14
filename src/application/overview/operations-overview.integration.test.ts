import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../auth/resolve-actor";
import { listInventoryPage } from "../inventory/inventory-service";
import { listReceivablesPage } from "../receivables/receivable-service";
import { listSalesOrdersPage } from "../sales-orders/sales-order-service";
import {
  getOperationsOverview,
  OperationsOverviewServiceError,
} from "./operations-overview-service";

const execFileAsync = promisify(execFile);

const owner: Actor = {
  id: "owner-user",
  name: "林建国",
  email: "owner@example.local",
  roles: ["OWNER"],
};
const sales: Actor = {
  id: "sales-user",
  name: "陈敏",
  email: "sales@example.local",
  roles: ["SALES"],
};
const warehouse: Actor = {
  id: "warehouse-user",
  name: "王强",
  email: "warehouse@example.local",
  roles: ["WAREHOUSE"],
};
const finance: Actor = {
  id: "finance-user",
  name: "刘芳",
  email: "finance@example.local",
  roles: ["FINANCE"],
};

describe("经营总览", () => {
  let container: StartedTestContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({
        POSTGRES_DB: "wholesale_ops_test",
        POSTGRES_USER: "wholesale_ops",
        POSTGRES_PASSWORD: "wholesale_ops",
      })
      .withExposedPorts(5432)
      .start();

    const databaseUrl = `postgresql://wholesale_ops:wholesale_ops@${container.getHost()}:${container.getMappedPort(5432)}/wholesale_ops_test?schema=public`;
    await execFileAsync("pnpm", ["prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  }, 120_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "inventory_movement", "inventory_balance", "data_import", "business_audit", "customer", "sku", "session", "account", "user_role", "user" CASCADE',
    );
    await prisma.user.createMany({
      data: [owner, sales, warehouse, finance].map(({ id, name, email }) => ({
        id,
        name,
        email,
      })),
    });
    await prisma.userRole.createMany({
      data: [owner, sales, warehouse, finance].flatMap((actor) =>
        actor.roles.map((role) => ({ userId: actor.id, role })),
      ),
    });
    await prisma.customer.create({
      data: {
        id: "customer",
        customerCode: "KH-0001",
        name: "广顺五金商行",
        contactName: "李海峰",
        phone: "138 0000 0000",
        address: "广东省深圳市宝安区工业路 18 号",
        responsibleSalesId: sales.id,
        paymentTermDays: 0,
      },
    });
    await prisma.sku.createMany({
      data: [
        {
          id: "sku-warning",
          skuCode: "WJ-LS-001",
          name: "304 不锈钢六角螺栓 M8×30",
          category: "紧固件",
          inventoryUnit: "盒",
          referencePriceFen: 4_850,
          warningThreshold: 8,
        },
        {
          id: "sku-normal",
          skuCode: "WJ-QP-004",
          name: "树脂切割片 105mm",
          category: "切削耗材",
          inventoryUnit: "片",
          referencePriceFen: 380,
          warningThreshold: 8,
        },
        {
          id: "sku-disabled-low",
          skuCode: "WJ-ZT-008",
          name: "高速钢直柄麻花钻 8mm",
          category: "钻削工具",
          inventoryUnit: "支",
          referencePriceFen: 1_890,
          warningThreshold: 8,
          enabled: false,
        },
      ],
    });
    await prisma.inventoryBalance.createMany({
      data: [
        { skuId: "sku-warning", onHandQuantity: 10, reservedQuantity: 2 },
        { skuId: "sku-normal", onHandQuantity: 20, reservedQuantity: 5 },
        { skuId: "sku-disabled-low", onHandQuantity: 0, reservedQuantity: 0 },
      ],
    });

    const orders = [
      {
        id: "order-before-day",
        salesOrderNumber: "XSD-20260814-0001",
        totalAmountFen: 50_000,
        outboundAt: new Date("2026-08-14T15:59:59.999Z"),
        dueDate: new Date("2026-08-14T00:00:00.000Z"),
        receivedAmountFen: 0,
        remainingAmountFen: 50_000,
        status: "PENDING" as const,
      },
      {
        id: "order-at-day-start",
        salesOrderNumber: "XSD-20260815-0002",
        totalAmountFen: 100_000,
        outboundAt: new Date("2026-08-14T16:00:00.000Z"),
        dueDate: new Date("2026-08-15T00:00:00.000Z"),
        receivedAmountFen: 40_000,
        remainingAmountFen: 60_000,
        status: "PARTIAL" as const,
      },
      {
        id: "order-today",
        salesOrderNumber: "XSD-20260815-0003",
        totalAmountFen: 250_000,
        outboundAt: new Date("2026-08-15T02:00:00.000Z"),
        dueDate: new Date("2026-08-13T00:00:00.000Z"),
        receivedAmountFen: 80_000,
        remainingAmountFen: 170_000,
        status: "PARTIAL" as const,
      },
      {
        id: "order-next-day",
        salesOrderNumber: "XSD-20260816-0004",
        totalAmountFen: 10_000,
        outboundAt: new Date("2026-08-15T16:00:00.000Z"),
        dueDate: new Date("2026-08-14T00:00:00.000Z"),
        receivedAmountFen: 10_000,
        remainingAmountFen: 0,
        status: "SETTLED" as const,
      },
    ];
    await prisma.salesOrder.createMany({
      data: orders.map((order) => ({
        id: order.id,
        salesOrderNumber: order.salesOrderNumber,
        status: "OUTBOUND",
        customerId: "customer",
        creatorId: sales.id,
        customerCodeSnapshot: "KH-0001",
        customerNameSnapshot: "广顺五金商行",
        customerContactNameSnapshot: "李海峰",
        customerPhoneSnapshot: "138 0000 0000",
        customerAddressSnapshot: "广东省深圳市宝安区工业路 18 号",
        responsibleSalesIdSnapshot: sales.id,
        responsibleSalesNameSnapshot: sales.name,
        paymentTermDaysSnapshot: 0,
        totalAmountFen: order.totalAmountFen,
      })),
    });
    await prisma.receivable.createMany({
      data: orders.map((order, index) => ({
        id: `receivable-${index + 1}`,
        receivableNumber: `YS-20260815-${String(index + 1).padStart(4, "0")}`,
        salesOrderId: order.id,
        customerId: "customer",
        customerCodeSnapshot: "KH-0001",
        customerNameSnapshot: "广顺五金商行",
        responsibleSalesIdSnapshot: sales.id,
        originalAmountFen: order.totalAmountFen,
        receivedAmountFen: order.receivedAmountFen,
        remainingAmountFen: order.remainingAmountFen,
        paymentTermDaysSnapshot: 0,
        outboundAt: order.outboundAt,
        dueDate: order.dueDate,
        status: order.status,
      })),
    });
    await prisma.payment.createMany({
      data: [
        {
          id: "payment-trend-start",
          receivableId: "receivable-3",
          paymentDate: new Date("2026-07-17T00:00:00.000Z"),
          amountFen: 80_000,
          method: "BANK_TRANSFER",
          idempotencyKey: "payment-trend-start",
          recordedAt: new Date("2026-07-17T03:00:00.000Z"),
          actorId: finance.id,
          actorName: finance.name,
        },
        {
          id: "payment-today",
          receivableId: "receivable-2",
          paymentDate: new Date("2026-08-15T00:00:00.000Z"),
          amountFen: 40_000,
          method: "WECHAT",
          idempotencyKey: "payment-today",
          recordedAt: new Date("2026-08-14T16:00:00.000Z"),
          actorId: finance.id,
          actorName: finance.name,
        },
        {
          id: "payment-reversed-today",
          receivableId: "receivable-3",
          paymentDate: new Date("2026-08-14T00:00:00.000Z"),
          amountFen: 20_000,
          method: "CASH",
          idempotencyKey: "payment-reversed-today",
          recordedAt: new Date("2026-08-15T01:00:00.000Z"),
          actorId: finance.id,
          actorName: finance.name,
        },
        {
          id: "payment-yesterday",
          receivableId: "receivable-4",
          paymentDate: new Date("2026-08-14T00:00:00.000Z"),
          amountFen: 10_000,
          method: "ALIPAY",
          idempotencyKey: "payment-yesterday",
          recordedAt: new Date("2026-08-14T10:00:00.000Z"),
          actorId: finance.id,
          actorName: finance.name,
        },
      ],
    });
    await prisma.paymentReversal.create({
      data: {
        id: "reversal-today",
        paymentId: "payment-reversed-today",
        receivableId: "receivable-3",
        amountFen: 20_000,
        reason: "测试撤销",
        idempotencyKey: "reversal-today",
        reversedAt: new Date("2026-08-15T02:00:00.000Z"),
        actorId: owner.id,
        actorName: owner.name,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("按中国标准时间汇总销售、有效收款、应收、库存预警与最近三十个自然日", async () => {
    const now = new Date("2026-08-14T16:30:00.000Z");

    const overview = await getOperationsOverview(prisma, owner, now);

    expect(overview.asOfDate).toBe("2026-08-15");
    expect(overview.todaySales).toEqual({ amountFen: 350_000, count: 2 });
    expect(overview.todayPayments).toEqual({ amountFen: 40_000, count: 1 });
    expect(overview.receivables).toEqual({
      remainingAmountFen: 280_000,
      unsettledCount: 3,
      overdueAmountFen: 220_000,
      overdueCount: 2,
    });
    expect(overview.inventoryWarnings).toEqual({
      count: 1,
      items: [
        {
          skuId: "sku-warning",
          skuCode: "WJ-LS-001",
          name: "304 不锈钢六角螺栓 M8×30",
          inventoryUnit: "盒",
          availableQuantity: 8,
          warningThreshold: 8,
        },
      ],
    });
    expect(overview.paymentTrend).toHaveLength(30);
    expect(overview.paymentTrend[0]).toEqual({
      date: "2026-07-17",
      amountFen: 80_000,
    });
    expect(overview.paymentTrend.at(-2)).toEqual({
      date: "2026-08-14",
      amountFen: 10_000,
    });
    expect(overview.paymentTrend.at(-1)).toEqual({
      date: "2026-08-15",
      amountFen: 40_000,
    });
    expect(
      overview.paymentTrend.reduce((sum, item) => sum + item.amountFen, 0),
    ).toBe(130_000);
  });

  it("老板以外角色不能读取经营总览指标", async () => {
    for (const actor of [sales, warehouse, finance]) {
      await expect(
        getOperationsOverview(
          prisma,
          actor,
          new Date("2026-08-14T16:30:00.000Z"),
        ),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "没有访问经营总览的权限。",
      } satisfies Partial<OperationsOverviewServiceError>);
    }
  });

  it("下钻筛选按出库时间、有效收款登记时间和未结清口径返回相应明细", async () => {
    const todayStart = new Date("2026-08-14T16:00:00.000Z");
    const todayEnd = new Date("2026-08-15T15:59:59.999Z");

    const salesPage = await listSalesOrdersPage(
      prisma,
      owner,
      {
        status: "OUTBOUND",
        outboundFrom: todayStart,
        outboundTo: todayEnd,
      },
      { page: 1, pageSize: 20 },
    );
    expect(salesPage.items.map(({ id }) => id).toSorted()).toEqual([
      "order-at-day-start",
      "order-today",
    ]);

    const paymentPage = await listReceivablesPage(
      prisma,
      owner,
      {
        paymentRecordedFrom: todayStart,
        paymentRecordedTo: todayEnd,
      },
      { page: 1, pageSize: 20 },
      new Date("2026-08-14T16:30:00.000Z"),
    );
    expect(paymentPage.items.map(({ id }) => id)).toEqual(["receivable-2"]);

    const outstandingPage = await listReceivablesPage(
      prisma,
      owner,
      { outstandingOnly: true },
      { page: 1, pageSize: 20 },
      new Date("2026-08-14T16:30:00.000Z"),
    );
    expect(outstandingPage.items.map(({ id }) => id).toSorted()).toEqual([
      "receivable-1",
      "receivable-2",
      "receivable-3",
    ]);

    const overduePage = await listReceivablesPage(
      prisma,
      owner,
      { overdueOnly: true },
      { page: 1, pageSize: 20 },
      new Date("2026-08-14T16:30:00.000Z"),
    );
    expect(overduePage.items.map(({ id }) => id).toSorted()).toEqual([
      "receivable-1",
      "receivable-3",
    ]);

    const warningPage = await listInventoryPage(
      prisma,
      owner,
      { enabled: true, inventoryWarning: true },
      {
        page: 1,
        pageSize: 20,
        sort: "skuCode",
        direction: "asc",
      },
    );
    expect(warningPage.items.map(({ skuId }) => skuId)).toEqual([
      "sku-warning",
    ]);
  });
});
