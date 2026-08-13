import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";

const maxDatabaseInteger = 2_147_483_647;

const transactionPriceSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  .transform((value, context) => {
    const [yuan, fractional = ""] = value.split(".");
    const fen = Number(yuan) * 100 + Number(fractional.padEnd(2, "0"));
    if (!Number.isSafeInteger(fen) || fen > maxDatabaseInteger) {
      context.addIssue({ code: "custom", message: "成交价超出允许范围。" });
      return z.NEVER;
    }
    return fen;
  });

const draftInputSchema = z.object({
  customerId: z.string().min(1),
  items: z
    .array(
      z.object({
        skuId: z.string().min(1),
        quantity: z.number().int().positive().max(maxDatabaseInteger),
        transactionPrice: transactionPriceSchema,
      }),
    )
    .min(1),
});
const updateDraftInputSchema = draftInputSchema.extend({
  salesOrderId: z.string().min(1),
});

type ParsedDraftInput = z.output<typeof draftInputSchema>;

export type SalesOrderDraftInput = z.input<typeof draftInputSchema>;
export type UpdateSalesOrderDraftInput = z.input<typeof updateDraftInputSchema>;
export type SalesOrderCustomerSnapshot = {
  customerCode: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  responsibleSalesId: string;
  responsibleSalesName: string;
  paymentTermDays: number;
};
export type SalesOrderDraftItem = {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  inventoryUnit: string;
  referencePriceFen: number;
  availableQuantity: number;
  quantity: number;
  transactionPriceFen: number;
  subtotalFen: number;
  inventoryRisk: boolean;
  shortageQuantity: number;
};
export type SalesOrderDraft = {
  id: string;
  salesOrderNumber: string;
  status: "DRAFT";
  creatorId: string;
  customerId: string;
  customerSnapshot: SalesOrderCustomerSnapshot;
  items: SalesOrderDraftItem[];
  totalAmountFen: number;
  createdAt: Date;
  updatedAt: Date;
  auditId?: string;
};
export type SalesOrderFilters = {
  query?: string;
  responsibleSalesId?: string;
  status?: "DRAFT" | "CONFIRMED" | "OUTBOUND" | "CANCELLED";
  createdFrom?: Date;
  createdTo?: Date;
};
export type SalesOrderListItem = {
  id: string;
  salesOrderNumber: string;
  customerName: string;
  responsibleSalesId: string;
  responsibleSalesName: string;
  creatorId: string;
  itemCount: number;
  totalAmountFen: number;
  status: "DRAFT" | "CONFIRMED" | "OUTBOUND" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
  canEdit: boolean;
  canDelete: boolean;
};
export type SalesOrderListPage = {
  items: SalesOrderListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type SalesOrderResponsibleOption = { id: string; name: string };

export class SalesOrderServiceError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "CUSTOMER_NOT_AVAILABLE"
      | "SKU_NOT_AVAILABLE"
      | "INVALID_ITEMS"
      | "DUPLICATE_SKU"
      | "INVALID_QUANTITY"
      | "INVALID_TRANSACTION_PRICE"
      | "AMOUNT_TOO_LARGE"
      | "DRAFT_NOT_FOUND",
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "SalesOrderServiceError";
  }
}

function isOwner(actor: Actor): boolean {
  return actor.roles.includes("OWNER");
}

function assertSalesOrderAccess(actor: Actor) {
  if (authorizeCapability(actor, "SALES_ORDERS_VIEW").kind !== "authorized") {
    throw new SalesOrderServiceError("FORBIDDEN", "没有访问销售单的权限。");
  }
}

