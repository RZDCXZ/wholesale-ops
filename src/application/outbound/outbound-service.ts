import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../../generated/prisma/client";
import { Prisma } from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";

export type OutboundFilters = {
  query?: string;
  confirmedFrom?: Date;
  confirmedTo?: Date;
};

export type PendingOutboundSalesOrder = {
  id: string;
  salesOrderNumber: string;
  customer: {
    name: string;
    contactName: string;
    phone: string;
    address: string;
  };
  confirmedAt: Date;
  confirmedByName: string;
  items: Array<{
    skuId: string;
    skuCode: string;
    skuName: string;
    inventoryUnit: string;
    quantity: number;
    reservationComplete: boolean;
  }>;
};

export type OutboundSalesOrder = {
  id: string;
  salesOrderNumber: string;
  status: "OUTBOUND";
  outboundAt: Date;
  outboundByName: string;
  auditId: string;
  items: Array<{
    skuId: string;
    skuCode: string;
    skuName: string;
    inventoryUnit: string;
    quantity: number;
    inventoryImpact: {
      onHandBefore: number;
      onHandAfter: number;
      reservedBefore: number;
      reservedAfter: number;
      availableBefore: number;
      availableAfter: number;
    };
  }>;
};

export class OutboundServiceError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "ORDER_NOT_FOUND"
      | "INVALID_STATUS"
      | "RESERVATION_MISSING"
      | "INVENTORY_CHANGED",
    message: string,
  ) {
    super(message);
    this.name = "OutboundServiceError";
  }
}

function isSerializationFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = error.code;
  if (code === "P2034") return true;
  if (code !== "P2010") return false;
  const meta =
    "meta" in error && error.meta && typeof error.meta === "object"
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

function chinaDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(`${chinaDate(date)}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function receivableDateCode(date: Date): string {
  return chinaDate(date).replaceAll("-", "");
}

function assertOutboundAccess(actor: Actor) {
  if (authorizeCapability(actor, "OUTBOUND_VIEW").kind !== "authorized") {
    throw new OutboundServiceError(
      "FORBIDDEN",
      "没有访问待出库工作台的权限。",
    );
  }
}

export async function listPendingOutboundSalesOrders(
  database: PrismaClient,
  actor: Actor,
  filters: OutboundFilters,
): Promise<PendingOutboundSalesOrder[]> {
  assertOutboundAccess(actor);
  const query = filters.query?.trim();
  const orders = await database.salesOrder.findMany({
    where: {
      status: "CONFIRMED",
      OR: query
        ? [
            {
              salesOrderNumber: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              customerNameSnapshot: {
                contains: query,
                mode: "insensitive",
              },
            },
          ]
        : undefined,
    },
    select: {
      id: true,
      salesOrderNumber: true,
      customerNameSnapshot: true,
      customerContactNameSnapshot: true,
      customerPhoneSnapshot: true,
      customerAddressSnapshot: true,
      items: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          skuId: true,
          skuCodeSnapshot: true,
          skuNameSnapshot: true,
          inventoryUnitSnapshot: true,
          quantity: true,
          sku: {
            select: {
              inventoryBalance: {
                select: { reservedQuantity: true },
              },
            },
          },
        },
      },
    },
  });
  if (orders.length === 0) return [];

  const orderIds = orders.map(({ id }) => id);
  const [confirmations, reservations] = await Promise.all([
    database.businessAudit.findMany({
      where: {
        objectType: "SALES_ORDER",
        objectId: { in: orderIds },
        action: "SALES_ORDER_CONFIRMED",
        occurredAt:
          filters.confirmedFrom || filters.confirmedTo
            ? { gte: filters.confirmedFrom, lte: filters.confirmedTo }
            : undefined,
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: {
        objectId: true,
        occurredAt: true,
        actorName: true,
      },
    }),
    database.inventoryMovement.findMany({
      where: {
        relatedType: "SALES_ORDER",
        relatedId: { in: orderIds },
        movementType: "RESERVATION",
      },
      select: {
        relatedId: true,
        skuId: true,
        reservedDelta: true,
      },
    }),
  ]);
  const confirmationByOrderId = new Map(
    confirmations.map((confirmation) => [confirmation.objectId, confirmation]),
  );
  const reservationByOrderAndSku = new Map(
    reservations.map((reservation) => [
      `${reservation.relatedId}:${reservation.skuId}`,
      reservation.reservedDelta,
    ]),
  );

  return orders
    .flatMap((order) => {
      const confirmation = confirmationByOrderId.get(order.id);
      if (!confirmation) return [];
      return {
        id: order.id,
        salesOrderNumber: order.salesOrderNumber,
        customer: {
          name: order.customerNameSnapshot,
          contactName: order.customerContactNameSnapshot,
          phone: order.customerPhoneSnapshot,
          address: order.customerAddressSnapshot,
        },
        confirmedAt: confirmation.occurredAt,
        confirmedByName: confirmation.actorName,
        items: order.items.map((item) => ({
          skuId: item.skuId,
          skuCode: item.skuCodeSnapshot,
          skuName: item.skuNameSnapshot,
          inventoryUnit: item.inventoryUnitSnapshot,
          quantity: item.quantity,
          reservationComplete:
            reservationByOrderAndSku.get(`${order.id}:${item.skuId}`) ===
              item.quantity &&
            (item.sku.inventoryBalance?.reservedQuantity ?? 0) >= item.quantity,
        })),
      } satisfies PendingOutboundSalesOrder;
    })
    .toSorted(
      (left, right) =>
        right.confirmedAt.getTime() - left.confirmedAt.getTime() ||
        right.id.localeCompare(left.id),
    );
}

export async function outboundSalesOrder(
  database: PrismaClient,
  actor: Actor,
  salesOrderId: string,
  outboundAt = new Date(),
): Promise<OutboundSalesOrder> {
  assertOutboundAccess(actor);
  const auditId = randomUUID();
  const receivableId = randomUUID();

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
          const order = await transaction.salesOrder.findUnique({
            where: { id: salesOrderId },
            include: {
              items: { orderBy: [{ position: "asc" }, { id: "asc" }] },
            },
          });
          if (!order) {
            throw new OutboundServiceError(
              "ORDER_NOT_FOUND",
              "销售单不存在或不可出库。",
            );
          }
          if (order.status !== "CONFIRMED") {
            const message =
              order.status === "DRAFT"
                ? "销售单仍是草稿，不能出库。"
                : order.status === "OUTBOUND"
                  ? "销售单已出库，不能重复出库。"
                  : "销售单已取消，不能出库。";
            throw new OutboundServiceError("INVALID_STATUS", message);
          }

          const skuIds = order.items.map(({ skuId }) => skuId).toSorted();
          const [balances, reservations] = await Promise.all([
            skuIds.length
              ? transaction.$queryRaw<
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
              : [],
            transaction.inventoryMovement.findMany({
              where: {
                relatedType: "SALES_ORDER",
                relatedId: order.id,
                movementType: "RESERVATION",
              },
              select: { skuId: true, reservedDelta: true },
            }),
          ]);
          const balanceBySkuId = new Map(
            balances.map((balance) => [balance.skuId, balance]),
          );
          const reservedBySkuId = new Map(
            reservations.map((reservation) => [
              reservation.skuId,
              reservation.reservedDelta,
            ]),
          );
          const impactBySkuId = new Map<
            string,
            OutboundSalesOrder["items"][number]["inventoryImpact"]
          >();

          for (const item of order.items.toSorted((left, right) =>
            left.skuId.localeCompare(right.skuId),
          )) {
            const balance = balanceBySkuId.get(item.skuId);
            if (
              reservedBySkuId.get(item.skuId) !== item.quantity ||
              !balance ||
              balance.reservedQuantity < item.quantity
            ) {
              throw new OutboundServiceError(
                "RESERVATION_MISSING",
                `SKU ${item.skuCodeSnapshot} 的预占不完整，销售单未出库。`,
              );
            }
            if (balance.onHandQuantity < item.quantity) {
              throw new OutboundServiceError(
                "INVENTORY_CHANGED",
                `SKU ${item.skuCodeSnapshot} 的现存量不足，销售单未出库。`,
              );
            }
            const onHandAfter = balance.onHandQuantity - item.quantity;
            const reservedAfter = balance.reservedQuantity - item.quantity;
            impactBySkuId.set(item.skuId, {
              onHandBefore: balance.onHandQuantity,
              onHandAfter,
              reservedBefore: balance.reservedQuantity,
              reservedAfter,
              availableBefore:
                balance.onHandQuantity - balance.reservedQuantity,
              availableAfter: onHandAfter - reservedAfter,
            });
          }

          for (const item of order.items.toSorted((left, right) =>
            left.skuId.localeCompare(right.skuId),
          )) {
            const impact = impactBySkuId.get(item.skuId)!;
            await transaction.inventoryBalance.update({
              where: { skuId: item.skuId },
              data: {
                onHandQuantity: impact.onHandAfter,
                reservedQuantity: impact.reservedAfter,
              },
            });
            await transaction.inventoryMovement.create({
              data: {
                id: randomUUID(),
                skuId: item.skuId,
                movementType: "OUTBOUND",
                onHandDelta: -item.quantity,
                reservedDelta: -item.quantity,
                onHandAfter: impact.onHandAfter,
                reservedAfter: impact.reservedAfter,
                occurredAt: outboundAt,
                relatedType: "SALES_ORDER",
                relatedId: order.id,
                relatedReference: order.salesOrderNumber,
                actorId: actor.id,
                actorName: actor.name,
              },
            });
          }

          const [{ value: receivableSequence }] = await transaction.$queryRaw<
            Array<{ value: bigint }>
          >`SELECT nextval('receivable_number_seq')::bigint AS value`;
          const receivableNumber = `YS-${receivableDateCode(outboundAt)}-${receivableSequence!.toString().padStart(4, "0")}`;
          await transaction.salesOrder.update({
            where: { id: order.id },
            data: { status: "OUTBOUND" },
          });
          await transaction.receivable.create({
            data: {
              id: receivableId,
              receivableNumber,
              salesOrderId: order.id,
              customerId: order.customerId,
              customerCodeSnapshot: order.customerCodeSnapshot,
              customerNameSnapshot: order.customerNameSnapshot,
              responsibleSalesIdSnapshot: order.responsibleSalesIdSnapshot,
              originalAmountFen: order.totalAmountFen,
              receivedAmountFen: 0,
              remainingAmountFen: order.totalAmountFen,
              paymentTermDaysSnapshot: order.paymentTermDaysSnapshot,
              outboundAt,
              dueDate: addCalendarDays(
                outboundAt,
                order.paymentTermDaysSnapshot,
              ),
              status: "PENDING",
              createdAt: outboundAt,
            },
          });
          await transaction.businessAudit.create({
            data: {
              id: auditId,
              actorId: actor.id,
              actorName: actor.name,
              action: "SALES_ORDER_OUTBOUND",
              objectType: "SALES_ORDER",
              objectId: order.id,
              occurredAt: outboundAt,
              referenceCode: order.salesOrderNumber,
              summary: `完整出库 ${order.items.length} 个 SKU，并自动生成应收 ${receivableNumber}`,
            },
          });

          return {
            id: order.id,
            salesOrderNumber: order.salesOrderNumber,
            status: "OUTBOUND",
            outboundAt,
            outboundByName: actor.name,
            auditId,
            items: order.items.map((item) => ({
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
        throw new OutboundServiceError(
          "INVENTORY_CHANGED",
          "销售单或库存刚刚发生变化，未完成出库。请刷新后重试。",
        );
      }
    }
  }

  throw new OutboundServiceError(
    "INVENTORY_CHANGED",
    "销售单或库存刚刚发生变化，未完成出库。请刷新后重试。",
  );
}
