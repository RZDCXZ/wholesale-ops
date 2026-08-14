import { PrismaPg } from "@prisma/adapter-pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma/client";
import { runRepositoryCommand } from "../../test-support/repository-command";
import { listBusinessAudit } from "../accounts/account-service";
import type { Actor } from "../auth/resolve-actor";
import {
  getReceivableDetail,
  listReceivablesPage,
  recordPayment,
  reversePayment,
  ReceivableServiceError,
} from "./receivable-service";

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

describe("部分收款与自动结清", () => {
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
      'TRUNCATE TABLE "inventory_movement", "inventory_balance", "data_import", "business_audit", "customer", "sku", "session", "account", "user_role", "user" CASCADE',
    );
    await prisma.user.createMany({
      data: [owner, sales, otherSales, warehouse, finance].map(
        ({ id, name, email }) => ({ id, name, email }),
      ),
    });
    await prisma.userRole.createMany({
      data: [owner, sales, otherSales, warehouse, finance].flatMap((actor) =>
        actor.roles.map((role) => ({ userId: actor.id, role })),
      ),
    });
    await prisma.customer.createMany({
      data: [
        {
          id: "customer-own",
          customerCode: "KH-0003",
          name: "广顺五金商行",
          contactName: "李海峰",
          phone: "138 0000 0000",
          address: "广东省深圳市宝安区工业路 18 号",
          responsibleSalesId: sales.id,
          paymentTermDays: 30,
        },
        {
          id: "customer-other",
          customerCode: "KH-0007",
          name: "宏远装饰工程",
          contactName: "林嘉怡",
          phone: "139 0000 0000",
          address: "广东省深圳市南山区测试路 7 号",
          responsibleSalesId: otherSales.id,
          paymentTermDays: 15,
        },
      ],
    });
    await prisma.salesOrder.createMany({
      data: [
        {
          id: "sales-order-pending",
          salesOrderNumber: "XSD-20260801-0001",
          status: "OUTBOUND",
          customerId: "customer-own",
          creatorId: sales.id,
          customerCodeSnapshot: "KH-0003",
          customerNameSnapshot: "广顺五金商行",
          customerContactNameSnapshot: "李海峰",
          customerPhoneSnapshot: "138 0000 0000",
          customerAddressSnapshot: "广东省深圳市宝安区工业路 18 号",
          responsibleSalesIdSnapshot: sales.id,
          responsibleSalesNameSnapshot: sales.name,
          paymentTermDaysSnapshot: 12,
          totalAmountFen: 236_000,
        },
        {
          id: "sales-order-partial",
          salesOrderNumber: "XSD-20260802-0002",
          status: "OUTBOUND",
          customerId: "customer-own",
          creatorId: sales.id,
          customerCodeSnapshot: "KH-0003",
          customerNameSnapshot: "广顺五金商行",
          customerContactNameSnapshot: "李海峰",
          customerPhoneSnapshot: "138 0000 0000",
          customerAddressSnapshot: "广东省深圳市宝安区工业路 18 号",
          responsibleSalesIdSnapshot: sales.id,
          responsibleSalesNameSnapshot: sales.name,
          paymentTermDaysSnapshot: 10,
          totalAmountFen: 108_400,
        },
        {
          id: "sales-order-settled",
          salesOrderNumber: "XSD-20260701-0003",
          status: "OUTBOUND",
          customerId: "customer-other",
          creatorId: otherSales.id,
          customerCodeSnapshot: "KH-0007",
          customerNameSnapshot: "宏远装饰工程",
          customerContactNameSnapshot: "林嘉怡",
          customerPhoneSnapshot: "139 0000 0000",
          customerAddressSnapshot: "广东省深圳市南山区测试路 7 号",
          responsibleSalesIdSnapshot: otherSales.id,
          responsibleSalesNameSnapshot: otherSales.name,
          paymentTermDaysSnapshot: 15,
          totalAmountFen: 75_600,
        },
      ],
    });
    await prisma.receivable.createMany({
      data: [
        {
          id: "receivable-pending",
          receivableNumber: "YS-20260801-0001",
          salesOrderId: "sales-order-pending",
          customerId: "customer-own",
          customerCodeSnapshot: "KH-0003",
          customerNameSnapshot: "广顺五金商行",
          responsibleSalesIdSnapshot: sales.id,
          originalAmountFen: 236_000,
          receivedAmountFen: 0,
          remainingAmountFen: 236_000,
          paymentTermDaysSnapshot: 12,
          outboundAt: new Date("2026-08-01T02:00:00.000Z"),
          dueDate: new Date("2026-08-13T00:00:00.000Z"),
          status: "PENDING",
        },
        {
          id: "receivable-partial",
          receivableNumber: "YS-20260802-0002",
          salesOrderId: "sales-order-partial",
          customerId: "customer-own",
          customerCodeSnapshot: "KH-0003",
          customerNameSnapshot: "广顺五金商行",
          responsibleSalesIdSnapshot: sales.id,
          originalAmountFen: 108_400,
          receivedAmountFen: 40_000,
          remainingAmountFen: 68_400,
          paymentTermDaysSnapshot: 10,
          outboundAt: new Date("2026-08-02T02:00:00.000Z"),
          dueDate: new Date("2026-08-12T00:00:00.000Z"),
          status: "PARTIAL",
        },
        {
          id: "receivable-settled",
          receivableNumber: "YS-20260701-0003",
          salesOrderId: "sales-order-settled",
          customerId: "customer-other",
          customerCodeSnapshot: "KH-0007",
          customerNameSnapshot: "宏远装饰工程",
          responsibleSalesIdSnapshot: otherSales.id,
          originalAmountFen: 75_600,
          receivedAmountFen: 75_600,
          remainingAmountFen: 0,
          paymentTermDaysSnapshot: 15,
          outboundAt: new Date("2026-07-01T02:00:00.000Z"),
          dueDate: new Date("2026-07-16T00:00:00.000Z"),
          status: "SETTLED",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("老板和财务读取全部应收，仓库与销售不能读取财务列表，逾期从到期日次日开始", async () => {
    const now = new Date("2026-08-13T12:00:00.000Z");

    for (const actor of [owner, finance]) {
      const page = await listReceivablesPage(
        prisma,
        actor,
        {},
        { page: 1, pageSize: 20 },
        now,
      );
      expect(page.items.map(({ id }) => id)).toEqual([
        "receivable-partial",
        "receivable-pending",
        "receivable-settled",
      ]);
      expect(page.items).toEqual([
        expect.objectContaining({
          id: "receivable-partial",
          overdue: true,
          overdueDays: 1,
        }),
        expect.objectContaining({
          id: "receivable-pending",
          overdue: false,
          overdueDays: 0,
        }),
        expect.objectContaining({
          id: "receivable-settled",
          overdue: false,
          overdueDays: 0,
        }),
      ]);
      await expect(
        listReceivablesPage(
          prisma,
          actor,
          { overdueOnly: true },
          { page: 1, pageSize: 20 },
          now,
        ),
      ).resolves.toMatchObject({
        total: 1,
        items: [expect.objectContaining({ id: "receivable-partial" })],
      });
    }

    for (const actor of [sales, warehouse]) {
      await expect(
        listReceivablesPage(
          prisma,
          actor,
          {},
          { page: 1, pageSize: 20 },
          now,
        ),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      } satisfies Partial<ReceivableServiceError>);
    }
  });

  it("老板和财务查看完整详情，销售只查看自己负责客户的收款进度摘要", async () => {
    const now = new Date("2026-08-13T12:00:00.000Z");

    for (const actor of [owner, finance]) {
      await expect(
        getReceivableDetail(prisma, actor, "receivable-partial", now),
      ).resolves.toEqual({
        visibility: "financial",
        id: "receivable-partial",
        receivableNumber: "YS-20260802-0002",
        customer: {
          id: "customer-own",
          code: "KH-0003",
          name: "广顺五金商行",
          responsibleSalesId: sales.id,
          responsibleSalesName: sales.name,
        },
        salesOrder: {
          id: "sales-order-partial",
          salesOrderNumber: "XSD-20260802-0002",
        },
        originalAmountFen: 108_400,
        receivedAmountFen: 40_000,
        remainingAmountFen: 68_400,
        status: "PARTIAL",
        overdue: true,
        overdueDays: 1,
        outboundAt: new Date("2026-08-02T02:00:00.000Z"),
        paymentTermDays: 10,
        dueDate: new Date("2026-08-12T00:00:00.000Z"),
        payments: [],
      });
    }

    const progress = await getReceivableDetail(
      prisma,
      sales,
      "receivable-partial",
      now,
    );
    expect(progress).toEqual({
      visibility: "progress",
      id: "receivable-partial",
      receivableNumber: "YS-20260802-0002",
      customer: {
        id: "customer-own",
        code: "KH-0003",
        name: "广顺五金商行",
      },
      salesOrder: {
        id: "sales-order-partial",
        salesOrderNumber: "XSD-20260802-0002",
      },
      originalAmountFen: 108_400,
      receivedAmountFen: 40_000,
      remainingAmountFen: 68_400,
      status: "PARTIAL",
      overdue: true,
      overdueDays: 1,
      dueDate: new Date("2026-08-12T00:00:00.000Z"),
    });
    expect(progress).not.toHaveProperty("payments");
    expect(progress).not.toHaveProperty("paymentTermDays");
    expect(progress).not.toHaveProperty("outboundAt");

    await expect(
      getReceivableDetail(prisma, sales, "receivable-settled", now),
    ).rejects.toMatchObject({
      code: "RECEIVABLE_NOT_FOUND",
    } satisfies Partial<ReceivableServiceError>);
    await expect(
      getReceivableDetail(prisma, warehouse, "receivable-partial", now),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<ReceivableServiceError>);
  });

  it("客户负责人转交后，收款进度访问范围随当前负责人切换而非停留在历史快照", async () => {
    await prisma.customer.update({
      where: { id: "customer-own" },
      data: { responsibleSalesId: otherSales.id },
    });

    await expect(
      getReceivableDetail(prisma, sales, "receivable-partial"),
    ).rejects.toMatchObject({
      code: "RECEIVABLE_NOT_FOUND",
    } satisfies Partial<ReceivableServiceError>);
    await expect(
      getReceivableDetail(prisma, otherSales, "receivable-partial"),
    ).resolves.toMatchObject({
      visibility: "progress",
      id: "receivable-partial",
    });
  });

  it("财务可登记多笔定点金额收款并在累计等于原始金额时自动结清", async () => {
    const firstRecordedAt = new Date("2026-08-13T06:35:00.000Z");
    const first = await recordPayment(
      prisma,
      finance,
      {
        receivableId: "receivable-pending",
        paymentDate: new Date("2026-08-13T00:00:00.000Z"),
        amountFen: 40_000,
        method: "BANK_TRANSFER",
        referenceNumber: "SK20260813001",
        note: "客户首笔收款",
        idempotencyKey: "payment-submit-first",
      },
      firstRecordedAt,
    );
    expect(first).toEqual({
      payment: {
        id: expect.any(String),
        paymentDate: new Date("2026-08-13T00:00:00.000Z"),
        amountFen: 40_000,
        method: "BANK_TRANSFER",
        referenceNumber: "SK20260813001",
        note: "客户首笔收款",
        recordedAt: firstRecordedAt,
        recordedBy: { id: finance.id, name: finance.name },
      },
      receivable: {
        id: "receivable-pending",
        receivedAmountFen: 40_000,
        remainingAmountFen: 196_000,
        status: "PARTIAL",
      },
      auditId: expect.any(String),
      duplicate: false,
    });

    const secondRecordedAt = new Date("2026-08-14T01:05:00.000Z");
    const second = await recordPayment(
      prisma,
      owner,
      {
        receivableId: "receivable-pending",
        paymentDate: new Date("2026-08-14T00:00:00.000Z"),
        amountFen: 196_000,
        method: "CASH",
        idempotencyKey: "payment-submit-second",
      },
      secondRecordedAt,
    );
    expect(second).toMatchObject({
      payment: {
        amountFen: 196_000,
        method: "CASH",
        referenceNumber: null,
        note: null,
        recordedBy: { id: owner.id, name: owner.name },
      },
      receivable: {
        receivedAmountFen: 236_000,
        remainingAmountFen: 0,
        status: "SETTLED",
      },
      duplicate: false,
    });

    await expect(
      getReceivableDetail(
        prisma,
        finance,
        "receivable-pending",
        new Date("2026-08-15T12:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      visibility: "financial",
      receivedAmountFen: 236_000,
      remainingAmountFen: 0,
      status: "SETTLED",
      overdue: false,
      payments: [
        expect.objectContaining({
          amountFen: 196_000,
          recordedAt: secondRecordedAt,
        }),
        expect.objectContaining({
          amountFen: 40_000,
          recordedAt: firstRecordedAt,
        }),
      ],
    });
    await expect(
      listBusinessAudit(prisma, owner, {
        action: "PAYMENT_RECORDED",
        objectType: "PAYMENT",
        referenceCode: "YS-20260801-0001",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        actorName: owner.name,
        objectId: second.payment.id,
        occurredAt: secondRecordedAt,
      }),
      expect.objectContaining({
        actorName: finance.name,
        objectId: first.payment.id,
        occurredAt: firstRecordedAt,
      }),
    ]);
  });

  it("财务撤销已结清应收的有效收款后保留原记录并恢复逾期", async () => {
    const payment = await recordPayment(
      prisma,
      finance,
      {
        receivableId: "receivable-pending",
        paymentDate: new Date("2026-08-13T00:00:00.000Z"),
        amountFen: 236_000,
        method: "BANK_TRANSFER",
        referenceNumber: "SK20260813002",
        idempotencyKey: "payment-before-reversal",
      },
      new Date("2026-08-13T06:35:00.000Z"),
    );

    const reversedAt = new Date("2026-08-15T06:45:00.000Z");
    const reversed = await reversePayment(
      prisma,
      finance,
      {
        paymentId: payment.payment.id,
        reason: "金额录入错误",
        idempotencyKey: "reverse-settled-payment",
      },
      reversedAt,
    );

    expect(reversed).toMatchObject({
      reversal: {
        id: expect.any(String),
        paymentId: payment.payment.id,
        receivableId: "receivable-pending",
        amountFen: 236_000,
        reason: "金额录入错误",
        reversedAt,
        reversedBy: { id: finance.id, name: finance.name },
      },
      receivable: {
        id: "receivable-pending",
        receivedAmountFen: 0,
        remainingAmountFen: 236_000,
        status: "PENDING",
      },
      duplicate: false,
    });
    await expect(
      getReceivableDetail(
        prisma,
        finance,
        "receivable-pending",
        new Date("2026-08-15T12:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      receivedAmountFen: 0,
      remainingAmountFen: 236_000,
      status: "PENDING",
      overdue: true,
      overdueDays: 2,
      payments: [
        expect.objectContaining({
          id: payment.payment.id,
          amountFen: 236_000,
          reversal: expect.objectContaining({
            id: reversed.reversal.id,
            reason: "金额录入错误",
          }),
        }),
      ],
    });
    await expect(
      prisma.payment.findUnique({ where: { id: payment.payment.id } }),
    ).resolves.toMatchObject({
      id: payment.payment.id,
      amountFen: 236_000,
    });
    await expect(
      listBusinessAudit(prisma, owner, {
        action: "PAYMENT_REVERSED",
        objectType: "PAYMENT",
        referenceCode: "YS-20260801-0001",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: reversed.auditId,
        actorName: finance.name,
        objectId: payment.payment.id,
        reason: "金额录入错误",
        summary: "撤销收款 ¥2360.00；撤销后未收 ¥2360.00；结算状态：待收款",
      }),
    ]);
  });

  it("老板撤销多笔收款中的一笔后保留其他有效收款并维持部分收款", async () => {
    const first = await recordPayment(prisma, finance, {
      receivableId: "receivable-pending",
      paymentDate: new Date("2026-08-13T00:00:00.000Z"),
      amountFen: 40_000,
      method: "WECHAT",
      idempotencyKey: "payment-to-reverse-from-partial",
    });
    const second = await recordPayment(prisma, owner, {
      receivableId: "receivable-pending",
      paymentDate: new Date("2026-08-14T00:00:00.000Z"),
      amountFen: 20_000,
      method: "CASH",
      idempotencyKey: "payment-to-keep-after-reversal",
    });

    await expect(
      reversePayment(prisma, owner, {
        paymentId: first.payment.id,
        reason: "收款归属录入错误",
        idempotencyKey: "reverse-one-of-multiple-payments",
      }),
    ).resolves.toMatchObject({
      receivable: {
        receivedAmountFen: 20_000,
        remainingAmountFen: 216_000,
        status: "PARTIAL",
      },
    });
    await expect(
      getReceivableDetail(prisma, finance, "receivable-pending"),
    ).resolves.toMatchObject({
      receivedAmountFen: 20_000,
      remainingAmountFen: 216_000,
      status: "PARTIAL",
      payments: expect.arrayContaining([
        expect.objectContaining({
          id: first.payment.id,
          reversal: expect.objectContaining({ reason: "收款归属录入错误" }),
        }),
        expect.objectContaining({ id: second.payment.id, reversal: null }),
      ]),
    });
  });

  it("重复撤销只保留一条反向记录且反向记录不能再次撤销", async () => {
    const payment = await recordPayment(prisma, finance, {
      receivableId: "receivable-pending",
      paymentDate: new Date("2026-08-13T00:00:00.000Z"),
      amountFen: 40_000,
      method: "ALIPAY",
      idempotencyKey: "payment-before-duplicate-reversal",
    });
    const input = {
      paymentId: payment.payment.id,
      reason: "重复登记",
      idempotencyKey: "same-reversal-submit",
    };

    const first = await reversePayment(prisma, finance, input);
    const duplicate = await reversePayment(prisma, finance, input);
    const repeatedWithNewKey = await reversePayment(prisma, owner, {
      ...input,
      reason: "再次请求不应产生新记录",
      idempotencyKey: "another-reversal-submit",
    });

    expect(duplicate).toEqual({ ...first, duplicate: true });
    expect(repeatedWithNewKey).toMatchObject({
      reversal: { id: first.reversal.id, reason: "重复登记" },
      receivable: {
        receivedAmountFen: 0,
        remainingAmountFen: 236_000,
        status: "PENDING",
      },
      duplicate: true,
    });
    await expect(prisma.paymentReversal.count()).resolves.toBe(1);
    await expect(
      reversePayment(prisma, finance, {
        paymentId: first.reversal.id,
        reason: "错误尝试撤销反向记录",
        idempotencyKey: "reverse-a-reversal",
      }),
    ).rejects.toMatchObject({
      code: "REVERSAL_NOT_REVERSIBLE",
      message: "撤销收款反向记录不能再次撤销。",
    } satisfies Partial<ReceivableServiceError>);
  });

  it("撤销收款必须填写原因且销售和仓库不能操作", async () => {
    const payment = await recordPayment(prisma, finance, {
      receivableId: "receivable-pending",
      paymentDate: new Date("2026-08-13T00:00:00.000Z"),
      amountFen: 40_000,
      method: "BANK_TRANSFER",
      idempotencyKey: "payment-before-invalid-reversals",
    });

    await expect(
      reversePayment(prisma, finance, {
        paymentId: payment.payment.id,
        reason: "   ",
        idempotencyKey: "empty-reversal-reason",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REVERSAL_REASON",
      message: "撤销原因不能为空且不能超过 1000 个字符。",
    } satisfies Partial<ReceivableServiceError>);
    for (const actor of [sales, warehouse]) {
      await expect(
        reversePayment(prisma, actor, {
          paymentId: payment.payment.id,
          reason: "无权操作",
          idempotencyKey: `forbidden-reversal-${actor.id}`,
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      } satisfies Partial<ReceivableServiceError>);
    }
    await expect(prisma.paymentReversal.count()).resolves.toBe(0);
    await expect(
      getReceivableDetail(prisma, finance, "receivable-pending"),
    ).resolves.toMatchObject({
      receivedAmountFen: 40_000,
      remainingAmountFen: 196_000,
      status: "PARTIAL",
    });
  });

  it("零、负数、超额金额和无权角色均不能产生收款", async () => {
    const baseInput = {
      receivableId: "receivable-pending",
      paymentDate: new Date("2026-08-13T00:00:00.000Z"),
      method: "WECHAT" as const,
      idempotencyKey: "invalid-payment-submit",
    };

    for (const amountFen of [0, -1]) {
      await expect(
        recordPayment(prisma, finance, { ...baseInput, amountFen }),
      ).rejects.toMatchObject({
        code: "INVALID_AMOUNT",
      } satisfies Partial<ReceivableServiceError>);
    }
    await expect(
      recordPayment(prisma, finance, {
        ...baseInput,
        amountFen: 236_001,
      }),
    ).rejects.toMatchObject({
      code: "AMOUNT_EXCEEDS_REMAINING",
      message: "收款金额不能超过当前未收金额 ¥2360.00。",
    } satisfies Partial<ReceivableServiceError>);
    for (const actor of [sales, warehouse]) {
      await expect(
        recordPayment(prisma, actor, {
          ...baseInput,
          amountFen: 10_000,
          idempotencyKey: `forbidden-${actor.id}`,
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      } satisfies Partial<ReceivableServiceError>);
    }

    await expect(
      getReceivableDetail(prisma, finance, "receivable-pending"),
    ).resolves.toMatchObject({
      receivedAmountFen: 0,
      remainingAmountFen: 236_000,
      status: "PENDING",
      payments: [],
    });
  });

  it("相同提交标识重复提交只保留一笔收款，不同内容复用标识会被拒绝", async () => {
    const input = {
      receivableId: "receivable-pending",
      paymentDate: new Date("2026-08-13T00:00:00.000Z"),
      amountFen: 40_000,
      method: "ALIPAY" as const,
      referenceNumber: "ZFB-001",
      idempotencyKey: "same-payment-submit",
    };
    const recordedAt = new Date("2026-08-13T07:00:00.000Z");

    const first = await recordPayment(prisma, finance, input, recordedAt);
    const duplicate = await recordPayment(prisma, finance, input, recordedAt);

    expect(duplicate).toEqual({ ...first, duplicate: true });
    await expect(
      recordPayment(prisma, finance, {
        ...input,
        amountFen: 30_000,
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    } satisfies Partial<ReceivableServiceError>);
    await expect(
      getReceivableDetail(prisma, finance, "receivable-pending"),
    ).resolves.toMatchObject({
      receivedAmountFen: 40_000,
      remainingAmountFen: 196_000,
      payments: [expect.objectContaining({ id: first.payment.id })],
    });
    await expect(
      listBusinessAudit(prisma, owner, {
        action: "PAYMENT_RECORDED",
        objectType: "PAYMENT",
      }),
    ).resolves.toHaveLength(1);
  });

  it("已登记收款在数据库层不可编辑或删除", async () => {
    const recorded = await recordPayment(prisma, finance, {
      receivableId: "receivable-pending",
      paymentDate: new Date("2026-08-13T00:00:00.000Z"),
      amountFen: 40_000,
      method: "BANK_TRANSFER",
      idempotencyKey: "immutable-payment-submit",
    });

    await expect(
      prisma.payment.update({
        where: { id: recorded.payment.id },
        data: { amountFen: 30_000 },
      }),
    ).rejects.toThrow("payment is append-only");
    await expect(
      prisma.payment.delete({ where: { id: recorded.payment.id } }),
    ).rejects.toThrow("payment is append-only");
  });

  it("撤销收款反向记录在数据库层不可编辑或删除", async () => {
    const payment = await recordPayment(prisma, finance, {
      receivableId: "receivable-pending",
      paymentDate: new Date("2026-08-13T00:00:00.000Z"),
      amountFen: 40_000,
      method: "BANK_TRANSFER",
      idempotencyKey: "payment-before-immutable-reversal",
    });
    const reversed = await reversePayment(prisma, finance, {
      paymentId: payment.payment.id,
      reason: "金额录入错误",
      idempotencyKey: "immutable-reversal",
    });

    await expect(
      prisma.paymentReversal.update({
        where: { id: reversed.reversal.id },
        data: { reason: "试图修改原因" },
      }),
    ).rejects.toThrow("payment reversal is append-only");
    await expect(
      prisma.paymentReversal.delete({ where: { id: reversed.reversal.id } }),
    ).rejects.toThrow("payment reversal is append-only");
  });

  it("并发登记不能让累计收款超过原始金额", async () => {
    const results = await Promise.allSettled([
      recordPayment(prisma, finance, {
        receivableId: "receivable-pending",
        paymentDate: new Date("2026-08-13T00:00:00.000Z"),
        amountFen: 200_000,
        method: "BANK_TRANSFER",
        idempotencyKey: "concurrent-payment-one",
      }),
      recordPayment(prisma, owner, {
        receivableId: "receivable-pending",
        paymentDate: new Date("2026-08-13T00:00:00.000Z"),
        amountFen: 200_000,
        method: "CASH",
        idempotencyKey: "concurrent-payment-two",
      }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    await expect(
      getReceivableDetail(prisma, finance, "receivable-pending"),
    ).resolves.toMatchObject({
      receivedAmountFen: 200_000,
      remainingAmountFen: 36_000,
      status: "PARTIAL",
      payments: [expect.objectContaining({ amountFen: 200_000 })],
    });
  });

  it("收款业务审计写入失败时收款、金额与状态全部回滚", async () => {
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_payment_recorded_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'PAYMENT_RECORDED' THEN
          RAISE EXCEPTION 'forced payment audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_payment_recorded_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION fail_payment_recorded_audit();
    `);

    try {
      await expect(
        recordPayment(prisma, finance, {
          receivableId: "receivable-pending",
          paymentDate: new Date("2026-08-13T00:00:00.000Z"),
          amountFen: 40_000,
          method: "BANK_TRANSFER",
          idempotencyKey: "rollback-payment-submit",
        }),
      ).rejects.toThrow("forced payment audit failure");
      await expect(
        getReceivableDetail(prisma, finance, "receivable-pending"),
      ).resolves.toMatchObject({
        receivedAmountFen: 0,
        remainingAmountFen: 236_000,
        status: "PENDING",
        payments: [],
      });
      await expect(
        listBusinessAudit(prisma, owner, { action: "PAYMENT_RECORDED" }),
      ).resolves.toEqual([]);
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_payment_recorded_audit_insert ON "business_audit";
        DROP FUNCTION IF EXISTS fail_payment_recorded_audit();
      `);
    }
  });

  it("撤销业务审计写入失败时反向记录、应收金额与状态全部回滚", async () => {
    const payment = await recordPayment(prisma, finance, {
      receivableId: "receivable-pending",
      paymentDate: new Date("2026-08-13T00:00:00.000Z"),
      amountFen: 40_000,
      method: "BANK_TRANSFER",
      idempotencyKey: "payment-before-reversal-rollback",
    });
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_payment_reversed_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'PAYMENT_REVERSED' THEN
          RAISE EXCEPTION 'forced payment reversal audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_payment_reversed_audit_insert
      BEFORE INSERT ON "business_audit"
      FOR EACH ROW EXECUTE FUNCTION fail_payment_reversed_audit();
    `);

    try {
      await expect(
        reversePayment(prisma, finance, {
          paymentId: payment.payment.id,
          reason: "金额录入错误",
          idempotencyKey: "rollback-reversal-submit",
        }),
      ).rejects.toThrow("forced payment reversal audit failure");
      await expect(prisma.paymentReversal.count()).resolves.toBe(0);
      await expect(
        getReceivableDetail(prisma, finance, "receivable-pending"),
      ).resolves.toMatchObject({
        receivedAmountFen: 40_000,
        remainingAmountFen: 196_000,
        status: "PARTIAL",
        payments: [expect.objectContaining({ reversal: null })],
      });
      await expect(
        listBusinessAudit(prisma, owner, { action: "PAYMENT_REVERSED" }),
      ).resolves.toEqual([]);
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_payment_reversed_audit_insert ON "business_audit";
        DROP FUNCTION IF EXISTS fail_payment_reversed_audit();
      `);
    }
  });
});
