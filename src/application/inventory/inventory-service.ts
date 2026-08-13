import type { InventoryMovementType, Prisma, PrismaClient } from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";

export type InventoryFilters = {
  query?: string;
  category?: string;
  enabled?: boolean;
  inventoryWarning?: boolean;
};

export type InventoryMovementFilters = {
  skuId?: string;
  movementType?: InventoryMovementType;
  dateFrom?: Date;
  dateTo?: Date;
  importId?: string;
  relatedReference?: string;
  actor?: string;
};

export class InventoryServiceError extends Error {
  constructor(
    readonly code: "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "InventoryServiceError";
  }
}

function assertInventoryAccess(actor: Actor) {
  if (authorizeCapability(actor, "INVENTORY_VIEW").kind !== "authorized") {
    throw new InventoryServiceError("FORBIDDEN", "没有访问库存的权限。");
  }
}

export type InventoryListItem = {
  skuId: string;
  skuCode: string;
  name: string;
  category: string;
  inventoryUnit: string;
  enabled: boolean;
  warningThreshold: number;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  inventoryWarning: boolean;
  lastChangedAt: Date | null;
};

export async function listInventory(
  database: PrismaClient,
  actor: Actor,
  filters: InventoryFilters,
): Promise<InventoryListItem[]> {
  assertInventoryAccess(actor);
  const query = filters.query?.trim();
  const category = filters.category?.trim();
  const where: Prisma.SkuWhereInput = {
    enabled: filters.enabled,
    category: category
      ? { equals: category, mode: "insensitive" }
      : undefined,
    OR: query
      ? [
          { skuCode: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };
  const skus = await database.sku.findMany({
    where,
    include: {
      inventoryBalance: true,
      inventoryMovements: {
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { occurredAt: true },
      },
    },
    orderBy: [{ skuCode: "asc" }, { id: "asc" }],
  });
  const items = skus.map((sku) => {
    const onHandQuantity = sku.inventoryBalance?.onHandQuantity ?? 0;
    const reservedQuantity = sku.inventoryBalance?.reservedQuantity ?? 0;
    const availableQuantity = onHandQuantity - reservedQuantity;
    return {
      skuId: sku.id,
      skuCode: sku.skuCode,
      name: sku.name,
      category: sku.category,
      inventoryUnit: sku.inventoryUnit,
      enabled: sku.enabled,
      warningThreshold: sku.warningThreshold,
      onHandQuantity,
      reservedQuantity,
      availableQuantity,
      inventoryWarning:
        sku.enabled && availableQuantity <= sku.warningThreshold,
      lastChangedAt: sku.inventoryMovements[0]?.occurredAt ?? null,
    };
  });

  return filters.inventoryWarning
    ? items.filter(({ inventoryWarning }) => inventoryWarning)
    : items;
}

export type InventoryMovementListItem = {
  id: string;
  occurredAt: Date;
  skuId: string;
  skuCode: string;
  skuName: string;
  inventoryUnit: string;
  movementType: InventoryMovementType;
  onHandDelta: number;
  reservedDelta: number;
  onHandAfter: number;
  reservedAfter: number;
  availableAfter: number;
  relatedType: string;
  relatedId: string;
  relatedReference: string | null;
  actorId: string;
  actorName: string;
};

export async function listInventoryMovements(
  database: PrismaClient,
  actor: Actor,
  filters: InventoryMovementFilters,
): Promise<InventoryMovementListItem[]> {
  assertInventoryAccess(actor);
  const movements = await database.inventoryMovement.findMany({
    where: {
      skuId: filters.skuId,
      movementType: filters.movementType,
      dataImportId: filters.importId,
      relatedReference: filters.relatedReference
        ? { contains: filters.relatedReference.trim(), mode: "insensitive" }
        : undefined,
      actorName: filters.actor
        ? { contains: filters.actor.trim(), mode: "insensitive" }
        : undefined,
      occurredAt:
        filters.dateFrom || filters.dateTo
          ? { gte: filters.dateFrom, lte: filters.dateTo }
          : undefined,
    },
    include: {
      sku: {
        select: {
          skuCode: true,
          name: true,
          inventoryUnit: true,
        },
      },
    },
    orderBy: [
      { occurredAt: "desc" },
      { sku: { skuCode: "desc" } },
      { id: "desc" },
    ],
  });

  return movements.map(({ sku, ...movement }) => ({
    ...movement,
    skuCode: sku.skuCode,
    skuName: sku.name,
    inventoryUnit: sku.inventoryUnit,
    availableAfter: movement.onHandAfter - movement.reservedAfter,
  }));
}

export type SalesSkuAvailability = {
  skuId: string;
  skuCode: string;
  name: string;
  inventoryUnit: string;
  referencePriceFen: number;
  availableQuantity: number;
};

export async function listSkuAvailabilityForSales(
  database: PrismaClient,
  actor: Actor,
  filters: { query?: string },
): Promise<SalesSkuAvailability[]> {
  if (
    authorizeCapability(actor, "SALES_ORDERS_VIEW").kind !== "authorized"
  ) {
    throw new InventoryServiceError(
      "FORBIDDEN",
      "没有查看销售可用量的权限。",
    );
  }
  const query = filters.query?.trim();
  const skus = await database.sku.findMany({
    where: {
      enabled: true,
      OR: query
        ? [
            { skuCode: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { inventoryBalance: true },
    orderBy: [{ skuCode: "asc" }, { id: "asc" }],
  });

  return skus.map((sku) => ({
    skuId: sku.id,
    skuCode: sku.skuCode,
    name: sku.name,
    inventoryUnit: sku.inventoryUnit,
    referencePriceFen: sku.referencePriceFen,
    availableQuantity:
      (sku.inventoryBalance?.onHandQuantity ?? 0) -
      (sku.inventoryBalance?.reservedQuantity ?? 0),
  }));
}
