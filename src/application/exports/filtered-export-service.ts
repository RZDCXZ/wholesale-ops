import { randomUUID } from "node:crypto";

import * as XLSX from "xlsx";

import type { PrismaClient } from "../../generated/prisma/client";
import { authorizeCapability, type Capability } from "../auth/access-policy";
import type { Actor } from "../auth/resolve-actor";
import {
  listInventoryMovements,
  type InventoryMovementFilters,
  type InventoryMovementListItem,
} from "../inventory/inventory-service";
import {
  listReceivablesPage,
  type ReceivableFilters,
  type ReceivableListItem,
} from "../receivables/receivable-service";
import {
  listSalesOrdersPage,
  type SalesOrderFilters,
  type SalesOrderListItem,
} from "../sales-orders/sales-order-service";

const salesOrderStatusLabels = {
  DRAFT: "草稿",
  CONFIRMED: "已确认",
  OUTBOUND: "已出库",
  CANCELLED: "已取消",
} as const;
const receivableStatusLabels = {
  PENDING: "待收款",
  PARTIAL: "部分收款",
  SETTLED: "已结清",
} as const;
const inventoryMovementLabels = {
  OPENING: "期初库存",
  RESERVATION: "建立预占",
  RELEASE: "释放预占",
  OUTBOUND: "出库",
} as const;

export type FilteredExportRequest =
  | {
      kind: "SALES_ORDERS";
      filters: SalesOrderFilters;
    }
  | {
      kind: "RECEIVABLES";
      filters: ReceivableFilters;
    }
  | {
      kind: "INVENTORY_MOVEMENTS";
      filters: InventoryMovementFilters;
    };

type WorkbookWriter = (workbook: XLSX.WorkBook) => Uint8Array;

export type FilteredExportOptions = {
  now?: Date;
  writeWorkbook?: WorkbookWriter;
};

export type FilteredExportResult = {
  bytes: Uint8Array;
  fileName: string;
  rowCount: number;
  auditId: string;
};

export class FilteredExportError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "EMPTY_RESULT",
    message: string,
  ) {
    super(message);
    this.name = "FilteredExportError";
  }
}

const exportCapabilities: Record<
  FilteredExportRequest["kind"],
  Capability
> = {
  SALES_ORDERS: "SALES_ORDERS_VIEW",
  RECEIVABLES: "RECEIVABLES_VIEW",
  INVENTORY_MOVEMENTS: "INVENTORY_VIEW",
};

function assertExportAccess(actor: Actor, request: FilteredExportRequest): void {
  if (
    authorizeCapability(actor, exportCapabilities[request.kind]).kind !==
    "authorized"
  ) {
    throw new FilteredExportError(
      "FORBIDDEN",
      "没有导出该类业务数据的权限。",
    );
  }
}

function formatChinaDate(date: Date, withTime = false): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }
      : {}),
  }).format(date);
}

function exportTimestamp(date: Date): string {
  const [calendarDate, clockTime] = formatChinaDate(date, true).split(" ");
  return `${calendarDate!.replaceAll("-", "")}-${clockTime!.replaceAll(":", "")}`;
}

function defaultWorkbookWriter(workbook: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
  );
}

function setColumnNumberFormat(
  worksheet: XLSX.WorkSheet,
  columnIndex: number,
  rowCount: number,
  format: string,
): void {
  for (let rowIndex = 1; rowIndex <= rowCount; rowIndex += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
    if (cell) cell.z = format;
  }
}

function createSalesOrderWorkbook(items: SalesOrderListItem[]): XLSX.WorkBook {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      "销售单编号",
      "客户名称",
      "客户负责人",
      "明细数",
      "成交金额（人民币元）",
      "履约状态",
      "创建日期",
      "更新时间",
    ],
    ...items.map((item) => [
      item.salesOrderNumber,
      item.customerName,
      item.responsibleSalesName,
      item.itemCount,
      item.totalAmountFen / 100,
      salesOrderStatusLabels[item.status],
      formatChinaDate(item.createdAt),
      formatChinaDate(item.updatedAt, true),
    ]),
  ]);
  worksheet["!cols"] = [
    { wch: 22 },
    { wch: 24 },
    { wch: 14 },
    { wch: 10 },
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 22 },
  ];
  worksheet["!autofilter"] = { ref: worksheet["!ref"]! };
  setColumnNumberFormat(worksheet, 3, items.length, "0");
  setColumnNumberFormat(worksheet, 4, items.length, "¥#,##0.00");

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "销售单");
  return workbook;
}

