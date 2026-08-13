import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client";
import { Prisma } from "../../generated/prisma/client";
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
const cancelInputSchema = z.object({
  salesOrderId: z.string().min(1),
  reason: z.string().trim().min(1),
});

type ParsedDraftInput = z.output<typeof draftInputSchema>;

export type SalesOrderDraftInput = z.input<typeof draftInputSchema>;
export type UpdateSalesOrderDraftInput = z.input<typeof updateDraftInputSchema>;
export type CancelSalesOrderInput = z.input<typeof cancelInputSchema>;
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
export type SalesOrderCancellationPreviewItem = {
  skuId: string;
  skuCode: string;
  skuName: string;
  inventoryUnit: string;
  quantity: number;
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
  canCancel: boolean;
  items: SalesOrderCancellationPreviewItem[];
};
export type SalesOrderListPage = {
  items: SalesOrderListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type SalesOrderResponsibleOption = { id: string; name: string };

export type SalesOrderInventoryImpact = {
  onHandBefore: number;
  onHandAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  availableBefore: number;
  availableAfter: number;
};

export type SalesOrderInventoryShortage = {
  skuId: string;
  skuCode: string;
  skuName: string;
  inventoryUnit: string;
  requiredQuantity: number;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
};

export type ConfirmedSalesOrder = {
  id: string;
  salesOrderNumber: string;
  status: "CONFIRMED";
  creatorId: string;
  customerId: string;
  customerSnapshot: SalesOrderCustomerSnapshot;
  totalAmountFen: number;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date;
  confirmedByName: string;
  auditId: string;
  items: Array<{
    id: string;
    skuId: string;
    skuCode: string;
    skuName: string;
    inventoryUnit: string;
    quantity: number;
    transactionPriceFen: number;
    subtotalFen: number;
    inventoryImpact: SalesOrderInventoryImpact;
  }>;
};

export type CancelledSalesOrder = {
  id: string;
  salesOrderNumber: string;
  status: "CANCELLED";
  cancelledAt: Date;
  cancelledByName: string;
  reason: string;
  auditId: string;
  items: Array<{
    id: string;
    skuId: string;
    skuCode: string;
    skuName: string;
    inventoryUnit: string;
    quantity: number;
    inventoryImpact: SalesOrderInventoryImpact;
  }>;
};

export type SalesOrderDetail = {
  id: string;
  salesOrderNumber: string;
  status: "DRAFT" | "CONFIRMED" | "OUTBOUND" | "CANCELLED";
  creatorId: string;
  customerId: string;
  customerSnapshot: SalesOrderCustomerSnapshot;
  totalAmountFen: number;
  createdAt: Date;
  updatedAt: Date;
  canEdit: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  confirmation: {
    auditId: string;
    actorId: string;
    actorName: string;
    occurredAt: Date;
  } | null;
  cancellation: {
    auditId: string;
    actorId: string;
    actorName: string;
    occurredAt: Date;
    reason: string;
  } | null;
  items: Array<{
    id: string;
    skuId: string;
    skuCode: string;
    skuName: string;
    inventoryUnit: string;
    referencePriceFen: number;
    quantity: number;
    transactionPriceFen: number;
    subtotalFen: number;
    currentInventory: {
      onHandQuantity: number;
      reservedQuantity: number;
      availableQuantity: number;
    };
    confirmationImpact: SalesOrderInventoryImpact | null;
    cancellationImpact: SalesOrderInventoryImpact | null;
  }>;
};

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
      | "DRAFT_NOT_FOUND"
      | "ORDER_NOT_FOUND"
      | "INVENTORY_SHORTAGE"
      | "INVENTORY_CHANGED"
      | "CANCEL_REASON_REQUIRED"
      | "INVALID_STATUS",
    message: string,
    readonly field?: string,
    readonly inventoryShortages?: SalesOrderInventoryShortage[],
  ) {
    super(message);
    this.name = "SalesOrderServiceError";
  }
}

