import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { getBusinessAudit } from "../accounts/account-service";
import { listBusinessAudit } from "../accounts/account-service";
import type { Actor } from "../auth/resolve-actor";
import {
  getOpeningInventorySource,
  listInventory,
  listInventoryPage,
  listInventoryMovements,
  listInventoryMovementsPage,
  listSkuAvailabilityForSales,
} from "../inventory/inventory-service";
import { PrismaClient } from "../../generated/prisma/client";
import { runRepositoryCommand } from "../../test-support/repository-command";
import {
  confirmOpeningInventoryImport,
  OpeningInventoryImportError,
  previewOpeningInventoryImport,
} from "./opening-inventory-import";

const owner: Actor = {
  id: "owner-user",
  name: "张伟",
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
const tokenContext = {
  secret: "opening-inventory-integration-secret-32-characters",
  now: new Date("2026-08-13T06:00:00.000Z"),
};

function createWorkbookFile(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["SKU 编码", "期初库存数量"],
      ...rows,
    ]),
    "期初库存导入",
  );
  return {
    name: "opening-inventory.xlsx",
    bytes: new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    ),
  };
}

describe("期初库存导入事务", () => {
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
      'TRUNCATE TABLE "inventory_movement", "inventory_balance", "data_import", "business_audit", "sku", "session", "account", "user_role", "user" CASCADE',
    );
    await prisma.user.create({
      data: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        roles: { create: { role: "OWNER" } },
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
          enabled: true,
        },
        {
          id: "sku-disc",
          skuCode: "WJ-QP-004",
          name: "树脂切割片 105mm",
          category: "切削耗材",
          inventoryUnit: "片",
          referencePriceFen: 380,
          warningThreshold: 15,
          enabled: true,
        },
        {
          id: "sku-disabled",
          skuCode: "WJ-TY-009",
          name: "停用测试 SKU",
          category: "测试",
          inventoryUnit: "个",
          referencePriceFen: 100,
          warningThreshold: 0,
          enabled: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("老板确认合法预览后可读取期初库存、来源流水和导入审计", async () => {
    const preview = await previewOpeningInventoryImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-LS-001", 120],
        ["WJ-QP-004", 60],
      ]),
      tokenContext,
    );
    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");

    const importStartedAt = new Date(Date.now() - 1_000);
    const imported = await confirmOpeningInventoryImport(
      prisma,
      owner,
      preview.previewToken,
      tokenContext,
    );
    const importFinishedAt = new Date(Date.now() + 1_000);

    await expect(listInventory(prisma, owner, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skuCode: "WJ-LS-001",
          onHandQuantity: 120,
          reservedQuantity: 0,
          availableQuantity: 120,
        }),
        expect.objectContaining({
          skuCode: "WJ-QP-004",
          onHandQuantity: 60,
          reservedQuantity: 0,
          availableQuantity: 60,
        }),
      ]),
    );
    await expect(
      listInventoryMovements(prisma, owner, { importId: imported.importId }),
    ).resolves.toEqual([
      expect.objectContaining({
        skuCode: "WJ-QP-004",
        movementType: "OPENING",
        onHandDelta: 60,
        onHandAfter: 60,
        availableAfter: 60,
        relatedId: imported.importId,
        relatedReference: "opening-inventory.xlsx",
      }),
      expect.objectContaining({
        skuCode: "WJ-LS-001",
        movementType: "OPENING",
        onHandDelta: 120,
        onHandAfter: 120,
        availableAfter: 120,
        relatedId: imported.importId,
        relatedReference: "opening-inventory.xlsx",
      }),
    ]);
    await expect(
      getOpeningInventorySource(prisma, warehouse, imported.importId),
    ).resolves.toMatchObject({
      id: imported.importId,
      fileName: "opening-inventory.xlsx",
      rowCount: 2,
      actor: { id: owner.id, name: owner.name },
      rows: [
        expect.objectContaining({ skuCode: "WJ-LS-001", quantity: 120 }),
        expect.objectContaining({ skuCode: "WJ-QP-004", quantity: 60 }),
      ],
    });
    await expect(
      getOpeningInventorySource(prisma, finance, imported.importId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      getBusinessAudit(prisma, owner, imported.auditId),
    ).resolves.toMatchObject({
      action: "OPENING_INVENTORY_IMPORTED",
      objectType: "DATA_IMPORT",
      objectId: imported.importId,
      summary: "通过 opening-inventory.xlsx 导入 2 个 SKU 的期初库存",
    });
    await expect(
      listInventoryMovements(prisma, owner, {
        movementType: "OPENING",
        dateFrom: importStartedAt,
        dateTo: importFinishedAt,
      }),
    ).resolves.toHaveLength(2);
    const movement = await prisma.inventoryMovement.findFirstOrThrow();
    await expect(
      prisma.inventoryMovement.update({
        where: { id: movement.id },
        data: { onHandDelta: 999 },
      }),
    ).rejects.toThrow("inventory_movement is append-only");
    await expect(
      prisma.inventoryMovement.delete({ where: { id: movement.id } }),
    ).rejects.toThrow("inventory_movement is append-only");
  });

  it("未知、重复、停用 SKU 与非法数量逐行返回且整批不写入", async () => {
    const preview = await previewOpeningInventoryImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-UNKNOWN", 1],
        ["WJ-LS-001", 4],
        ["WJ-LS-001", 5],
        ["WJ-TY-009", 3],
        ["WJ-QP-004", -1],
        ["WJ-QP-004", 1.5],
      ]),
      tokenContext,
    );

    expect(preview).toMatchObject({
      status: "invalid",
      errors: expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          field: "SKU 编码",
          reason: "SKU 编码不存在。",
        }),
        expect.objectContaining({
          rowNumber: 3,
          field: "SKU 编码",
          reason: "文件内 SKU 编码重复。",
        }),
        expect.objectContaining({
          rowNumber: 4,
          field: "SKU 编码",
          reason: "文件内 SKU 编码重复。",
        }),
        expect.objectContaining({
          rowNumber: 5,
          field: "SKU 编码",
          reason: "SKU 已停用，不能建立期初库存。",
        }),
        expect.objectContaining({
          rowNumber: 6,
          field: "期初库存数量",
          reason: "必须是非负整数。",
        }),
        expect.objectContaining({
          rowNumber: 7,
          field: "期初库存数量",
          reason: "必须是非负整数。",
        }),
      ]),
    });
    expect("previewToken" in preview).toBe(false);
    await expect(listInventory(prisma, owner, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ onHandQuantity: 0, reservedQuantity: 0 }),
      ]),
    );
    await expect(listInventoryMovements(prisma, owner, {})).resolves.toEqual([]);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([]);
  });

  it("公式单元格即使带缓存值也只进入错误区", async () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["SKU 编码", "期初库存数量"],
      ["WJ-LS-001", 120],
      ["WJ-QP-004", 60],
    ]);
    worksheet.B2 = { t: "n", f: "60+60", v: 120 };
    XLSX.utils.book_append_sheet(workbook, worksheet, "期初库存导入");

    const preview = await previewOpeningInventoryImport(
      prisma,
      owner,
      {
        name: "opening-inventory.xlsx",
        bytes: new Uint8Array(
          XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
        ),
      },
      tokenContext,
    );

    expect(preview).toMatchObject({
      status: "invalid",
      validRows: [
        expect.objectContaining({ rowNumber: 3, skuCode: "WJ-QP-004" }),
      ],
      errors: [
        expect.objectContaining({
          rowNumber: 2,
          field: "期初库存数量",
          reason: "不接受公式，请粘贴静态值。",
        }),
      ],
    });
  });

  it("重复确认、第二批期初库存和销售库存活动后导入都被拒绝", async () => {
    const preview = await previewOpeningInventoryImport(
      prisma,
      owner,
      createWorkbookFile([["WJ-LS-001", 120]]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");
    await confirmOpeningInventoryImport(
      prisma,
      owner,
      preview.previewToken,
      tokenContext,
    );

    await expect(
      confirmOpeningInventoryImport(
        prisma,
        owner,
        preview.previewToken,
        tokenContext,
      ),
    ).rejects.toMatchObject({
      code: "DUPLICATE_SUBMISSION",
    } satisfies Partial<OpeningInventoryImportError>);
    await expect(
      previewOpeningInventoryImport(
        prisma,
        owner,
        createWorkbookFile([["WJ-QP-004", 60]]),
        tokenContext,
      ),
    ).rejects.toMatchObject({
      code: "OPENING_ALREADY_IMPORTED",
    } satisfies Partial<OpeningInventoryImportError>);

    await prisma.inventoryMovement.create({
      data: {
        id: "sales-activity",
        skuId: "sku-bolt",
        movementType: "RESERVATION",
        onHandDelta: 0,
        reservedDelta: 1,
        onHandAfter: 120,
        reservedAfter: 1,
        relatedType: "SALES_ORDER",
        relatedId: "sales-order-1",
        relatedReference: "XSD-TEST-001",
        actorId: owner.id,
        actorName: owner.name,
      },
    });
    await expect(
      previewOpeningInventoryImport(
        prisma,
        owner,
        createWorkbookFile([["WJ-QP-004", 60]]),
        tokenContext,
      ),
    ).rejects.toMatchObject({
      code: "SALES_INVENTORY_ACTIVITY_EXISTS",
    } satisfies Partial<OpeningInventoryImportError>);
  });

  it("确认末段业务审计失败时余额、流水和导入记录全部回滚", async () => {
    const preview = await previewOpeningInventoryImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-LS-001", 120],
        ["WJ-QP-004", 60],
      ]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_opening_inventory_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW."action" = 'OPENING_INVENTORY_IMPORTED' THEN
          RAISE EXCEPTION 'forced opening inventory audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_opening_inventory_audit
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION reject_opening_inventory_audit();
    `);

    await expect(
      confirmOpeningInventoryImport(
        prisma,
        owner,
        preview.previewToken,
        tokenContext,
      ),
    ).rejects.toThrow("forced opening inventory audit failure");
    await expect(listInventory(prisma, owner, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ onHandQuantity: 0, reservedQuantity: 0 }),
      ]),
    );
    await expect(listInventoryMovements(prisma, owner, {})).resolves.toEqual([]);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([]);
    await expect(
      prisma.dataImport.findMany({ where: { importType: "OPENING_INVENTORY" } }),
    ).resolves.toEqual([]);
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_opening_inventory_audit ON "business_audit"',
    );
    await prisma.$executeRawUnsafe(
      "DROP FUNCTION reject_opening_inventory_audit()",
    );
  });

  it("非老板不能预览或复用老板的期初库存预览", async () => {
    const preview = await previewOpeningInventoryImport(
      prisma,
      owner,
      createWorkbookFile([["WJ-LS-001", 120]]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");

    await expect(
      previewOpeningInventoryImport(
        prisma,
        sales,
        createWorkbookFile([["WJ-LS-001", 120]]),
        tokenContext,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      confirmOpeningInventoryImport(
        prisma,
        sales,
        preview.previewToken,
        tokenContext,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("库存查询按启用 SKU 计算预警，角色只能读取职责所需数量", async () => {
    const preview = await previewOpeningInventoryImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-LS-001", 20],
        ["WJ-QP-004", 16],
      ]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");
    await confirmOpeningInventoryImport(
      prisma,
      owner,
      preview.previewToken,
      tokenContext,
    );
    await prisma.$transaction([
      prisma.inventoryBalance.update({
        where: { skuId: "sku-disc" },
        data: { reservedQuantity: 10 },
      }),
      prisma.inventoryMovement.create({
        data: {
          id: "reservation-movement",
          skuId: "sku-disc",
          movementType: "RESERVATION",
          onHandDelta: 0,
          reservedDelta: 10,
          onHandAfter: 16,
          reservedAfter: 10,
          relatedType: "SALES_ORDER",
          relatedId: "sales-order-reservation",
          relatedReference: "XSD-TEST-RESERVATION",
          actorId: owner.id,
          actorName: owner.name,
        },
      }),
    ]);

    await expect(
      listInventory(prisma, owner, { inventoryWarning: true }),
    ).resolves.toEqual([
      expect.objectContaining({
        skuCode: "WJ-LS-001",
        availableQuantity: 20,
        warningThreshold: 20,
        inventoryWarning: true,
      }),
      expect.objectContaining({
        skuCode: "WJ-QP-004",
        onHandQuantity: 16,
        reservedQuantity: 10,
        availableQuantity: 6,
        warningThreshold: 15,
        inventoryWarning: true,
      }),
    ]);
    await expect(listInventory(prisma, warehouse, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skuCode: "WJ-LS-001", onHandQuantity: 20 }),
      ]),
    );
    await expect(listInventory(prisma, sales, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(listInventory(prisma, finance, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      listInventoryPage(
        prisma,
        owner,
        { inventoryWarning: true },
        { page: 1, pageSize: 1, sort: "skuCode", direction: "asc" },
      ),
    ).resolves.toMatchObject({
      total: 2,
      totalPages: 2,
      items: [expect.objectContaining({ skuCode: "WJ-LS-001" })],
    });
    await expect(
      listInventoryMovementsPage(
        prisma,
        warehouse,
        {},
        { page: 1, pageSize: 1, sort: "occurredAt", direction: "desc" },
      ),
    ).resolves.toMatchObject({ total: 3, totalPages: 3, items: [expect.any(Object)] });

    const availability = await listSkuAvailabilityForSales(prisma, sales, {
      query: "WJ-LS",
    });
    expect(availability).toEqual([
      {
        skuId: "sku-bolt",
        skuCode: "WJ-LS-001",
        name: "304 不锈钢六角螺栓 M8×30",
        inventoryUnit: "盒",
        referencePriceFen: 4_850,
        availableQuantity: 20,
      },
    ]);
    expect(availability[0]).not.toHaveProperty("onHandQuantity");
    expect(availability[0]).not.toHaveProperty("reservedQuantity");
  });
});