function createReceivableWorkbook(items: ReceivableListItem[]): XLSX.WorkBook {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      "应收编号",
      "客户编码",
      "客户名称",
      "客户负责人",
      "销售单编号",
      "原始金额（人民币元）",
      "累计收款（人民币元）",
      "未收金额（人民币元）",
      "到期日",
      "结算状态",
      "逾期状态",
    ],
    ...items.map((item) => [
      item.receivableNumber,
      item.customerCode,
      item.customerName,
      item.responsibleSalesName,
      item.salesOrderNumber,
      item.originalAmountFen / 100,
      item.receivedAmountFen / 100,
      item.remainingAmountFen / 100,
      item.dueDate.toISOString().slice(0, 10),
      receivableStatusLabels[item.status],
      item.overdue ? `逾期 ${item.overdueDays} 天` : "—",
    ]),
  ]);
  worksheet["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 24 },
    { wch: 14 },
    { wch: 22 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  worksheet["!autofilter"] = { ref: worksheet["!ref"]! };
  for (const columnIndex of [5, 6, 7]) {
    setColumnNumberFormat(
      worksheet,
      columnIndex,
      items.length,
      "¥#,##0.00",
    );
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "应收");
  return workbook;
}

function relatedTypeLabel(relatedType: string): string {
  return relatedType === "SALES_ORDER"
    ? "销售单"
    : relatedType === "DATA_IMPORT"
      ? "导入记录"
      : relatedType;
}

function createInventoryMovementWorkbook(
  items: InventoryMovementListItem[],
): XLSX.WorkBook {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      "发生时间",
      "SKU 编码",
      "SKU 名称",
      "库存单位",
      "流水类型",
      "现存量变化",
      "预占量变化",
      "变化后现存量",
      "变化后预占量",
      "变化后可用量",
      "关联类型",
      "关联编号",
      "操作者",
    ],
    ...items.map((item) => [
      formatChinaDate(item.occurredAt, true),
      item.skuCode,
      item.skuName,
      item.inventoryUnit,
      inventoryMovementLabels[item.movementType],
      item.onHandDelta,
      item.reservedDelta,
      item.onHandAfter,
      item.reservedAfter,
      item.availableAfter,
      relatedTypeLabel(item.relatedType),
      item.relatedReference ?? item.relatedId,
      item.actorName,
    ]),
  ]);
  worksheet["!cols"] = [
    { wch: 22 },
    { wch: 18 },
    { wch: 30 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
  ];
  worksheet["!autofilter"] = { ref: worksheet["!ref"]! };
  for (const columnIndex of [5, 6, 7, 8, 9]) {
    setColumnNumberFormat(worksheet, columnIndex, items.length, "0");
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "库存流水");
  return workbook;
}

async function listAllSalesOrders(
  database: PrismaClient,
  actor: Actor,
  filters: SalesOrderFilters,
): Promise<SalesOrderListItem[]> {
  return listAllPages((page) =>
    listSalesOrdersPage(database, actor, filters, { page, pageSize: 100 }),
  );
}

async function listAllReceivables(
  database: PrismaClient,
  actor: Actor,
  filters: ReceivableFilters,
  now: Date,
): Promise<ReceivableListItem[]> {
  return listAllPages((page) =>
    listReceivablesPage(
      database,
      actor,
      filters,
      { page, pageSize: 100 },
      now,
    ),
  );
}

async function listAllPages<T>(
  loadPage: (page: number) => Promise<{
    items: T[];
    totalPages: number;
  }>,
): Promise<T[]> {
  const firstPage = await loadPage(1);
  const items = [...firstPage.items];
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await loadPage(page);
    items.push(...nextPage.items);
  }
  return items;
}