function isOwner(actor: Actor): boolean {
  return actor.roles.includes("OWNER");
}

function canManageCustomerSalesOrder(
  actor: Actor,
  responsibleSalesId: string,
): boolean {
  return isOwner(actor) || responsibleSalesId === actor.id;
}

function canCancelSalesOrderForCustomer(
  actor: Actor,
  status: SalesOrderListItem["status"],
  responsibleSalesId: string,
): boolean {
  return (
    status === "CONFIRMED" &&
    canManageCustomerSalesOrder(actor, responsibleSalesId)
  );
}

function isSerializationFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = error.code;
  if (code === "P2034") return true;
  if (code !== "P2010") return false;
  const meta = "meta" in error && error.meta && typeof error.meta === "object"
    ? error.meta
    : undefined;
  const databaseCode = meta && "code" in meta ? meta.code : undefined;
  const message = error instanceof Error ? error.message : "";
  return (
    databaseCode === "40001" ||
    message.includes("40001") ||
    message.toLocaleLowerCase("en").includes("serialize")
  );
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
        items: {
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: {
            skuId: true,
            skuCodeSnapshot: true,
            skuNameSnapshot: true,
            inventoryUnitSnapshot: true,
            quantity: true,
          },
        },
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
        canCancel: canCancelSalesOrderForCustomer(
          actor,
          order.status,
          order.customer.responsibleSalesId,
        ),
        items: order.items.map((item) => ({
          skuId: item.skuId,
          skuCode: item.skuCodeSnapshot,
          skuName: item.skuNameSnapshot,
          inventoryUnit: item.inventoryUnitSnapshot,
          quantity: item.quantity,
        })),
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

