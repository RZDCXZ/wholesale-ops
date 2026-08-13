import type { InventoryMovementType, Prisma, PrismaClient } from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";

export type InventoryFilters = {
  query?: string;
  category?: string;
  enabled?: boolean;
  inventoryWarning?: boolean;
};

export type InventorySortField =
  | "skuCode"
  | "name"
  | "inventoryUnit"
  | "onHandQuantity"
  | "reservedQuantity"
  | "warningThreshold"
  | "lastChangedAt";

export type ListPagination<TSort extends string> = {
  page: number;
  pageSize: number;
  sort: TSort;
  direction: "asc" | "desc";
};

export type InventoryMovementFilters = {
  skuId?: string;
  movementType?: InventoryMovementType;
  dateFrom?: Date;
  dateTo?: Date;
  importId?: string;
  relatedReference?: string;
  actor?: string;
  limit?: number;
};

export class InventoryServiceError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "OPENING_SOURCE_NOT_FOUND",
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

export type InventoryListPage = {
  items: InventoryListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function inventoryWhere(
  filters: InventoryFilters,
  warningSkuIds?: string[],
): Prisma.SkuWhereInput {
  const query = filters.query?.trim();
  const category = filters.category?.trim();
  return {
    id: warningSkuIds ? { in: warningSkuIds } : undefined,
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
}

function toInventoryListItem(sku: {
  id: string;
  skuCode: string;
  name: string;
  category: string;
  inventoryUnit: string;
  enabled: boolean;
  warningThreshold: number;
  inventoryBalance: { onHandQuantity: number; reservedQuantity: number } | null;
  inventoryMovements: Array<{ occurredAt: Date }>;
}): InventoryListItem {
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
}

const inventoryInclude = {
  inventoryBalance: true,
  inventoryMovements: {
    orderBy: [{ occurredAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
    select: { occurredAt: true },
  },
};

export async function listInventory(
  database: PrismaClient,
  actor: Actor,
  filters: InventoryFilters,
): Promise<InventoryListItem[]> {
  assertInventoryAccess(actor);
  const skus = await database.sku.findMany({
    where: inventoryWhere(filters),
    include: inventoryInclude,
    orderBy: [{ skuCode: "asc" }, { id: "asc" }],
  });
  const items = skus.map(toInventoryListItem);

  return filters.inventoryWarning
    ? items.filter(({ inventoryWarning }) => inventoryWarning)
    : items;
}

export async function listInventoryPage(
  database: PrismaClient,
  actor: Actor,
  filters: InventoryFilters,
  pagination: ListPagination<InventorySortField>,
): Promise<InventoryListPage> {
  assertInventoryAccess(actor);
  const page = Math.max(1, Math.trunc(pagination.page));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(pagination.pageSize)));
  const warningSkuIds = filters.inventoryWarning
    ? (
        await database.$queryRaw<Array<{ id: string }>>`
          SELECT sku.id
          FROM "sku" AS sku
          LEFT JOIN "inventory_balance" AS balance ON balance."skuId" = sku.id
          WHERE sku.enabled = TRUE
            AND COALESCE(balance."onHandQuantity", 0)
              - COALESCE(balance."reservedQuantity", 0) <= sku."warningThreshold"
        `
      ).map(({ id }) => id)
    : undefined;
  const where = inventoryWhere(filters, warningSkuIds);
  const relationSort =
    pagination.sort === "onHandQuantity" ||
    pagination.sort === "reservedQuantity"
      ? { inventoryBalance: { [pagination.sort]: pagination.direction } }
      : pagination.sort === "lastChangedAt"
        ? { inventoryBalance: { updatedAt: pagination.direction } }
        : { [pagination.sort]: pagination.direction };
  const [total, skus] = await Promise.all([
    database.sku.count({ where }),
    database.sku.findMany({
      where,
      include: inventoryInclude,
      orderBy: [relationSort, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: skus.map(toInventoryListItem),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
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

export type InventoryMovementSortField =
  | "occurredAt"
  | "skuCode"
  | "movementType"
  | "onHandDelta"
  | "reservedDelta"
  | "onHandAfter"
  | "reservedAfter"
  | "actorName";

export type InventoryMovementListPage = {
  items: InventoryMovementListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type OpeningInventorySource = {
  id: string;
  fileName: string;
  rowCount: number;
  confirmedAt: Date;
  actor: { id: string; name: string };
  rows: Array<{
    skuId: string;
    skuCode: string;
    skuName: string;
    inventoryUnit: string;
    quantity: number;
  }>;
};

export async function getOpeningInventorySource(
  database: PrismaClient,
  actor: Actor,
  importId: string,
): Promise<OpeningInventorySource> {
  assertInventoryAccess(actor);
  const source = await database.dataImport.findFirst({
    where: { id: importId, importType: "OPENING_INVENTORY" },
    select: {
      id: true,
      fileName: true,
      rowCount: true,
      confirmedAt: true,
      actor: { select: { id: true, name: true } },
      inventoryMovements: {
        where: { movementType: "OPENING" },
        orderBy: [{ sku: { skuCode: "asc" } }, { id: "asc" }],
        select: {
          skuId: true,
          onHandDelta: true,
          sku: {
            select: {
              skuCode: true,
              name: true,
              inventoryUnit: true,
            },
          },
        },
      },
    },
  });
  if (!source) {
    throw new InventoryServiceError(
      "OPENING_SOURCE_NOT_FOUND",
      "期初库存导入记录不存在或不可访问。",
    );
  }

  return {
    id: source.id,
    fileName: source.fileName,
    rowCount: source.rowCount,
    confirmedAt: source.confirmedAt,
    actor: source.actor,
    rows: source.inventoryMovements.map(({ sku, skuId, onHandDelta }) => ({
      skuId,
      skuCode: sku.skuCode,
      skuName: sku.name,
      inventoryUnit: sku.inventoryUnit,
      quantity: onHandDelta,
    })),
  };
}

function inventoryMovementWhere(
  filters: InventoryMovementFilters,
): Prisma.InventoryMovementWhereInput {
  return {
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
  };
}

const inventoryMovementInclude = {
  sku: {
    select: {
      skuCode: true,
      name: true,
      inventoryUnit: true,
    },
  },
};

function toInventoryMovementListItem(movementWithSku: {
  id: string;
  occurredAt: Date;
  skuId: string;
  movementType: InventoryMovementType;
  onHandDelta: number;
  reservedDelta: number;
  onHandAfter: number;
  reservedAfter: number;
  relatedType: string;
  relatedId: string;
  relatedReference: string | null;
  actorId: string;
  actorName: string;
  dataImportId: string | null;
  sku: { skuCode: string; name: string; inventoryUnit: string };
}): InventoryMovementListItem {
  const { sku } = movementWithSku;
  return {
    id: movementWithSku.id,
    occurredAt: movementWithSku.occurredAt,
    skuId: movementWithSku.skuId,
    skuCode: sku.skuCode,
    skuName: sku.name,
    inventoryUnit: sku.inventoryUnit,
    movementType: movementWithSku.movementType,
    onHandDelta: movementWithSku.onHandDelta,
    reservedDelta: movementWithSku.reservedDelta,
    onHandAfter: movementWithSku.onHandAfter,
    reservedAfter: movementWithSku.reservedAfter,
    availableAfter:
      movementWithSku.onHandAfter - movementWithSku.reservedAfter,
    relatedType: movementWithSku.relatedType,
    relatedId: movementWithSku.relatedId,
    relatedReference: movementWithSku.relatedReference,
    actorId: movementWithSku.actorId,
    actorName: movementWithSku.actorName,
  };
}

export async function listInventoryMovements(
  database: PrismaClient,
  actor: Actor,
  filters: InventoryMovementFilters,
): Promise<InventoryMovementListItem[]> {
  assertInventoryAccess(actor);
  const movements = await database.inventoryMovement.findMany({
    where: inventoryMovementWhere(filters),
    include: inventoryMovementInclude,
    orderBy: [
      { occurredAt: "desc" },
      { sku: { skuCode: "desc" } },
      { id: "desc" },
    ],
    take:
      filters.limit && filters.limit > 0
        ? Math.min(Math.trunc(filters.limit), 100)
        : undefined,
  });

  return movements.map(toInventoryMovementListItem);
}

export async function listInventoryMovementsPage(
  database: PrismaClient,
  actor: Actor,
  filters: InventoryMovementFilters,
  pagination: ListPagination<InventoryMovementSortField>,
): Promise<InventoryMovementListPage> {
  assertInventoryAccess(actor);
  const page = Math.max(1, Math.trunc(pagination.page));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(pagination.pageSize)));
  const where = inventoryMovementWhere(filters);
  const primaryOrder =
    pagination.sort === "skuCode"
      ? { sku: { skuCode: pagination.direction } }
      : { [pagination.sort]: pagination.direction };
  const [total, movements] = await Promise.all([
    database.inventoryMovement.count({ where }),
    database.inventoryMovement.findMany({
      where,
      include: inventoryMovementInclude,
      orderBy: [primaryOrder, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: movements.map(toInventoryMovementListItem),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
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
