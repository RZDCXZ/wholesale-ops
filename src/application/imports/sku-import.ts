import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";
import * as XLSX from "xlsx";

import type { PrismaClient } from "../../generated/prisma/client";
import { authorizeCapability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";
import {
  readImportWorksheet,
  type ImportFile,
  type ImportFileRejection,
} from "./workbook-import";

const SKU_IMPORT_HEADERS = [
  "SKU 编码",
  "名称",
  "分类",
  "库存单位",
  "参考售价",
  "预警值",
  "启用状态",
] as const;
const SKU_TEXT_LIMITS = [64, 160, 80, 24] as const;

export type SkuImportRow = {
  rowNumber: number;
  skuCode: string;
  name: string;
  category: string;
  inventoryUnit: string;
  referencePriceFen: number;
  warningThreshold: number;
  enabled: boolean;
};

export type ImportRowError = {
  rowNumber: number;
  field: string;
  value: string;
  reason: string;
};

export class SkuImportError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "PREVIEW_INVALID"
      | "PREVIEW_FORBIDDEN"
      | "PREVIEW_STALE"
      | "DUPLICATE_SUBMISSION",
    message: string,
  ) {
    super(message);
    this.name = "SkuImportError";
  }
}

export type SkuImportPreview =
  | ImportFileRejection
  | {
      status: "ready";
      fileName: string;
      totalRows: number;
      validRows: SkuImportRow[];
      errors: [];
    }
  | {
      status: "invalid";
      fileName: string;
      totalRows: number;
      validRows: SkuImportRow[];
      errors: ImportRowError[];
    };

export type ImportTokenContext = {
  secret: string;
  now: Date;
};

export type IssuedSkuImportPreview =
  | Exclude<SkuImportPreview, { status: "ready" }>
  | (Extract<SkuImportPreview, { status: "ready" }> & {
      previewToken: string;
      expiresAt: Date;
    });

type ParsedSkuImport =
  | ImportFileRejection
  | {
      status: "parsed";
      fileName: string;
      totalRows: number;
      validRows: SkuImportRow[];
      errors: ImportRowError[];
      skuCodeRows: Array<{ rowNumber: number; skuCode: string }>;
    };

const previewPayloadSchema = z
  .object({
    version: z.literal(1),
    previewId: z.string().min(1),
    actorId: z.string().min(1),
    importType: z.literal("SKU"),
    fileName: z.string().min(1).max(1_024),
    expiresAt: z.number().int().positive(),
    rows: z
      .array(
        z.object({
          rowNumber: z.number().int().min(2).max(2_001),
          skuCode: z.string().min(1).max(64),
          name: z.string().min(1).max(160),
          category: z.string().min(1).max(80),
          inventoryUnit: z.string().min(1).max(24),
          referencePriceFen: z.number().int().nonnegative().max(2_147_483_647),
          warningThreshold: z.number().int().nonnegative().max(2_147_483_647),
          enabled: z.boolean(),
        }),
      )
      .min(1)
      .max(2_000),
  })
  .strict()
  .superRefine(({ rows }, context) => {
    const codes = new Set<string>();
    for (const row of rows) {
      if (codes.has(row.skuCode)) {
        context.addIssue({
          code: "custom",
          message: "预览内容包含重复 SKU 编码。",
        });
      }
      codes.add(row.skuCode);
    }
  });

type PreviewPayload = z.infer<typeof previewPayloadSchema>;

const SKU_IMPORT_INSTRUCTIONS = [
  { 字段: "SKU 编码", 填写说明: "必填，最多 64 个字符；创建后不可修改。", 示例: "WJ-LS-001" },
  { 字段: "名称", 填写说明: "必填，最多 160 个字符；名称可以重复。", 示例: "304 不锈钢六角螺栓 M8×30" },
  { 字段: "分类", 填写说明: "必填，最多 80 个字符。", 示例: "紧固件" },
  { 字段: "库存单位", 填写说明: "必填，最多 24 个字符；创建后不可修改。", 示例: "盒" },
  { 字段: "参考售价", 填写说明: "必填，非负人民币金额，最多两位小数。", 示例: "48.50" },
  { 字段: "预警值", 填写说明: "必填，非负整数。", 示例: "20" },
  { 字段: "启用状态", 填写说明: "必填，只能填写“启用”或“停用”。", 示例: "启用" },
] as const;

