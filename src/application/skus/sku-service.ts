import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";

const referencePriceSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  .transform((value, context) => {
    const [yuan, fractional = ""] = value.split(".");
    const fen = Number(yuan) * 100 + Number(fractional.padEnd(2, "0"));

    if (!Number.isSafeInteger(fen) || fen > 2_147_483_647) {
      context.addIssue({ code: "custom", message: "参考售价超出允许范围。" });
      return z.NEVER;
    }

    return fen;
  });

const createSkuInputSchema = z.object({
  skuCode: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  inventoryUnit: z.string().trim().min(1).max(24),
  referencePrice: referencePriceSchema,
  warningThreshold: z.number().int().nonnegative().max(2_147_483_647),
  enabled: z.boolean(),
});

const updateSkuInputSchema = createSkuInputSchema
  .omit({ skuCode: true, inventoryUnit: true, enabled: true })
  .extend({ skuId: z.string().min(1) });
const confirmedSkuInputSchema = z.object({
  skuId: z.string().min(1),
  confirmed: z.literal(true),
});

export type SkuListItem = {
  id: string;
  skuCode: string;
  name: string;
  category: string;
  inventoryUnit: string;
  referencePriceFen: number;
  warningThreshold: number;
  enabled: boolean;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SkuDetail = SkuListItem & { hasBusinessReferences: boolean };
export type SkuMutationResult = SkuListItem & { auditId: string };
export type SkuFilters = {
  query?: string;
  category?: string;
  enabled?: boolean;
  inventoryWarning?: boolean;
};
export type SkuSortField =
  | "skuCode"
  | "name"
  | "category"
  | "referencePrice"
  | "warningThreshold"
  | "updatedAt";
export type SkuListPage = {
  items: SkuListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export class SkuServiceError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "SKU_CODE_EXISTS"
      | "SKU_CODE_IMMUTABLE"
      | "INVENTORY_UNIT_IMMUTABLE"
      | "SKU_STATUS_REQUIRES_ACTION"
      | "SKU_NOT_FOUND"
      | "SKU_REFERENCED"
      | "INVALID_REFERENCE_PRICE"
      | "INVALID_WARNING_THRESHOLD",
    message: string,
  ) {
    super(message);
    this.name = "SkuServiceError";
  }
}

function throwSkuValidationError(error: z.ZodError): never {
  if (error.issues.some(({ path }) => path[0] === "referencePrice")) {
    throw new SkuServiceError(
      "INVALID_REFERENCE_PRICE",
      "参考售价必须是最多两位小数的非负人民币金额。",
    );
  }
  if (error.issues.some(({ path }) => path[0] === "warningThreshold")) {
    throw new SkuServiceError(
      "INVALID_WARNING_THRESHOLD",
      "预警值必须是非负整数。",
    );
  }

  throw error;
}

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("meta" in error)) {
    return undefined;
  }
  const meta = error.meta;
  if (
    typeof meta !== "object" ||
    meta === null ||
    !("driverAdapterError" in meta)
  ) {
    return undefined;
  }
  const adapterError = meta.driverAdapterError;
  if (
    typeof adapterError !== "object" ||
    adapterError === null ||
    !("cause" in adapterError)
  ) {
    return undefined;
  }
  const cause = adapterError.cause;

  return typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string"
    ? cause.code
    : undefined;
}

function formatReferencePrice(fen: number): string {
  return `¥${(fen / 100).toFixed(2)}`;
}

function updateSummary(
  current: {
    name: string;
    category: string;
    referencePriceFen: number;
    warningThreshold: number;
  },
  updated: {
    name: string;
    category: string;
    referencePriceFen: number;
    warningThreshold: number;
  },
): string {
  const changes: string[] = [];
  if (current.name !== updated.name) {
    changes.push(`名称由「${current.name}」调整为「${updated.name}」`);
  }
  if (current.category !== updated.category) {
    changes.push(`分类由「${current.category}」调整为「${updated.category}」`);
  }
  if (current.referencePriceFen !== updated.referencePriceFen) {
    changes.push(
      `参考售价由 ${formatReferencePrice(current.referencePriceFen)} 调整为 ${formatReferencePrice(updated.referencePriceFen)}`,
    );
  }
  if (current.warningThreshold !== updated.warningThreshold) {
    changes.push(
      `预警值由 ${current.warningThreshold} 调整为 ${updated.warningThreshold}`,
    );
  }

  return changes.join("；") || "资料内容未发生变化";
}

function assertCapability(
  actor: Actor,
  capability: "SKUS_VIEW" | "SKUS_MANAGE" | "INVENTORY_VIEW",
) {
  if (authorizeCapability(actor, capability).kind !== "authorized") {
    throw new SkuServiceError("FORBIDDEN", "没有访问权限。");
  }
}

