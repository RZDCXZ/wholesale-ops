import { describe, expect, it } from "vitest";

import {
  ExportRequestError,
  parseFilteredExportRequest,
} from "./export-request";

describe("导出请求筛选解析", () => {
  it("销售单只重新解析页面支持的筛选字段并忽略客户端自报数据范围", () => {
    const parameters = new URLSearchParams({
      q: "目标客户",
      status: "OUTBOUND",
      responsibleSalesId: "sales-user",
      from: "2026-08-13",
      to: "2026-08-14",
      outboundOn: "2026-08-14",
      page: "9",
      size: "100",
      actorId: "other-sales-user",
      userId: "other-sales-user",
      scope: "all",
    });

    expect(parseFilteredExportRequest("SALES_ORDERS", parameters)).toEqual({
      kind: "SALES_ORDERS",
      filters: {
        query: "目标客户",
        status: "OUTBOUND",
        responsibleSalesId: "sales-user",
        createdFrom: new Date("2026-08-12T16:00:00.000Z"),
        createdTo: new Date("2026-08-14T15:59:59.999Z"),
        outboundFrom: new Date("2026-08-13T16:00:00.000Z"),
        outboundTo: new Date("2026-08-14T15:59:59.999Z"),
      },
    });
  });

  it("应收重新解析结算、逾期、有效收款和到期日筛选", () => {
    const parameters = new URLSearchParams({
      q: "YS-20260814",
      customerId: "customer-id",
      responsibleSalesId: "sales-user",
      status: "PARTIAL",
      overdue: "1",
      outstanding: "1",
      paymentRecordedOn: "2026-08-14",
      from: "2026-08-13",
      to: "2026-08-30",
    });

    expect(parseFilteredExportRequest("RECEIVABLES", parameters)).toEqual({
      kind: "RECEIVABLES",
      filters: {
        query: "YS-20260814",
        customerId: "customer-id",
        responsibleSalesId: "sales-user",
        status: "PARTIAL",
        overdueOnly: true,
        outstandingOnly: true,
        paymentRecordedFrom: new Date("2026-08-13T16:00:00.000Z"),
        paymentRecordedTo: new Date("2026-08-14T15:59:59.999Z"),
        dueFrom: new Date("2026-08-13T00:00:00.000Z"),
        dueTo: new Date("2026-08-30T00:00:00.000Z"),
      },
    });
  });

  it("库存流水重新解析 SKU、类型、日期、关联编号与操作者筛选", () => {
    const parameters = new URLSearchParams({
      skuId: "sku-id",
      type: "OUTBOUND",
      from: "2026-08-13",
      to: "2026-08-14",
      reference: "XSD-20260814",
      actor: "王强",
      importId: "ignored-when-filtering-other-types",
    });

    expect(
      parseFilteredExportRequest("INVENTORY_MOVEMENTS", parameters),
    ).toEqual({
      kind: "INVENTORY_MOVEMENTS",
      filters: {
        skuId: "sku-id",
        movementType: "OUTBOUND",
        dateFrom: new Date("2026-08-12T16:00:00.000Z"),
        dateTo: new Date("2026-08-14T15:59:59.999Z"),
        relatedReference: "XSD-20260814",
        actor: "王强",
        importId: "ignored-when-filtering-other-types",
      },
    });
  });

  it.each([
    ["SALES_ORDERS", { from: "2026-02-31" }],
    ["RECEIVABLES", { from: "2026-08-15", to: "2026-08-14" }],
    ["INVENTORY_MOVEMENTS", { from: "not-a-date" }],
  ] as const)("%s 拒绝非法或反向日期范围", (kind, values) => {
    expect(() =>
      parseFilteredExportRequest(kind, new URLSearchParams(values)),
    ).toThrow(
      new ExportRequestError("INVALID_FILTERS", "导出筛选中的日期无效。"),
    );
  });
});
