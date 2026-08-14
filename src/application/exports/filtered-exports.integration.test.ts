import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { PrismaClient } from "../../generated/prisma/client";
import { runRepositoryCommand } from "../../test-support/repository-command";
import type { Actor } from "../auth/resolve-actor";
import {
  exportFilteredWorkbook,
  FilteredExportError,
  type FilteredExportRequest,
} from "./filtered-export-service";

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
  email: "other-sales@example.local",
  roles: ["SALES"],
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

function worksheetRows(bytes: Uint8Array, sheetName: string): unknown[][] {
  const workbook = XLSX.read(bytes, { type: "array" });
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, {
    header: 1,
    raw: true,
  });
}

describe("按权限和筛选条件导出", () => {
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
    await runRepositoryCommand("db:migrate", [], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  }, 120_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "inventory_movement", "inventory_balance", "business_audit", "receivable", "sales_order", "customer", "sku", "user_role", "user" CASCADE',
    );
    await prisma.user.createMany({
      data: [owner, sales, otherSales, finance, warehouse].map(
        ({ id, name, email }) => ({
        id,
        name,
        email,
        }),
      ),
    });
    await prisma.userRole.createMany({
      data: [owner, sales, otherSales, finance, warehouse].flatMap((actor) =>
        actor.roles.map((role) => ({ userId: actor.id, role })),
      ),
    });
    await prisma.customer.createMany({
      data: [
        {
          id: "customer-sales",
          customerCode: "KH-0001",
          name: "目标五金商行",
          contactName: "李海峰",
          phone: "138 0000 0000",
          address: "深圳市测试路 1 号",
          responsibleSalesId: sales.id,
          paymentTermDays: 30,
        },
        {
          id: "customer-other-sales",
          customerCode: "KH-0002",
          name: "目标机电商行",
          contactName: "周志成",
          phone: "136 0000 0000",
          address: "深圳市测试路 2 号",
          responsibleSalesId: otherSales.id,
          paymentTermDays: 15,
        },
      ],
    });
    await prisma.salesOrder.createMany({
      data: [
        {
          id: "order-visible-outbound",
          salesOrderNumber: "XSD-20260814-0001",
          status: "OUTBOUND",
          customerId: "customer-sales",
          creatorId: sales.id,
          customerCodeSnapshot: "KH-0001",
          customerNameSnapshot: "目标五金商行",
          customerContactNameSnapshot: "李海峰",
          customerPhoneSnapshot: "138 0000 0000",
          customerAddressSnapshot: "深圳市测试路 1 号",
          responsibleSalesIdSnapshot: sales.id,
          responsibleSalesNameSnapshot: sales.name,
          paymentTermDaysSnapshot: 30,
          totalAmountFen: 12_345,
          createdAt: new Date("2026-08-13T16:00:00.000Z"),
          updatedAt: new Date("2026-08-14T02:03:00.000Z"),
        },
        {
          id: "order-visible-draft",
          salesOrderNumber: "XSD-20260814-0002",
          status: "DRAFT",
          customerId: "customer-sales",
          creatorId: sales.id,
          customerCodeSnapshot: "KH-0001",
          customerNameSnapshot: "目标五金商行",
          customerContactNameSnapshot: "李海峰",
          customerPhoneSnapshot: "138 0000 0000",
          customerAddressSnapshot: "深圳市测试路 1 号",
          responsibleSalesIdSnapshot: sales.id,
          responsibleSalesNameSnapshot: sales.name,
          paymentTermDaysSnapshot: 30,
          totalAmountFen: 20_000,
        },
        {
          id: "order-other-sales",
          salesOrderNumber: "XSD-20260814-0003",
          status: "OUTBOUND",
          customerId: "customer-other-sales",
          creatorId: otherSales.id,
          customerCodeSnapshot: "KH-0002",
          customerNameSnapshot: "目标机电商行",
          customerContactNameSnapshot: "周志成",
          customerPhoneSnapshot: "136 0000 0000",
          customerAddressSnapshot: "深圳市测试路 2 号",
          responsibleSalesIdSnapshot: otherSales.id,
          responsibleSalesNameSnapshot: otherSales.name,
          paymentTermDaysSnapshot: 15,
          totalAmountFen: 99_900,
        },
      ],
    });
    await prisma.receivable.createMany({
      data: [
        {
          id: "receivable-partial",
          receivableNumber: "YS-20260814-0001",
          salesOrderId: "order-visible-outbound",
          customerId: "customer-sales",
          customerCodeSnapshot: "KH-0001",
          customerNameSnapshot: "目标五金商行",
          responsibleSalesIdSnapshot: sales.id,
          originalAmountFen: 12_345,
          receivedAmountFen: 2_300,
          remainingAmountFen: 10_045,
          paymentTermDaysSnapshot: 30,
          outboundAt: new Date("2026-08-14T02:03:00.000Z"),
          dueDate: new Date("2026-08-13T00:00:00.000Z"),
          status: "PARTIAL",
        },
        {
          id: "receivable-settled",
          receivableNumber: "YS-20260814-0002",
          salesOrderId: "order-other-sales",
          customerId: "customer-other-sales",
          customerCodeSnapshot: "KH-0002",
          customerNameSnapshot: "目标机电商行",
          responsibleSalesIdSnapshot: otherSales.id,
          originalAmountFen: 99_900,
          receivedAmountFen: 99_900,
          remainingAmountFen: 0,
          paymentTermDaysSnapshot: 15,
          outboundAt: new Date("2026-08-14T03:00:00.000Z"),
          dueDate: new Date("2026-08-29T00:00:00.000Z"),
          status: "SETTLED",
        },
      ],
    });
    await prisma.sku.createMany({
      data: [
        {
          id: "sku-target",
          skuCode: "WJ-LS-001",
          name: "304 不锈钢六角螺栓 M8×30",
          category: "紧固件",
          inventoryUnit: "盒",
          referencePriceFen: 4_850,
          warningThreshold: 10,
        },
        {
          id: "sku-other",
          skuCode: "WJ-QP-004",
          name: "树脂切割片 105mm",
          category: "切削耗材",
          inventoryUnit: "片",
          referencePriceFen: 380,
          warningThreshold: 20,
        },
      ],
    });
    await prisma.inventoryMovement.createMany({
      data: [
        {
          id: "movement-target",
          skuId: "sku-target",
          movementType: "OUTBOUND",
          onHandDelta: -20,
          reservedDelta: -20,
          onHandAfter: 100,
          reservedAfter: 40,
          occurredAt: new Date("2026-08-14T02:12:00.000Z"),
          relatedType: "SALES_ORDER",
          relatedId: "order-visible-outbound",
          relatedReference: "XSD-TARGET-0001",
          actorId: warehouse.id,
          actorName: warehouse.name,
        },
        {
          id: "movement-other-reference",
          skuId: "sku-other",
          movementType: "OUTBOUND",
          onHandDelta: -3,
          reservedDelta: -3,
          onHandAfter: 57,
          reservedAfter: 7,
          occurredAt: new Date("2026-08-14T03:00:00.000Z"),
          relatedType: "SALES_ORDER",
          relatedId: "order-other-sales",
          relatedReference: "XSD-OTHER-0002",
          actorId: warehouse.id,
          actorName: warehouse.name,
        },
        {
          id: "movement-reservation",
          skuId: "sku-target",
          movementType: "RESERVATION",
          onHandDelta: 0,
          reservedDelta: 20,
          onHandAfter: 120,
          reservedAfter: 60,
          occurredAt: new Date("2026-08-14T01:26:00.000Z"),
          relatedType: "SALES_ORDER",
          relatedId: "order-visible-outbound",
          relatedReference: "XSD-TARGET-0001",
          actorId: sales.id,
          actorName: sales.name,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("销售按页面筛选导出时只包含自己负责客户的销售单并留下审计", async () => {
    const exportedAt = new Date("2026-08-14T06:30:00.000Z");

    const result = await exportFilteredWorkbook(
      prisma,
      sales,
      {
        kind: "SALES_ORDERS",
        filters: { query: "目标", status: "OUTBOUND" },
      },
      { now: exportedAt },
    );

    expect(result.fileName).toBe("销售单-20260814-143000.xlsx");
    expect(result.rowCount).toBe(1);
    expect(worksheetRows(result.bytes, "销售单")).toEqual([
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
      [
        "XSD-20260814-0001",
        "目标五金商行",
        "陈敏",
        0,
        123.45,
        "已出库",
        "2026-08-14",
        "2026-08-14 10:03:00",
      ],
    ]);
    await expect(
      prisma.businessAudit.findUnique({ where: { id: result.auditId } }),
    ).resolves.toMatchObject({
      actorId: sales.id,
      actorName: sales.name,
      action: "DATA_EXPORTED",
      objectType: "SALES_ORDER_EXPORT",
      objectId: result.auditId,
      occurredAt: exportedAt,
      referenceCode: "销售单",
      summary: "导出销售单 1 条；筛选：搜索=目标、履约状态=已出库",
    });
  });

  it("财务按应收筛选导出正式金额和结算字段并留下审计", async () => {
    const exportedAt = new Date("2026-08-14T06:35:00.000Z");

    const result = await exportFilteredWorkbook(
      prisma,
      finance,
      {
        kind: "RECEIVABLES",
        filters: {
          status: "PARTIAL",
          overdueOnly: true,
          responsibleSalesId: sales.id,
        },
      },
      { now: exportedAt },
    );

    expect(result.fileName).toBe("应收-20260814-143500.xlsx");
    expect(result.rowCount).toBe(1);
    expect(worksheetRows(result.bytes, "应收")).toEqual([
      [
        "应收编号",
        "客户编码",
        "客户名称",
        "客户负责人",
        "销售单编号",
        "原始金额（人民币元）",
        "累计收款（人民币元）",
        "未收金额（人民币元）",
        "到期日",
        "结算状态",
        "逾期状态",
      ],
      [
        "YS-20260814-0001",
        "KH-0001",
        "目标五金商行",
        "陈敏",
        "XSD-20260814-0001",
        123.45,
        23,
        100.45,
        "2026-08-13",
        "部分收款",
        "逾期 1 天",
      ],
    ]);
    await expect(
      prisma.businessAudit.findUnique({ where: { id: result.auditId } }),
    ).resolves.toMatchObject({
      actorId: finance.id,
      action: "DATA_EXPORTED",
      objectType: "RECEIVABLE_EXPORT",
      occurredAt: exportedAt,
      referenceCode: "应收",
      summary:
        "导出应收 1 条；筛选：客户负责人=sales-user、结算状态=部分收款、仅看逾期",
    });
  });

  it("仓库按流水筛选导出数量追溯字段且不包含成交价和应收字段", async () => {
    const exportedAt = new Date("2026-08-14T06:40:00.000Z");

    const result = await exportFilteredWorkbook(
      prisma,
      warehouse,
      {
        kind: "INVENTORY_MOVEMENTS",
        filters: {
          movementType: "OUTBOUND",
          relatedReference: "XSD-TARGET",
          actor: "王",
        },
      },
      { now: exportedAt },
    );

    expect(result.fileName).toBe("库存流水-20260814-144000.xlsx");
    expect(result.rowCount).toBe(1);
    const rows = worksheetRows(result.bytes, "库存流水");
    expect(rows).toEqual([
      [
        "发生时间",
        "SKU 编码",
        "SKU 名称",
        "库存单位",
        "流水类型",
        "现存量变化",
        "预占量变化",
        "变化后现存量",
        "变化后预占量",
        "变化后可用量",
        "关联类型",
        "关联编号",
        "操作者",
      ],
      [
        "2026-08-14 10:12:00",
        "WJ-LS-001",
        "304 不锈钢六角螺栓 M8×30",
        "盒",
        "出库",
        -20,
        -20,
        100,
        40,
        60,
        "销售单",
        "XSD-TARGET-0001",
        "王强",
      ],
    ]);
    expect(rows[0]).not.toEqual(
      expect.arrayContaining([
        "成交价",
        "应收",
        "收款",
        "原始金额（人民币元）",
      ]),
    );
    await expect(
      prisma.businessAudit.findUnique({ where: { id: result.auditId } }),
    ).resolves.toMatchObject({
      actorId: warehouse.id,
      action: "DATA_EXPORTED",
      objectType: "INVENTORY_MOVEMENT_EXPORT",
      occurredAt: exportedAt,
      referenceCode: "库存流水",
      summary:
        "导出库存流水 1 条；筛选：流水类型=出库、关联编号=XSD-TARGET、操作者=王",
    });
  });

  it("老板可以按各自筛选导出销售单、应收和库存流水", async () => {
    const requests: FilteredExportRequest[] = [
      { kind: "SALES_ORDERS", filters: { status: "DRAFT" } },
      { kind: "RECEIVABLES", filters: { status: "SETTLED" } },
      {
        kind: "INVENTORY_MOVEMENTS",
        filters: { movementType: "RESERVATION" },
      },
    ];

    for (const request of requests) {
      await expect(
        exportFilteredWorkbook(prisma, owner, request),
      ).resolves.toMatchObject({ rowCount: 1 });
    }
    await expect(
      prisma.businessAudit.count({ where: { action: "DATA_EXPORTED" } }),
    ).resolves.toBe(3);
  });

  it.each([
    [warehouse, { kind: "SALES_ORDERS", filters: {} }],
    [finance, { kind: "SALES_ORDERS", filters: {} }],
    [sales, { kind: "RECEIVABLES", filters: {} }],
    [warehouse, { kind: "RECEIVABLES", filters: {} }],
    [sales, { kind: "INVENTORY_MOVEMENTS", filters: {} }],
    [finance, { kind: "INVENTORY_MOVEMENTS", filters: {} }],
  ] as Array<[Actor, FilteredExportRequest]>) (
    "%s 不能导出越权业务数据",
    async (actor, request) => {
      await expect(
        exportFilteredWorkbook(prisma, actor, request),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(prisma.businessAudit.count()).resolves.toBe(0);
    },
  );

  it("当前权限与筛选下没有记录时给出清楚反馈且不生成成功审计", async () => {
    await expect(
      exportFilteredWorkbook(prisma, sales, {
        kind: "SALES_ORDERS",
        filters: { query: "不存在的销售单" },
      }),
    ).rejects.toEqual(
      new FilteredExportError(
        "EMPTY_RESULT",
        "当前权限与筛选条件下没有可导出的销售单。",
      ),
    );
    await expect(prisma.businessAudit.count()).resolves.toBe(0);
  });

  it("工作簿生成失败时不留下成功审计", async () => {
    await expect(
      exportFilteredWorkbook(
        prisma,
        sales,
        { kind: "SALES_ORDERS", filters: { status: "OUTBOUND" } },
        {
          writeWorkbook() {
            throw new Error("模拟工作簿生成失败");
          },
        },
      ),
    ).rejects.toThrow("模拟工作簿生成失败");
    await expect(prisma.businessAudit.count()).resolves.toBe(0);
  });
});