function parseDraftInput(input: SalesOrderDraftInput): ParsedDraftInput {
  const result = draftInputSchema.safeParse(input);
  if (result.success) return result.data;

  const quantityIssue = result.error.issues.find(
    ({ path }) => path.at(-1) === "quantity",
  );
  if (quantityIssue) {
    const itemIndex = quantityIssue.path[1];
    throw new SalesOrderServiceError(
      "INVALID_QUANTITY",
      "数量必须是正整数。",
      typeof itemIndex === "number" ? `items.${itemIndex}.quantity` : undefined,
    );
  }
  const priceIssue = result.error.issues.find(
    ({ path }) => path.at(-1) === "transactionPrice",
  );
  if (priceIssue) {
    const itemIndex = priceIssue.path[1];
    throw new SalesOrderServiceError(
      "INVALID_TRANSACTION_PRICE",
      "成交价必须是最多两位小数的非负人民币金额。",
      typeof itemIndex === "number"
        ? `items.${itemIndex}.transactionPrice`
        : undefined,
    );
  }
  throw new SalesOrderServiceError(
    "INVALID_ITEMS",
    "销售单草稿至少需要一条有效明细。",
    "items",
  );
}

function chinaDateCode(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replaceAll("-", "");
}

type DraftRecord = Prisma.SalesOrderGetPayload<{
  include: {
    items: {
      include: { sku: { include: { inventoryBalance: true } } };
    };
  };
}>;

function toSalesOrderDraft(order: DraftRecord, auditId?: string): SalesOrderDraft {
  if (order.status !== "DRAFT") {
    throw new SalesOrderServiceError("FORBIDDEN", "销售单不是草稿状态。");
  }
  return {
    id: order.id,
    salesOrderNumber: order.salesOrderNumber,
    status: order.status,
    creatorId: order.creatorId,
    customerId: order.customerId,
    customerSnapshot: {
      customerCode: order.customerCodeSnapshot,
      name: order.customerNameSnapshot,
      contactName: order.customerContactNameSnapshot,
      phone: order.customerPhoneSnapshot,
      address: order.customerAddressSnapshot,
      responsibleSalesId: order.responsibleSalesIdSnapshot,
      responsibleSalesName: order.responsibleSalesNameSnapshot,
      paymentTermDays: order.paymentTermDaysSnapshot,
    },
    items: order.items
      .toSorted((left, right) => left.position - right.position)
      .map((item) => ({
        id: item.id,
        skuId: item.skuId,
        skuCode: item.skuCodeSnapshot,
        skuName: item.skuNameSnapshot,
        inventoryUnit: item.inventoryUnitSnapshot,
        referencePriceFen: item.referencePriceFenSnapshot,
        availableQuantity:
          (item.sku.inventoryBalance?.onHandQuantity ?? 0) -
          (item.sku.inventoryBalance?.reservedQuantity ?? 0),
        quantity: item.quantity,
        transactionPriceFen: item.transactionPriceFen,
        subtotalFen: item.subtotalFen,
        inventoryRisk:
          item.quantity >
          (item.sku.inventoryBalance?.onHandQuantity ?? 0) -
            (item.sku.inventoryBalance?.reservedQuantity ?? 0),
        shortageQuantity: Math.max(
          0,
          item.quantity -
            ((item.sku.inventoryBalance?.onHandQuantity ?? 0) -
              (item.sku.inventoryBalance?.reservedQuantity ?? 0)),
        ),
      })),
    totalAmountFen: order.totalAmountFen,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    auditId,
  };
}

