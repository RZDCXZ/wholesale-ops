import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  getBusinessAudit,
  listBusinessAudit,
} from "../accounts/account-service";
import type { Actor } from "../auth/resolve-actor";
import { createSku, listSkus } from "../skus/sku-service";
import { PrismaClient } from "../../generated/prisma/client";
import { runRepositoryCommand } from "../../test-support/repository-command";
import {
  confirmSkuImport,
  previewSkuImport,
  SkuImportError,
} from "./sku-import";

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
const otherOwner: Actor = {
  id: "other-owner-user",
  name: "另一位老板",
  email: "other-owner@example.local",
  roles: ["OWNER"],
};
const tokenContext = {
  secret: "sku-import-integration-secret-at-least-32-characters",
  now: new Date("2026-08-13T06:00:00.000Z"),
};

function createWorkbookFile(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["SKU 编码", "名称", "分类", "库存单位", "参考售价", "预警值", "启用状态"],
      ...rows,
    ]),
    "SKU导入",
  );
  return {
    name: "sku-import.xlsx",
    bytes: new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    ),
  };
}

describe("SKU Excel 导入事务", () => {
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
      'TRUNCATE TABLE "data_import", "business_audit", "sku", "session", "account", "user_role", "user" CASCADE',
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

  it("老板确认合法预览后可同时读取全部 SKU 和一条导入业务审计", async () => {
    const preview = await previewSkuImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-IMPORT-101", "导入螺栓", "紧固件", "盒", 48.5, 20, "启用"],
        ["WJ-IMPORT-102", "导入切割片", "切削耗材", "片", 3.8, 10, "停用"],
      ]),
      tokenContext,
    );
    expect(preview.status).toBe("ready");
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");

    const imported = await confirmSkuImport(
      prisma,
      owner,
      preview.previewToken,
      tokenContext,
    );

    await expect(listSkus(prisma, owner, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skuCode: "WJ-IMPORT-101", referencePriceFen: 4_850 }),
        expect.objectContaining({ skuCode: "WJ-IMPORT-102", enabled: false }),
      ]),
    );
    await expect(
      getBusinessAudit(prisma, owner, imported.auditId),
    ).resolves.toMatchObject({
      action: "SKU_IMPORTED",
      objectType: "DATA_IMPORT",
      objectId: imported.importId,
      summary: "通过 sku-import.xlsx 导入 2 个 SKU",
    });
    expect(imported.importedCount).toBe(2);
  });

  it("预览后编码被占用时整批保持不写入", async () => {
    const preview = await previewSkuImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-STALE-101", "冲突 SKU", "测试", "个", 1, 0, "启用"],
        ["WJ-STALE-102", "本应导入 SKU", "测试", "个", 2, 0, "启用"],
      ]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");
    await createSku(prisma, owner, {
      skuCode: "WJ-STALE-101",
      name: "先创建的 SKU",
      category: "测试",
      inventoryUnit: "个",
      referencePrice: "1.00",
      warningThreshold: 0,
      enabled: true,
    });

    await expect(
      confirmSkuImport(prisma, owner, preview.previewToken, tokenContext),
    ).rejects.toMatchObject({ code: "PREVIEW_STALE" } satisfies Partial<SkuImportError>);
    await expect(listSkus(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({ skuCode: "WJ-STALE-101" }),
    ]);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({ action: "SKU_CREATED" }),
    ]);
  });

  it("预览会查询数据库既有编码且不签发确认令牌", async () => {
    await createSku(prisma, owner, {
      skuCode: "WJ-EXISTING-101",
      name: "数据库既有 SKU",
      category: "测试",
      inventoryUnit: "个",
      referencePrice: "1.00",
      warningThreshold: 0,
      enabled: true,
    });

    const preview = await previewSkuImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-EXISTING-101", "重复 SKU", "测试", "个", 1, 0, "启用"],
        ["WJ-NEW-102", "本应合法 SKU", "测试", "个", 2, 0, "启用"],
      ]),
      tokenContext,
    );

    expect(preview).toMatchObject({
      status: "invalid",
      validRows: [expect.objectContaining({ skuCode: "WJ-NEW-102" })],
      errors: [
        expect.objectContaining({
          field: "SKU 编码",
          value: "WJ-EXISTING-101",
          reason: "SKU 编码已存在。",
        }),
      ],
    });
    expect("previewToken" in preview).toBe(false);
    await expect(listSkus(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({ skuCode: "WJ-EXISTING-101" }),
    ]);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({ action: "SKU_CREATED" }),
    ]);
  });

  it("一次预览同时返回字段错误和数据库既有编码错误", async () => {
    await createSku(prisma, owner, {
      skuCode: "WJ-MIXED-EXISTING",
      name: "数据库既有 SKU",
      category: "测试",
      inventoryUnit: "个",
      referencePrice: "1.00",
      warningThreshold: 0,
      enabled: true,
    });

    const preview = await previewSkuImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-MIXED-INVALID", "金额错误 SKU", "测试", "个", "非法金额", 0, "启用"],
        ["WJ-MIXED-EXISTING", "编码冲突 SKU", "测试", "个", 2, 0, "启用"],
      ]),
      tokenContext,
    );

    expect(preview).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          field: "参考售价",
          reason: "必须是最多两位小数的非负人民币金额。",
        }),
        expect.objectContaining({
          rowNumber: 3,
          field: "SKU 编码",
          value: "WJ-MIXED-EXISTING",
          reason: "SKU 编码已存在。",
        }),
      ]),
    });
    expect("previewToken" in preview).toBe(false);
  });

  it("事务末段失败时已经创建的 SKU 也全部回滚", async () => {
    const preview = await previewSkuImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-ROLLBACK-101", "回滚 SKU 一", "测试", "个", 1, 0, "启用"],
        ["WJ-ROLLBACK-102", "回滚 SKU 二", "测试", "个", 2, 0, "启用"],
      ]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");
    await prisma.user.delete({ where: { id: owner.id } });

    await expect(
      confirmSkuImport(prisma, owner, preview.previewToken, tokenContext),
    ).rejects.toBeDefined();
    await expect(listSkus(prisma, owner, {})).resolves.toEqual([]);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([]);
  });

  it("同一预览令牌只能成功确认一次", async () => {
    const preview = await previewSkuImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-ONCE-101", "一次性预览 SKU", "测试", "个", 1, 0, "启用"],
      ]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");

    await confirmSkuImport(prisma, owner, preview.previewToken, tokenContext);
    await expect(
      confirmSkuImport(prisma, owner, preview.previewToken, tokenContext),
    ).rejects.toMatchObject({
      code: "DUPLICATE_SUBMISSION",
      message: "该预览已经导入，不能重复提交。",
    } satisfies Partial<SkuImportError>);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toHaveLength(1);
  });

  it("确认时重新校验老板身份、令牌操作者、签名和有效期", async () => {
    const preview = await previewSkuImport(
      prisma,
      owner,
      createWorkbookFile([
        ["WJ-TOKEN-101", "令牌校验 SKU", "测试", "个", 1, 0, "启用"],
      ]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");

    await expect(
      confirmSkuImport(prisma, sales, preview.previewToken, tokenContext),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<SkuImportError>);
    await expect(
      confirmSkuImport(prisma, otherOwner, preview.previewToken, tokenContext),
    ).rejects.toMatchObject({
      code: "PREVIEW_FORBIDDEN",
    } satisfies Partial<SkuImportError>);
    await expect(
      confirmSkuImport(
        prisma,
        owner,
        `${preview.previewToken.slice(0, -1)}x`,
        tokenContext,
      ),
    ).rejects.toMatchObject({ code: "PREVIEW_INVALID" } satisfies Partial<SkuImportError>);
    await expect(
      confirmSkuImport(prisma, owner, preview.previewToken, {
        ...tokenContext,
        now: new Date(tokenContext.now.getTime() + 16 * 60_000),
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_INVALID" } satisfies Partial<SkuImportError>);
    await expect(listSkus(prisma, owner, {})).resolves.toEqual([]);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([]);
  });
});
