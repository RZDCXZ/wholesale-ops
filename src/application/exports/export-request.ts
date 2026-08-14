import type { InventoryMovementType } from "../../generated/prisma/client";
import {
  chinaCalendarDayRange,
  parseCalendarDate,
} from "../../lib/china-calendar";
import type { FilteredExportRequest } from "./filtered-export-service";

export type FilteredExportKind = FilteredExportRequest["kind"];

export class ExportRequestError extends Error {
  constructor(
    readonly code: "INVALID_FILTERS",
    message: string,
  ) {
    super(message);
    this.name = "ExportRequestError";
  }
}

function trimmed(parameters: URLSearchParams, name: string): string {
  return (parameters.get(name) ?? "").trim();
}

function assertValidDateRange(
  rawFrom: string,
  rawTo: string,
  parsedFrom: Date | undefined,
  parsedTo: Date | undefined,
): void {
  if (
    (rawFrom && !parsedFrom) ||
    (rawTo && !parsedTo) ||
    (parsedFrom && parsedTo && parsedFrom > parsedTo)
  ) {
    throw new ExportRequestError(
      "INVALID_FILTERS",
      "导出筛选中的日期无效。",
    );
  }
}

function parseSalesOrderRequest(
  parameters: URLSearchParams,
): FilteredExportRequest {
  const statusValue = trimmed(parameters, "status");
  const status = ["DRAFT", "CONFIRMED", "OUTBOUND", "CANCELLED"].includes(
    statusValue,
  )
    ? (statusValue as "DRAFT" | "CONFIRMED" | "OUTBOUND" | "CANCELLED")
    : undefined;
  const rawFrom = trimmed(parameters, "from");
  const rawTo = trimmed(parameters, "to");
  const fromRange = rawFrom ? chinaCalendarDayRange(rawFrom) : undefined;
  const toRange = rawTo ? chinaCalendarDayRange(rawTo) : undefined;
  assertValidDateRange(
    rawFrom,
    rawTo,
    fromRange?.start,
    toRange?.endInclusive,
  );
  const rawOutboundOn = trimmed(parameters, "outboundOn");
  const outboundRange = rawOutboundOn
    ? chinaCalendarDayRange(rawOutboundOn)
    : undefined;
  if (rawOutboundOn && !outboundRange) {
    throw new ExportRequestError(
      "INVALID_FILTERS",
      "导出筛选中的日期无效。",
    );
  }

  return {
    kind: "SALES_ORDERS",
    filters: {
      query: trimmed(parameters, "q") || undefined,
      status,
      responsibleSalesId:
        trimmed(parameters, "responsibleSalesId") || undefined,
      createdFrom: fromRange?.start,
      createdTo: toRange?.endInclusive,
      outboundFrom: outboundRange?.start,
      outboundTo: outboundRange?.endInclusive,
    },
  };
}

function parseReceivableRequest(
  parameters: URLSearchParams,
): FilteredExportRequest {
  const statusValue = trimmed(parameters, "status");
  const status = ["PENDING", "PARTIAL", "SETTLED"].includes(statusValue)
    ? (statusValue as "PENDING" | "PARTIAL" | "SETTLED")
    : undefined;
  const rawDueFrom = trimmed(parameters, "from");
  const rawDueTo = trimmed(parameters, "to");
  const dueFrom = rawDueFrom ? parseCalendarDate(rawDueFrom) : undefined;
  const dueTo = rawDueTo ? parseCalendarDate(rawDueTo) : undefined;
  assertValidDateRange(rawDueFrom, rawDueTo, dueFrom, dueTo);
  const rawPaymentRecordedOn = trimmed(parameters, "paymentRecordedOn");
  const paymentRecordedRange = rawPaymentRecordedOn
    ? chinaCalendarDayRange(rawPaymentRecordedOn)
    : undefined;
  if (rawPaymentRecordedOn && !paymentRecordedRange) {
    throw new ExportRequestError(
      "INVALID_FILTERS",
      "导出筛选中的日期无效。",
    );
  }

  return {
    kind: "RECEIVABLES",
    filters: {
      query: trimmed(parameters, "q") || undefined,
      customerId: trimmed(parameters, "customerId") || undefined,
      responsibleSalesId:
        trimmed(parameters, "responsibleSalesId") || undefined,
      status,
      overdueOnly: trimmed(parameters, "overdue") === "1",
      outstandingOnly: trimmed(parameters, "outstanding") === "1",
      paymentRecordedFrom: paymentRecordedRange?.start,
      paymentRecordedTo: paymentRecordedRange?.endInclusive,
      dueFrom,
      dueTo,
    },
  };
}

function parseInventoryMovementRequest(
  parameters: URLSearchParams,
): FilteredExportRequest {
  const movementTypeValue = trimmed(parameters, "type");
  const movementType = ["OPENING", "RESERVATION", "RELEASE", "OUTBOUND"].includes(
    movementTypeValue,
  )
    ? (movementTypeValue as InventoryMovementType)
    : undefined;
  const rawFrom = trimmed(parameters, "from");
  const rawTo = trimmed(parameters, "to");
  const fromRange = rawFrom ? chinaCalendarDayRange(rawFrom) : undefined;
  const toRange = rawTo ? chinaCalendarDayRange(rawTo) : undefined;
  assertValidDateRange(
    rawFrom,
    rawTo,
    fromRange?.start,
    toRange?.endInclusive,
  );

  return {
    kind: "INVENTORY_MOVEMENTS",
    filters: {
      skuId: trimmed(parameters, "skuId") || undefined,
      movementType,
      dateFrom: fromRange?.start,
      dateTo: toRange?.endInclusive,
      relatedReference: trimmed(parameters, "reference") || undefined,
      actor: trimmed(parameters, "actor") || undefined,
      importId: trimmed(parameters, "importId") || undefined,
    },
  };
}

export function parseFilteredExportRequest(
  kind: FilteredExportKind,
  parameters: URLSearchParams,
): FilteredExportRequest {
  if (kind === "SALES_ORDERS") return parseSalesOrderRequest(parameters);
  if (kind === "RECEIVABLES") return parseReceivableRequest(parameters);
  return parseInventoryMovementRequest(parameters);
}