async function resolveDraftFacts(
  transaction: Prisma.TransactionClient,
  actor: Actor,
  input: ParsedDraftInput,
) {
  const customer = await transaction.customer.findFirst({
    where: {
      id: input.customerId,
      enabled: true,
      responsibleSalesId: isOwner(actor) ? undefined : actor.id,
    },
    include: { responsibleSales: { select: { id: true, name: true } } },
  });
  if (!customer) {
    throw new SalesOrderServiceError(
      "CUSTOMER_NOT_AVAILABLE",
      "客户不存在、已停用或不在你的负责人数据范围内。",
      "customerId",
    );
  }

  const duplicateSku = input.items.find(
    (item, index) =>
      input.items.findIndex(({ skuId }) => skuId === item.skuId) !== index,
  );
  if (duplicateSku) {
    throw new SalesOrderServiceError(
      "DUPLICATE_SKU",
      "同一 SKU 不能重复添加，请合并数量或修改原明细。",
      "items",
    );
  }

  const skuIds = input.items.map(({ skuId }) => skuId);
  const skus = await transaction.sku.findMany({
    where: { id: { in: skuIds }, enabled: true },
    include: { inventoryBalance: true },
  });
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const unavailableIndex = input.items.findIndex(
    ({ skuId }) => !skuById.has(skuId),
  );
  if (unavailableIndex >= 0) {
    throw new SalesOrderServiceError(
      "SKU_NOT_AVAILABLE",
      "SKU 不存在或已停用，请重新选择。",
      `items.${unavailableIndex}.skuId`,
    );
  }

  const items = input.items.map((item, position) => {
    const sku = skuById.get(item.skuId)!;
    const subtotalFen = item.quantity * item.transactionPrice;
    if (!Number.isSafeInteger(subtotalFen) || subtotalFen > maxDatabaseInteger) {
      throw new SalesOrderServiceError(
        "AMOUNT_TOO_LARGE",
        "销售明细小计超出允许范围。",
        `items.${position}.transactionPrice`,
      );
    }
    return { item, position, sku, subtotalFen };
  });
  const totalAmountFen = items.reduce(
    (total, { subtotalFen }) => total + subtotalFen,
    0,
  );
  if (!Number.isSafeInteger(totalAmountFen) || totalAmountFen > maxDatabaseInteger) {
    throw new SalesOrderServiceError(
      "AMOUNT_TOO_LARGE",
      "销售单成交金额超出允许范围。",
      "items",
    );
  }

  return { customer, items, totalAmountFen };
}

