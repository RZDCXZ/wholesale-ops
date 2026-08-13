import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "../auth/resolve-actor";
import {
  createSku,
  deleteSku,
  disableSku,
  getSku,
  getSkuInventorySummary,
  listSkus,
  listSkusPage,
  SkuServiceError,
  updateSku,
} from "./sku-service";
import { PrismaClient } from "../../generated/prisma/client";

const execFileAsync = promisify(execFile);

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

describe("SKU 资料管理", () => {
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
      'TRUNCATE TABLE "business_audit", "sku", "session", "account", "user_role", "user" CASCADE',
    );
    await prisma.user.create({
      data: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        roles: { create: { role: "OWNER" } },
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("老板创建 SKU 后可从列表读取定点价格、整数预警值、零库存与审计", async () => {
    const sku = await createSku(prisma, owner, {
      skuCode: "WJ-LS-001",
      name: "304 不锈钢六角螺栓 M8×30",
      category: "紧固件",
      inventoryUnit: "盒",
      referencePrice: "48.50",
      warningThreshold: 20,
      enabled: true,
    });

    expect(sku).toMatchObject({
      skuCode: "WJ-LS-001",
      referencePriceFen: 4_850,
      warningThreshold: 20,
      onHandQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
    });
    await expect(listSkus(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({
        id: sku.id,
        skuCode: "WJ-LS-001",
        referencePriceFen: 4_850,
      }),
    ]);
    await expect(
      prisma.businessAudit.findMany({ where: { objectId: sku.id } }),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "SKU_CREATED",
        objectType: "SKU",
        referenceCode: "WJ-LS-001",
      }),
    ]);
  });

  it("SKU 编码重复时明确拒绝，而名称可以重复", async () => {
    const baseInput = {
      skuCode: "WJ-QP-004",
      name: "树脂切割片 105mm",
      category: "切削耗材",
      inventoryUnit: "片",
      referencePrice: "3.80",
      warningThreshold: 10,
      enabled: true,
    } as const;

    await createSku(prisma, owner, baseInput);
    await expect(
      createSku(prisma, owner, { ...baseInput, skuCode: "WJ-QP-005" }),
    ).resolves.toMatchObject({ name: baseInput.name });
    await expect(createSku(prisma, owner, baseInput)).rejects.toMatchObject({
      code: "SKU_CODE_EXISTS",
      message: "SKU 编码已被使用。",
    } satisfies Partial<SkuServiceError>);
  });

  it.each(["48.501", "-1.00", "12 元"])(
    "参考售价 %s 不是最多精确到分的非负人民币金额时拒绝创建",
    async (referencePrice) => {
      await expect(
        createSku(prisma, owner, {
          skuCode: "WJ-JG-001",
          name: "角磨机",
          category: "电动工具",
          inventoryUnit: "台",
          referencePrice,
          warningThreshold: 2,
          enabled: true,
        }),
      ).rejects.toMatchObject({
        code: "INVALID_REFERENCE_PRICE",
        message: "参考售价必须是最多两位小数的非负人民币金额。",
      } satisfies Partial<SkuServiceError>);
    },
  );

  it.each([1.5, -1])("预警值 %s 不是非负整数时拒绝创建", async (warningThreshold) => {
    await expect(
      createSku(prisma, owner, {
        skuCode: "WJ-JG-002",
        name: "充电角磨机",
        category: "电动工具",
        inventoryUnit: "台",
        referencePrice: "588.00",
        warningThreshold,
        enabled: true,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_WARNING_THRESHOLD",
      message: "预警值必须是非负整数。",
    } satisfies Partial<SkuServiceError>);
  });

  it("老板可以编辑可变资料，但服务端拒绝修改 SKU 编码", async () => {
    const sku = await createSku(prisma, owner, {
      skuCode: "WJ-LS-001",
      name: "六角螺栓",
      category: "紧固件",
      inventoryUnit: "盒",
      referencePrice: "48.50",
      warningThreshold: 20,
      enabled: true,
    });

    const tamperedUpdate = {
      skuId: sku.id,
      skuCode: "WJ-LS-HACK",
      name: "304 不锈钢六角螺栓 M8×30",
      category: "紧固件",
      inventoryUnit: "盒",
      referencePrice: "50.00",
      warningThreshold: 18,
      enabled: true,
    };
    await expect(updateSku(prisma, owner, tamperedUpdate)).rejects.toMatchObject({
      code: "SKU_CODE_IMMUTABLE",
      message: "SKU 编码创建后不能修改。",
    } satisfies Partial<SkuServiceError>);

    await expect(
      updateSku(prisma, owner, {
        skuId: sku.id,
        name: "304 不锈钢六角螺栓 M8×30",
        category: "不锈钢紧固件",
        referencePrice: "50.00",
        warningThreshold: 18,
      }),
    ).resolves.toMatchObject({
      skuCode: "WJ-LS-001",
      name: "304 不锈钢六角螺栓 M8×30",
      category: "不锈钢紧固件",
      referencePriceFen: 5_000,
      warningThreshold: 18,
    });
    await expect(getSku(prisma, owner, sku.id)).resolves.toMatchObject({
      skuCode: "WJ-LS-001",
    });
    await expect(
      prisma.businessAudit.findMany({
        where: { objectId: sku.id },
        orderBy: { occurredAt: "asc" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ action: "SKU_CREATED" }),
      expect.objectContaining({
        action: "SKU_UPDATED",
        summary:
          "名称由「六角螺栓」调整为「304 不锈钢六角螺栓 M8×30」；分类由「紧固件」调整为「不锈钢紧固件」；参考售价由 ¥48.50 调整为 ¥50.00；预警值由 20 调整为 18",
      }),
    ]);
  });

  it("服务端拒绝通过普通编辑修改库存单位或启用状态", async () => {
    const sku = await createSku(prisma, owner, {
      skuCode: "WJ-IMMUTABLE-UNIT",
      name: "固定单位测试",
      category: "测试",
      inventoryUnit: "盒",
      referencePrice: "10.00",
      warningThreshold: 1,
      enabled: true,
    });
    const editable = {
      skuId: sku.id,
      name: sku.name,
      category: sku.category,
      referencePrice: "10.00",
      warningThreshold: 1,
    };

    const tamperedUnit = { ...editable, inventoryUnit: "片" };
    const tamperedStatus = { ...editable, enabled: false };
    await expect(updateSku(prisma, owner, tamperedUnit)).rejects.toMatchObject({
      code: "INVENTORY_UNIT_IMMUTABLE",
      message: "库存单位创建后不能修改。",
    } satisfies Partial<SkuServiceError>);
    await expect(updateSku(prisma, owner, tamperedStatus)).rejects.toMatchObject({
      code: "SKU_STATUS_REQUIRES_ACTION",
      message: "请使用专门的停用操作变更 SKU 状态。",
    } satisfies Partial<SkuServiceError>);
  });

  it("老板和销售可组合筛选 SKU，销售目录始终只返回启用 SKU", async () => {
    const enabledBolt = await createSku(prisma, owner, {
      skuCode: "WJ-LS-001",
      name: "六角螺栓 M8×30",
      category: "紧固件",
      inventoryUnit: "盒",
      referencePrice: "48.50",
      warningThreshold: 20,
      enabled: true,
    });
    await createSku(prisma, owner, {
      skuCode: "WJ-LS-002",
      name: "六角螺栓 M10×40",
      category: "紧固件",
      inventoryUnit: "盒",
      referencePrice: "68.00",
      warningThreshold: 12,
      enabled: false,
    });
    await createSku(prisma, owner, {
      skuCode: "WJ-QP-004",
      name: "树脂切割片 105mm",
      category: "切削耗材",
      inventoryUnit: "片",
      referencePrice: "3.80",
      warningThreshold: 10,
      enabled: true,
    });

    await expect(
      listSkus(prisma, owner, {
        query: "m8×30",
        category: "紧固件",
        enabled: true,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: enabledBolt.id })]);
    await expect(listSkus(prisma, sales, {})).resolves.toHaveLength(2);
    await expect(
      listSkus(prisma, sales, { enabled: false }),
    ).resolves.toEqual([]);
    await expect(
      listSkus(prisma, owner, { inventoryWarning: true }),
    ).resolves.toEqual([
      expect.objectContaining({ skuCode: "WJ-QP-004", enabled: true }),
      expect.objectContaining({ skuCode: "WJ-LS-001", enabled: true }),
    ]);
    await expect(
      listSkusPage(prisma, owner, { category: "紧固件" }, { page: 2, pageSize: 1 }),
    ).resolves.toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    await expect(
      listSkusPage(
        prisma,
        owner,
        {},
        { page: 1, pageSize: 20, sort: "skuCode", direction: "asc" },
      ),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ skuCode: "WJ-LS-001" }),
        expect.objectContaining({ skuCode: "WJ-LS-002" }),
        expect.objectContaining({ skuCode: "WJ-QP-004" }),
      ],
    });
  });

  it.each([sales, warehouse, finance])(
    "$name 不能调用老板的 SKU 维护能力",
    async (actor) => {
      await expect(
        createSku(prisma, actor, {
          skuCode: "WJ-YQ-001",
          name: "维护越权测试",
          category: "测试",
          inventoryUnit: "个",
          referencePrice: "1.00",
          warningThreshold: 0,
          enabled: true,
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "没有访问权限。",
      } satisfies Partial<SkuServiceError>);
    },
  );

  it.each([warehouse, finance])(
    "$name 不能直接读取 SKU 目录",
    async (actor) => {
      await expect(listSkus(prisma, actor, {})).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "没有访问权限。",
      } satisfies Partial<SkuServiceError>);
    },
  );

  it("库存流水入口只向老板和仓库提供必要 SKU 摘要", async () => {
    const sku = await createSku(prisma, owner, {
      skuCode: "WJ-LEDGER-001",
      name: "流水筛选测试 SKU",
      category: "测试",
      inventoryUnit: "个",
      referencePrice: "12.00",
      warningThreshold: 2,
      enabled: false,
    });

    await expect(
      getSkuInventorySummary(prisma, warehouse, sku.id),
    ).resolves.toMatchObject({
      skuCode: "WJ-LEDGER-001",
      onHandQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
    });
    await expect(
      getSkuInventorySummary(prisma, finance, sku.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<SkuServiceError>);
  });

  it("老板停用 SKU 后销售目录不再返回它，并留下停用审计", async () => {
    const sku = await createSku(prisma, owner, {
      skuCode: "WJ-ZT-008",
      name: "高速钢直柄麻花钻 8mm",
      category: "钻削工具",
      inventoryUnit: "支",
      referencePrice: "18.90",
      warningThreshold: 12,
      enabled: true,
    });

    await expect(
      disableSku(prisma, owner, { skuId: sku.id, confirmed: true }),
    ).resolves.toMatchObject({ enabled: false });
    await expect(listSkus(prisma, sales, {})).resolves.toEqual([]);
    await expect(getSku(prisma, sales, sku.id)).rejects.toMatchObject({
      code: "SKU_NOT_FOUND",
    } satisfies Partial<SkuServiceError>);
    await expect(
      prisma.businessAudit.findFirst({
        where: { objectId: sku.id, action: "SKU_DISABLED" },
      }),
    ).resolves.toMatchObject({ referenceCode: "WJ-ZT-008" });
  });

  it("尚未被业务记录引用的 SKU 可以删除且保留删除审计", async () => {
    const sku = await createSku(prisma, owner, {
      skuCode: "WJ-LS-DELETE",
      name: "待删除螺栓",
      category: "紧固件",
      inventoryUnit: "盒",
      referencePrice: "8.00",
      warningThreshold: 0,
      enabled: false,
    });

    await expect(
      deleteSku(prisma, owner, { skuId: sku.id, confirmed: true }),
    ).resolves.toEqual({
      id: sku.id,
      skuCode: "WJ-LS-DELETE",
      auditId: expect.any(String),
    });
    await expect(getSku(prisma, owner, sku.id)).rejects.toMatchObject({
      code: "SKU_NOT_FOUND",
    } satisfies Partial<SkuServiceError>);
    await expect(
      prisma.businessAudit.findFirst({
        where: { objectId: sku.id, action: "SKU_DELETED" },
      }),
    ).resolves.toMatchObject({ referenceCode: "WJ-LS-DELETE" });
  });

  it("SKU 已被业务记录引用时拒绝删除并给出可停用反馈", async () => {
    const sku = await createSku(prisma, owner, {
      skuCode: "WJ-LS-REFERENCED",
      name: "已引用螺栓",
      category: "紧固件",
      inventoryUnit: "盒",
      referencePrice: "28.00",
      warningThreshold: 5,
      enabled: true,
    });
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "sku_business_reference_test" (
        "id" TEXT PRIMARY KEY,
        "skuId" TEXT NOT NULL REFERENCES "sku"("id") ON DELETE RESTRICT
      )
    `);
    await prisma.$executeRaw`
      INSERT INTO "sku_business_reference_test" ("id", "skuId")
      VALUES ('reference-1', ${sku.id})
    `;

    await expect(getSku(prisma, owner, sku.id)).resolves.toMatchObject({
      hasBusinessReferences: true,
    });

    await expect(
      deleteSku(prisma, owner, { skuId: sku.id, confirmed: true }),
    ).rejects.toMatchObject({
      code: "SKU_REFERENCED",
      message: "SKU 已被业务记录引用，不能删除；请改为停用。",
    } satisfies Partial<SkuServiceError>);
    await expect(getSku(prisma, owner, sku.id)).resolves.toMatchObject({
      skuCode: "WJ-LS-REFERENCED",
    });
  });

  it("创建、编辑、停用和删除在审计写入失败时全部回滚", async () => {
    const createInput = {
      skuCode: "WJ-ATOMIC-001",
      name: "原子性测试 SKU",
      category: "测试",
      inventoryUnit: "个",
      referencePrice: "10.00",
      warningThreshold: 1,
      enabled: true,
    } as const;
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_sku_audit_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW."objectType" = 'SKU' THEN
          RAISE EXCEPTION 'forced sku audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_sku_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION reject_sku_audit_insert();
    `);

    await expect(createSku(prisma, owner, createInput)).rejects.toThrow(
      "forced sku audit failure",
    );
    await expect(listSkus(prisma, owner, {})).resolves.toEqual([]);

    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_sku_audit_insert ON "business_audit"',
    );
    const sku = await createSku(prisma, owner, createInput);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_sku_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION reject_sku_audit_insert();
    `);

    await expect(
      updateSku(prisma, owner, {
        skuId: sku.id,
        name: "不应保存的新名称",
        category: sku.category,
        referencePrice: "20.00",
        warningThreshold: 2,
      }),
    ).rejects.toThrow("forced sku audit failure");
    await expect(
      disableSku(prisma, owner, { skuId: sku.id, confirmed: true }),
    ).rejects.toThrow("forced sku audit failure");
    await expect(
      deleteSku(prisma, owner, { skuId: sku.id, confirmed: true }),
    ).rejects.toThrow("forced sku audit failure");
    await expect(getSku(prisma, owner, sku.id)).resolves.toMatchObject({
      name: createInput.name,
      referencePriceFen: 1_000,
      warningThreshold: 1,
      enabled: true,
    });

    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_sku_audit_insert ON "business_audit"',
    );
    await prisma.$executeRawUnsafe("DROP FUNCTION reject_sku_audit_insert() ");
  });
});
