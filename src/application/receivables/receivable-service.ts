import { randomUUID } from "node:crypto";

import {
  Prisma,
  type PaymentMethod,
  type PrismaClient,
} from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";
import { isSerializationFailure } from "../database/prisma-errors";

export type ReceivableFilters = {
  query?: string;
  customerId?: string;
  responsibleSalesId?: string;
  status?: "PENDING" | "PARTIAL" | "SETTLED";
  overdueOnly?: boolean;
  dueFrom?: Date;
  dueTo?: Date;
};

export type ReceivableListItem = {
  id: string;
  receivableNumber: string;
  salesOrderId: string;
  salesOrderNumber: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  responsibleSalesId: string;
  responsibleSalesName: string;
  originalAmountFen: number;
  receivedAmountFen: number;
  remainingAmountFen: number;
  dueDate: Date;
  status: "PENDING" | "PARTIAL" | "SETTLED";
  overdue: boolean;
  overdueDays: number;
};

export type ReceivableListPage = {
  items: ReceivableListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ReceivableProgressFields = {
  id: string;
  receivableNumber: string;
  customer: {
    id: string;
    code: string;
    name: string;
  };
  salesOrder: {
    id: string;
    salesOrderNumber: string;
  };
  originalAmountFen: number;
  receivedAmountFen: number;
  remainingAmountFen: number;
  status: "PENDING" | "PARTIAL" | "SETTLED";
  overdue: boolean;
  overdueDays: number;
  dueDate: Date;
};

export type ReceivableProgressDetail = ReceivableProgressFields & {
  visibility: "progress";
};

export type PaymentRecord = {
  id: string;
  paymentDate: Date;
  amountFen: number;
  method: PaymentMethod;
  referenceNumber: string | null;
  note: string | null;
  recordedAt: Date;
  recordedBy: { id: string; name: string };
  auditId: string;
};

export type ReceivableFinancialDetail = Omit<
  ReceivableProgressFields,
  "customer"
> & {
  visibility: "financial";
  customer: ReceivableProgressFields["customer"] & {
    responsibleSalesId: string;
    responsibleSalesName: string;
  };
  outboundAt: Date;
  paymentTermDays: number;
  payments: PaymentRecord[];
};

export type ReceivableDetail =
  | ReceivableProgressDetail
  | ReceivableFinancialDetail;

export class ReceivableServiceError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "RECEIVABLE_NOT_FOUND"
      | "INVALID_AMOUNT"
      | "AMOUNT_EXCEEDS_REMAINING"
      | "INVALID_PAYMENT_DATE"
      | "INVALID_PAYMENT_METHOD"
      | "INVALID_PAYMENT_DETAILS"
      | "RECEIVABLE_SETTLED"
      | "IDEMPOTENCY_CONFLICT"
      | "RECEIVABLE_CHANGED",
    message: string,
  ) {
    super(message);
    this.name = "ReceivableServiceError";
  }
}

function assertReceivablesListAccess(actor: Actor): void {
  if (authorizeCapability(actor, "RECEIVABLES_VIEW").kind !== "authorized") {
    throw new ReceivableServiceError("FORBIDDEN", "没有访问应收列表的权限。");
  }
}

function assertReceivablesProgressAccess(actor: Actor): void {
  if (
    authorizeCapability(actor, "RECEIVABLES_PROGRESS_VIEW").kind !==
    "authorized"
  ) {
    throw new ReceivableServiceError("FORBIDDEN", "没有查看收款进度的权限。");
  }
}

function assertPaymentAccess(actor: Actor): void {
  if (authorizeCapability(actor, "RECEIVABLES_VIEW").kind !== "authorized") {
    throw new ReceivableServiceError("FORBIDDEN", "没有登记收款的权限。");
  }
}

function chinaDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function chinaToday(date: Date): Date {
  return new Date(`${chinaDate(date)}T00:00:00.000Z`);
}