export async function createSalesOrderDraft(
  database: PrismaClient,
  actor: Actor,
  input: SalesOrderDraftInput,
): Promise<SalesOrderDraft> {
  assertSalesOrderAccess(actor);
  const parsed = parseDraftInput(input);
  const salesOrderId = randomUUID();
  const auditId = randomUUID();

  const order = await database.$transaction(async (transaction) => {
    const { customer, items, totalAmountFen } = await resolveDraftFacts(
      transaction,
      actor,
      parsed,
    );
    const sequenceRows = await transaction.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('sales_order_number_seq') AS value
    `;
    const sequence = sequenceRows[0]?.value;
    if (sequence === undefined) throw new Error("Sales order sequence unavailable.");
    const salesOrderNumber = `XSD-${chinaDateCode()}-${sequence.toString().padStart(4, "0")}`;

    const created = await transaction.salesOrder.create({
      data: {
        id: salesOrderId,
        salesOrderNumber,
        customerId: customer.id,
        creatorId: actor.id,
        customerCodeSnapshot: customer.customerCode,
        customerNameSnapshot: customer.name,
        customerContactNameSnapshot: customer.contactName,
        customerPhoneSnapshot: customer.phone,
        customerAddressSnapshot: customer.address,
        responsibleSalesIdSnapshot: customer.responsibleSales.id,
        responsibleSalesNameSnapshot: customer.responsibleSales.name,
        paymentTermDaysSnapshot: customer.paymentTermDays,
        totalAmountFen,
        items: {
          create: items.map(({ item, position, sku, subtotalFen }) => ({
            id: randomUUID(),
            position,
            skuId: sku.id,
            skuCodeSnapshot: sku.skuCode,
            skuNameSnapshot: sku.name,
            inventoryUnitSnapshot: sku.inventoryUnit,
            referencePriceFenSnapshot: sku.referencePriceFen,
            quantity: item.quantity,
            transactionPriceFen: item.transactionPrice,
            subtotalFen,
          })),
        },
      },
      include: {
        items: {
          include: { sku: { include: { inventoryBalance: true } } },
        },
      },
    });

    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "SALES_ORDER_DRAFT_CREATED",
        objectType: "SALES_ORDER",
        objectId: created.id,
        referenceCode: created.salesOrderNumber,
        summary: `创建销售单草稿；${created.items.length} 条明细；成交金额 ¥${(created.totalAmountFen / 100).toFixed(2)}`,
      },
    });

    return created;
  });

  return toSalesOrderDraft(order, auditId);
}

function salesOrderReadScope(actor: Actor): Prisma.SalesOrderWhereInput {
  return isOwner(actor)
    ? {}
    : { customer: { responsibleSalesId: actor.id } };
}

export async function listSalesOrdersPage(
  database: PrismaClient,
  actor: Actor,
  filters: SalesOrderFilters,
  pagination: { page: number; pageSize: number },
): Promise<SalesOrderListPage> {
  assertSalesOrderAccess(actor);
  const page = Math.max(1, Math.trunc(pagination.page));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(pagination.pageSize)));
  const query = filters.query?.trim();
  const where: Prisma.SalesOrderWhereInput = {
    AND: [
      salesOrderReadScope(actor),
      { responsibleSalesIdSnapshot: filters.responsibleSalesId },
      { status: filters.status },
      {
        createdAt:
          filters.createdFrom || filters.createdTo
            ? { gte: filters.createdFrom, lte: filters.createdTo }
            : undefined,
      },
    ],
    OR: query
      ? [
          { salesOrderNumber: { contains: query, mode: "insensitive" } },
          { customerNameSnapshot: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
  const [total, orders] = await Promise.all([
    database.salesOrder.count({ where }),
    database.salesOrder.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { responsibleSalesId: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  return {
    items: orders.map((order) => {
      const canManageDraft =
        order.status === "DRAFT" &&
        (isOwner(actor) ||
          (order.creatorId === actor.id &&
            order.customer.responsibleSalesId === actor.id));
      return {
        id: order.id,
        salesOrderNumber: order.salesOrderNumber,
        customerName: order.customerNameSnapshot,
        responsibleSalesId: order.responsibleSalesIdSnapshot,
        responsibleSalesName: order.responsibleSalesNameSnapshot,
        creatorId: order.creatorId,
        itemCount: order._count.items,
        totalAmountFen: order.totalAmountFen,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        canEdit: canManageDraft,
        canDelete: canManageDraft,
      };
    }),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listSalesOrderResponsibleOptions(
  database: PrismaClient,
  actor: Actor,
): Promise<SalesOrderResponsibleOption[]> {
  assertSalesOrderAccess(actor);
  const orders = await database.salesOrder.findMany({
    where: salesOrderReadScope(actor),
    orderBy: [
      { responsibleSalesNameSnapshot: "asc" },
      { responsibleSalesIdSnapshot: "asc" },
    ],
    select: {
      responsibleSalesIdSnapshot: true,
      responsibleSalesNameSnapshot: true,
    },
  });
  return Array.from(
    new Map(
      orders.map((order) => [
        order.responsibleSalesIdSnapshot,
        {
          id: order.responsibleSalesIdSnapshot,
          name: order.responsibleSalesNameSnapshot,
        },
      ]),
    ).values(),
  );
}

export async function getSalesOrderDraftForEditing(
  database: PrismaClient,
  actor: Actor,
  salesOrderId: string,
): Promise<SalesOrderDraft> {
  assertSalesOrderAccess(actor);
  const draft = await database.salesOrder.findFirst({
    where: {
      id: salesOrderId,
      status: "DRAFT",
      creatorId: isOwner(actor) ? undefined : actor.id,
      customer: isOwner(actor)
        ? undefined
        : { responsibleSalesId: actor.id },
    },
    include: {
      items: {
        include: { sku: { include: { inventoryBalance: true } } },
      },
    },
  });
  if (!draft) {
    throw new SalesOrderServiceError(
      "DRAFT_NOT_FOUND",
      "销售单草稿不存在或不可编辑。",
    );
  }
  return toSalesOrderDraft(draft);
}

export async function updateSalesOrderDraft(
  database: PrismaClient,
  actor: Actor,
  input: UpdateSalesOrderDraftInput,
): Promise<SalesOrderDraft> {
  assertSalesOrderAccess(actor);
  const parsedResult = updateDraftInputSchema.safeParse(input);
  if (!parsedResult.success) {
    parseDraftInput(input);
    throw new SalesOrderServiceError(
      "DRAFT_NOT_FOUND",
      "销售单草稿不存在或不可编辑。",
    );
  }
  const parsed = parsedResult.data;
  const auditId = randomUUID();

  const order = await database.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "sales_order"
      WHERE "id" = ${parsed.salesOrderId}
      FOR UPDATE
    `;
    const current = await transaction.salesOrder.findFirst({
      where: {
        id: parsed.salesOrderId,
        status: "DRAFT",
        creatorId: isOwner(actor) ? undefined : actor.id,
        customer: isOwner(actor)
          ? undefined
          : { responsibleSalesId: actor.id },
      },
    });
    if (!current) {
      throw new SalesOrderServiceError(
        "DRAFT_NOT_FOUND",
        "销售单草稿不存在或不可编辑。",
      );
    }

    const { customer, items, totalAmountFen } = await resolveDraftFacts(
      transaction,
      actor,
      parsed,
    );
    const preserveCustomerSnapshot = current.customerId === customer.id;
    const updated = await transaction.salesOrder.update({
      where: { id: current.id },
      data: {
        customerId: customer.id,
        customerCodeSnapshot: preserveCustomerSnapshot
          ? current.customerCodeSnapshot
          : customer.customerCode,
        customerNameSnapshot: preserveCustomerSnapshot
          ? current.customerNameSnapshot
          : customer.name,
        customerContactNameSnapshot: preserveCustomerSnapshot
          ? current.customerContactNameSnapshot
          : customer.contactName,
        customerPhoneSnapshot: preserveCustomerSnapshot
          ? current.customerPhoneSnapshot
          : customer.phone,
        customerAddressSnapshot: preserveCustomerSnapshot
          ? current.customerAddressSnapshot
          : customer.address,
        responsibleSalesIdSnapshot: preserveCustomerSnapshot
          ? current.responsibleSalesIdSnapshot
          : customer.responsibleSales.id,
        responsibleSalesNameSnapshot: preserveCustomerSnapshot
          ? current.responsibleSalesNameSnapshot
          : customer.responsibleSales.name,
        paymentTermDaysSnapshot: preserveCustomerSnapshot
          ? current.paymentTermDaysSnapshot
          : customer.paymentTermDays,
        totalAmountFen,
        items: {
          deleteMany: {},
          create: items.map(({ item, position, sku, subtotalFen }) => ({
            id: randomUUID(),
            position,
            skuId: sku.id,
            skuCodeSnapshot: sku.skuCode,
            skuNameSnapshot: sku.name,
            inventoryUnitSnapshot: sku.inventoryUnit,
            referencePriceFenSnapshot: sku.referencePriceFen,
            quantity: item.quantity,
            transactionPriceFen: item.transactionPrice,
            subtotalFen,
          })),
        },
      },
      include: {
        items: {
          include: { sku: { include: { inventoryBalance: true } } },
        },
      },
    });

    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "SALES_ORDER_DRAFT_UPDATED",
        objectType: "SALES_ORDER",
        objectId: updated.id,
        referenceCode: updated.salesOrderNumber,
        summary: `更新销售单草稿；${updated.items.length} 条明细；成交金额 ¥${(updated.totalAmountFen / 100).toFixed(2)}`,
      },
    });

    return updated;
  });

  return toSalesOrderDraft(order, auditId);
}

