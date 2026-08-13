import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import type { Actor } from "../auth/resolve-actor";
import {
  createCustomerImportTemplate,
  CustomerImportError,
  previewCustomerImportFile,
  type CustomerImportLookup,
} from "./customer-import";

const owner: Actor = {
  id: "owner-user",
  name: "张伟",
  email: "owner@example.local",
  roles: ["OWNER"],
};
const sales: Actor = {
  id: "sales-user",
  name: "陈敏",
  email: "sales@example.local",
  roles: ["SALES"],
};
const lookup: CustomerImportLookup = {
  existingCustomerCodes: new Set(),
  responsibleSalesAccounts: [
    { id: sales.id, name: sales.name, email: sales.email },
  ],
};

function createWorkbookFile(
  rows: unknown[][],
  options: { name?: string; sheetName?: string } = {},
) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        "客户编码",
        "名称",
        "联系人",
        "电话",
        "地址",
        "客户负责人",
        "默认账期",
        "启用状态",
      ],
      ...rows,
    ]),
    options.sheetName ?? "客户导入",
  );
  return {
    name: options.name ?? "customer-import.xlsx",
    bytes: new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    ),
  };
}

describe("客户 Excel 导入", () => {
  it("生成包含正式字段和客户负责人填写说明的固定模板", () => {
    const workbook = XLSX.read(createCustomerImportTemplate(), { type: "array" });

    expect(workbook.SheetNames).toEqual(["客户导入", "填写说明"]);
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["客户导入"]!, {
        header: 1,
        raw: true,
      }),
    ).toEqual([
      [
        "客户编码",
        "名称",
        "联系人",
        "电话",
        "地址",
        "客户负责人",
        "默认账期",
        "启用状态",
      ],
    ]);
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["填写说明"]!, { raw: true }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          字段: "客户负责人",
          填写说明: expect.stringContaining("启用销售账号邮箱"),
          示例: "sales@example.local",
        }),
        expect.objectContaining({
          字段: "默认账期",
          填写说明: expect.stringContaining("现结"),
        }),
      ]),
    );
  });

  it("预览合法文件时解析负责人、现结和整数天数", () => {
    const result = previewCustomerImportFile(
      owner,
      createWorkbookFile([
        [
          "KH-0101",
          "广源机电商行",
          "李海峰",
          "138 0000 0000",
          "广东省深圳市宝安区工业路 18 号",
          " SALES@example.local ",
          "现结",
          "启用",
        ],
        [
          "KH-0102",
          "华南工程部",
          "周志成",
          "136 0000 0000",
          "广东省深圳市龙华区民治大道 27 号",
          "sales@example.local",
          30,
          "停用",
        ],
      ]),
      lookup,
    );

    expect(result).toEqual({
      status: "ready",
      fileName: "customer-import.xlsx",
      totalRows: 2,
      validRows: [
        {
          rowNumber: 2,
          customerCode: "KH-0101",
          name: "广源机电商行",
          contactName: "李海峰",
          phone: "138 0000 0000",
          address: "广东省深圳市宝安区工业路 18 号",
          responsibleSalesId: sales.id,
          responsibleSalesName: sales.name,
          responsibleSalesEmail: sales.email,
          paymentTermDays: 0,
          enabled: true,
        },
        {
          rowNumber: 3,
          customerCode: "KH-0102",
          name: "华南工程部",
          contactName: "周志成",
          phone: "136 0000 0000",
          address: "广东省深圳市龙华区民治大道 27 号",
          responsibleSalesId: sales.id,
          responsibleSalesName: sales.name,
          responsibleSalesEmail: sales.email,
          paymentTermDays: 30,
          enabled: false,
        },
      ],
      errors: [],
    });
  });

  it("逐行汇总缺失字段、无效账期、无效负责人和启用状态", () => {
    const result = previewCustomerImportFile(
      owner,
      createWorkbookFile([
        [
          "KH-MISSING",
          "",
          "",
          "",
          "",
          "sales@example.local",
          "现结",
          "启用",
        ],
        [
          "KH-INVALID",
          "错误客户",
          "联系人",
          "123",
          "地址",
          "disabled@example.local",
          -1,
          "是",
        ],
      ]),
      lookup,
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: expect.arrayContaining([
        { rowNumber: 2, field: "名称", value: "", reason: "必填字段不能为空。" },
        { rowNumber: 2, field: "联系人", value: "", reason: "必填字段不能为空。" },
        { rowNumber: 2, field: "电话", value: "", reason: "必填字段不能为空。" },
        { rowNumber: 2, field: "地址", value: "", reason: "必填字段不能为空。" },
        {
          rowNumber: 3,
          field: "客户负责人",
          value: "disabled@example.local",
          reason: "必须匹配启用的销售账号邮箱。",
        },
        {
          rowNumber: 3,
          field: "默认账期",
          value: "-1",
          reason: "必须填写“现结”或非负整数天数。",
        },
        {
          rowNumber: 3,
          field: "启用状态",
          value: "是",
          reason: "只能填写“启用”或“停用”。",
        },
      ]),
    });
  });

  it("文件内重复编码和数据库既有编码都定位到原始行", () => {
    const result = previewCustomerImportFile(
      owner,
      createWorkbookFile([
        ["KH-DUP", "重复一", "甲", "1", "地址", sales.email, "现结", "启用"],
        ["KH-DUP", "重复二", "乙", "2", "地址", sales.email, 30, "启用"],
        ["KH-EXISTS", "既有", "丙", "3", "地址", sales.email, 0, "启用"],
      ]),
      { ...lookup, existingCustomerCodes: new Set(["KH-EXISTS"]) },
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: expect.arrayContaining([
        {
          rowNumber: 2,
          field: "客户编码",
          value: "KH-DUP",
          reason: "文件内客户编码重复。",
        },
        {
          rowNumber: 3,
          field: "客户编码",
          value: "KH-DUP",
          reason: "文件内客户编码重复。",
        },
        {
          rowNumber: 4,
          field: "客户编码",
          value: "KH-EXISTS",
          reason: "客户编码已存在。",
        },
      ]),
    });
  });

  it("公式值进入错误预览且不计算结果", () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["客户编码", "名称", "联系人", "电话", "地址", "客户负责人", "默认账期", "启用状态"],
      ["KH-FORMULA", "公式客户", "甲", "1", "地址", sales.email, 30, "启用"],
    ]);
    worksheet.G2 = { t: "n", f: "15+15", v: 30 };
    XLSX.utils.book_append_sheet(workbook, worksheet, "客户导入");

    const result = previewCustomerImportFile(
      owner,
      {
        name: "customer-import.xlsx",
        bytes: new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" })),
      },
      lookup,
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: [
        {
          rowNumber: 2,
          field: "默认账期",
          value: "=15+15",
          reason: "不接受公式，请填写固定值。",
        },
      ],
    });
  });

  it("沿用固定工作表、文件类型和行数限制", () => {
    expect(
      previewCustomerImportFile(
        owner,
        createWorkbookFile([], { sheetName: "Sheet1" }),
        lookup,
      ),
    ).toEqual({
      status: "rejected",
      code: "WORKSHEET_INVALID",
      message: "第一张工作表必须命名为“客户导入”。",
    });
    expect(
      previewCustomerImportFile(
        owner,
        { name: "customer-import.xls", bytes: new Uint8Array([1, 2, 3, 4]) },
        lookup,
      ),
    ).toEqual({
      status: "rejected",
      code: "FILE_TYPE_INVALID",
      message: "只接受 .xlsx 文件。",
    });
    expect(
      previewCustomerImportFile(
        owner,
        createWorkbookFile(
          Array.from({ length: 2_001 }, (_, index) => [
            `KH-${index}`,
            `客户 ${index}`,
            "联系人",
            "1",
            "地址",
            sales.email,
            "现结",
            "启用",
          ]),
        ),
        lookup,
      ),
    ).toEqual({
      status: "rejected",
      code: "ROW_LIMIT_EXCEEDED",
      message: "每次最多导入 2,000 行。",
    });
  });

  it("非老板不能预览客户导入文件", () => {
    expect(() =>
      previewCustomerImportFile(
        sales,
        createWorkbookFile([
          ["KH-FORBIDDEN", "客户", "甲", "1", "地址", sales.email, "现结", "启用"],
        ]),
        lookup,
      ),
    ).toThrow(
      expect.objectContaining({
        code: "FORBIDDEN",
        message: "只有老板可以使用导入工作台。",
      }) satisfies Partial<CustomerImportError>,
    );
  });
});