export function createSkuImportTemplate(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([[...SKU_IMPORT_HEADERS]]);
  dataSheet["!cols"] = [
    { wch: 18 },
    { wch: 32 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
  ];
  const instructionsSheet = XLSX.utils.json_to_sheet([
    ...SKU_IMPORT_INSTRUCTIONS,
  ]);
  instructionsSheet["!cols"] = [{ wch: 16 }, { wch: 48 }, { wch: 34 }];

  XLSX.utils.book_append_sheet(workbook, dataSheet, "SKU导入");
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "填写说明");

  const output = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
  });
  return new Uint8Array(output);
}

function cellText(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function referencePriceFen(value: unknown): number {
  const [yuan, fraction = ""] = cellText(value).split(".");
  return Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
}

function previewSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function issuePreviewToken(
  actor: Actor,
  fileName: string,
  rows: SkuImportRow[],
  context: ImportTokenContext,
): { previewToken: string; expiresAt: Date } {
  const expiresAt = new Date(context.now.getTime() + 15 * 60_000);
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      previewId: randomUUID(),
      actorId: actor.id,
      importType: "SKU",
      fileName,
      expiresAt: expiresAt.getTime(),
      rows,
    } satisfies PreviewPayload),
  ).toString("base64url");
  return {
    previewToken: `${payload}.${previewSignature(payload, context.secret)}`,
    expiresAt,
  };
}