export async function deleteSalesOrderDraft(
  database: PrismaClient,
  actor: Actor,
  salesOrderId: string,
): Promise<{ id: string; salesOrderNumber: string; auditId: string }> {
  assertSalesOrderAccess(actor);
  const auditId = randomUUID();

  return database.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "sales_order"
      WHERE "id" = ${salesOrderId}
      FOR UPDATE
    `;
    const draft = await transaction.salesOrder.findFirst({
      where: {
        id: salesOrderId,
        status: "DRAFT",
        creatorId: isOwner(actor) ? undefined : actor.id,
        customer: isOwner(actor)
          ? undefined
          : { responsibleSalesId: actor.id },
      },
    });
    if (!draft) {
      throw new SalesOrderServiceError(
        "DRAFT_NOT_FOUND",
        "销售单草稿不存在或不可删除。",
      );
    }

    await transaction.salesOrder.delete({ where: { id: draft.id } });
    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "SALES_ORDER_DRAFT_DELETED",
        objectType: "SALES_ORDER",
        objectId: draft.id,
        referenceCode: draft.salesOrderNumber,
        summary: `删除销售单草稿；成交金额 ¥${(draft.totalAmountFen / 100).toFixed(2)}`,
      },
    });

    return {
      id: draft.id,
      salesOrderNumber: draft.salesOrderNumber,
      auditId,
    };
  });
}
