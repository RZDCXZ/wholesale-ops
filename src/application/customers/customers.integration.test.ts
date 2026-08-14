import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma/client";
import { runRepositoryCommand } from "../../test-support/repository-command";
import type { Actor } from "../auth/resolve-actor";
import {
  createCustomer,
  CustomerServiceError,
  deleteCustomer,
  disableCustomer,
  getCustomer,
  listCustomerResponsibleOptions,
  listCustomers,
  listCustomersPage,
  reassignCustomer,
  updateCustomer,
} from "./customer-service";

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
const financeSales: Actor = {
  id: "finance-sales-user",
  name: "孙悦",
  email: "finance-sales@example.local",
  roles: ["SALES", "FINANCE"],
};

describe("客户资料与负责人数据边界", () => {
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
      'TRUNCATE TABLE "business_audit", "customer", "session", "account", "user_role", "user" CASCADE',
    );
    await prisma.user.createMany({
      data: [
        { id: owner.id, name: owner.name, email: owner.email },
        { id: sales.id, name: sales.name, email: sales.email },
        { id: otherSales.id, name: otherSales.name, email: otherSales.email },
        { id: finance.id, name: finance.name, email: finance.email },
        { id: warehouse.id, name: warehouse.name, email: warehouse.email },
        { id: financeSales.id, name: financeSales.name, email: financeSales.email },
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
        { userId: financeSales.id, role: "SALES" },
        { userId: financeSales.id, role: "FINANCE" },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("老板创建客户后可从列表读取账期、负责人和同事务审计", async () => {
    const customer = await createCustomer(prisma, owner, {
      customerCode: "KH-0003",
      name: "广顺五金商行",
      contactName: "李海峰",
      phone: "138 0000 0000",
      address: "广东省深圳市宝安区工业路 18 号",
      responsibleSalesId: sales.id,
      paymentTermDays: 30,
      enabled: true,
    });

    expect(customer).toMatchObject({
      customerCode: "KH-0003",
      responsibleSales: { id: sales.id, name: sales.name },
      paymentTermDays: 30,
    });
    await expect(listCustomers(prisma, owner, {})).resolves.toEqual([
      expect.objectContaining({ id: customer.id, customerCode: "KH-0003" }),
    ]);
    await expect(
      prisma.businessAudit.findMany({ where: { objectId: customer.id } }),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "CUSTOMER_CREATED",
        objectType: "CUSTOMER",
        referenceCode: "KH-0003",
      }),
    ]);
  });

  it("服务端数据范围阻止销售用已知标识访问他人客户，财务只读且仓库无目录权限", async () => {
    const ownCustomer = await createCustomer(prisma, owner, {
      customerCode: "KH-SALES-OWN",
      name: "销售自己的客户",
      contactName: "周先生",
      phone: "13800000001",
      address: "深圳市宝安区",
      responsibleSalesId: sales.id,
      paymentTermDays: 0,
      enabled: true,
    });
    const otherCustomer = await createCustomer(prisma, owner, {
      customerCode: "KH-SALES-OTHER",
      name: "其他销售的客户",
      contactName: "吴女士",
      phone: "13800000002",
      address: "深圳市龙华区",
      responsibleSalesId: otherSales.id,
      paymentTermDays: 15,
      enabled: true,
    });

    await expect(listCustomers(prisma, sales, {})).resolves.toEqual([
      expect.objectContaining({ id: ownCustomer.id }),
    ]);
    await expect(getCustomer(prisma, sales, otherCustomer.id)).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
      message: "客户不存在或不可访问。",
    } satisfies Partial<CustomerServiceError>);
    await expect(
      updateCustomer(prisma, sales, {
        customerId: otherCustomer.id,
        name: "越权修改",
        contactName: otherCustomer.contactName,
        phone: otherCustomer.phone,
        address: otherCustomer.address,
        paymentTermDays: otherCustomer.paymentTermDays,
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" } satisfies Partial<CustomerServiceError>);

    await expect(listCustomers(prisma, finance, {})).resolves.toHaveLength(2);
    await expect(getCustomer(prisma, finance, otherCustomer.id)).resolves.toMatchObject({
      id: otherCustomer.id,
    });
    await expect(
      updateCustomer(prisma, finance, {
        customerId: otherCustomer.id,
        name: otherCustomer.name,
        contactName: otherCustomer.contactName,
        phone: otherCustomer.phone,
        address: otherCustomer.address,
        paymentTermDays: otherCustomer.paymentTermDays,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<CustomerServiceError>);
    await expect(listCustomers(prisma, warehouse, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<CustomerServiceError>);

    await expect(listCustomers(prisma, financeSales, {})).resolves.toHaveLength(2);
    await expect(
      updateCustomer(prisma, financeSales, {
        customerId: otherCustomer.id,
        name: "多角色越权修改",
        contactName: otherCustomer.contactName,
        phone: otherCustomer.phone,
        address: otherCustomer.address,
        paymentTermDays: otherCustomer.paymentTermDays,
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" } satisfies Partial<CustomerServiceError>);
  });

  it("客户编码唯一且不可变、名称可重复，销售创建负责人强制为自己且账期合法", async () => {
    const baseInput = {
      customerCode: "KH-RULE-001",
      name: "同名客户",
      contactName: "李先生",
      phone: "13800000003",
      address: "深圳市南山区",
      responsibleSalesId: otherSales.id,
      paymentTermDays: 0,
      enabled: true,
    } as const;
    const createdBySales = await createCustomer(prisma, sales, baseInput);
    expect(createdBySales.responsibleSales.id).toBe(sales.id);
    await expect(
      createCustomer(prisma, owner, {
        ...baseInput,
        customerCode: "KH-RULE-002",
        responsibleSalesId: otherSales.id,
      }),
    ).resolves.toMatchObject({ name: baseInput.name });
    await expect(createCustomer(prisma, sales, baseInput)).rejects.toMatchObject({
      code: "CUSTOMER_CODE_EXISTS",
      message: "客户编码已被使用。",
    } satisfies Partial<CustomerServiceError>);

    for (const paymentTermDays of [-1, 1.5]) {
      await expect(
        createCustomer(prisma, sales, {
          ...baseInput,
          customerCode: `KH-TERM-${paymentTermDays}`,
          paymentTermDays,
        }),
      ).rejects.toMatchObject({
        code: "INVALID_PAYMENT_TERM",
        message: "默认账期必须是现结或非负整数天数。",
      } satisfies Partial<CustomerServiceError>);
    }

    const tamperedUpdate = {
      customerId: createdBySales.id,
      customerCode: "KH-RULE-HACK",
      name: createdBySales.name,
      contactName: createdBySales.contactName,
      phone: createdBySales.phone,
      address: createdBySales.address,
      paymentTermDays: 30,
    };
    await expect(updateCustomer(prisma, sales, tamperedUpdate)).rejects.toMatchObject({
      code: "CUSTOMER_CODE_IMMUTABLE",
      message: "客户编码创建后不能修改。",
    } satisfies Partial<CustomerServiceError>);
    await expect(getCustomer(prisma, sales, createdBySales.id)).resolves.toMatchObject({
      customerCode: "KH-RULE-001",
      paymentTermDays: 0,
    });
  });

  it("老板只可转交给启用销售，转交立即改变销售数据范围且有权销售可停用", async () => {
    const customer = await createCustomer(prisma, owner, {
      customerCode: "KH-REASSIGN-001",
      name: "待转交客户",
      contactName: "黄先生",
      phone: "13800000004",
      address: "深圳市福田区",
      responsibleSalesId: sales.id,
      paymentTermDays: 30,
      enabled: true,
    });

    await prisma.user.update({
      where: { id: otherSales.id },
      data: { enabled: false },
    });
    await expect(
      reassignCustomer(prisma, owner, {
        customerId: customer.id,
        responsibleSalesId: otherSales.id,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSIBLE_SALES" } satisfies Partial<CustomerServiceError>);
    await prisma.user.update({
      where: { id: otherSales.id },
      data: { enabled: true },
    });

    await expect(
      reassignCustomer(prisma, sales, {
        customerId: customer.id,
        responsibleSalesId: otherSales.id,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<CustomerServiceError>);
    await expect(
      reassignCustomer(prisma, owner, {
        customerId: customer.id,
        responsibleSalesId: otherSales.id,
        confirmed: true,
      }),
    ).resolves.toMatchObject({ responsibleSales: { id: otherSales.id } });
    await expect(getCustomer(prisma, sales, customer.id)).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    } satisfies Partial<CustomerServiceError>);
    await expect(getCustomer(prisma, otherSales, customer.id)).resolves.toMatchObject({
      id: customer.id,
    });

    await expect(
      disableCustomer(prisma, sales, { customerId: customer.id, confirmed: true }),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" } satisfies Partial<CustomerServiceError>);
    await expect(
      disableCustomer(prisma, otherSales, { customerId: customer.id, confirmed: true }),
    ).resolves.toMatchObject({ enabled: false });
    await expect(
      prisma.businessAudit.findMany({
        where: { objectId: customer.id },
        orderBy: { occurredAt: "asc" },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ action: "CUSTOMER_CREATED" }),
      expect.objectContaining({
        action: "CUSTOMER_RESPONSIBLE_SALES_CHANGED",
        summary: "客户负责人由「陈敏」调整为「赵磊」",
      }),
      expect.objectContaining({ action: "CUSTOMER_DISABLED" }),
    ]);
  });

  it("老板并发转交同一客户时审计形成连续的负责人变更链", async () => {
    const customer = await createCustomer(prisma, owner, {
      customerCode: "KH-REASSIGN-CONCURRENT",
      name: "并发转交客户",
      contactName: "贺先生",
      phone: "13800000013",
      address: "深圳市罗湖区",
      responsibleSalesId: sales.id,
      paymentTermDays: 30,
      enabled: true,
    });

    await Promise.all([
      reassignCustomer(prisma, owner, {
        customerId: customer.id,
        responsibleSalesId: otherSales.id,
        confirmed: true,
      }),
      reassignCustomer(prisma, owner, {
        customerId: customer.id,
        responsibleSalesId: financeSales.id,
        confirmed: true,
      }),
    ]);

    const audits = await prisma.businessAudit.findMany({
      where: {
        objectId: customer.id,
        action: "CUSTOMER_RESPONSIBLE_SALES_CHANGED",
      },
      select: { summary: true },
    });
    const summaries = audits.map(({ summary }) => summary).sort();
    const validChains = [
      ["客户负责人由「陈敏」调整为「赵磊」", "客户负责人由「赵磊」调整为「孙悦」"],
      ["客户负责人由「陈敏」调整为「孙悦」", "客户负责人由「孙悦」调整为「赵磊」"],
    ].map((chain) => chain.sort());

    expect(validChains).toContainEqual(summaries);
  });

  it("客户编码名称、负责人和启用状态筛选在服务端数据范围内组合生效", async () => {
    const ownEnabled = await createCustomer(prisma, owner, {
      customerCode: "KH-FILTER-001",
      name: "南山机电客户",
      contactName: "何先生",
      phone: "13800000005",
      address: "深圳市南山区",
      responsibleSalesId: sales.id,
      paymentTermDays: 0,
      enabled: true,
    });
    await createCustomer(prisma, owner, {
      customerCode: "KH-FILTER-002",
      name: "南山机电客户",
      contactName: "罗女士",
      phone: "13800000006",
      address: "深圳市龙岗区",
      responsibleSalesId: otherSales.id,
      paymentTermDays: 30,
      enabled: true,
    });
    await createCustomer(prisma, owner, {
      customerCode: "KH-FILTER-003",
      name: "停用客户",
      contactName: "秦女士",
      phone: "13800000007",
      address: "深圳市盐田区",
      responsibleSalesId: sales.id,
      paymentTermDays: 15,
      enabled: false,
    });

    await expect(
      listCustomers(prisma, owner, {
        query: "南山机电",
        responsibleSalesId: sales.id,
        enabled: true,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: ownEnabled.id })]);
    await expect(
      listCustomers(prisma, sales, { responsibleSalesId: otherSales.id }),
    ).resolves.toEqual([]);
    await expect(
      listCustomersPage(
        prisma,
        owner,
        {},
        { page: 2, pageSize: 1, sort: "customerCode", direction: "asc" },
      ),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 1,
      total: 3,
      totalPages: 3,
      items: [expect.objectContaining({ customerCode: "KH-FILTER-002" })],
    });
    await prisma.user.update({
      where: { id: sales.id },
      data: { enabled: false },
    });
    await expect(
      listCustomerResponsibleOptions(prisma, owner),
    ).resolves.toEqual([
      expect.objectContaining({ id: otherSales.id, enabled: true }),
      expect.objectContaining({ id: sales.id, enabled: false }),
    ]);
  });

  it("未引用客户可以删除并留审计，被业务记录引用的客户只能停用", async () => {
    const deletable = await createCustomer(prisma, owner, {
      customerCode: "KH-DELETE-001",
      name: "未引用客户",
      contactName: "叶先生",
      phone: "13800000008",
      address: "深圳市光明区",
      responsibleSalesId: sales.id,
      paymentTermDays: 0,
      enabled: false,
    });
    await expect(
      deleteCustomer(prisma, owner, { customerId: deletable.id, confirmed: true }),
    ).resolves.toMatchObject({
      id: deletable.id,
      customerCode: "KH-DELETE-001",
      auditId: expect.any(String),
    });
    await expect(getCustomer(prisma, owner, deletable.id)).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    } satisfies Partial<CustomerServiceError>);

    const referenced = await createCustomer(prisma, owner, {
      customerCode: "KH-REFERENCED-001",
      name: "已引用客户",
      contactName: "顾女士",
      phone: "13800000009",
      address: "深圳市坪山区",
      responsibleSalesId: sales.id,
      paymentTermDays: 15,
      enabled: true,
    });
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "customer_business_reference_test" (
        "id" TEXT PRIMARY KEY,
        "customerId" TEXT NOT NULL REFERENCES "customer"("id") ON DELETE RESTRICT
      )
    `);
    await prisma.$executeRaw`
      INSERT INTO "customer_business_reference_test" ("id", "customerId")
      VALUES ('customer-reference-1', ${referenced.id})
    `;

    await expect(getCustomer(prisma, owner, referenced.id)).resolves.toMatchObject({
      hasBusinessReferences: true,
    });
    await expect(
      deleteCustomer(prisma, owner, { customerId: referenced.id, confirmed: true }),
    ).rejects.toMatchObject({
      code: "CUSTOMER_REFERENCED",
      message: "客户已被业务记录引用，不能删除；请改为停用。",
    } satisfies Partial<CustomerServiceError>);
  });

  it("创建编辑负责人调整停用删除在审计失败时全部回滚", async () => {
    const createInput = {
      customerCode: "KH-ATOMIC-001",
      name: "原子性客户",
      contactName: "邓先生",
      phone: "13800000010",
      address: "深圳市大鹏新区",
      responsibleSalesId: sales.id,
      paymentTermDays: 15,
      enabled: true,
    } as const;
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION reject_customer_audit_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW."objectType" = 'CUSTOMER' THEN
          RAISE EXCEPTION 'forced customer audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_customer_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION reject_customer_audit_insert();
    `);

    await expect(createCustomer(prisma, owner, createInput)).rejects.toThrow(
      "forced customer audit failure",
    );
    await expect(listCustomers(prisma, owner, {})).resolves.toEqual([]);

    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_customer_audit_insert ON "business_audit"',
    );
    const customer = await createCustomer(prisma, owner, createInput);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reject_customer_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION reject_customer_audit_insert();
    `);

    await expect(
      updateCustomer(prisma, owner, {
        customerId: customer.id,
        name: "不应保存的新名称",
        contactName: customer.contactName,
        phone: customer.phone,
        address: customer.address,
        paymentTermDays: 30,
      }),
    ).rejects.toThrow("forced customer audit failure");
    await expect(
      reassignCustomer(prisma, owner, {
        customerId: customer.id,
        responsibleSalesId: otherSales.id,
        confirmed: true,
      }),
    ).rejects.toThrow("forced customer audit failure");
    await expect(
      disableCustomer(prisma, owner, { customerId: customer.id, confirmed: true }),
    ).rejects.toThrow("forced customer audit failure");
    await expect(
      deleteCustomer(prisma, owner, { customerId: customer.id, confirmed: true }),
    ).rejects.toThrow("forced customer audit failure");
    await expect(getCustomer(prisma, owner, customer.id)).resolves.toMatchObject({
      name: createInput.name,
      responsibleSales: { id: sales.id },
      paymentTermDays: 15,
      enabled: true,
    });

    await prisma.$executeRawUnsafe(
      'DROP TRIGGER reject_customer_audit_insert ON "business_audit"',
    );
    await prisma.$executeRawUnsafe("DROP FUNCTION reject_customer_audit_insert() ");
  });
});
