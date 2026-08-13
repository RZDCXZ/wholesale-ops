import { randomUUID } from "node:crypto";

import { z } from "zod";
import * as XLSX from "xlsx";

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";
import {
  readImportWorksheet,
  type ImportFile,
  type ImportFileRejection,
} from "./workbook-import";
import {
  issueImportPreviewToken,
  readImportPreviewToken,
  type ImportTokenContext,
} from "./signed-import-preview";

const OPENING_INVENTORY_HEADERS = ["SKU 编码", "期初库存数量"] as const;

export type OpeningInventoryImportRow = {
  rowNumber: number;
  skuId: string;
  skuCode: string;
  skuName: string;
  inventoryUnit: string;
  quantity: number;
};

type ParsedOpeningInventoryRow = {
  rowNumber: number;
  skuCode: string;
  quantity?: number;
};

export type OpeningInventoryImportRowError = {
  rowNumber: number;
  field: string;
  value: string;
  reason: string;
};

export class OpeningInventoryImportError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "PREVIEW_INVALID"
      | "PREVIEW_FORBIDDEN"
      | "PREVIEW_STALE"
      | "DUPLICATE_SUBMISSION"
      | "OPENING_ALREADY_IMPORTED"
      | "SALES_INVENTORY_ACTIVITY_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "OpeningInventoryImportError";
  }
}

export type OpeningInventoryImportPreview =
  | ImportFileRejection
  | {
      status: "ready";
      fileName: string;
      totalRows: number;
      validRows: OpeningInventoryImportRow[];
      errors: [];
    }
  | {
      status: "invalid";
      fileName: string;
      totalRows: number;
      validRows: OpeningInventoryImportRow[];
      errors: OpeningInventoryImportRowError[];
    };

export type IssuedOpeningInventoryImportPreview =
  | Exclude<OpeningInventoryImportPreview, { status: "ready" }>
  | (Extract<OpeningInventoryImportPreview, { status: "ready" }> & {
      previewToken: string;
      expiresAt: Date;
    });

const previewPayloadSchema = z.object({
  version: z.literal(1),
  previewId: z.string().min(1),
  actorId: z.string().min(1),
  importType: z.literal("OPENING_INVENTORY"),
  fileName: z.string().min(1),
  expiresAt: z.number().int(),
  rows: z.array(
    z.object({
      rowNumber: z.number().int().positive(),
      skuId: z.string().min(1),
      skuCode: z.string().min(1),
      skuName: z.string().min(1),
      inventoryUnit: z.string().min(1),
      quantity: z.number().int().nonnegative().max(2_147_483_647),
    }),
  ),
});

type PreviewPayload = z.infer<typeof previewPayloadSchema>;

const OPENING_INVENTORY_INSTRUCTIONS = [
  ["期初库存导入说明"],
  ["SKU 编码", "必须关联已启用 SKU，文件内不能重复。"],
  ["期初库存数量", "必须是非负整数；零数量也会建立可追溯起点。"],
  ["限制", "期初库存只能导入一次，且销售库存活动发生后不能再导入。"],
];

export function createOpeningInventoryImportTemplate(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...OPENING_INVENTORY_HEADERS],
    ["WJ-LS-001", 120],
    ["WJ-QP-004", 60],
  ]);
  worksheet["!cols"] = [{ wch: 24 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "期初库存导入");
  const instructions = XLSX.utils.aoa_to_sheet(OPENING_INVENTORY_INSTRUCTIONS);
  instructions["!cols"] = [{ wch: 22 }, { wch: 68 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "填写说明");
  return new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
  );
}

function cellText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseNonnegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647
      ? value
      : undefined;
  }
  const normalized = cellText(value);
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) return undefined;
  const quantity = Number(normalized);
  return Number.isSafeInteger(quantity) && quantity <= 2_147_483_647
    ? quantity
    : undefined;
}