function salesOrderFilterSummary(filters: SalesOrderFilters): string {
  const parts = [
    filters.query?.trim() ? `搜索=${filters.query.trim()}` : undefined,
    filters.status
      ? `履约状态=${salesOrderStatusLabels[filters.status]}`
      : undefined,
    filters.responsibleSalesId
      ? `客户负责人=${filters.responsibleSalesId}`
      : undefined,
    filters.createdFrom
      ? `创建日期从=${formatChinaDate(filters.createdFrom)}`
      : undefined,
    filters.createdTo
      ? `创建日期至=${formatChinaDate(filters.createdTo)}`
      : undefined,
    filters.outboundFrom
      ? `出库日期从=${formatChinaDate(filters.outboundFrom)}`
      : undefined,
    filters.outboundTo
      ? `出库日期至=${formatChinaDate(filters.outboundTo)}`
      : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("、") : "无额外筛选";
}

function receivableFilterSummary(filters: ReceivableFilters): string {
  const parts = [
    filters.query?.trim() ? `搜索=${filters.query.trim()}` : undefined,
    filters.customerId ? `客户=${filters.customerId}` : undefined,
    filters.responsibleSalesId
      ? `客户负责人=${filters.responsibleSalesId}`
      : undefined,
    filters.status
      ? `结算状态=${receivableStatusLabels[filters.status]}`
      : undefined,
    filters.overdueOnly ? "仅看逾期" : undefined,
    filters.outstandingOnly ? "仅看未结清" : undefined,
    filters.dueFrom
      ? `到期日期从=${filters.dueFrom.toISOString().slice(0, 10)}`
      : undefined,
    filters.dueTo
      ? `到期日期至=${filters.dueTo.toISOString().slice(0, 10)}`
      : undefined,
    filters.paymentRecordedFrom
      ? `有效收款登记从=${formatChinaDate(filters.paymentRecordedFrom)}`
      : undefined,
    filters.paymentRecordedTo
      ? `有效收款登记至=${formatChinaDate(filters.paymentRecordedTo)}`
      : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("、") : "无额外筛选";
}

function inventoryMovementFilterSummary(
  filters: InventoryMovementFilters,
): string {
  const parts = [
    filters.skuId ? `SKU=${filters.skuId}` : undefined,
    filters.movementType
      ? `流水类型=${inventoryMovementLabels[filters.movementType]}`
      : undefined,
    filters.dateFrom
      ? `发生日期从=${formatChinaDate(filters.dateFrom)}`
      : undefined,
    filters.dateTo ? `发生日期至=${formatChinaDate(filters.dateTo)}` : undefined,
    filters.importId ? `导入记录=${filters.importId}` : undefined,
    filters.relatedReference?.trim()
      ? `关联编号=${filters.relatedReference.trim()}`
      : undefined,
    filters.actor?.trim() ? `操作者=${filters.actor.trim()}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("、") : "无额外筛选";
}

export async function exportFilteredWorkbook(
  database: PrismaClient,
  actor: Actor,
  request: FilteredExportRequest,
  options: FilteredExportOptions = {},
): Promise<FilteredExportResult> {
  assertExportAccess(actor, request);
  const now = options.now ?? new Date();
  let label: string;
  let objectType: string;
  let rowCount: number;
  let filterSummary: string;
  let workbook: XLSX.WorkBook;

  if (request.kind === "SALES_ORDERS") {
    const items = await listAllSalesOrders(database, actor, request.filters);
    label = "销售单";
    objectType = "SALES_ORDER_EXPORT";
    rowCount = items.length;
    filterSummary = salesOrderFilterSummary(request.filters);
    workbook = createSalesOrderWorkbook(items);
  } else if (request.kind === "RECEIVABLES") {
    const items = await listAllReceivables(
      database,
      actor,
      request.filters,
      now,
    );
    label = "应收";
    objectType = "RECEIVABLE_EXPORT";
    rowCount = items.length;
    filterSummary = receivableFilterSummary(request.filters);
    workbook = createReceivableWorkbook(items);
  } else {
    const items = await listInventoryMovements(
      database,
      actor,
      request.filters,
    );
    label = "库存流水";
    objectType = "INVENTORY_MOVEMENT_EXPORT";
    rowCount = items.length;
    filterSummary = inventoryMovementFilterSummary(request.filters);
    workbook = createInventoryMovementWorkbook(items);
  }

  if (rowCount === 0) {
    throw new FilteredExportError(
      "EMPTY_RESULT",
      `当前权限与筛选条件下没有可导出的${label}。`,
    );
  }

  const bytes = (options.writeWorkbook ?? defaultWorkbookWriter)(workbook);
  const auditId = randomUUID();
  const summary = `导出${label} ${rowCount} 条；筛选：${filterSummary}`;

  await database.businessAudit.create({
    data: {
      id: auditId,
      actorId: actor.id,
      actorName: actor.name,
      action: "DATA_EXPORTED",
      objectType,
      objectId: auditId,
      occurredAt: now,
      referenceCode: label,
      summary,
    },
  });

  return {
    bytes,
    fileName: `${label}-${exportTimestamp(now)}.xlsx`,
    rowCount,
    auditId,
  };
}