function overdueFacts(
  dueDate: Date,
  remainingAmountFen: number,
  today: Date,
): { overdue: boolean; overdueDays: number } {
  if (remainingAmountFen <= 0 || dueDate >= today) {
    return { overdue: false, overdueDays: 0 };
  }
  return {
    overdue: true,
    overdueDays: Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000),
  };
}

function receivableWhere(
  filters: ReceivableFilters,
  today: Date,
): Prisma.ReceivableWhereInput {
  const query = filters.query?.trim();
  const dueDate =
    filters.dueFrom || filters.dueTo || filters.overdueOnly
      ? {
          gte: filters.dueFrom,
          lte: filters.dueTo,
          lt: filters.overdueOnly ? today : undefined,
        }
      : undefined;

  return {
    customerId: filters.customerId,
    responsibleSalesIdSnapshot: filters.responsibleSalesId,
    status: filters.status,
    remainingAmountFen: filters.overdueOnly ? { gt: 0 } : undefined,
    dueDate,
    OR: query
      ? [
          { receivableNumber: { contains: query, mode: "insensitive" } },
          { customerNameSnapshot: { contains: query, mode: "insensitive" } },
          {
            salesOrder: {
              salesOrderNumber: { contains: query, mode: "insensitive" },
            },
          },
        ]
      : undefined,
  };
}