function assertCanImport(actor: Actor) {
  if (authorizeCapability(actor, "IMPORTS_MANAGE").kind !== "authorized") {
    throw new OpeningInventoryImportError(
      "FORBIDDEN",
      "只有老板可以导入期初库存。",
    );
  }
}

function parseOpeningInventoryFile(actor: Actor, file: ImportFile) {
  assertCanImport(actor);
  const worksheet = readImportWorksheet(file, {
    templateName: "期初库存",
    worksheetName: "期初库存导入",
    headers: OPENING_INVENTORY_HEADERS,
  });
  if (worksheet.status === "rejected") return worksheet;

  const rows: ParsedOpeningInventoryRow[] = [];
  const errors: OpeningInventoryImportRowError[] = [];
  const occurrences = new Map<string, number[]>();

  for (const row of worksheet.rows) {
    const [skuCodeValue, quantityValue] = row.values;
    const skuCode = cellText(skuCodeValue);
    const quantity = parseNonnegativeInteger(quantityValue);
    const formulaColumns = new Set(row.formulas.map(({ columnIndex }) => columnIndex));

    if (formulaColumns.has(0)) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "SKU 编码",
        value: cellText(skuCodeValue),
        reason: "不接受公式，请粘贴静态值。",
      });
    } else if (!skuCode) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "SKU 编码",
        value: "",
        reason: "必填字段不能为空。",
      });
    } else if (skuCode.length > 64) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "SKU 编码",
        value: skuCode,
        reason: "不能超过 64 个字符。",
      });
    } else {
      occurrences.set(skuCode, [...(occurrences.get(skuCode) ?? []), row.rowNumber]);
    }

    if (formulaColumns.has(1)) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "期初库存数量",
        value: cellText(quantityValue),
        reason: "不接受公式，请粘贴静态值。",
      });
    } else if (cellText(quantityValue) === "") {
      errors.push({
        rowNumber: row.rowNumber,
        field: "期初库存数量",
        value: "",
        reason: "必填字段不能为空。",
      });
    } else if (quantity === undefined) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "期初库存数量",
        value: cellText(quantityValue),
        reason: "必须是非负整数。",
      });
    }

    rows.push({ rowNumber: row.rowNumber, skuCode, quantity });
  }

  for (const [skuCode, rowNumbers] of occurrences) {
    if (rowNumbers.length < 2) continue;
    for (const rowNumber of rowNumbers) {
      errors.push({
        rowNumber,
        field: "SKU 编码",
        value: skuCode,
        reason: "文件内 SKU 编码重复。",
      });
    }
  }

  return {
    status: "parsed" as const,
    fileName: file.name,
    totalRows: worksheet.rows.length,
    rows,
    errors,
    invalidRowNumbers: new Set(errors.map(({ rowNumber }) => rowNumber)),
    duplicatedCodes: new Set(
      [...occurrences].filter(([, rowNumbers]) => rowNumbers.length > 1).map(([code]) => code),
    ),
  };
}

function issuePreviewToken(
  actor: Actor,
  fileName: string,
  rows: OpeningInventoryImportRow[],
  context: ImportTokenContext,
) {
  return issueImportPreviewToken<PreviewPayload>(
    {
      version: 1,
      actorId: actor.id,
      importType: "OPENING_INVENTORY",
      fileName,
      rows,
    },
    context,
  );
}

function readPreviewToken(token: string, context: ImportTokenContext) {
  return readImportPreviewToken(token, previewPayloadSchema, context);
}

async function assertOpeningInventoryAllowed(
  database: PrismaClient | Prisma.TransactionClient,
) {
  const [openingImport, salesMovement] = await Promise.all([
    database.dataImport.findFirst({
      where: { importType: "OPENING_INVENTORY" },
      select: { id: true },
    }),
    database.inventoryMovement.findFirst({
      where: { movementType: { not: "OPENING" } },
      select: { id: true },
    }),
  ]);
  if (salesMovement) {
    throw new OpeningInventoryImportError(
      "SALES_INVENTORY_ACTIVITY_EXISTS",
      "系统已发生销售库存活动，期初库存只能作为库存流水起点。",
    );
  }
  if (openingImport) {
    throw new OpeningInventoryImportError(
      "OPENING_ALREADY_IMPORTED",
      "期初库存已经导入，不能重复导入或用于调整库存。",
    );
  }
}