function canManageSkus(actor: Actor): boolean {
  return authorizeCapability(actor, "SKUS_MANAGE").kind === "authorized";
}

function skuWhere(
  actor: Actor,
  filters: SkuFilters,
): Prisma.SkuWhereInput {
  const query = filters.query?.trim();
  const category = filters.category?.trim();

  return {
    AND: [
      { enabled: canManageSkus(actor) ? undefined : true },
      { enabled: filters.enabled },
      // Ticket 03 exposes zero inventory until the inventory ledger lands. With a
      // nonnegative threshold, every enabled SKU is therefore currently at warning.
      { enabled: filters.inventoryWarning ? true : undefined },
    ],
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

function skuOrderBy(
  sort: SkuSortField = "updatedAt",
  direction: Prisma.SortOrder = "desc",
): Prisma.SkuOrderByWithRelationInput[] {
  const field = sort === "referencePrice" ? "referencePriceFen" : sort;
  return [{ [field]: direction }, { id: "asc" }];
}

function toSkuListItem(sku: {
  id: string;
  skuCode: string;
  name: string;
  category: string;
  inventoryUnit: string;
  referencePriceFen: number;
  warningThreshold: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SkuListItem {
  return {
    ...sku,
    onHandQuantity: 0,
    reservedQuantity: 0,
    availableQuantity: 0,
  };
}

export async function createSku(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof createSkuInputSchema>,
): Promise<SkuMutationResult> {
  assertCapability(actor, "SKUS_MANAGE");
  const validation = createSkuInputSchema.safeParse(input);
  if (!validation.success) {
    throwSkuValidationError(validation.error);
  }
  const parsed = validation.data;
  const skuId = randomUUID();
  const auditId = randomUUID();

  try {
    const sku = await database.$transaction(async (transaction) => {
      const created = await transaction.sku.create({
        data: {
          id: skuId,
          skuCode: parsed.skuCode,
          name: parsed.name,
          category: parsed.category,
          inventoryUnit: parsed.inventoryUnit,
          referencePriceFen: parsed.referencePrice,
          warningThreshold: parsed.warningThreshold,
          enabled: parsed.enabled,
        },
      });

      await transaction.businessAudit.create({
        data: {
          id: auditId,
          actorId: actor.id,
          actorName: actor.name,
          action: "SKU_CREATED",
          objectType: "SKU",
          objectId: created.id,
          referenceCode: created.skuCode,
          summary: `创建 SKU：${created.name}`,
        },
      });

      return created;
    });

    return { ...toSkuListItem(sku), auditId };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new SkuServiceError("SKU_CODE_EXISTS", "SKU 编码已被使用。");
    }

    throw error;
  }
}

export async function getSku(
  database: PrismaClient,
  actor: Actor,
  skuId: string,
): Promise<SkuDetail> {
  assertCapability(actor, "SKUS_VIEW");
  const sku = await database.sku.findFirst({
    where: {
      id: skuId,
      enabled: canManageSkus(actor) ? undefined : true,
    },
  });

  if (!sku) {
    throw new SkuServiceError("SKU_NOT_FOUND", "SKU 不存在或不可访问。");
  }

  return {
    ...toSkuListItem(sku),
    hasBusinessReferences: await skuHasBusinessReferences(database, sku.id),
  };
}

export async function getSkuInventorySummary(
  database: PrismaClient,
  actor: Actor,
  skuId: string,
): Promise<SkuListItem> {
  assertCapability(actor, "INVENTORY_VIEW");
  const sku = await database.sku.findUnique({ where: { id: skuId } });
  if (!sku) {
    throw new SkuServiceError("SKU_NOT_FOUND", "SKU 不存在或不可访问。");
  }
  return toSkuListItem(sku);
}

async function skuHasBusinessReferences(
  database: PrismaClient | Prisma.TransactionClient,
  skuId: string,
): Promise<boolean> {
  const rows = await database.$queryRaw<Array<{ referenced: boolean }>>`
    SELECT sku_has_business_references(${skuId}) AS referenced
  `;
  return rows[0]?.referenced ?? false;
}

export async function updateSku(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof updateSkuInputSchema>,
): Promise<SkuMutationResult> {
  assertCapability(actor, "SKUS_MANAGE");
  if (typeof input === "object" && input !== null && "skuCode" in input) {
    throw new SkuServiceError(
      "SKU_CODE_IMMUTABLE",
      "SKU 编码创建后不能修改。",
    );
  }
  if (typeof input === "object" && input !== null && "inventoryUnit" in input) {
    throw new SkuServiceError(
      "INVENTORY_UNIT_IMMUTABLE",
      "库存单位创建后不能修改。",
    );
  }
  if (typeof input === "object" && input !== null && "enabled" in input) {
    throw new SkuServiceError(
      "SKU_STATUS_REQUIRES_ACTION",
      "请使用专门的停用操作变更 SKU 状态。",
    );
  }
  const validation = updateSkuInputSchema.safeParse(input);
  if (!validation.success) {
    throwSkuValidationError(validation.error);
  }
  const parsed = validation.data;
  const auditId = randomUUID();

  const sku = await database.$transaction(async (transaction) => {
    const current = await transaction.sku.findUnique({
      where: { id: parsed.skuId },
    });

    if (!current) {
      throw new SkuServiceError("SKU_NOT_FOUND", "SKU 不存在或不可访问。");
    }

    const updated = await transaction.sku.update({
      where: { id: current.id },
      data: {
        name: parsed.name,
        category: parsed.category,
        referencePriceFen: parsed.referencePrice,
        warningThreshold: parsed.warningThreshold,
      },
    });
    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "SKU_UPDATED",
        objectType: "SKU",
        objectId: updated.id,
        referenceCode: updated.skuCode,
        summary: updateSummary(current, updated),
      },
    });

    return updated;
  });

  return { ...toSkuListItem(sku), auditId };
}