export async function getSalesOrderDetail(
  database: PrismaClient,
  actor: Actor,
  salesOrderId: string,
): Promise<SalesOrderDetail> {
  assertSalesOrderAccess(actor);
  const order = await database.salesOrder.findFirst({
    where: { id: salesOrderId, ...salesOrderReadScope(actor) },
    include: {
      customer: { select: { responsibleSalesId: true } },
      items: {
        include: { sku: { include: { inventoryBalance: true } } },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!order) {
    throw new SalesOrderServiceError(
      "ORDER_NOT_FOUND",
      "销售单不存在或不可访问。",
    );
  }

  const [confirmation, cancellation, reservationMovements, releaseMovements] =
    await Promise.all([
    database.businessAudit.findFirst({
      where: {
        objectType: "SALES_ORDER",
        objectId: order.id,
        action: "SALES_ORDER_CONFIRMED",
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        actorId: true,
        actorName: true,
        occurredAt: true,
      },
    }),
    database.businessAudit.findFirst({
      where: {
        objectType: "SALES_ORDER",
        objectId: order.id,
        action: "SALES_ORDER_CANCELLED",
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        actorId: true,
        actorName: true,
        occurredAt: true,
        reason: true,
      },
    }),
    database.inventoryMovement.findMany({
      where: {
        relatedType: "SALES_ORDER",
        relatedId: order.id,
        movementType: "RESERVATION",
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    }),
    database.inventoryMovement.findMany({
      where: {
        relatedType: "SALES_ORDER",
        relatedId: order.id,
        movementType: "RELEASE",
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const movementBySkuId = new Map(
    reservationMovements.map((movement) => [movement.skuId, movement]),
  );
  const releaseMovementBySkuId = new Map(
    releaseMovements.map((movement) => [movement.skuId, movement]),
  );
  const canEditDraft =
    order.status === "DRAFT" &&
    (isOwner(actor) ||
      (order.creatorId === actor.id &&
        order.customer.responsibleSalesId === actor.id));
  const canConfirmDraft =
    order.status === "DRAFT" &&
    (isOwner(actor) || order.customer.responsibleSalesId === actor.id);

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
    totalAmountFen: order.totalAmountFen,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    canEdit: canEditDraft,
    canConfirm: canConfirmDraft,
    canCancel: canCancelSalesOrderForCustomer(
      actor,
      order.status,
      order.customer.responsibleSalesId,
    ),
    confirmation: confirmation
      ? {
          auditId: confirmation.id,
          actorId: confirmation.actorId,
          actorName: confirmation.actorName,
          occurredAt: confirmation.occurredAt,
        }
      : null,
    cancellation: cancellation
      ? {
          auditId: cancellation.id,
          actorId: cancellation.actorId,
          actorName: cancellation.actorName,
          occurredAt: cancellation.occurredAt,
          reason: cancellation.reason ?? "",
        }
      : null,
    items: order.items.map((item) => {
      const onHandQuantity = item.sku.inventoryBalance?.onHandQuantity ?? 0;
      const reservedQuantity = item.sku.inventoryBalance?.reservedQuantity ?? 0;
      const movement = movementBySkuId.get(item.skuId);
      const releaseMovement = releaseMovementBySkuId.get(item.skuId);
      const confirmationImpact = movement
        ? {
            onHandBefore: movement.onHandAfter - movement.onHandDelta,
            onHandAfter: movement.onHandAfter,
            reservedBefore: movement.reservedAfter - movement.reservedDelta,
            reservedAfter: movement.reservedAfter,
            availableBefore:
              movement.onHandAfter -
              movement.onHandDelta -
              (movement.reservedAfter - movement.reservedDelta),
            availableAfter: movement.onHandAfter - movement.reservedAfter,
          }
        : null;
      const cancellationImpact = releaseMovement
        ? {
            onHandBefore:
              releaseMovement.onHandAfter - releaseMovement.onHandDelta,
            onHandAfter: releaseMovement.onHandAfter,
            reservedBefore:
              releaseMovement.reservedAfter - releaseMovement.reservedDelta,
            reservedAfter: releaseMovement.reservedAfter,
            availableBefore:
              releaseMovement.onHandAfter -
              releaseMovement.onHandDelta -
              (releaseMovement.reservedAfter - releaseMovement.reservedDelta),
            availableAfter:
              releaseMovement.onHandAfter - releaseMovement.reservedAfter,
          }
        : null;
      return {
        id: item.id,
        skuId: item.skuId,
        skuCode: item.skuCodeSnapshot,
        skuName: item.skuNameSnapshot,
        inventoryUnit: item.inventoryUnitSnapshot,
        referencePriceFen: item.referencePriceFenSnapshot,
        quantity: item.quantity,
        transactionPriceFen: item.transactionPriceFen,
        subtotalFen: item.subtotalFen,
        currentInventory: {
          onHandQuantity,
          reservedQuantity,
          availableQuantity: onHandQuantity - reservedQuantity,
        },
        confirmationImpact,
        cancellationImpact,
      };
    }),
  };
}

export async function confirmSalesOrder(
  database: PrismaClient,
  actor: Actor,
  salesOrderId: string,
): Promise<ConfirmedSalesOrder> {
  assertSalesOrderAccess(actor);
  const auditId = randomUUID();
  let inventoryChanged = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await database.$transaction(
        async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id"
        FROM "sales_order"
        WHERE "id" = ${salesOrderId}
        FOR UPDATE
      `;
      const order = await transaction.salesOrder.findFirst({
        where: {
          id: salesOrderId,
          customer: isOwner(actor)
            ? undefined
            : { responsibleSalesId: actor.id },
        },
        include: {
          items: {
            include: { sku: true },
            orderBy: [{ position: "asc" }, { id: "asc" }],
          },
        },
      });
      if (!order) {
        throw new SalesOrderServiceError(
          "DRAFT_NOT_FOUND",
          "销售单草稿不存在或不可确认。",
        );
      }
      if (order.status !== "DRAFT") {
        const message =
          order.status === "CONFIRMED"
            ? "销售单已确认，不能再次确认。"
            : order.status === "OUTBOUND"
              ? "销售单已出库，不能确认。"
              : "销售单已取消，不能确认。";
        throw new SalesOrderServiceError("INVALID_STATUS", message);
      }

      const skuIds = order.items.map(({ skuId }) => skuId).toSorted();
      const balances = skuIds.length
        ? await transaction.$queryRaw<
            Array<{
              skuId: string;
              onHandQuantity: number;
              reservedQuantity: number;
            }>
          >`
            SELECT
              balance."skuId",
              balance."onHandQuantity",
              balance."reservedQuantity"
            FROM "inventory_balance" AS balance
            WHERE balance."skuId" IN (${Prisma.join(skuIds)})
            ORDER BY balance."skuId"
            FOR UPDATE
          `
        : [];
      const balanceBySkuId = new Map(
        balances.map((balance) => [balance.skuId, balance]),
      );
      const impactBySkuId = new Map<string, SalesOrderInventoryImpact>();
      const inventoryShortages: SalesOrderInventoryShortage[] = [];

      for (const item of order.items.toSorted((left, right) =>
        left.skuId.localeCompare(right.skuId),
      )) {
        if (!item.sku.enabled) {
          throw new SalesOrderServiceError(
            "SKU_NOT_AVAILABLE",
            `SKU ${item.skuCodeSnapshot} 已停用，销售单不能确认。`,
          );
        }
        const balance = balanceBySkuId.get(item.skuId) ?? {
          skuId: item.skuId,
          onHandQuantity: 0,
          reservedQuantity: 0,
        };
        const availableBefore =
          balance.onHandQuantity - balance.reservedQuantity;
        if (availableBefore < item.quantity) {
          inventoryShortages.push({
            skuId: item.skuId,
            skuCode: item.skuCodeSnapshot,
            skuName: item.skuNameSnapshot,
            inventoryUnit: item.inventoryUnitSnapshot,
            requiredQuantity: item.quantity,
            onHandQuantity: balance.onHandQuantity,
            reservedQuantity: balance.reservedQuantity,
            availableQuantity: availableBefore,
            shortageQuantity: item.quantity - availableBefore,
          });
          continue;
        }
        const reservedAfter = balance.reservedQuantity + item.quantity;
        const impact: SalesOrderInventoryImpact = {
          onHandBefore: balance.onHandQuantity,
          onHandAfter: balance.onHandQuantity,
          reservedBefore: balance.reservedQuantity,
          reservedAfter,
          availableBefore,
          availableAfter: balance.onHandQuantity - reservedAfter,
        };
        impactBySkuId.set(item.skuId, impact);
      }

      if (inventoryShortages.length > 0) {
        throw new SalesOrderServiceError(
          inventoryChanged ? "INVENTORY_CHANGED" : "INVENTORY_SHORTAGE",
          inventoryChanged
            ? "库存刚刚发生变化，销售单保持草稿。请按最新可用量修改后再次确认。"
            : `销售单未确认：${inventoryShortages.length} 个 SKU 可用量不足。`,
          undefined,
          inventoryShortages,
        );
      }

      for (const item of order.items.toSorted((left, right) =>
        left.skuId.localeCompare(right.skuId),
      )) {
        const impact = impactBySkuId.get(item.skuId)!;
        await transaction.inventoryBalance.update({
          where: { skuId: item.skuId },
          data: { reservedQuantity: impact.reservedAfter },
        });
        await transaction.inventoryMovement.create({
          data: {
            id: randomUUID(),
            skuId: item.skuId,
            movementType: "RESERVATION",
            onHandDelta: 0,
            reservedDelta: item.quantity,
            onHandAfter: impact.onHandAfter,
            reservedAfter: impact.reservedAfter,
            relatedType: "SALES_ORDER",
            relatedId: order.id,
            relatedReference: order.salesOrderNumber,
            actorId: actor.id,
            actorName: actor.name,
          },
        });
      }

      const updated = await transaction.salesOrder.update({
        where: { id: order.id },
        data: { status: "CONFIRMED" },
      });
      const audit = await transaction.businessAudit.create({
        data: {
          id: auditId,
          actorId: actor.id,
          actorName: actor.name,
          action: "SALES_ORDER_CONFIRMED",
          objectType: "SALES_ORDER",
          objectId: order.id,
          referenceCode: order.salesOrderNumber,
          summary: `确认销售单并预占库存；${order.items.map((item) => `${item.skuCodeSnapshot} ×${item.quantity}`).join("、")}`,
        },
      });

      return {
        id: updated.id,
        salesOrderNumber: updated.salesOrderNumber,
        status: "CONFIRMED",
        creatorId: updated.creatorId,
        customerId: updated.customerId,
        customerSnapshot: {
          customerCode: updated.customerCodeSnapshot,
          name: updated.customerNameSnapshot,
          contactName: updated.customerContactNameSnapshot,
          phone: updated.customerPhoneSnapshot,
          address: updated.customerAddressSnapshot,
          responsibleSalesId: updated.responsibleSalesIdSnapshot,
          responsibleSalesName: updated.responsibleSalesNameSnapshot,
          paymentTermDays: updated.paymentTermDaysSnapshot,
        },
        totalAmountFen: updated.totalAmountFen,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        confirmedAt: audit.occurredAt,
        confirmedByName: audit.actorName,
        auditId: audit.id,
        items: order.items.map((item) => ({
          id: item.id,
          skuId: item.skuId,
          skuCode: item.skuCodeSnapshot,
          skuName: item.skuNameSnapshot,
          inventoryUnit: item.inventoryUnitSnapshot,
          quantity: item.quantity,
          transactionPriceFen: item.transactionPriceFen,
          subtotalFen: item.subtotalFen,
          inventoryImpact: impactBySkuId.get(item.skuId)!,
        })),
      };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isSerializationFailure(error)) throw error;
      inventoryChanged = true;
      if (attempt === 2) {
        throw new SalesOrderServiceError(
          "INVENTORY_CHANGED",
          "库存刚刚发生变化，销售单保持草稿。请刷新最新可用量后再次确认。",
        );
      }
    }
  }

  throw new SalesOrderServiceError(
    "INVENTORY_CHANGED",
    "库存刚刚发生变化，销售单保持草稿。请刷新最新可用量后再次确认。",
  );
}

export async function cancelSalesOrder(
  database: PrismaClient,
  actor: Actor,
  input: CancelSalesOrderInput,
): Promise<CancelledSalesOrder> {
  assertSalesOrderAccess(actor);
  const parsed = cancelInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new SalesOrderServiceError(
      "CANCEL_REASON_REQUIRED",
      "请填写取消原因。",
      "reason",
    );
  }
  const auditId = randomUUID();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await database.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`
            SELECT "id"
            FROM "sales_order"
            WHERE "id" = ${parsed.data.salesOrderId}
            FOR UPDATE
          `;
          const order = await transaction.salesOrder.findFirst({
            where: { id: parsed.data.salesOrderId },
            include: {
              customer: { select: { responsibleSalesId: true } },
              items: { orderBy: [{ position: "asc" }, { id: "asc" }] },
            },
          });
          if (
            !order ||
            !canManageCustomerSalesOrder(
              actor,
              order.customer.responsibleSalesId,
            )
          ) {
            throw new SalesOrderServiceError(
              "ORDER_NOT_FOUND",
              "销售单不存在或不可取消。",
            );
          }
          if (order.status !== "CONFIRMED") {
            const message =
              order.status === "DRAFT"
                ? "销售单仍是草稿，不能取消。"
                : order.status === "OUTBOUND"
                  ? "销售单已出库，不能取消。"
                  : "销售单已取消，不能再次取消。";
            throw new SalesOrderServiceError("INVALID_STATUS", message);
          }

          const skuIds = order.items.map(({ skuId }) => skuId).toSorted();
          const balances = skuIds.length
            ? await transaction.$queryRaw<
                Array<{
                  skuId: string;
                  onHandQuantity: number;
                  reservedQuantity: number;
                }>
              >`
                SELECT
                  balance."skuId",
                  balance."onHandQuantity",
                  balance."reservedQuantity"
                FROM "inventory_balance" AS balance
                WHERE balance."skuId" IN (${Prisma.join(skuIds)})
                ORDER BY balance."skuId"
                FOR UPDATE
              `
            : [];
          const balanceBySkuId = new Map(
            balances.map((balance) => [balance.skuId, balance]),
          );
          const impactBySkuId = new Map<string, SalesOrderInventoryImpact>();

          for (const item of order.items.toSorted((left, right) =>
            left.skuId.localeCompare(right.skuId),
          )) {
            const balance = balanceBySkuId.get(item.skuId);
            if (!balance || balance.reservedQuantity < item.quantity) {
              throw new SalesOrderServiceError(
                "INVENTORY_CHANGED",
                "库存预占刚刚发生变化，销售单未取消。请刷新后重试。",
              );
            }
            const reservedAfter = balance.reservedQuantity - item.quantity;
            impactBySkuId.set(item.skuId, {
              onHandBefore: balance.onHandQuantity,
              onHandAfter: balance.onHandQuantity,
              reservedBefore: balance.reservedQuantity,
              reservedAfter,
              availableBefore:
                balance.onHandQuantity - balance.reservedQuantity,
              availableAfter: balance.onHandQuantity - reservedAfter,
            });
          }

          for (const item of order.items.toSorted((left, right) =>
            left.skuId.localeCompare(right.skuId),
          )) {
            const impact = impactBySkuId.get(item.skuId)!;
            await transaction.inventoryBalance.update({
              where: { skuId: item.skuId },
              data: { reservedQuantity: impact.reservedAfter },
            });
            await transaction.inventoryMovement.create({
              data: {
                id: randomUUID(),
                skuId: item.skuId,
                movementType: "RELEASE",
                onHandDelta: 0,
                reservedDelta: -item.quantity,
                onHandAfter: impact.onHandAfter,
                reservedAfter: impact.reservedAfter,
                relatedType: "SALES_ORDER",
                relatedId: order.id,
                relatedReference: order.salesOrderNumber,
                actorId: actor.id,
                actorName: actor.name,
              },
            });
          }

          await transaction.salesOrder.update({
            where: { id: order.id },
            data: { status: "CANCELLED" },
          });
          const audit = await transaction.businessAudit.create({
            data: {
              id: auditId,
              actorId: actor.id,
              actorName: actor.name,
              action: "SALES_ORDER_CANCELLED",
              objectType: "SALES_ORDER",
              objectId: order.id,
              referenceCode: order.salesOrderNumber,
              reason: parsed.data.reason,
              summary: `取消销售单并释放全部预占；${order.items.map((item) => `${item.skuCodeSnapshot} ×${item.quantity}`).join("、")}`,
            },
          });

          return {
            id: order.id,
            salesOrderNumber: order.salesOrderNumber,
            status: "CANCELLED",
            cancelledAt: audit.occurredAt,
            cancelledByName: audit.actorName,
            reason: parsed.data.reason,
            auditId: audit.id,
            items: order.items.map((item) => ({
              id: item.id,
              skuId: item.skuId,
              skuCode: item.skuCodeSnapshot,
              skuName: item.skuNameSnapshot,
              inventoryUnit: item.inventoryUnitSnapshot,
              quantity: item.quantity,
              inventoryImpact: impactBySkuId.get(item.skuId)!,
            })),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isSerializationFailure(error)) throw error;
      if (attempt === 2) {
        throw new SalesOrderServiceError(
          "INVENTORY_CHANGED",
          "库存或销售单状态刚刚发生变化，销售单未取消。请刷新后重试。",
        );
      }
    }
  }

  throw new SalesOrderServiceError(
    "INVENTORY_CHANGED",
    "库存或销售单状态刚刚发生变化，销售单未取消。请刷新后重试。",
  );
}