export async function getOpeningInventoryImportAvailability(
  database: PrismaClient,
  actor: Actor,
): Promise<
  | { allowed: true }
  | {
      allowed: false;
      code: "OPENING_ALREADY_IMPORTED" | "SALES_INVENTORY_ACTIVITY_EXISTS";
      message: string;
    }
> {
  assertCanImport(actor);
  try {
    await assertOpeningInventoryAllowed(database);
    return { allowed: true };
  } catch (error) {
    if (
      error instanceof OpeningInventoryImportError &&
      (error.code === "OPENING_ALREADY_IMPORTED" ||
        error.code === "SALES_INVENTORY_ACTIVITY_EXISTS")
    ) {
      return { allowed: false, code: error.code, message: error.message };
    }
    throw error;
  }
}

export async function previewOpeningInventoryImport(
  database: PrismaClient,
  actor: Actor,
  file: ImportFile,
  tokenContext: ImportTokenContext,
): Promise<IssuedOpeningInventoryImportPreview> {
  const parsed = parseOpeningInventoryFile(actor, file);
  if (parsed.status === "rejected") return parsed;
  await assertOpeningInventoryAllowed(database);

  const skuCodes = [...new Set(parsed.rows.map(({ skuCode }) => skuCode).filter(Boolean))];
  const skus = await database.sku.findMany({
    where: { skuCode: { in: skuCodes } },
    select: {
      id: true,
      skuCode: true,
      name: true,
      inventoryUnit: true,
      enabled: true,
    },
  });
  const skuByCode = new Map(skus.map((sku) => [sku.skuCode, sku]));
  const lookupErrors: OpeningInventoryImportRowError[] = [];
  const validRows: OpeningInventoryImportRow[] = [];

  for (const row of parsed.rows) {
    if (
      !row.skuCode ||
      row.quantity === undefined ||
      parsed.invalidRowNumbers.has(row.rowNumber) ||
      parsed.duplicatedCodes.has(row.skuCode)
    ) {
      continue;
    }
    const sku = skuByCode.get(row.skuCode);
    if (!sku) {
      lookupErrors.push({
        rowNumber: row.rowNumber,
        field: "SKU 编码",
        value: row.skuCode,
        reason: "SKU 编码不存在。",
      });
      continue;
    }
    if (!sku.enabled) {
      lookupErrors.push({
        rowNumber: row.rowNumber,
        field: "SKU 编码",
        value: row.skuCode,
        reason: "SKU 已停用，不能建立期初库存。",
      });
      continue;
    }
    validRows.push({
      rowNumber: row.rowNumber,
      skuId: sku.id,
      skuCode: sku.skuCode,
      skuName: sku.name,
      inventoryUnit: sku.inventoryUnit,
      quantity: row.quantity,
    });
  }

  const errors = [...parsed.errors, ...lookupErrors].sort(
    (left, right) => left.rowNumber - right.rowNumber,
  );
  const preview = {
    fileName: parsed.fileName,
    totalRows: parsed.totalRows,
    validRows,
  };
  if (errors.length > 0) {
    return { status: "invalid", ...preview, errors };
  }
  return {
    status: "ready",
    ...preview,
    errors: [],
    ...issuePreviewToken(actor, parsed.fileName, validRows, tokenContext),
  };
}