export async function disableSku(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof confirmedSkuInputSchema>,
): Promise<SkuMutationResult> {
  assertCapability(actor, "SKUS_MANAGE");
  const parsed = confirmedSkuInputSchema.parse(input);
  const auditId = randomUUID();

  const sku = await database.$transaction(async (transaction) => {
    const current = await transaction.sku.findUnique({
      where: { id: parsed.skuId },
    });
    if (!current) {
      throw new SkuServiceError("SKU_NOT_FOUND", "SKU 不存在或不可访问。");
    }

    const updated = await transaction.sku.update({
      where: { id: current.id },
      data: { enabled: false },
    });
    await transaction.businessAudit.create({
      data: {
        id: auditId,
        actorId: actor.id,
        actorName: actor.name,
        action: "SKU_DISABLED",
        objectType: "SKU",
        objectId: updated.id,
        referenceCode: updated.skuCode,
        summary: `停用 SKU：${updated.name}`,
      },
    });

    return updated;
  });

  return { ...toSkuListItem(sku), auditId };
}

export async function deleteSku(
  database: PrismaClient,
  actor: Actor,
  input: z.input<typeof confirmedSkuInputSchema>,
): Promise<{ id: string; skuCode: string; auditId: string }> {
  assertCapability(actor, "SKUS_MANAGE");
  const parsed = confirmedSkuInputSchema.parse(input);
  const auditId = randomUUID();

  try {
    return await database.$transaction(async (transaction) => {
      const current = await transaction.sku.findUnique({
        where: { id: parsed.skuId },
      });
      if (!current) {
        throw new SkuServiceError("SKU_NOT_FOUND", "SKU 不存在或不可访问。");
      }
      if (await skuHasBusinessReferences(transaction, current.id)) {
        throw new SkuServiceError(
          "SKU_REFERENCED",
          "SKU 已被业务记录引用，不能删除；请改为停用。",
        );
      }

      await transaction.sku.delete({ where: { id: current.id } });
      await transaction.businessAudit.create({
        data: {
          id: auditId,
          actorId: actor.id,
          actorName: actor.name,
          action: "SKU_DELETED",
          objectType: "SKU",
          objectId: current.id,
          referenceCode: current.skuCode,
          summary: `删除未被业务记录引用的 SKU：${current.name}`,
        },
      });

      return { id: current.id, skuCode: current.skuCode, auditId };
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "P2003" ||
        (error.code === "P2039" &&
          ["23001", "23503"].includes(databaseErrorCode(error) ?? "")))
    ) {
      throw new SkuServiceError(
        "SKU_REFERENCED",
        "SKU 已被业务记录引用，不能删除；请改为停用。",
      );
    }

    throw error;
  }
}

export async function listSkus(
  database: PrismaClient,
  actor: Actor,
  filters: SkuFilters,
): Promise<SkuListItem[]> {
  assertCapability(actor, "SKUS_VIEW");
  const skus = await database.sku.findMany({
    where: skuWhere(actor, filters),
    orderBy: skuOrderBy(),
  });

  return skus.map(toSkuListItem);
}

export async function listSkusPage(
  database: PrismaClient,
  actor: Actor,
  filters: SkuFilters,
  pagination: {
    page: number;
    pageSize: number;
    sort?: SkuSortField;
    direction?: Prisma.SortOrder;
  },
): Promise<SkuListPage> {
  assertCapability(actor, "SKUS_VIEW");
  const page = Math.max(1, pagination.page);
  const pageSize = Math.min(100, Math.max(1, pagination.pageSize));
  const where = skuWhere(actor, filters);
  const [total, skus] = await Promise.all([
    database.sku.count({ where }),
    database.sku.findMany({
      where,
      orderBy: skuOrderBy(pagination.sort, pagination.direction),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: skus.map(toSkuListItem),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