export async function listReceivablesPage(
  database: PrismaClient,
  actor: Actor,
  filters: ReceivableFilters,
  pagination: { page: number; pageSize: number },
  now = new Date(),
): Promise<ReceivableListPage> {
  assertReceivablesListAccess(actor);
  const page = Math.max(1, pagination.page);
  const pageSize = Math.max(1, pagination.pageSize);
  const today = chinaToday(now);
  const where = receivableWhere(filters, today);
  const unsettledWhere: Prisma.ReceivableWhereInput = {
    AND: [where, { status: { not: "SETTLED" } }],
  };
  const settledWhere: Prisma.ReceivableWhereInput = {
    AND: [where, { status: "SETTLED" }],
  };
  const [total, unsettledTotal] = await Promise.all([
    database.receivable.count({ where }),
    database.receivable.count({ where: unsettledWhere }),
  ]);
  const offset = (page - 1) * pageSize;
  const unsettledTake = Math.max(0, Math.min(pageSize, unsettledTotal - offset));
  const settledTake = pageSize - unsettledTake;
  const include = {
    salesOrder: {
      select: {
        salesOrderNumber: true,
        responsibleSalesNameSnapshot: true,
      },
    },
  } satisfies Prisma.ReceivableInclude;
  const [unsettledRecords, settledRecords] = await Promise.all([
    unsettledTake > 0
      ? database.receivable.findMany({
          where: unsettledWhere,
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
          skip: offset,
          take: unsettledTake,
          include,
        })
      : [],
    settledTake > 0
      ? database.receivable.findMany({
          where: settledWhere,
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
          skip: Math.max(0, offset - unsettledTotal),
          take: settledTake,
          include,
        })
      : [],
  ]);
  const records = [...unsettledRecords, ...settledRecords];

  return {
    items: records.map((record) => ({
      id: record.id,
      receivableNumber: record.receivableNumber,
      salesOrderId: record.salesOrderId,
      salesOrderNumber: record.salesOrder.salesOrderNumber,
      customerId: record.customerId,
      customerCode: record.customerCodeSnapshot,
      customerName: record.customerNameSnapshot,
      responsibleSalesId: record.responsibleSalesIdSnapshot,
      responsibleSalesName: record.salesOrder.responsibleSalesNameSnapshot,
      originalAmountFen: record.originalAmountFen,
      receivedAmountFen: record.receivedAmountFen,
      remainingAmountFen: record.remainingAmountFen,
      dueDate: record.dueDate,
      status: record.status,
      ...overdueFacts(record.dueDate, record.remainingAmountFen, today),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getReceivableDetail(
  database: PrismaClient,
  actor: Actor,
  receivableId: string,
  now = new Date(),
): Promise<ReceivableDetail> {
  assertReceivablesProgressAccess(actor);
  const hasFinancialAccess =
    authorizeCapability(actor, "RECEIVABLES_VIEW").kind === "authorized";
  const receivable = await database.receivable.findFirst({
    where: {
      id: receivableId,
      responsibleSalesIdSnapshot: hasFinancialAccess ? undefined : actor.id,
    },
    include: {
      salesOrder: {
        select: {
          salesOrderNumber: true,
          responsibleSalesNameSnapshot: true,
        },
      },
    },
  });
  if (!receivable) {
    throw new ReceivableServiceError(
      "RECEIVABLE_NOT_FOUND",
      "应收不存在或不可访问。",
    );
  }

  const today = chinaToday(now);
  const common: ReceivableProgressFields = {
    id: receivable.id,
    receivableNumber: receivable.receivableNumber,
    customer: {
      id: receivable.customerId,
      code: receivable.customerCodeSnapshot,
      name: receivable.customerNameSnapshot,
    },
    salesOrder: {
      id: receivable.salesOrderId,
      salesOrderNumber: receivable.salesOrder.salesOrderNumber,
    },
    originalAmountFen: receivable.originalAmountFen,
    receivedAmountFen: receivable.receivedAmountFen,
    remainingAmountFen: receivable.remainingAmountFen,
    status: receivable.status,
    ...overdueFacts(receivable.dueDate, receivable.remainingAmountFen, today),
    dueDate: receivable.dueDate,
  };

  if (!hasFinancialAccess) {
    return { visibility: "progress", ...common };
  }
  const [payments, paymentAudits] = await Promise.all([
    database.payment.findMany({
      where: { receivableId: receivable.id },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    }),
    database.businessAudit.findMany({
      where: {
        objectType: "PAYMENT",
        action: "PAYMENT_RECORDED",
        referenceCode: receivable.receivableNumber,
      },
      select: { id: true, objectId: true },
    }),
  ]);
  const auditIdByPaymentId = new Map(
    paymentAudits.map((audit) => [audit.objectId, audit.id]),
  );
  return {
    visibility: "financial",
    ...common,
    customer: {
      ...common.customer,
      responsibleSalesId: receivable.responsibleSalesIdSnapshot,
      responsibleSalesName:
        receivable.salesOrder.responsibleSalesNameSnapshot,
    },
    outboundAt: receivable.outboundAt,
    paymentTermDays: receivable.paymentTermDaysSnapshot,
    payments: payments.map((payment) => ({
      id: payment.id,
      paymentDate: payment.paymentDate,
      amountFen: payment.amountFen,
      method: payment.method,
      referenceNumber: payment.referenceNumber,
      note: payment.note,
      recordedAt: payment.recordedAt,
      recordedBy: { id: payment.actorId, name: payment.actorName },
      auditId: auditIdByPaymentId.get(payment.id) ?? "",
    })),
  };
}

export type RecordPaymentInput = {
  receivableId: string;
  paymentDate: Date;
  amountFen: number;
  method: PaymentMethod;
  referenceNumber?: string;
  note?: string;
  idempotencyKey: string;
};

export type RecordPaymentResult = {
  payment: Omit<PaymentRecord, "auditId">;
  receivable: {
    id: string;
    receivedAmountFen: number;
    remainingAmountFen: number;
    status: "PARTIAL" | "SETTLED";
  };
  auditId: string;
  duplicate: boolean;
};

const paymentMethods = new Set<PaymentMethod>([
  "CASH",
  "BANK_TRANSFER",
  "WECHAT",
  "ALIPAY",
  "OTHER",
]);
const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "现金",
  BANK_TRANSFER: "银行转账",
  WECHAT: "微信",
  ALIPAY: "支付宝",
  OTHER: "其他",
};

type ParsedPaymentInput = Omit<
  RecordPaymentInput,
  "referenceNumber" | "note"
> & {
  referenceNumber: string | null;
  note: string | null;
};

function parsePaymentInput(input: RecordPaymentInput): ParsedPaymentInput {
  if (!Number.isSafeInteger(input.amountFen) || input.amountFen <= 0) {
    throw new ReceivableServiceError(
      "INVALID_AMOUNT",
      "收款金额必须大于零。",
    );
  }
  if (Number.isNaN(input.paymentDate.getTime())) {
    throw new ReceivableServiceError(
      "INVALID_PAYMENT_DATE",
      "请选择有效的收款日期。",
    );
  }
  if (!paymentMethods.has(input.method)) {
    throw new ReceivableServiceError(
      "INVALID_PAYMENT_METHOD",
      "请选择有效的收款方式。",
    );
  }
  const receivableId = input.receivableId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const referenceNumber = input.referenceNumber?.trim() || null;
  const note = input.note?.trim() || null;
  if (
    !receivableId ||
    !idempotencyKey ||
    idempotencyKey.length > 128 ||
    (referenceNumber?.length ?? 0) > 160 ||
    (note?.length ?? 0) > 1_000
  ) {
    throw new ReceivableServiceError(
      "INVALID_PAYMENT_DETAILS",
      "收款参考号或备注不符合要求。",
    );
  }
  return {
    ...input,
    receivableId,
    idempotencyKey,
    paymentDate: new Date(
      Date.UTC(
        input.paymentDate.getUTCFullYear(),
        input.paymentDate.getUTCMonth(),
        input.paymentDate.getUTCDate(),
      ),
    ),
    referenceNumber,
    note,
  };
}

function matchesPaymentSubmission(
  payment: {
    receivableId: string;
    paymentDate: Date;
    amountFen: number;
    method: PaymentMethod;
    referenceNumber: string | null;
    note: string | null;
    actorId: string;
  },
  actor: Actor,
  input: ParsedPaymentInput,
): boolean {
  return (
    payment.receivableId === input.receivableId &&
    payment.paymentDate.getTime() === input.paymentDate.getTime() &&
    payment.amountFen === input.amountFen &&
    payment.method === input.method &&
    payment.referenceNumber === input.referenceNumber &&
    payment.note === input.note &&
    payment.actorId === actor.id
  );
}

async function existingPaymentResult(
  database: PrismaClient | Prisma.TransactionClient,
  actor: Actor,
  input: ParsedPaymentInput,
): Promise<RecordPaymentResult | null> {
  const payment = await database.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (!payment) return null;
  if (!matchesPaymentSubmission(payment, actor, input)) {
    throw new ReceivableServiceError(
      "IDEMPOTENCY_CONFLICT",
      "本次提交标识已用于其他收款，请刷新后重试。",
    );
  }
  const [receivable, audit] = await Promise.all([
    database.receivable.findUniqueOrThrow({ where: { id: payment.receivableId } }),
    database.businessAudit.findFirstOrThrow({
      where: {
        action: "PAYMENT_RECORDED",
        objectType: "PAYMENT",
        objectId: payment.id,
      },
      select: { id: true },
    }),
  ]);
  return {
    payment: {
      id: payment.id,
      paymentDate: payment.paymentDate,
      amountFen: payment.amountFen,
      method: payment.method,
      referenceNumber: payment.referenceNumber,
      note: payment.note,
      recordedAt: payment.recordedAt,
      recordedBy: { id: payment.actorId, name: payment.actorName },
    },
    receivable: {
      id: receivable.id,
      receivedAmountFen: receivable.receivedAmountFen,
      remainingAmountFen: receivable.remainingAmountFen,
      status: receivable.status === "SETTLED" ? "SETTLED" : "PARTIAL",
    },
    auditId: audit.id,
    duplicate: true,
  };
}

export async function recordPayment(
  database: PrismaClient,
  actor: Actor,
  input: RecordPaymentInput,
  recordedAt = new Date(),
): Promise<RecordPaymentResult> {
  assertPaymentAccess(actor);
  const parsed = parsePaymentInput(input);
  const paymentId = randomUUID();
  const auditId = randomUUID();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await database.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`
            SELECT "id"
            FROM "receivable"
            WHERE "id" = ${parsed.receivableId}
            FOR UPDATE
          `;
          const duplicate = await existingPaymentResult(
            transaction,
            actor,
            parsed,
          );
          if (duplicate) return duplicate;

          const receivable = await transaction.receivable.findUnique({
            where: { id: parsed.receivableId },
          });
          if (!receivable) {
            throw new ReceivableServiceError(
              "RECEIVABLE_NOT_FOUND",
              "应收不存在或不可登记收款。",
            );
          }
          if (receivable.remainingAmountFen === 0 || receivable.status === "SETTLED") {
            throw new ReceivableServiceError(
              "RECEIVABLE_SETTLED",
              "应收已结清，不能继续登记收款。",
            );
          }
          if (parsed.amountFen > receivable.remainingAmountFen) {
            throw new ReceivableServiceError(
              "AMOUNT_EXCEEDS_REMAINING",
              `收款金额不能超过当前未收金额 ¥${(receivable.remainingAmountFen / 100).toFixed(2)}。`,
            );
          }

          const receivedAmountFen =
            receivable.receivedAmountFen + parsed.amountFen;
          const remainingAmountFen =
            receivable.remainingAmountFen - parsed.amountFen;
          const status = remainingAmountFen === 0 ? "SETTLED" : "PARTIAL";
          const payment = await transaction.payment.create({
            data: {
              id: paymentId,
              receivableId: receivable.id,
              paymentDate: parsed.paymentDate,
              amountFen: parsed.amountFen,
              method: parsed.method,
              referenceNumber: parsed.referenceNumber,
              note: parsed.note,
              idempotencyKey: parsed.idempotencyKey,
              recordedAt,
              actorId: actor.id,
              actorName: actor.name,
            },
          });
          await transaction.receivable.update({
            where: { id: receivable.id },
            data: { receivedAmountFen, remainingAmountFen, status },
          });
          await transaction.businessAudit.create({
            data: {
              id: auditId,
              actorId: actor.id,
              actorName: actor.name,
              action: "PAYMENT_RECORDED",
              objectType: "PAYMENT",
              objectId: payment.id,
              occurredAt: recordedAt,
              referenceCode: receivable.receivableNumber,
              summary: `登记收款 ¥${(parsed.amountFen / 100).toFixed(2)}；方式：${paymentMethodLabels[parsed.method]}；登记后未收 ¥${(remainingAmountFen / 100).toFixed(2)}`,
            },
          });

          return {
            payment: {
              id: payment.id,
              paymentDate: payment.paymentDate,
              amountFen: payment.amountFen,
              method: payment.method,
              referenceNumber: payment.referenceNumber,
              note: payment.note,
              recordedAt: payment.recordedAt,
              recordedBy: { id: payment.actorId, name: payment.actorName },
            },
            receivable: {
              id: receivable.id,
              receivedAmountFen,
              remainingAmountFen,
              status,
            },
            auditId,
            duplicate: false,
          } satisfies RecordPaymentResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerializationFailure(error) && attempt < 2) continue;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const duplicate = await existingPaymentResult(database, actor, parsed);
        if (duplicate) return duplicate;
      }
      if (isSerializationFailure(error)) {
        throw new ReceivableServiceError(
          "RECEIVABLE_CHANGED",
          "应收刚刚发生变化，未登记收款。请刷新后重试。",
        );
      }
      throw error;
    }
  }

  throw new ReceivableServiceError(
    "RECEIVABLE_CHANGED",
    "应收刚刚发生变化，未登记收款。请刷新后重试。",
  );
}