export async function confirmOpeningInventoryImport(
  database: PrismaClient,
  actor: Actor,
  previewToken: string,
  tokenContext: ImportTokenContext,
): Promise<{ importId: string; auditId: string; importedCount: number }> {
  assertCanImport(actor);
  const preview = readPreviewToken(previewToken, tokenContext);
  if (!preview) {
    throw new OpeningInventoryImportError(
      "PREVIEW_INVALID",
      "预览已失效，请重新上传文件。",
    );
  }
  if (preview.actorId !== actor.id) {
    throw new OpeningInventoryImportError(
      "PREVIEW_FORBIDDEN",
      "不能确认其他操作者创建的预览。",
    );
  }

  const auditId = randomUUID();
  try {
    await database.$transaction(async (transaction) => {
      const confirmed = await transaction.dataImport.findUnique({
        where: { id: preview.previewId },
        select: { id: true },
      });
      if (confirmed) {
        throw new OpeningInventoryImportError(
          "DUPLICATE_SUBMISSION",
          "该预览已经导入，不能重复提交。",
        );
      }
      await assertOpeningInventoryAllowed(transaction);

      const currentSkus = await transaction.sku.findMany({
        where: { id: { in: preview.rows.map(({ skuId }) => skuId) } },
        select: { id: true, skuCode: true, name: true, inventoryUnit: true, enabled: true },
      });
      const currentById = new Map(currentSkus.map((sku) => [sku.id, sku]));
      const staleCodes = preview.rows.flatMap((row) => {
        const sku = currentById.get(row.skuId);
        return !sku ||
          !sku.enabled ||
          sku.skuCode !== row.skuCode ||
          sku.name !== row.skuName ||
          sku.inventoryUnit !== row.inventoryUnit
          ? [row.skuCode]
          : [];
      });
      if (staleCodes.length > 0) {
        throw new OpeningInventoryImportError(
          "PREVIEW_STALE",
          `预览后 SKU 状态或资料已变化：${staleCodes.join("、")}。请重新上传校验。`,
        );
      }

      await transaction.dataImport.create({
        data: {
          id: preview.previewId,
          importType: preview.importType,
          fileName: preview.fileName,
          rowCount: preview.rows.length,
          actorId: actor.id,
        },
      });
      for (const row of preview.rows) {
        await transaction.inventoryBalance.create({
          data: {
            skuId: row.skuId,
            onHandQuantity: row.quantity,
            reservedQuantity: 0,
          },
        });
        await transaction.inventoryMovement.create({
          data: {
            id: randomUUID(),
            skuId: row.skuId,
            movementType: "OPENING",
            onHandDelta: row.quantity,
            reservedDelta: 0,
            onHandAfter: row.quantity,
            reservedAfter: 0,
            relatedType: "DATA_IMPORT",
            relatedId: preview.previewId,
            relatedReference: preview.fileName,
            dataImportId: preview.previewId,
            actorId: actor.id,
            actorName: actor.name,
          },
        });
      }
      await transaction.businessAudit.create({
        data: {
          id: auditId,
          actorId: actor.id,
          actorName: actor.name,
          action: "OPENING_INVENTORY_IMPORTED",
          objectType: "DATA_IMPORT",
          objectId: preview.previewId,
          referenceCode: preview.fileName,
          summary: `通过 ${preview.fileName} 导入 ${preview.rows.length} 个 SKU 的期初库存`,
        },
      });
    });
  } catch (error) {
    if (error instanceof OpeningInventoryImportError) throw error;
    if (typeof error === "object" && error !== null && "code" in error) {
      const alreadyImported = await database.dataImport.findFirst({
        where: { importType: "OPENING_INVENTORY" },
        select: { id: true },
      });
      if (alreadyImported) {
        throw new OpeningInventoryImportError(
          alreadyImported.id === preview.previewId
            ? "DUPLICATE_SUBMISSION"
            : "OPENING_ALREADY_IMPORTED",
          alreadyImported.id === preview.previewId
            ? "该预览已经导入，不能重复提交。"
            : "期初库存已经导入，不能重复导入或用于调整库存。",
        );
      }
    }
    throw error;
  }

  return {
    importId: preview.previewId,
    auditId,
    importedCount: preview.rows.length,
  };
}
