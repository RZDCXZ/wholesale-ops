import { randomUUID } from "node:crypto";

import { z } from "zod";
import * as XLSX from "xlsx";

import type { PrismaClient } from "../../generated/prisma/client";
import { Prisma } from "../../generated/prisma/client";
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

const CUSTOMER_IMPORT_HEADERS = [
  "客户编码",
  "名称",
  "联系人",
  "电话",
  "地址",
  "客户负责人",
  "默认账期",
  "启用状态",
] as const;
const CUSTOMER_TEXT_LIMITS = [64, 160, 80, 80, 500, 320] as const;

export type ResponsibleSalesAccount = {
  id: string;
  name: string;
  email: string;
};

export type CustomerImportLookup = {
  existingCustomerCodes: ReadonlySet<string>;
  responsibleSalesAccounts: readonly ResponsibleSalesAccount[];
};

export type CustomerImportRow = {
  rowNumber: number;
  customerCode: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  responsibleSalesId: string;
  responsibleSalesName: string;
  responsibleSalesEmail: string;
  paymentTermDays: number;
  enabled: boolean;
};

export type CustomerImportRowError = {
  rowNumber: number;
  field: string;
  value: string;
  reason: string;
};

export class CustomerImportError extends Error {
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
    this.name = "CustomerImportError";
  }
}

export type CustomerImportPreview =
  | ImportFileRejection
  | {
      status: "ready";
      fileName: string;
      totalRows: number;
      validRows: CustomerImportRow[];
      errors: [];
    }
  | {
      status: "invalid";
      fileName: string;
      totalRows: number;
      validRows: CustomerImportRow[];
      errors: CustomerImportRowError[];
    };

export type IssuedCustomerImportPreview =
  | Exclude<CustomerImportPreview, { status: "ready" }>
  | (Extract<CustomerImportPreview, { status: "ready" }> & {
      previewToken: string;
      expiresAt: Date;
    });

type ParsedCustomerImportRow = Omit<
  CustomerImportRow,
  "responsibleSalesId" | "responsibleSalesName"
>;

type ParsedCustomerImport =
  | ImportFileRejection
  | {
      status: "parsed";
      fileName: string;
      totalRows: number;
      candidateRows: ParsedCustomerImportRow[];
      errors: CustomerImportRowError[];
      customerCodeRows: Array<{ rowNumber: number; customerCode: string }>;
      responsibleSalesRows: Array<{
        rowNumber: number;
        responsibleSalesEmail: string;
      }>;
    };

