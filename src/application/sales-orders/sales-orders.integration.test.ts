import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../auth/resolve-actor";
import { listBusinessAudit } from "../accounts/account-service";
import {
  listInventory,
  listInventoryMovements,
} from "../inventory/inventory-service";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrderDraft,
  deleteSalesOrderDraft,
  getSalesOrderDetail,
  getSalesOrderDraftForEditing,
  listSalesOrdersPage,
  SalesOrderServiceError,
  updateSalesOrderDraft,
} from "./sales-order-service";

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
const otherSales: Actor = {
  id: "other-sales-user",
  name: "赵磊",
  email: "multi@example.local",
  roles: ["SALES", "WAREHOUSE"],
};
const finance: Actor = {
  id: "finance-user",
  name: "刘芳",
  email: "finance@example.local",
  roles: ["FINANCE"],
};
const warehouse: Actor = {
  id: "warehouse-user",
  name: "王强",
  email: "warehouse@example.local",
  roles: ["WAREHOUSE"],
};

describe("销售单草稿", () => {
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
      data: [
        { id: owner.id, name: owner.name, email: owner.email },
        { id: sales.id, name: sales.name, email: sales.email },
        { id: otherSales.id, name: otherSales.name, email: otherSales.email },
        { id: finance.id, name: finance.name, email: finance.email },
        { id: warehouse.id, name: warehouse.name, email: warehouse.email },
      ],
    });
    await prisma.userRole.createMany({
      data: [
        { userId: owner.id, role: "OWNER" },
        { userId: sales.id, role: "SALES" },
        { userId: otherSales.id, role: "SALES" },
        { userId: otherSales.id, role: "WAREHOUSE" },
        { userId: finance.id, role: "FINANCE" },
        { userId: warehouse.id, role: "WAREHOUSE" },
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
    await prisma.customer.create({
      data: {
        id: "customer-other",
        customerCode: "KH-0007",
        name: "宏远装饰工程",
        contactName: "林嘉怡",
        phone: "139 0000 0000",
        address: "广东省深圳市龙华区测试路 7 号",
        responsibleSalesId: otherSales.id,
        paymentTermDays: 15,
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

  it("销售为自己负责的启用客户创建多 SKU 草稿并原子保存交易快照、定点金额和审计", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 30, transactionPrice: "3.80" },
      ],
    });

    expect(draft).toMatchObject({
      status: "DRAFT",
      customerSnapshot: {
        customerCode: "KH-0003",
        name: "广顺五金商行",
        contactName: "李海峰",
        phone: "138 0000 0000",
        address: "广东省深圳市宝安区工业路 18 号",
        responsibleSalesId: sales.id,
        responsibleSalesName: sales.name,
        paymentTermDays: 30,
      },
      totalAmountFen: 108_400,
      items: [
        expect.objectContaining({
          skuId: "sku-bolt",
          quantity: 20,
          transactionPriceFen: 4_850,
          subtotalFen: 97_000,
          availableQuantity: 80,
        }),
        expect.objectContaining({
          skuId: "sku-disc",
          quantity: 30,
          transactionPriceFen: 380,
          subtotalFen: 11_400,
          availableQuantity: 50,
        }),
      ],
    });
    expect(draft.salesOrderNumber).toMatch(/^XSD-\d{8}-\d{4,}$/);
    await expect(
      prisma.businessAudit.findMany({ where: { objectId: draft.id } }),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "SALES_ORDER_DRAFT_CREATED",
        objectType: "SALES_ORDER",
        referenceCode: draft.salesOrderNumber,
      }),
    ]);
  });

  it("销售确认自己的草稿后原子冻结内容、建立全部预占、库存流水和业务审计", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 30, transactionPrice: "3.80" },
      ],
    });

    const confirmed = await confirmSalesOrder(prisma, sales, draft.id);

    expect(confirmed).toMatchObject({
      id: draft.id,
      salesOrderNumber: draft.salesOrderNumber,
      status: "CONFIRMED",
      items: [
        expect.objectContaining({
          skuCode: "WJ-LS-001",
          quantity: 20,
          inventoryImpact: {
            onHandBefore: 120,
            onHandAfter: 120,
            reservedBefore: 40,
            reservedAfter: 60,
            availableBefore: 80,
            availableAfter: 60,
          },
        }),
        expect.objectContaining({
          skuCode: "WJ-QP-004",
          quantity: 30,
          inventoryImpact: {
            onHandBefore: 60,
            onHandAfter: 60,
            reservedBefore: 10,
            reservedAfter: 40,
            availableBefore: 50,
            availableAfter: 20,
          },
        }),
      ],
    });
    await expect(listInventory(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({
        skuCode: "WJ-LS-001",
        onHandQuantity: 120,
        reservedQuantity: 60,
        availableQuantity: 60,
      }),
      expect.objectContaining({
        skuCode: "WJ-QP-004",
        onHandQuantity: 60,
        reservedQuantity: 40,
        availableQuantity: 20,
      }),
    ]);
    await expect(
      listInventoryMovements(prisma, owner, { relatedReference: draft.salesOrderNumber }),
    ).resolves.toEqual([
      expect.objectContaining({
        skuCode: "WJ-QP-004",
        movementType: "RESERVATION",
        onHandDelta: 0,
        reservedDelta: 30,
        onHandAfter: 60,
        reservedAfter: 40,
        availableAfter: 20,
      }),
      expect.objectContaining({
        skuCode: "WJ-LS-001",
        movementType: "RESERVATION",
        onHandDelta: 0,
        reservedDelta: 20,
        onHandAfter: 120,
        reservedAfter: 60,
        availableAfter: 60,
      }),
    ]);
    await expect(
      listBusinessAudit(prisma, owner, { action: "SALES_ORDER_CONFIRMED" }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: confirmed.auditId,
        objectId: draft.id,
        referenceCode: draft.salesOrderNumber,
        actorName: sales.name,
      }),
    ]);
  });

  it("销售取消自己负责客户的已确认销售单并原子释放全部预占、写入流水和取消轨迹", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 30, transactionPrice: "3.80" },
      ],
    });
    await confirmSalesOrder(prisma, sales, draft.id);

    const cancelled = await cancelSalesOrder(prisma, sales, {
      salesOrderId: draft.id,
      reason: "客户临时取消采购计划",
    });

    expect(cancelled).toMatchObject({
      id: draft.id,
      salesOrderNumber: draft.salesOrderNumber,
      status: "CANCELLED",
      cancelledByName: sales.name,
      reason: "客户临时取消采购计划",
      items: [
        expect.objectContaining({
          skuCode: "WJ-LS-001",
          quantity: 20,
          inventoryImpact: {
            onHandBefore: 120,
            onHandAfter: 120,
            reservedBefore: 60,
            reservedAfter: 40,
            availableBefore: 60,
            availableAfter: 80,
          },
        }),
        expect.objectContaining({
          skuCode: "WJ-QP-004",
          quantity: 30,
          inventoryImpact: {
            onHandBefore: 60,
            onHandAfter: 60,
            reservedBefore: 40,
            reservedAfter: 10,
            availableBefore: 20,
            availableAfter: 50,
          },
        }),
      ],
    });
    await expect(listInventory(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({
        skuCode: "WJ-LS-001",
        onHandQuantity: 120,
        reservedQuantity: 40,
        availableQuantity: 80,
      }),
      expect.objectContaining({
        skuCode: "WJ-QP-004",
        onHandQuantity: 60,
        reservedQuantity: 10,
        availableQuantity: 50,
      }),
    ]);
    await expect(
      listInventoryMovements(prisma, owner, {
        relatedReference: draft.salesOrderNumber,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        skuCode: "WJ-QP-004",
        movementType: "RELEASE",
        onHandDelta: 0,
        reservedDelta: -30,
        onHandAfter: 60,
        reservedAfter: 10,
        availableAfter: 50,
      }),
      expect.objectContaining({
        skuCode: "WJ-LS-001",
        movementType: "RELEASE",
        onHandDelta: 0,
        reservedDelta: -20,
        onHandAfter: 120,
        reservedAfter: 40,
        availableAfter: 80,
      }),
      expect.objectContaining({ movementType: "RESERVATION" }),
      expect.objectContaining({ movementType: "RESERVATION" }),
    ]);
    await expect(
      listBusinessAudit(prisma, owner, { action: "SALES_ORDER_CANCELLED" }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: cancelled.auditId,
        objectId: draft.id,
        referenceCode: draft.salesOrderNumber,
        actorName: sales.name,
        reason: "客户临时取消采购计划",
      }),
    ]);
  });

  it("取消要求非空原因，且无权销售不能取消其他负责人客户的销售单", async () => {
    const ownDraft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" }],
    });
    await confirmSalesOrder(prisma, sales, ownDraft.id);

    await expect(
      cancelSalesOrder(prisma, sales, {
        salesOrderId: ownDraft.id,
        reason: "   ",
      }),
    ).rejects.toMatchObject({
      code: "CANCEL_REASON_REQUIRED",
      message: "请填写取消原因。",
      field: "reason",
    } satisfies Partial<SalesOrderServiceError>);
    await expect(
      cancelSalesOrder(prisma, otherSales, {
        salesOrderId: ownDraft.id,
        reason: "越权尝试",
      }),
    ).rejects.toMatchObject({
      code: "ORDER_NOT_FOUND",
      message: "销售单不存在或不可取消。",
    } satisfies Partial<SalesOrderServiceError>);
    await expect(getSalesOrderDetail(prisma, sales, ownDraft.id)).resolves.toMatchObject({
      status: "CONFIRMED",
    });

    const otherDraft = await createSalesOrderDraft(prisma, owner, {
      customerId: "customer-other",
      items: [{ skuId: "sku-disc", quantity: 3, transactionPrice: "3.80" }],
    });
    await confirmSalesOrder(prisma, owner, otherDraft.id);
    await expect(
      cancelSalesOrder(prisma, owner, {
        salesOrderId: otherDraft.id,
        reason: "老板终止履约",
      }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("草稿和已出库销售单不能取消，已取消销售单不能再次取消", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" }],
    });
    await expect(
      cancelSalesOrder(prisma, sales, {
        salesOrderId: draft.id,
        reason: "错误状态尝试",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_STATUS",
      message: "销售单仍是草稿，不能取消。",
    } satisfies Partial<SalesOrderServiceError>);

    await confirmSalesOrder(prisma, sales, draft.id);
    await cancelSalesOrder(prisma, sales, {
      salesOrderId: draft.id,
      reason: "客户取消",
    });
    await expect(
      cancelSalesOrder(prisma, sales, {
        salesOrderId: draft.id,
        reason: "重复取消",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_STATUS",
      message: "销售单已取消，不能再次取消。",
    } satisfies Partial<SalesOrderServiceError>);
    await expect(
      updateSalesOrderDraft(prisma, sales, {
        salesOrderId: draft.id,
        customerId: "customer-own",
        items: [{ skuId: "sku-bolt", quantity: 1, transactionPrice: "1.00" }],
      }),
    ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
    await expect(deleteSalesOrderDraft(prisma, sales, draft.id)).rejects.toMatchObject({
      code: "DRAFT_NOT_FOUND",
    });

    const outboundDraft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-disc", quantity: 2, transactionPrice: "3.80" }],
    });
    await confirmSalesOrder(prisma, sales, outboundDraft.id);
    await prisma.salesOrder.update({
      where: { id: outboundDraft.id },
      data: { status: "OUTBOUND" },
    });
    await expect(
      cancelSalesOrder(prisma, sales, {
        salesOrderId: outboundDraft.id,
        reason: "出库后尝试",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_STATUS",
      message: "销售单已出库，不能取消。",
    } satisfies Partial<SalesOrderServiceError>);
  });

  it("取消业务审计写入失败时状态、全部预占和释放流水一起回滚", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 30, transactionPrice: "3.80" },
      ],
    });
    await confirmSalesOrder(prisma, sales, draft.id);
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_sales_order_cancellation_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'SALES_ORDER_CANCELLED' THEN
          RAISE EXCEPTION 'forced sales order cancellation audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_sales_order_cancellation_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION fail_sales_order_cancellation_audit();
    `);

    try {
      await expect(
        cancelSalesOrder(prisma, sales, {
          salesOrderId: draft.id,
          reason: "客户取消",
        }),
      ).rejects.toThrow("forced sales order cancellation audit failure");
      await expect(getSalesOrderDetail(prisma, sales, draft.id)).resolves.toMatchObject({
        status: "CONFIRMED",
      });
      await expect(listInventory(prisma, owner, {})).resolves.toEqual([
        expect.objectContaining({ skuCode: "WJ-LS-001", reservedQuantity: 60 }),
        expect.objectContaining({ skuCode: "WJ-QP-004", reservedQuantity: 40 }),
      ]);
      await expect(
        prisma.inventoryMovement.count({
          where: {
            relatedId: draft.id,
            movementType: "RELEASE",
          },
        }),
      ).resolves.toBe(0);
      await expect(
        prisma.businessAudit.count({
          where: { objectId: draft.id, action: "SALES_ORDER_CANCELLED" },
        }),
      ).resolves.toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_sales_order_cancellation_audit_insert ON "business_audit";
        DROP FUNCTION IF EXISTS fail_sales_order_cancellation_audit();
      `);
    }
  });

  it("两个请求并发取消时只有一个成功，失败方得到已取消的当前状态", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" }],
    });
    await confirmSalesOrder(prisma, sales, draft.id);

    const results = await Promise.allSettled([
      cancelSalesOrder(prisma, sales, {
        salesOrderId: draft.id,
        reason: "客户取消 A",
      }),
      cancelSalesOrder(prisma, sales, {
        salesOrderId: draft.id,
        reason: "客户取消 B",
      }),
    ]);
    const succeeded = results.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof cancelSalesOrder>>
      > => result.status === "fulfilled",
    );
    const failed = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toMatchObject({
      code: "INVALID_STATUS",
      message: "销售单已取消，不能再次取消。",
    } satisfies Partial<SalesOrderServiceError>);
    await expect(
      prisma.inventoryMovement.count({
        where: { relatedId: draft.id, movementType: "RELEASE" },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.businessAudit.count({
        where: { objectId: draft.id, action: "SALES_ORDER_CANCELLED" },
      }),
    ).resolves.toBe(1);
    await expect(listInventory(prisma, owner, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skuCode: "WJ-LS-001",
          onHandQuantity: 120,
          reservedQuantity: 40,
          availableQuantity: 80,
        }),
      ]),
    );
  });

  it("任一 SKU 可用量不足时整单保持草稿并返回每条差额且不产生部分预占", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 70, transactionPrice: "3.80" },
      ],
    });

    await expect(confirmSalesOrder(prisma, sales, draft.id)).rejects.toMatchObject({
      code: "INVENTORY_SHORTAGE",
      message: "销售单未确认：1 个 SKU 可用量不足。",
      inventoryShortages: [
        {
          skuId: "sku-disc",
          skuCode: "WJ-QP-004",
          skuName: "树脂切割片 105mm",
          inventoryUnit: "片",
          requiredQuantity: 70,
          onHandQuantity: 60,
          reservedQuantity: 10,
          availableQuantity: 50,
          shortageQuantity: 20,
        },
      ],
    } satisfies Partial<SalesOrderServiceError>);
    await expect(
      getSalesOrderDraftForEditing(prisma, sales, draft.id),
    ).resolves.toMatchObject({
      status: "DRAFT",
      items: [
        expect.objectContaining({ skuCode: "WJ-LS-001", availableQuantity: 80 }),
        expect.objectContaining({
          skuCode: "WJ-QP-004",
          availableQuantity: 50,
          shortageQuantity: 20,
        }),
      ],
    });
    await expect(
      listInventoryMovements(prisma, owner, { relatedReference: draft.salesOrderNumber }),
    ).resolves.toEqual([]);
    await expect(
      listBusinessAudit(prisma, owner, { action: "SALES_ORDER_CONFIRMED" }),
    ).resolves.toEqual([]);
  });

  it("确认的业务审计写入失败时状态、全部预占和库存流水一起回滚", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 30, transactionPrice: "3.80" },
      ],
    });
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_sales_order_confirmation_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'SALES_ORDER_CONFIRMED' THEN
          RAISE EXCEPTION 'forced sales order confirmation audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_sales_order_confirmation_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION fail_sales_order_confirmation_audit();
    `);

    try {
      await expect(confirmSalesOrder(prisma, sales, draft.id)).rejects.toThrow(
        "forced sales order confirmation audit failure",
      );
      await expect(
        getSalesOrderDraftForEditing(prisma, sales, draft.id),
      ).resolves.toMatchObject({ status: "DRAFT" });
      await expect(listInventory(prisma, owner, {})).resolves.toEqual([
        expect.objectContaining({
          skuCode: "WJ-LS-001",
          reservedQuantity: 40,
          availableQuantity: 80,
        }),
        expect.objectContaining({
          skuCode: "WJ-QP-004",
          reservedQuantity: 10,
          availableQuantity: 50,
        }),
      ]);
      await expect(
        listInventoryMovements(prisma, owner, { relatedReference: draft.salesOrderNumber }),
      ).resolves.toEqual([]);
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_sales_order_confirmation_audit_insert ON "business_audit";
        DROP FUNCTION IF EXISTS fail_sales_order_confirmation_audit();
      `);
    }
  });

  it("已确认销售单不能重复确认，且原草稿编辑和删除入口都不能改写冻结内容", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" }],
    });
    await confirmSalesOrder(prisma, sales, draft.id);

    await expect(confirmSalesOrder(prisma, sales, draft.id)).rejects.toMatchObject({
      code: "INVALID_STATUS",
      message: "销售单已确认，不能再次确认。",
    } satisfies Partial<SalesOrderServiceError>);
    await expect(
      updateSalesOrderDraft(prisma, sales, {
        salesOrderId: draft.id,
        customerId: "customer-own",
        items: [{ skuId: "sku-bolt", quantity: 9, transactionPrice: "1.00" }],
      }),
    ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
    await expect(
      deleteSalesOrderDraft(prisma, sales, draft.id),
    ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
  });

  it("两个请求争用最后库存时仅一个确认成功，失败方得到最新可用量且库存不为负", async () => {
    await prisma.inventoryBalance.update({
      where: { skuId: "sku-disc" },
      data: { onHandQuantity: 50, reservedQuantity: 0 },
    });
    const [firstDraft, secondDraft] = await Promise.all([
      createSalesOrderDraft(prisma, owner, {
        customerId: "customer-own",
        items: [{ skuId: "sku-disc", quantity: 50, transactionPrice: "3.80" }],
      }),
      createSalesOrderDraft(prisma, owner, {
        customerId: "customer-own",
        items: [{ skuId: "sku-disc", quantity: 50, transactionPrice: "3.80" }],
      }),
    ]);

    const results = await Promise.allSettled([
      confirmSalesOrder(prisma, owner, firstDraft.id),
      confirmSalesOrder(prisma, owner, secondDraft.id),
    ]);
    const succeeded = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof confirmSalesOrder>>> =>
        result.status === "fulfilled",
    );
    const failed = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toMatchObject({
      code: "INVENTORY_CHANGED",
      message: "库存刚刚发生变化，销售单保持草稿。请按最新可用量修改后再次确认。",
      inventoryShortages: [
        expect.objectContaining({
          skuCode: "WJ-QP-004",
          requiredQuantity: 50,
          onHandQuantity: 50,
          reservedQuantity: 50,
          availableQuantity: 0,
          shortageQuantity: 50,
        }),
      ],
    } satisfies Partial<SalesOrderServiceError>);
    await expect(listInventory(prisma, owner, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skuCode: "WJ-QP-004",
          onHandQuantity: 50,
          reservedQuantity: 50,
          availableQuantity: 0,
        }),
      ]),
    );
    const orderPage = await listSalesOrdersPage(
      prisma,
      owner,
      {},
      { page: 1, pageSize: 20 },
    );
    expect(orderPage).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: firstDraft.id }),
        expect.objectContaining({ id: secondDraft.id }),
      ]),
    });
    expect(
      orderPage.items
        .filter(({ id }) => id === firstDraft.id || id === secondDraft.id)
        .map(({ status }) => status)
        .toSorted(),
    ).toEqual(["CONFIRMED", "DRAFT"]);
  });

  it("确认时按客户当前负责人复核范围，新负责人和老板可处理原创建者草稿", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" }],
    });
    await prisma.customer.update({
      where: { id: "customer-own" },
      data: { responsibleSalesId: otherSales.id },
    });

    await expect(confirmSalesOrder(prisma, sales, draft.id)).rejects.toMatchObject({
      code: "DRAFT_NOT_FOUND",
    } satisfies Partial<SalesOrderServiceError>);
    await expect(confirmSalesOrder(prisma, otherSales, draft.id)).resolves.toMatchObject({
      status: "CONFIRMED",
      confirmedByName: otherSales.name,
    });

    const ownerDraft = await createSalesOrderDraft(prisma, owner, {
      customerId: "customer-other",
      items: [{ skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" }],
    });
    await expect(confirmSalesOrder(prisma, owner, ownerDraft.id)).resolves.toMatchObject({
      status: "CONFIRMED",
    });
  });

  it("草稿保存后 SKU 被停用时确认失败并保持草稿且不写入库存流水", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" }],
    });
    await prisma.sku.update({
      where: { id: "sku-bolt" },
      data: { enabled: false },
    });

    await expect(confirmSalesOrder(prisma, sales, draft.id)).rejects.toMatchObject({
      code: "SKU_NOT_AVAILABLE",
      message: "SKU WJ-LS-001 已停用，销售单不能确认。",
    } satisfies Partial<SalesOrderServiceError>);
    await expect(
      getSalesOrderDraftForEditing(prisma, sales, draft.id),
    ).resolves.toMatchObject({ status: "DRAFT" });
    await expect(
      listInventoryMovements(prisma, owner, { relatedReference: draft.salesOrderNumber }),
    ).resolves.toEqual([]);
  });

  it("销售单详情按数据范围返回冻结快照、确认记录和可追溯的库存影响", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
        { skuId: "sku-disc", quantity: 30, transactionPrice: "3.80" },
      ],
    });
    const confirmed = await confirmSalesOrder(prisma, sales, draft.id);

    await expect(getSalesOrderDetail(prisma, sales, draft.id)).resolves.toMatchObject({
      id: draft.id,
      salesOrderNumber: draft.salesOrderNumber,
      status: "CONFIRMED",
      canEdit: false,
      canConfirm: false,
      customerSnapshot: draft.customerSnapshot,
      totalAmountFen: 108_400,
      confirmation: {
        auditId: confirmed.auditId,
        actorName: sales.name,
        occurredAt: confirmed.confirmedAt,
      },
      items: [
        expect.objectContaining({
          skuCode: "WJ-LS-001",
          quantity: 20,
          currentInventory: {
            onHandQuantity: 120,
            reservedQuantity: 60,
            availableQuantity: 60,
          },
          confirmationImpact: {
            onHandBefore: 120,
            onHandAfter: 120,
            reservedBefore: 40,
            reservedAfter: 60,
            availableBefore: 80,
            availableAfter: 60,
          },
        }),
        expect.objectContaining({
          skuCode: "WJ-QP-004",
          quantity: 30,
          currentInventory: {
            onHandQuantity: 60,
            reservedQuantity: 40,
            availableQuantity: 20,
          },
        }),
      ],
    });
    await expect(
      getSalesOrderDetail(prisma, otherSales, draft.id),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("取消后的销售单详情永久展示取消人、时间、原因和实际释放结果且不再提供任何写入口", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" }],
    });
    await confirmSalesOrder(prisma, sales, draft.id);
    const cancelled = await cancelSalesOrder(prisma, sales, {
      salesOrderId: draft.id,
      reason: "客户项目延期，停止本次采购",
    });

    await expect(getSalesOrderDetail(prisma, sales, draft.id)).resolves.toMatchObject({
      id: draft.id,
      status: "CANCELLED",
      canEdit: false,
      canConfirm: false,
      canCancel: false,
      cancellation: {
        auditId: cancelled.auditId,
        actorName: sales.name,
        occurredAt: cancelled.cancelledAt,
        reason: "客户项目延期，停止本次采购",
      },
      items: [
        expect.objectContaining({
          skuCode: "WJ-LS-001",
          currentInventory: {
            onHandQuantity: 120,
            reservedQuantity: 40,
            availableQuantity: 80,
          },
          cancellationImpact: {
            onHandBefore: 120,
            onHandAfter: 120,
            reservedBefore: 60,
            reservedAfter: 40,
            availableBefore: 60,
            availableAfter: 80,
          },
        }),
      ],
    });
  });

  it("编辑草稿保留原客户交易快照并允许保存库存不足明细且明确返回风险", async () => {
    const created = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [
        { skuId: "sku-bolt", quantity: 20, transactionPrice: "48.50" },
      ],
    });
    await prisma.customer.update({
      where: { id: "customer-own" },
      data: {
        name: "客户资料已改名",
        contactName: "新联系人",
        phone: "139 9999 9999",
        address: "新的客户地址",
        paymentTermDays: 0,
      },
    });

    const updated = await updateSalesOrderDraft(prisma, sales, {
      salesOrderId: created.id,
      customerId: "customer-own",
      items: [
        { skuId: "sku-disc", quantity: 70, transactionPrice: "3.80" },
      ],
    });

    expect(updated).toMatchObject({
      id: created.id,
      customerSnapshot: created.customerSnapshot,
      totalAmountFen: 26_600,
      items: [
        expect.objectContaining({
          skuId: "sku-disc",
          availableQuantity: 50,
          quantity: 70,
          inventoryRisk: true,
          shortageQuantity: 20,
        }),
      ],
    });
    await expect(
      prisma.businessAudit.findMany({
        where: { objectId: created.id },
        orderBy: { occurredAt: "asc" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ action: "SALES_ORDER_DRAFT_CREATED" }),
      expect.objectContaining({ action: "SALES_ORDER_DRAFT_UPDATED" }),
    ]);
  });

  it("销售单列表先应用负责人数据范围并支持编号、客户、负责人、履约状态和日期筛选", async () => {
    const ownDraft = await createSalesOrderDraft(prisma, owner, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" }],
    });
    const otherDraft = await createSalesOrderDraft(prisma, owner, {
      customerId: "customer-other",
      items: [{ skuId: "sku-disc", quantity: 3, transactionPrice: "3.80" }],
    });
    await confirmSalesOrder(prisma, owner, ownDraft.id);
    const from = new Date(Date.now() - 60_000);
    const to = new Date(Date.now() + 60_000);

    await expect(
      listSalesOrdersPage(prisma, sales, {}, { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          id: ownDraft.id,
          canEdit: false,
          canDelete: false,
          canCancel: true,
          items: [
            {
              skuId: "sku-bolt",
              skuCode: "WJ-LS-001",
              skuName: "304 不锈钢六角螺栓 M8×30",
              inventoryUnit: "盒",
              quantity: 2,
            },
          ],
        }),
      ],
    });
    await expect(
      listSalesOrdersPage(
        prisma,
        owner,
        {
          query: otherDraft.salesOrderNumber.slice(-4),
          responsibleSalesId: otherSales.id,
          status: "DRAFT",
          createdFrom: from,
          createdTo: to,
        },
        { page: 1, pageSize: 20 },
      ),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: otherDraft.id })],
    });
    await expect(
      listSalesOrdersPage(
        prisma,
        owner,
        { query: "宏远装饰工程" },
        { page: 1, pageSize: 20 },
      ),
    ).resolves.toMatchObject({ total: 1 });
    for (const actor of [finance, warehouse]) {
      await expect(
        listSalesOrdersPage(prisma, actor, {}, { page: 1, pageSize: 20 }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      } satisfies Partial<SalesOrderServiceError>);
    }
  });

  it("停用资料和非法明细被拒绝，只有创建者或老板能编辑、删除草稿且删除保留审计", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 1, transactionPrice: "48.50" }],
    });

    await expect(
      updateSalesOrderDraft(prisma, otherSales, {
        salesOrderId: draft.id,
        customerId: "customer-own",
        items: [{ skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" }],
      }),
    ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
    for (const actor of [finance, warehouse]) {
      await expect(
        createSalesOrderDraft(prisma, actor, {
          customerId: "customer-own",
          items: [{ skuId: "sku-bolt", quantity: 1, transactionPrice: "48.50" }],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    await prisma.customer.update({
      where: { id: "customer-own" },
      data: { enabled: false },
    });
    await expect(
      createSalesOrderDraft(prisma, sales, {
        customerId: "customer-own",
        items: [{ skuId: "sku-bolt", quantity: 1, transactionPrice: "48.50" }],
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_AVAILABLE" });
    await prisma.customer.update({
      where: { id: "customer-own" },
      data: { enabled: true },
    });
    await prisma.sku.update({ where: { id: "sku-disc" }, data: { enabled: false } });
    await expect(
      createSalesOrderDraft(prisma, sales, {
        customerId: "customer-own",
        items: [{ skuId: "sku-disc", quantity: 1, transactionPrice: "3.80" }],
      }),
    ).rejects.toMatchObject({ code: "SKU_NOT_AVAILABLE" });

    for (const quantity of [0, -1, 1.5]) {
      await expect(
        createSalesOrderDraft(prisma, sales, {
          customerId: "customer-own",
          items: [{ skuId: "sku-bolt", quantity, transactionPrice: "48.50" }],
        }),
      ).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
    }
    for (const transactionPrice of ["-1", "1.234", "abc"]) {
      await expect(
        createSalesOrderDraft(prisma, sales, {
          customerId: "customer-own",
          items: [{ skuId: "sku-bolt", quantity: 1, transactionPrice }],
        }),
      ).rejects.toMatchObject({ code: "INVALID_TRANSACTION_PRICE" });
    }
    await expect(
      createSalesOrderDraft(prisma, sales, {
        customerId: "customer-own",
        items: [
          { skuId: "sku-bolt", quantity: 1, transactionPrice: "48.50" },
          { skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" },
        ],
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_SKU" });

    await expect(deleteSalesOrderDraft(prisma, otherSales, draft.id)).rejects.toMatchObject({
      code: "DRAFT_NOT_FOUND",
    });
    const deleted = await deleteSalesOrderDraft(prisma, owner, draft.id);
    expect(deleted).toMatchObject({
      id: draft.id,
      salesOrderNumber: draft.salesOrderNumber,
    });
    await expect(prisma.salesOrder.count({ where: { id: draft.id } })).resolves.toBe(0);
    await expect(
      prisma.businessAudit.findMany({ where: { objectId: draft.id } }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "SALES_ORDER_DRAFT_CREATED" }),
        expect.objectContaining({ action: "SALES_ORDER_DRAFT_DELETED" }),
      ]),
    );
  });

  it("编辑页读取在服务端同时校验草稿状态、创建者和客户当前负责人范围", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 2, transactionPrice: "48.50" }],
    });

    await expect(
      getSalesOrderDraftForEditing(prisma, sales, draft.id),
    ).resolves.toMatchObject({ id: draft.id, creatorId: sales.id });
    await expect(
      getSalesOrderDraftForEditing(prisma, owner, draft.id),
    ).resolves.toMatchObject({ id: draft.id });
    await expect(
      getSalesOrderDraftForEditing(prisma, otherSales, draft.id),
    ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });

    await prisma.customer.update({
      where: { id: "customer-own" },
      data: { responsibleSalesId: otherSales.id },
    });
    await expect(
      getSalesOrderDraftForEditing(prisma, sales, draft.id),
    ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
    await expect(
      getSalesOrderDraftForEditing(prisma, otherSales, draft.id),
    ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
    await expect(
      getSalesOrderDraftForEditing(prisma, owner, draft.id),
    ).resolves.toMatchObject({
      customerSnapshot: { responsibleSalesId: sales.id },
    });
  });

  it("业务审计写入失败时创建、编辑和删除草稿全部回滚", async () => {
    const draft = await createSalesOrderDraft(prisma, sales, {
      customerId: "customer-own",
      items: [{ skuId: "sku-bolt", quantity: 1, transactionPrice: "48.50" }],
    });
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_sales_order_draft_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action LIKE 'SALES_ORDER_DRAFT_%' THEN
          RAISE EXCEPTION 'forced sales order audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_sales_order_draft_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION fail_sales_order_draft_audit();
    `);

    try {
      await expect(
        createSalesOrderDraft(prisma, sales, {
          customerId: "customer-own",
          items: [{ skuId: "sku-disc", quantity: 2, transactionPrice: "3.80" }],
        }),
      ).rejects.toThrow("forced sales order audit failure");
      await expect(prisma.salesOrder.count()).resolves.toBe(1);

      await expect(
        updateSalesOrderDraft(prisma, sales, {
          salesOrderId: draft.id,
          customerId: "customer-own",
          items: [{ skuId: "sku-bolt", quantity: 9, transactionPrice: "48.50" }],
        }),
      ).rejects.toThrow("forced sales order audit failure");
      await expect(
        prisma.salesOrder.findUniqueOrThrow({
          where: { id: draft.id },
          include: { items: true },
        }),
      ).resolves.toMatchObject({
        totalAmountFen: 4_850,
        items: [expect.objectContaining({ quantity: 1, subtotalFen: 4_850 })],
      });

      await expect(
        deleteSalesOrderDraft(prisma, sales, draft.id),
      ).rejects.toThrow("forced sales order audit failure");
      await expect(prisma.salesOrder.count({ where: { id: draft.id } })).resolves.toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_sales_order_draft_audit_insert ON "business_audit";
        DROP FUNCTION IF EXISTS fail_sales_order_draft_audit();
      `);
    }
  });
});