function readPreviewToken(
  token: string,
  context: ImportTokenContext,
): PreviewPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, receivedSignature] = parts;
  if (!payload || !receivedSignature) return null;
  const expected = Buffer.from(previewSignature(payload, context.secret));
  const received = Buffer.from(receivedSignature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  try {
    const parsed = previewPayloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!parsed.success || parsed.data.expiresAt <= context.now.getTime()) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function parseSkuImportFile(
  actor: Actor,
  file: ImportFile,
): ParsedSkuImport {
  if (authorizeCapability(actor, "IMPORTS_MANAGE").kind !== "authorized") {
    throw new SkuImportError(
      "FORBIDDEN",
      "只有老板可以使用导入工作台。",
    );
  }
  const worksheet = readImportWorksheet(file, {
    templateName: "SKU",
    worksheetName: "SKU导入",
    headers: SKU_IMPORT_HEADERS,
  });
  if (worksheet.status === "rejected") {
    return worksheet;
  }
  const errors: ImportRowError[] = [];
  const candidateRows = worksheet.rows.flatMap(
    ({ rowNumber, values, formulas }) => {
      if (formulas.length > 0) {
        errors.push(
          ...formulas.map(({ columnIndex, expression }) => ({
            rowNumber,
            field: SKU_IMPORT_HEADERS[columnIndex]!,
            value: `=${expression}`,
            reason: "不接受公式，请填写固定值。",
          })),
        );
        return [];
      }

      const texts = values.map(cellText);
      const missingFieldErrors = SKU_IMPORT_HEADERS.flatMap(
        (field, columnIndex) =>
          texts[columnIndex]
            ? []
            : [
                {
                  rowNumber,
                  field,
                  value: "",
                  reason: "必填字段不能为空。",
                },
              ],
      );
      if (missingFieldErrors.length > 0) {
        errors.push(...missingFieldErrors);
        return [];
      }
      const lengthErrors = SKU_TEXT_LIMITS.flatMap((maximum, columnIndex) =>
        texts[columnIndex]!.length > maximum
          ? [
              {
                rowNumber,
                field: SKU_IMPORT_HEADERS[columnIndex]!,
                value: texts[columnIndex]!,
                reason: `不能超过 ${maximum} 个字符。`,
              },
            ]
          : [],
      );
      if (lengthErrors.length > 0) {
        errors.push(...lengthErrors);
        return [];
      }

      const referencePrice = texts[4]!;
      const parsedReferencePriceFen = referencePriceFen(referencePrice);
      if (
        !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(referencePrice) ||
        !Number.isSafeInteger(parsedReferencePriceFen) ||
        parsedReferencePriceFen > 2_147_483_647
      ) {
        errors.push({
          rowNumber,
          field: "参考售价",
          value: referencePrice,
          reason: "必须是最多两位小数的非负人民币金额。",
        });
        return [];
      }

      const warningThreshold = Number(texts[5]);
      if (
        !/^\d+$/.test(texts[5]!) ||
        !Number.isSafeInteger(warningThreshold) ||
        warningThreshold > 2_147_483_647
      ) {
        errors.push({
          rowNumber,
          field: "预警值",
          value: texts[5]!,
          reason: "必须是非负整数。",
        });
        return [];
      }
      if (texts[6] !== "启用" && texts[6] !== "停用") {
        errors.push({
          rowNumber,
          field: "启用状态",
          value: texts[6]!,
          reason: "只能填写“启用”或“停用”。",
        });
        return [];
      }

      return [
        {
          rowNumber,
          skuCode: texts[0]!,
          name: texts[1]!,
          category: texts[2]!,
          inventoryUnit: texts[3]!,
          referencePriceFen: parsedReferencePriceFen,
          warningThreshold,
          enabled: texts[6] === "启用",
        },
      ];
    },
  );

  const skuCodeRows = worksheet.rows.flatMap((row) => {
    if (row.formulas.some(({ columnIndex }) => columnIndex === 0)) return [];
    const skuCode = cellText(row.values[0]);
    return skuCode ? [{ rowNumber: row.rowNumber, skuCode }] : [];
  });
  const codeCounts = new Map<string, number>();
  for (const { skuCode } of skuCodeRows) {
    codeCounts.set(skuCode, (codeCounts.get(skuCode) ?? 0) + 1);
  }
  const duplicateCodes = new Set(
    [...codeCounts].filter(([, count]) => count > 1).map(([skuCode]) => skuCode),
  );
  for (const { rowNumber, skuCode } of skuCodeRows) {
    if (duplicateCodes.has(skuCode)) {
      errors.push({
        rowNumber,
        field: "SKU 编码",
        value: skuCode,
        reason: "文件内 SKU 编码重复。",
      });
    }
  }
  const validRows = candidateRows.filter(
    ({ skuCode }) => !duplicateCodes.has(skuCode),
  );

  return {
    status: "parsed",
    fileName: file.name,
    totalRows: worksheet.rows.length,
    validRows,
    errors,
    skuCodeRows,
  };
}

function buildSkuImportPreview(
  parsed: Exclude<ParsedSkuImport, ImportFileRejection>,
  existingSkuCodes: ReadonlySet<string>,
): SkuImportPreview {
  const existingCodeErrors = parsed.skuCodeRows.flatMap(
    ({ rowNumber, skuCode }) =>
      existingSkuCodes.has(skuCode)
        ? [
            {
              rowNumber,
              field: "SKU 编码",
              value: skuCode,
              reason: "SKU 编码已存在。",
            },
          ]
        : [],
  );
  const errors = [...parsed.errors, ...existingCodeErrors];
  const preview = {
    fileName: parsed.fileName,
    totalRows: parsed.totalRows,
    validRows: parsed.validRows.filter(
      ({ skuCode }) => !existingSkuCodes.has(skuCode),
    ),
  };
  return errors.length === 0
    ? { status: "ready", ...preview, errors: [] }
    : { status: "invalid", ...preview, errors };
}

export function previewSkuImportFile(
  actor: Actor,
  file: ImportFile,
  existingSkuCodes: ReadonlySet<string>,
): SkuImportPreview {
  const parsed = parseSkuImportFile(actor, file);
  return parsed.status === "rejected"
    ? parsed
    : buildSkuImportPreview(parsed, existingSkuCodes);
}

export async function previewSkuImport(
  database: PrismaClient,
  actor: Actor,
  file: ImportFile,
  tokenContext: ImportTokenContext,
): Promise<IssuedSkuImportPreview> {
  const parsed = parseSkuImportFile(actor, file);
  if (parsed.status === "rejected") return parsed;

  const existing = await database.sku.findMany({
    where: {
      skuCode: { in: parsed.skuCodeRows.map(({ skuCode }) => skuCode) },
    },
    select: { skuCode: true },
  });
  const preview = buildSkuImportPreview(
    parsed,
    new Set(existing.map(({ skuCode }) => skuCode)),
  );
  if (preview.status !== "ready") return preview;

  return {
    ...preview,
    ...issuePreviewToken(actor, preview.fileName, preview.validRows, tokenContext),
  };
}

export async function confirmSkuImport(
  database: PrismaClient,
  actor: Actor,
  previewToken: string,
  tokenContext: ImportTokenContext,
): Promise<{ importId: string; auditId: string; importedCount: number }> {
  if (authorizeCapability(actor, "IMPORTS_MANAGE").kind !== "authorized") {
    throw new SkuImportError(
      "FORBIDDEN",
      "只有老板可以使用导入工作台。",
    );
  }
  const preview = readPreviewToken(previewToken, tokenContext);
  if (!preview) {
    throw new SkuImportError(
      "PREVIEW_INVALID",
      "预览已失效，请重新上传文件。",
    );
  }
  if (preview.actorId !== actor.id) {
    throw new SkuImportError(
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
        throw new SkuImportError(
          "DUPLICATE_SUBMISSION",
          "该预览已经导入，不能重复提交。",
        );
      }

      const existing = await transaction.sku.findMany({
        where: { skuCode: { in: preview.rows.map(({ skuCode }) => skuCode) } },
        select: { skuCode: true },
      });
      if (existing.length > 0) {
        throw new SkuImportError(
          "PREVIEW_STALE",
          `预览后已有 SKU 编码被使用：${existing.map(({ skuCode }) => skuCode).join("、")}。请重新上传校验。`,
        );
      }

      await transaction.sku.createMany({
        data: preview.rows.map((row) => ({
          id: randomUUID(),
          skuCode: row.skuCode,
          name: row.name,
          category: row.category,
          inventoryUnit: row.inventoryUnit,
          referencePriceFen: row.referencePriceFen,
          warningThreshold: row.warningThreshold,
          enabled: row.enabled,
        })),
      });
      await transaction.dataImport.create({
        data: {
          id: preview.previewId,
          importType: preview.importType,
          fileName: preview.fileName,
          rowCount: preview.rows.length,
          actorId: actor.id,
        },
      });
      await transaction.businessAudit.create({
        data: {
          id: auditId,
          actorId: actor.id,
          actorName: actor.name,
          action: "SKU_IMPORTED",
          objectType: "DATA_IMPORT",
          objectId: preview.previewId,
          referenceCode: preview.fileName,
          summary: `通过 ${preview.fileName} 导入 ${preview.rows.length} 个 SKU`,
        },
      });
    });
  } catch (error) {
    if (error instanceof SkuImportError) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const alreadyImported = await database.dataImport.findUnique({
        where: { id: preview.previewId },
        select: { id: true },
      });
      throw alreadyImported
        ? new SkuImportError(
            "DUPLICATE_SUBMISSION",
            "该预览已经导入，不能重复提交。",
          )
        : new SkuImportError(
            "PREVIEW_STALE",
            "预览内容已过期，请重新上传校验。",
          );
    }
    throw error;
  }

  return {
    importId: preview.previewId,
    auditId,
    importedCount: preview.rows.length,
  };
}
