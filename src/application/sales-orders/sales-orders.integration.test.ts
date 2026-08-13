import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../auth/resolve-actor";
import {
  createSalesOrderDraft,
  deleteSalesOrderDraft,
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