const previewPayloadSchema = z
  .object({
    version: z.literal(1),
    previewId: z.string().min(1),
    actorId: z.string().min(1),
    importType: z.literal("CUSTOMER"),
    fileName: z.string().min(1).max(1_024),
    expiresAt: z.number().int().positive(),
    rows: z
      .array(
        z.object({
          rowNumber: z.number().int().min(2).max(2_001),
          customerCode: z.string().min(1).max(64),
          name: z.string().min(1).max(160),
          contactName: z.string().min(1).max(80),
          phone: z.string().min(1).max(80),
          address: z.string().min(1).max(500),
          responsibleSalesId: z.string().min(1),
          responsibleSalesName: z.string().min(1).max(80),
          responsibleSalesEmail: z.string().min(1).max(320),
          paymentTermDays: z.number().int().nonnegative().max(2_147_483_647),
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
      if (codes.has(row.customerCode)) {
        context.addIssue({
          code: "custom",
          message: "预览内容包含重复客户编码。",
        });
      }
      codes.add(row.customerCode);
    }
  });

type PreviewPayload = z.infer<typeof previewPayloadSchema>;

const CUSTOMER_IMPORT_INSTRUCTIONS = [
  { 字段: "客户编码", 填写说明: "必填，最多 64 个字符；创建后不可修改。", 示例: "KH-0101" },
  { 字段: "名称", 填写说明: "必填，最多 160 个字符；名称可以重复。", 示例: "广源机电商行" },
  { 字段: "联系人", 填写说明: "必填，最多 80 个字符。", 示例: "李海峰" },
  { 字段: "电话", 填写说明: "必填，最多 80 个字符。", 示例: "138 0000 0000" },
  { 字段: "地址", 填写说明: "必填，最多 500 个字符。", 示例: "广东省深圳市宝安区工业路 18 号" },
  { 字段: "客户负责人", 填写说明: "必填，填写启用销售账号邮箱。", 示例: "sales@example.local" },
  { 字段: "默认账期", 填写说明: "必填，填写“现结”或非负整数天数。", 示例: "30" },
  { 字段: "启用状态", 填写说明: "必填，只能填写“启用”或“停用”。", 示例: "启用" },
] as const;

export function createCustomerImportTemplate(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([[...CUSTOMER_IMPORT_HEADERS]]);
  dataSheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 16 },
    { wch: 20 },
    { wch: 42 },
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
  ];
  const instructionsSheet = XLSX.utils.json_to_sheet([
    ...CUSTOMER_IMPORT_INSTRUCTIONS,
  ]);
  instructionsSheet["!cols"] = [{ wch: 16 }, { wch: 48 }, { wch: 42 }];

  XLSX.utils.book_append_sheet(workbook, dataSheet, "客户导入");
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

function normalizedEmail(value: unknown): string {
  return cellText(value).toLowerCase();
}

function issuePreviewToken(
  actor: Actor,
  fileName: string,
  rows: CustomerImportRow[],
  context: ImportTokenContext,
): { previewToken: string; expiresAt: Date } {
  return issueImportPreviewToken<PreviewPayload>(
    {
      version: 1,
      actorId: actor.id,
      importType: "CUSTOMER",
      fileName,
      rows,
    },
    context,
  );
}

function readPreviewToken(
  token: string,
  context: ImportTokenContext,
): PreviewPayload | null {
  return readImportPreviewToken(token, previewPayloadSchema, context);
}

function assertCanImport(actor: Actor) {
  if (authorizeCapability(actor, "IMPORTS_MANAGE").kind !== "authorized") {
    throw new CustomerImportError(
      "FORBIDDEN",
      "只有老板可以使用导入工作台。",
    );
  }
}

function parseCustomerImportFile(
  actor: Actor,
  file: ImportFile,
): ParsedCustomerImport {
  assertCanImport(actor);
  const worksheet = readImportWorksheet(file, {
    templateName: "客户",
    worksheetName: "客户导入",
    headers: CUSTOMER_IMPORT_HEADERS,
  });
  if (worksheet.status === "rejected") return worksheet;

  const errors: CustomerImportRowError[] = [];
  const candidateRows = worksheet.rows.flatMap(
    ({ rowNumber, values, formulas }) => {
      if (formulas.length > 0) {
        errors.push(
          ...formulas.map(({ columnIndex, expression }) => ({
            rowNumber,
            field: CUSTOMER_IMPORT_HEADERS[columnIndex]!,
            value: `=${expression}`,
            reason: "不接受公式，请填写固定值。",
          })),
        );
        return [];
      }

      const texts = values.map(cellText);
      const missingFieldErrors = CUSTOMER_IMPORT_HEADERS.flatMap(
        (field, columnIndex) =>
          texts[columnIndex]
            ? []
            : [{ rowNumber, field, value: "", reason: "必填字段不能为空。" }],
      );
      if (missingFieldErrors.length > 0) {
        errors.push(...missingFieldErrors);
        return [];
      }

      const lengthErrors = CUSTOMER_TEXT_LIMITS.flatMap(
        (maximum, columnIndex) =>
          texts[columnIndex]!.length > maximum
            ? [
                {
                  rowNumber,
                  field: CUSTOMER_IMPORT_HEADERS[columnIndex]!,
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

      const paymentTerm = texts[6]!;
      const paymentTermDays = paymentTerm === "现结" ? 0 : Number(paymentTerm);
      let rowIsValid = true;
      if (
        paymentTerm !== "现结" &&
        (!/^\d+$/.test(paymentTerm) ||
          !Number.isSafeInteger(paymentTermDays) ||
          paymentTermDays > 2_147_483_647)
      ) {
        errors.push({
          rowNumber,
          field: "默认账期",
          value: paymentTerm,
          reason: "必须填写“现结”或非负整数天数。",
        });
        rowIsValid = false;
      }
      if (texts[7] !== "启用" && texts[7] !== "停用") {
        errors.push({
          rowNumber,
          field: "启用状态",
          value: texts[7]!,
          reason: "只能填写“启用”或“停用”。",
        });
        rowIsValid = false;
      }
      if (!rowIsValid) return [];

      return [
        {
          rowNumber,
          customerCode: texts[0]!,
          name: texts[1]!,
          contactName: texts[2]!,
          phone: texts[3]!,
          address: texts[4]!,
          responsibleSalesEmail: normalizedEmail(texts[5]),
          paymentTermDays,
          enabled: texts[7] === "启用",
        },
      ];
    },
  );

  const customerCodeRows = worksheet.rows.flatMap((row) => {
    if (row.formulas.some(({ columnIndex }) => columnIndex === 0)) return [];
    const customerCode = cellText(row.values[0]);
    return customerCode ? [{ rowNumber: row.rowNumber, customerCode }] : [];
  });
  const responsibleSalesRows = worksheet.rows.flatMap((row) => {
    if (row.formulas.some(({ columnIndex }) => columnIndex === 5)) return [];
    const responsibleSalesEmail = normalizedEmail(row.values[5]);
    return responsibleSalesEmail
      ? [{ rowNumber: row.rowNumber, responsibleSalesEmail }]
      : [];
  });

  return {
    status: "parsed",
    fileName: file.name,
    totalRows: worksheet.rows.length,
    candidateRows,
    errors,
    customerCodeRows,
    responsibleSalesRows,
  };
}

function buildCustomerImportPreview(
  parsed: Exclude<ParsedCustomerImport, ImportFileRejection>,
  lookup: CustomerImportLookup,
): CustomerImportPreview {
  const codeCounts = new Map<string, number>();
  for (const { customerCode } of parsed.customerCodeRows) {
    codeCounts.set(customerCode, (codeCounts.get(customerCode) ?? 0) + 1);
  }
  const duplicateCodes = new Set(
    [...codeCounts]
      .filter(([, count]) => count > 1)
      .map(([customerCode]) => customerCode),
  );
  const duplicateCodeErrors = parsed.customerCodeRows.flatMap(
    ({ rowNumber, customerCode }) =>
      duplicateCodes.has(customerCode)
        ? [
            {
              rowNumber,
              field: "客户编码",
              value: customerCode,
              reason: "文件内客户编码重复。",
            },
          ]
        : [],
  );
  const existingCodeErrors = parsed.customerCodeRows.flatMap(
    ({ rowNumber, customerCode }) =>
      lookup.existingCustomerCodes.has(customerCode)
        ? [
            {
              rowNumber,
              field: "客户编码",
              value: customerCode,
              reason: "客户编码已存在。",
            },
          ]
        : [],
  );
  const responsibleSalesByEmail = new Map(
    lookup.responsibleSalesAccounts.map((account) => [
      account.email.toLowerCase(),
      account,
    ]),
  );
  const responsibleSalesErrors = parsed.responsibleSalesRows.flatMap(
    ({ rowNumber, responsibleSalesEmail }) =>
      responsibleSalesByEmail.has(responsibleSalesEmail)
        ? []
        : [
            {
              rowNumber,
              field: "客户负责人",
              value: responsibleSalesEmail,
              reason: "必须匹配启用的销售账号邮箱。",
            },
          ],
  );
  const validRows = parsed.candidateRows.flatMap((row) => {
    const responsibleSales = responsibleSalesByEmail.get(
      row.responsibleSalesEmail,
    );
    if (
      duplicateCodes.has(row.customerCode) ||
      lookup.existingCustomerCodes.has(row.customerCode) ||
      !responsibleSales
    ) {
      return [];
    }
    return [
      {
        ...row,
        responsibleSalesId: responsibleSales.id,
        responsibleSalesName: responsibleSales.name,
        responsibleSalesEmail: responsibleSales.email,
      },
    ];
  });
  const errors = [
    ...parsed.errors,
    ...duplicateCodeErrors,
    ...existingCodeErrors,
    ...responsibleSalesErrors,
  ];
  const preview = {
    fileName: parsed.fileName,
    totalRows: parsed.totalRows,
    validRows,
  };
  return errors.length === 0
    ? { status: "ready", ...preview, errors: [] }
    : { status: "invalid", ...preview, errors };
}

export function previewCustomerImportFile(
  actor: Actor,
  file: ImportFile,
  lookup: CustomerImportLookup,
): CustomerImportPreview {
  const parsed = parseCustomerImportFile(actor, file);
  return parsed.status === "rejected"
    ? parsed
    : buildCustomerImportPreview(parsed, lookup);
}

export async function previewCustomerImport(
  database: PrismaClient,
  actor: Actor,
  file: ImportFile,
  tokenContext: ImportTokenContext,
): Promise<IssuedCustomerImportPreview> {
  const parsed = parseCustomerImportFile(actor, file);
  if (parsed.status === "rejected") return parsed;

  const [existingCustomers, responsibleSalesAccounts] = await Promise.all([
    database.customer.findMany({
      where: {
        customerCode: {
          in: parsed.customerCodeRows.map(({ customerCode }) => customerCode),
        },
      },
      select: { customerCode: true },
    }),
    database.user.findMany({
      where: { enabled: true, roles: { some: { role: "SALES" } } },
      select: { id: true, name: true, email: true },
    }),
  ]);
  const preview = buildCustomerImportPreview(parsed, {
    existingCustomerCodes: new Set(
      existingCustomers.map(({ customerCode }) => customerCode),
    ),
    responsibleSalesAccounts,
  });
  if (preview.status !== "ready") return preview;

  return {
    ...preview,
    ...issuePreviewToken(actor, preview.fileName, preview.validRows, tokenContext),
  };
}

export async function confirmCustomerImport(
  database: PrismaClient,
  actor: Actor,
  previewToken: string,
  tokenContext: ImportTokenContext,
): Promise<{ importId: string; auditId: string; importedCount: number }> {
  assertCanImport(actor);
  const preview = readPreviewToken(previewToken, tokenContext);
  if (!preview) {
    throw new CustomerImportError(
      "PREVIEW_INVALID",
      "预览已失效，请重新上传文件。",
    );
  }
  if (preview.actorId !== actor.id) {
    throw new CustomerImportError(
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
        throw new CustomerImportError(
          "DUPLICATE_SUBMISSION",
          "该预览已经导入，不能重复提交。",
        );
      }

      const existingCustomers = await transaction.customer.findMany({
        where: {
          customerCode: {
            in: preview.rows.map(({ customerCode }) => customerCode),
          },
        },
        select: { customerCode: true },
      });
      if (existingCustomers.length > 0) {
        throw new CustomerImportError(
          "PREVIEW_STALE",
          `预览后已有客户编码被使用：${existingCustomers.map(({ customerCode }) => customerCode).join("、")}。请重新上传校验。`,
        );
      }

      const responsibleSalesIds = [
        ...new Set(preview.rows.map(({ responsibleSalesId }) => responsibleSalesId)),
      ];
      const activeResponsibleSales = await transaction.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT responsible_sales."id"
        FROM "user" AS responsible_sales
        JOIN "user_role" AS responsible_sales_role
          ON responsible_sales_role."userId" = responsible_sales."id"
        WHERE responsible_sales."id" IN (${Prisma.join(responsibleSalesIds)})
          AND responsible_sales."enabled" = TRUE
          AND responsible_sales_role."role" = CAST('SALES' AS "RoleCode")
        FOR SHARE OF responsible_sales, responsible_sales_role
      `;
      const activeResponsibleSalesIds = new Set(
        activeResponsibleSales.map(({ id }) => id),
      );
      if (activeResponsibleSalesIds.size !== responsibleSalesIds.length) {
        const staleEmails = [
          ...new Set(
            preview.rows
              .filter(
                ({ responsibleSalesId }) =>
                  !activeResponsibleSalesIds.has(responsibleSalesId),
              )
              .map(({ responsibleSalesEmail }) => responsibleSalesEmail),
          ),
        ];
        throw new CustomerImportError(
          "PREVIEW_STALE",
          `预览后客户负责人已停用或不再是销售账号：${staleEmails.join("、")}。请重新上传校验。`,
        );
      }

      await transaction.customer.createMany({
        data: preview.rows.map((row) => ({
          id: randomUUID(),
          customerCode: row.customerCode,
          name: row.name,
          contactName: row.contactName,
          phone: row.phone,
          address: row.address,
          responsibleSalesId: row.responsibleSalesId,
          paymentTermDays: row.paymentTermDays,
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
          action: "CUSTOMER_IMPORTED",
          objectType: "DATA_IMPORT",
          objectId: preview.previewId,
          referenceCode: preview.fileName,
          summary: `通过 ${preview.fileName} 导入 ${preview.rows.length} 个客户`,
        },
      });
    });
  } catch (error) {
    if (error instanceof CustomerImportError) throw error;
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
        ? new CustomerImportError(
            "DUPLICATE_SUBMISSION",
            "该预览已经导入，不能重复提交。",
          )
        : new CustomerImportError(
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
