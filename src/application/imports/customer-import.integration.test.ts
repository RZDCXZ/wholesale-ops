import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  getBusinessAudit,
  listBusinessAudit,
} from "../accounts/account-service";
import type { Actor } from "../auth/resolve-actor";
import { listCustomers } from "../customers/customer-service";
import { PrismaClient } from "../../generated/prisma/client";
import { runRepositoryCommand } from "../../test-support/repository-command";
import {
  confirmCustomerImport,
  CustomerImportError,
  previewCustomerImport,
} from "./customer-import";

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
const disabledSales: Actor = {
  id: "disabled-sales-user",
  name: "停用销售",
  email: "disabled-sales@example.local",
  roles: ["SALES"],
};
const tokenContext = {
  secret: "customer-import-integration-secret-at-least-32-characters",
  now: new Date("2026-08-13T06:00:00.000Z"),
};

function createWorkbookFile(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        "客户编码",
        "名称",
        "联系人",
        "电话",
        "地址",
        "客户负责人",
        "默认账期",
        "启用状态",
      ],
      ...rows,
    ]),
    "客户导入",
  );
  return {
    name: "customer-import.xlsx",
    bytes: new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    ),
  };
}

function customerRow(
  customerCode: string,
  responsibleSalesEmail = sales.email,
): unknown[] {
  return [
    customerCode,
    `客户 ${customerCode}`,
    "李海峰",
    "138 0000 0000",
    "广东省深圳市宝安区工业路 18 号",
    responsibleSalesEmail,
    30,
    "启用",
  ];
}

describe("客户 Excel 导入事务", () => {
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
      'TRUNCATE TABLE "data_import", "business_audit", "customer", "sku", "session", "account", "user_role", "user" CASCADE',
    );
    await prisma.user.createMany({
      data: [
        { id: owner.id, name: owner.name, email: owner.email },
        { id: sales.id, name: sales.name, email: sales.email },
        {
          id: disabledSales.id,
          name: disabledSales.name,
          email: disabledSales.email,
          enabled: false,
        },
      ],
    });
    await prisma.userRole.createMany({
      data: [
        { userId: owner.id, role: "OWNER" },
        { userId: sales.id, role: "SALES" },
        { userId: disabledSales.id, role: "SALES" },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("老板确认合法预览后可读取全部客户和一条导入业务审计", async () => {
    const preview = await previewCustomerImport(
      prisma,
      owner,
      createWorkbookFile([
        customerRow("KH-IMPORT-101"),
        [
          "KH-IMPORT-102",
          "停用客户",
          "周志成",
          "136 0000 0000",
          "广东省深圳市龙华区民治大道 27 号",
          sales.email,
          "现结",
          "停用",
        ],
      ]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");

    const imported = await confirmCustomerImport(
      prisma,
      owner,
      preview.previewToken,
      tokenContext,
    );

    await expect(listCustomers(prisma, owner, {})).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          customerCode: "KH-IMPORT-101",
          responsibleSales: { id: sales.id, name: sales.name },
          paymentTermDays: 30,
          enabled: true,
        }),
        expect.objectContaining({
          customerCode: "KH-IMPORT-102",
          paymentTermDays: 0,
          enabled: false,
        }),
      ]),
    );
    expect(imported.importedCount).toBe(2);
    await expect(getBusinessAudit(prisma, owner, imported.auditId)).resolves.toMatchObject({
      action: "CUSTOMER_IMPORTED",
      objectType: "DATA_IMPORT",
      objectId: imported.importId,
      referenceCode: "customer-import.xlsx",
      summary: "通过 customer-import.xlsx 导入 2 个客户",
    });
  });

  it("错误预览同时报告既有编码和停用负责人且不发放确认令牌", async () => {
    await prisma.customer.create({
      data: {
        id: "existing-customer",
        customerCode: "KH-EXISTING",
        name: "既有客户",
        contactName: "联系人",
        phone: "1",
        address: "地址",
        responsibleSalesId: sales.id,
        paymentTermDays: 0,
      },
    });

    const preview = await previewCustomerImport(
      prisma,
      owner,
      createWorkbookFile([
        customerRow("KH-EXISTING"),
        customerRow("KH-DISABLED-SALES", disabledSales.email),
      ]),
      tokenContext,
    );

    expect(preview).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          field: "客户编码",
          reason: "客户编码已存在。",
        }),
        expect.objectContaining({
          rowNumber: 3,
          field: "客户负责人",
          reason: "必须匹配启用的销售账号邮箱。",
        }),
      ]),
    });
    expect("previewToken" in preview).toBe(false);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([]);
  });

  it("预览后负责人停用会使整批确认失效", async () => {
    const preview = await previewCustomerImport(
      prisma,
      owner,
      createWorkbookFile([
        customerRow("KH-STALE-101"),
        customerRow("KH-STALE-102"),
      ]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");
    await prisma.user.update({ where: { id: sales.id }, data: { enabled: false } });

    await expect(
      confirmCustomerImport(prisma, owner, preview.previewToken, tokenContext),
    ).rejects.toMatchObject({
      code: "PREVIEW_STALE",
      message: expect.stringContaining(sales.email),
    } satisfies Partial<CustomerImportError>);
    await expect(listCustomers(prisma, owner, {})).resolves.toEqual([]);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([]);
  });

  it("非老板不能确认老板生成的客户预览", async () => {
    const preview = await previewCustomerImport(
      prisma,
      owner,
      createWorkbookFile([customerRow("KH-FORBIDDEN-101")]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");

    await expect(
      confirmCustomerImport(prisma, sales, preview.previewToken, tokenContext),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<CustomerImportError>);
    await expect(listCustomers(prisma, owner, {})).resolves.toEqual([]);
  });

  it("事务末段失败时客户和导入记录全部回滚并可重新确认", async () => {
    const preview = await previewCustomerImport(
      prisma,
      owner,
      createWorkbookFile([
        customerRow("KH-ROLLBACK-101"),
        customerRow("KH-ROLLBACK-102"),
      ]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");
    await prisma.user.delete({ where: { id: owner.id } });

    await expect(
      confirmCustomerImport(prisma, owner, preview.previewToken, tokenContext),
    ).rejects.toBeDefined();
    await expect(listCustomers(prisma, owner, {})).resolves.toEqual([]);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toEqual([]);

    await prisma.user.create({
      data: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        roles: { create: { role: "OWNER" } },
      },
    });
    await expect(
      confirmCustomerImport(prisma, owner, preview.previewToken, tokenContext),
    ).resolves.toMatchObject({ importedCount: 2 });
    await expect(listCustomers(prisma, owner, {})).resolves.toHaveLength(2);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toHaveLength(1);
  });

  it("同一客户预览只能成功确认一次", async () => {
    const preview = await previewCustomerImport(
      prisma,
      owner,
      createWorkbookFile([customerRow("KH-ONCE-101")]),
      tokenContext,
    );
    if (preview.status !== "ready") throw new Error("Expected a ready preview.");

    await confirmCustomerImport(prisma, owner, preview.previewToken, tokenContext);
    await expect(
      confirmCustomerImport(prisma, owner, preview.previewToken, tokenContext),
    ).rejects.toMatchObject({
      code: "DUPLICATE_SUBMISSION",
      message: "该预览已经导入，不能重复提交。",
    } satisfies Partial<CustomerImportError>);
    await expect(listCustomers(prisma, owner, {})).resolves.toHaveLength(1);
    await expect(listBusinessAudit(prisma, owner, {})).resolves.toHaveLength(1);
  });
});
