import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../auth/resolve-actor";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrderDraft,
  getSalesOrderDetail,
} from "../sales-orders/sales-order-service";
import {
  listPendingOutboundSalesOrders,
  outboundSalesOrder,
  OutboundServiceError,
} from "./outbound-service";

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

describe("整单出库", () => {
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
      data: [
        { userId: owner.id, role: "OWNER" },
        { userId: sales.id, role: "SALES" },
        { userId: warehouse.id, role: "WAREHOUSE" },
        { userId: finance.id, role: "FINANCE" },
      ],
    });
    await prisma.customer.create({
      data: {
        id: "customer-own",
        customerCode: "KH-0003",
        name: "广顺五金商行",
        contactName: "李海峰",
        phone: "138 0000 0000",
        address: "广东省深圳市宝安区工业路 18 号",
        responsibleSalesId: sales.id,
        paymentTermDays: 30,
      },
    });
    await prisma.sku.createMany({
      data: [
        {
          id: "sku-bolt",
          skuCode: "WJ-LS-001",
          name: "304 不锈钢六角螺栓 M8×30",
          category: "紧固件",
          inventoryUnit: "盒",
          referencePriceFen: 4_850,
          warningThreshold: 20,
        },
        {
          id: "sku-disc",
          skuCode: "WJ-QP-004",
          name: "树脂切割片 105mm",
          category: "切割耗材",
          inventoryUnit: "片",
          referencePriceFen: 380,
          warningThreshold: 15,
        },
      ],
    });
    await prisma.inventoryBalance.createMany({
      data: [
        { skuId: "sku-bolt", onHandQuantity: 120, reservedQuantity: 40 },
        { skuId: "sku-disc", onHandQuantity: 60, reservedQuantity: 10 },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("老板和仓库读取全部待出库任务且响应只包含履约所需快照", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 30, transactionPrice: "3.80" },
      ],
    });
    const confirmed = await confirmSalesOrder(prisma, sales, draft.id);

    for (const actor of [owner, warehouse]) {
      await expect(
        listPendingOutboundSalesOrders(prisma, actor, {}),
      ).resolves.toEqual([
        {
          id: draft.id,
          salesOrderNumber: draft.salesOrderNumber,
          customer: {
            name: "广顺五金商行",
            contactName: "李海峰",
            phone: "138 0000 0000",
            address: "广东省深圳市宝安区工业路 18 号",
          },
          confirmedAt: confirmed.confirmedAt,
          confirmedByName: sales.name,
          items: [
            {
              skuId: "sku-bolt",
              skuCode: "WJ-LS-001",
              skuName: "304 不锈钢六角螺栓 M8×30",
              inventoryUnit: "盒",
              quantity: 20,
              reservationComplete: true,
            },
            {
              skuId: "sku-disc",
              skuCode: "WJ-QP-004",
              skuName: "树脂切割片 105mm",
              inventoryUnit: "片",
              quantity: 30,
              reservationComplete: true,
            },
          ],
        },
      ]);
    }

    for (const actor of [sales, finance]) {
      await expect(
        listPendingOutboundSalesOrders(prisma, actor, {}),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "没有访问待出库工作台的权限。",
      } satisfies Partial<OutboundServiceError>);
    }
  });

  it("待出库任务按销售单自己的预占记录判断完整性，不被其他销售单的聚合预占掩盖", async () => {
    const firstDraft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 5, transactionPrice: "48.50" },
      ],
    });
    const secondDraft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 5, transactionPrice: "48.50" },
      ],
    });
    await prisma.$transaction([
      prisma.salesOrder.update({
        where: { id: firstDraft.id },
        data: { status: "CONFIRMED" },
      }),
      prisma.businessAudit.create({
        data: {
          id: "first-confirmation-without-reservation",
          actorId: sales.id,
          actorName: sales.name,
          action: "SALES_ORDER_CONFIRMED",
          objectType: "SALES_ORDER",
          objectId: firstDraft.id,
          referenceCode: firstDraft.salesOrderNumber,
        },
      }),
    ]);
    await confirmSalesOrder(prisma, sales, secondDraft.id);

    const tasks = await listPendingOutboundSalesOrders(prisma, warehouse, {});

    expect(
      tasks.find(({ id }) => id === firstDraft.id)?.items[0]
        ?.reservationComplete,
    ).toBe(false);
    expect(
      tasks.find(({ id }) => id === secondDraft.id)?.items[0]
        ?.reservationComplete,
    ).toBe(true);
  });

  it("仓库整单出库后原子减少现存量和预占量、记录流水并按账期生成单笔应收", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 30, transactionPrice: "3.80" },
      ],
    });
    await confirmSalesOrder(prisma, sales, draft.id);
    const outboundAt = new Date("2026-08-13T02:12:00.000Z");

    const result = await outboundSalesOrder(
      prisma,
      warehouse,
      draft.id,
      outboundAt,
    );

    expect(result).toEqual({
      id: draft.id,
      salesOrderNumber: draft.salesOrderNumber,
      status: "OUTBOUND",
      outboundAt,
      outboundByName: warehouse.name,
      auditId: expect.any(String),
      items: [
        {
          skuId: "sku-bolt",
          skuCode: "WJ-LS-001",
          skuName: "304 不锈钢六角螺栓 M8×30",
          inventoryUnit: "盒",
          quantity: 20,
          inventoryImpact: {
            onHandBefore: 120,
            onHandAfter: 100,
            reservedBefore: 60,
            reservedAfter: 40,
            availableBefore: 60,
            availableAfter: 60,
          },
        },
        {
          skuId: "sku-disc",
          skuCode: "WJ-QP-004",
          skuName: "树脂切割片 105mm",
          inventoryUnit: "片",
          quantity: 30,
          inventoryImpact: {
            onHandBefore: 60,
            onHandAfter: 30,
            reservedBefore: 40,
            reservedAfter: 10,
            availableBefore: 20,
            availableAfter: 20,
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /amount|price|paymentTerm|receivable|应收/i,
    );

    await expect(
      prisma.inventoryBalance.findMany({ orderBy: { skuId: "asc" } }),
    ).resolves.toEqual([
      expect.objectContaining({
        skuId: "sku-bolt",
        onHandQuantity: 100,
        reservedQuantity: 40,
      }),
      expect.objectContaining({
        skuId: "sku-disc",
        onHandQuantity: 30,
        reservedQuantity: 10,
      }),
    ]);
    await expect(
      prisma.inventoryMovement.findMany({
        where: { relatedId: draft.id, movementType: "OUTBOUND" },
        orderBy: { skuId: "asc" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        skuId: "sku-bolt",
        onHandDelta: -20,
        reservedDelta: -20,
        onHandAfter: 100,
        reservedAfter: 40,
        actorName: warehouse.name,
      }),
      expect.objectContaining({
        skuId: "sku-disc",
        onHandDelta: -30,
        reservedDelta: -30,
        onHandAfter: 30,
        reservedAfter: 10,
        actorName: warehouse.name,
      }),
    ]);
    await expect(
      prisma.receivable.findUnique({ where: { salesOrderId: draft.id } }),
    ).resolves.toEqual(
      expect.objectContaining({
        receivableNumber: expect.stringMatching(/^YS-20260813-\d{4,}$/),
        customerId: "customer-own",
        customerCodeSnapshot: "KH-0003",
        customerNameSnapshot: "广顺五金商行",
        responsibleSalesIdSnapshot: sales.id,
        originalAmountFen: 108_400,
        receivedAmountFen: 0,
        remainingAmountFen: 108_400,
        paymentTermDaysSnapshot: 30,
        outboundAt,
        dueDate: new Date("2026-09-12T00:00:00.000Z"),
        status: "PENDING",
      }),
    );
    await expect(
      prisma.businessAudit.findMany({
        where: { objectId: draft.id, action: "SALES_ORDER_OUTBOUND" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: result.auditId,
        actorName: warehouse.name,
        referenceCode: draft.salesOrderNumber,
      }),
    ]);
    await expect(
      prisma.salesOrder.findUnique({ where: { id: draft.id } }),
    ).resolves.toEqual(expect.objectContaining({ status: "OUTBOUND" }));
    await expect(
      getSalesOrderDetail(prisma, owner, draft.id),
    ).resolves.toMatchObject({
      status: "OUTBOUND",
      outbound: {
        auditId: result.auditId,
        actorName: warehouse.name,
        occurredAt: outboundAt,
      },
      items: [
        {
          skuId: "sku-bolt",
          outboundImpact: {
            onHandBefore: 120,
            onHandAfter: 100,
            reservedBefore: 60,
            reservedAfter: 40,
            availableBefore: 60,
            availableAfter: 60,
          },
        },
        {
          skuId: "sku-disc",
          outboundImpact: {
            onHandBefore: 60,
            onHandAfter: 30,
            reservedBefore: 40,
            reservedAfter: 10,
            availableBefore: 20,
            availableAfter: 20,
          },
        },
      ],
    });
  });

  it("现结销售单的应收到期日等于中国标准时间的出库日", async () => {
    await prisma.customer.update({
      where: { id: "customer-own" },
      data: { paymentTermDays: 0 },
    });
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" },
      ],
    });
    await confirmSalesOrder(prisma, sales, draft.id);
    const outboundAt = new Date("2026-08-13T16:30:00.000Z");

    await outboundSalesOrder(prisma, warehouse, draft.id, outboundAt);

    await expect(
      prisma.receivable.findUnique({ where: { salesOrderId: draft.id } }),
    ).resolves.toEqual(
      expect.objectContaining({
        paymentTermDaysSnapshot: 0,
        outboundAt,
        dueDate: new Date("2026-08-14T00:00:00.000Z"),
      }),
    );
  });

  it("重复出库、已取消销售单出库和无权角色出库均被拒绝且只保留一个合法结果", async () => {
    const outboundDraft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" },
      ],
    });
    await confirmSalesOrder(prisma, sales, outboundDraft.id);
    await outboundSalesOrder(prisma, warehouse, outboundDraft.id);

    await expect(
      outboundSalesOrder(prisma, warehouse, outboundDraft.id),
    ).rejects.toMatchObject({
      code: "INVALID_STATUS",
      message: "销售单已出库，不能重复出库。",
    } satisfies Partial<OutboundServiceError>);
    await expect(
      prisma.receivable.count({ where: { salesOrderId: outboundDraft.id } }),
    ).resolves.toBe(1);

    const cancelledDraft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-disc", quantity: 2, transactionPrice: "3.80" },
      ],
    });
    await confirmSalesOrder(prisma, sales, cancelledDraft.id);
    await cancelSalesOrder(prisma, sales, {
      salesOrderId: cancelledDraft.id,
      reason: "客户取消",
    });
    await expect(
      outboundSalesOrder(prisma, warehouse, cancelledDraft.id),
    ).rejects.toMatchObject({
      code: "INVALID_STATUS",
      message: "销售单已取消，不能出库。",
    } satisfies Partial<OutboundServiceError>);
    await expect(
      prisma.receivable.count({ where: { salesOrderId: cancelledDraft.id } }),
    ).resolves.toBe(0);

    const protectedDraft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-disc", quantity: 2, transactionPrice: "3.80" },
      ],
    });
    await confirmSalesOrder(prisma, sales, protectedDraft.id);
    for (const actor of [sales, finance]) {
      await expect(
        outboundSalesOrder(prisma, actor, protectedDraft.id),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("出库业务审计写入失败时状态、数量、流水和应收全部回滚", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 30, transactionPrice: "3.80" },
      ],
    });
    await confirmSalesOrder(prisma, sales, draft.id);
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_sales_order_outbound_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'SALES_ORDER_OUTBOUND' THEN
          RAISE EXCEPTION 'forced sales order outbound audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_sales_order_outbound_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION fail_sales_order_outbound_audit();
    `);

    try {
      await expect(
        outboundSalesOrder(prisma, warehouse, draft.id),
      ).rejects.toThrow("forced sales order outbound audit failure");
      await expect(
        prisma.salesOrder.findUnique({ where: { id: draft.id } }),
      ).resolves.toEqual(expect.objectContaining({ status: "CONFIRMED" }));
      await expect(
        prisma.inventoryBalance.findMany({ orderBy: { skuId: "asc" } }),
      ).resolves.toEqual([
        expect.objectContaining({
          skuId: "sku-bolt",
          onHandQuantity: 120,
          reservedQuantity: 60,
        }),
        expect.objectContaining({
          skuId: "sku-disc",
          onHandQuantity: 60,
          reservedQuantity: 40,
        }),
      ]);
      await expect(
        prisma.inventoryMovement.count({
          where: { relatedId: draft.id, movementType: "OUTBOUND" },
        }),
      ).resolves.toBe(0);
      await expect(
        prisma.receivable.count({ where: { salesOrderId: draft.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.businessAudit.count({
          where: { objectId: draft.id, action: "SALES_ORDER_OUTBOUND" },
        }),
      ).resolves.toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_sales_order_outbound_audit_insert ON "business_audit";
        DROP FUNCTION IF EXISTS fail_sales_order_outbound_audit();
      `);
    }
  });

  it("取消与出库并发竞争时只有一个终态及其对应的库存活动和应收", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" },
      ],
    });
    await confirmSalesOrder(prisma, sales, draft.id);

    const results = await Promise.allSettled([
      outboundSalesOrder(prisma, warehouse, draft.id),
      cancelSalesOrder(prisma, sales, {
        salesOrderId: draft.id,
        reason: "与出库竞争的取消",
      }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    const order = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: draft.id },
    });
    const [outboundMovements, releaseMovements, receivables] =
      await Promise.all([
        prisma.inventoryMovement.count({
          where: { relatedId: draft.id, movementType: "OUTBOUND" },
        }),
        prisma.inventoryMovement.count({
          where: { relatedId: draft.id, movementType: "RELEASE" },
        }),
        prisma.receivable.count({ where: { salesOrderId: draft.id } }),
      ]);
    if (order.status === "OUTBOUND") {
      expect({ outboundMovements, releaseMovements, receivables }).toEqual({
        outboundMovements: 1,
        releaseMovements: 0,
        receivables: 1,
      });
    } else {
      expect(order.status).toBe("CANCELLED");
      expect({ outboundMovements, releaseMovements, receivables }).toEqual({
        outboundMovements: 0,
        releaseMovements: 1,
        receivables: 0,
      });
    }
  });
});
