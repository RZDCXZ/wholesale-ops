import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import type { Actor } from "../auth/resolve-actor";
import {
  createSkuImportTemplate,
  previewSkuImportFile,
  SkuImportError,
} from "./sku-import";

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

function createWorkbookFile(
  rows: unknown[][],
  options: { name?: string; sheetName?: string } = {},
) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        "SKU 编码",
        "名称",
        "分类",
        "库存单位",
        "参考售价",
        "预警值",
        "启用状态",
      ],
      ...rows,
    ]),
    options.sheetName ?? "SKU导入",
  );
  return {
    name: options.name ?? "sku-import.xlsx",
    bytes: new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    ),
  };
}

describe("SKU Excel 导入", () => {
  it("生成包含正式字段和独立示例说明的固定模板", () => {
    const workbook = XLSX.read(createSkuImportTemplate(), { type: "array" });

    expect(workbook.SheetNames).toEqual(["SKU导入", "填写说明"]);
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["SKU导入"]!, {
        header: 1,
        raw: true,
      }),
    ).toEqual([
      [
        "SKU 编码",
        "名称",
        "分类",
        "库存单位",
        "参考售价",
        "预警值",
        "启用状态",
      ],
    ]);
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["填写说明"]!, {
        raw: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          字段: "SKU 编码",
          示例: "WJ-LS-001",
        }),
        expect.objectContaining({
          字段: "启用状态",
          示例: "启用",
        }),
      ]),
    );
  });

  it("预览合法文件时返回可导入行和规范化字段", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        [
          "WJ-LS-101",
          "304 不锈钢六角螺栓 M8×30",
          "紧固件",
          "盒",
          48.5,
          20,
          "启用",
        ],
        ["WJ-QP-104", "树脂切割片 105mm", "切削耗材", "片", "3.80", 10, "停用"],
      ]),
      new Set(),
    );

    expect(result).toEqual({
      status: "ready",
      fileName: "sku-import.xlsx",
      totalRows: 2,
      validRows: [
        {
          rowNumber: 2,
          skuCode: "WJ-LS-101",
          name: "304 不锈钢六角螺栓 M8×30",
          category: "紧固件",
          inventoryUnit: "盒",
          referencePriceFen: 4_850,
          warningThreshold: 20,
          enabled: true,
        },
        {
          rowNumber: 3,
          skuCode: "WJ-QP-104",
          name: "树脂切割片 105mm",
          category: "切削耗材",
          inventoryUnit: "片",
          referencePriceFen: 380,
          warningThreshold: 10,
          enabled: false,
        },
      ],
      errors: [],
    });
  });

  it("拒绝非 .xlsx 文件", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([], { name: "sku-import.xlsm" }),
      new Set(),
    );

    expect(result).toEqual({
      status: "rejected",
      code: "FILE_TYPE_INVALID",
      message: "只接受 .xlsx 文件。",
    });
  });

  it("拒绝改名为 .xlsx 的其他 ZIP 表格格式", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["SKU 编码", "名称", "分类", "库存单位", "参考售价", "预警值", "启用状态"],
        ["WJ-ODS-001", "伪装表格", "测试", "个", 1, 0, "启用"],
      ]),
      "SKU导入",
    );

    const result = previewSkuImportFile(
      owner,
      {
        name: "renamed.xlsx",
        bytes: new Uint8Array(
          XLSX.write(workbook, { type: "array", bookType: "ods" }),
        ),
      },
      new Set(),
    );

    expect(result).toEqual({
      status: "rejected",
      code: "FILE_TYPE_INVALID",
      message: "只接受 .xlsx 文件。",
    });
  });

  it("在解析前拒绝超过 10 MB 的文件", () => {
    const result = previewSkuImportFile(
      owner,
      {
        name: "sku-import.xlsx",
        bytes: new Uint8Array(10 * 1024 * 1024 + 1),
      },
      new Set(),
    );

    expect(result).toEqual({
      status: "rejected",
      code: "FILE_TOO_LARGE",
      message: "文件不能超过 10 MB。",
    });
  });

  it("拒绝只有表头的空文件", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([]),
      new Set(),
    );

    expect(result).toEqual({
      status: "rejected",
      code: "EMPTY_FILE",
      message: "工作表中没有可导入的数据行。",
    });
  });

  it("拒绝第一张工作表不是固定 SKU 工作表的文件", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile(
        [["WJ-LS-101", "螺栓", "紧固件", "盒", 48.5, 20, "启用"]],
        { sheetName: "Sheet1" },
      ),
      new Set(),
    );

    expect(result).toEqual({
      status: "rejected",
      code: "WORKSHEET_INVALID",
      message: "第一张工作表必须命名为“SKU导入”。",
    });
  });

  it("拒绝超过 2,000 条数据行的工作表", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile(
        Array.from({ length: 2_001 }, (_, index) => [
          `WJ-LIMIT-${index}`,
          `测试 SKU ${index}`,
          "测试",
          "个",
          1,
          0,
          "启用",
        ]),
      ),
      new Set(),
    );

    expect(result).toEqual({
      status: "rejected",
      code: "ROW_LIMIT_EXCEEDED",
      message: "每次最多导入 2,000 行。",
    });
  });

  it("拒绝伪装为 .xlsx 的宏工作簿", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["SKU 编码", "名称", "分类", "库存单位", "参考售价", "预警值", "启用状态"],
        ["WJ-MACRO-001", "测试 SKU", "测试", "个", 1, 0, "启用"],
      ]),
      "SKU导入",
    );
    workbook.vbaraw = new Uint8Array([1, 2, 3, 4]);

    const result = previewSkuImportFile(
      owner,
      {
        name: "sku-import.xlsx",
        bytes: new Uint8Array(
          XLSX.write(workbook, { type: "array", bookType: "xlsm" }),
        ),
      },
      new Set(),
    );

    expect(result).toEqual({
      status: "rejected",
      code: "MACRO_NOT_ALLOWED",
      message: "不接受包含宏的工作簿。",
    });
  });

  it("公式值按原始 Excel 行号和字段进入错误预览", () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["SKU 编码", "名称", "分类", "库存单位", "参考售价", "预警值", "启用状态"],
      ["WJ-FORMULA-001", "测试 SKU", "测试", "个", 40, 0, "启用"],
    ]);
    worksheet.E2 = { t: "n", f: "20+20", v: 40 };
    XLSX.utils.book_append_sheet(workbook, worksheet, "SKU导入");

    const result = previewSkuImportFile(
      owner,
      {
        name: "sku-import.xlsx",
        bytes: new Uint8Array(
          XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
        ),
      },
      new Set(),
    );

    expect(result).toEqual({
      status: "invalid",
      fileName: "sku-import.xlsx",
      totalRows: 1,
      validRows: [],
      errors: [
        {
          rowNumber: 2,
          field: "参考售价",
          value: "=20+20",
          reason: "不接受公式，请填写固定值。",
        },
      ],
    });
  });

  it("拒绝表头与固定模板不一致的工作簿", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["编码", "名称", "分类", "库存单位", "参考售价", "预警值", "启用状态"],
        ["WJ-HEADER-001", "测试 SKU", "测试", "个", 1, 0, "启用"],
      ]),
      "SKU导入",
    );

    const result = previewSkuImportFile(
      owner,
      {
        name: "sku-import.xlsx",
        bytes: new Uint8Array(
          XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
        ),
      },
      new Set(),
    );

    expect(result).toEqual({
      status: "rejected",
      code: "TEMPLATE_INVALID",
      message: "表头与 SKU 固定模板不一致，请重新下载模板。",
    });
  });

  it("损坏的工作簿返回可理解的解析失败", () => {
    const result = previewSkuImportFile(
      owner,
      { name: "sku-import.xlsx", bytes: new Uint8Array([1, 2, 3, 4]) },
      new Set(),
    );

    expect(result).toEqual({
      status: "rejected",
      code: "PARSE_FAILED",
      message: "无法解析工作簿，请确认文件来自固定模板且未损坏。",
    });
  });

  it("缺失必填字段时分别展示可导入行和错误行", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        ["WJ-VALID-001", "合法 SKU", "紧固件", "盒", 8.5, 5, "启用"],
        ["WJ-MISSING-001", "", "紧固件", "盒", 9.5, 5, "启用"],
      ]),
      new Set(),
    );

    expect(result).toMatchObject({
      status: "invalid",
      totalRows: 2,
      validRows: [expect.objectContaining({ rowNumber: 2, skuCode: "WJ-VALID-001" })],
      errors: [
        {
          rowNumber: 3,
          field: "名称",
          value: "",
          reason: "必填字段不能为空。",
        },
      ],
    });
  });

  it("所有正式字段都执行必填校验", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        ["WJ-MISSING-ALL", "", "", "", "", "", ""],
        ["", "缺编码 SKU", "测试", "个", 1, 0, "启用"],
      ]),
      new Set(),
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: [
        { rowNumber: 2, field: "名称", value: "", reason: "必填字段不能为空。" },
        { rowNumber: 2, field: "分类", value: "", reason: "必填字段不能为空。" },
        { rowNumber: 2, field: "库存单位", value: "", reason: "必填字段不能为空。" },
        { rowNumber: 2, field: "参考售价", value: "", reason: "必填字段不能为空。" },
        { rowNumber: 2, field: "预警值", value: "", reason: "必填字段不能为空。" },
        { rowNumber: 2, field: "启用状态", value: "", reason: "必填字段不能为空。" },
        { rowNumber: 3, field: "SKU 编码", value: "", reason: "必填字段不能为空。" },
      ],
    });
  });

  it("预警值不是非负整数时按字段拒绝", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        ["WJ-INT-001", "测试 SKU", "测试", "个", 1, 1.5, "启用"],
      ]),
      new Set(),
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: [
        {
          rowNumber: 2,
          field: "预警值",
          value: "1.5",
          reason: "必须是非负整数。",
        },
      ],
    });
  });

  it("参考售价不是最多两位小数的非负金额时按字段拒绝", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        ["WJ-MONEY-001", "测试 SKU", "测试", "个", "四十八元", 1, "启用"],
      ]),
      new Set(),
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: [
        {
          rowNumber: 2,
          field: "参考售价",
          value: "四十八元",
          reason: "必须是最多两位小数的非负人民币金额。",
        },
      ],
    });
  });

  it("启用状态不在固定值中时按字段拒绝", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        ["WJ-STATUS-001", "测试 SKU", "测试", "个", 1, 0, "是"],
      ]),
      new Set(),
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: [
        {
          rowNumber: 2,
          field: "启用状态",
          value: "是",
          reason: "只能填写“启用”或“停用”。",
        },
      ],
    });
  });

  it("文本字段沿用 SKU 资料的长度限制", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        ["S".repeat(65), "SKU", "分类", "个", 1, 0, "启用"],
        ["WJ-LONG-NAME", "名".repeat(161), "分类", "个", 1, 0, "启用"],
        ["WJ-LONG-CATEGORY", "SKU", "类".repeat(81), "个", 1, 0, "启用"],
        ["WJ-LONG-UNIT", "SKU", "分类", "个".repeat(25), 1, 0, "启用"],
      ]),
      new Set(),
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: [
        expect.objectContaining({ rowNumber: 2, field: "SKU 编码", reason: "不能超过 64 个字符。" }),
        expect.objectContaining({ rowNumber: 3, field: "名称", reason: "不能超过 160 个字符。" }),
        expect.objectContaining({ rowNumber: 4, field: "分类", reason: "不能超过 80 个字符。" }),
        expect.objectContaining({ rowNumber: 5, field: "库存单位", reason: "不能超过 24 个字符。" }),
      ],
    });
  });

  it("文件内重复 SKU 编码会标记每个重复行", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        ["WJ-DUP-001", "重复 SKU 一", "测试", "个", 1, 0, "启用"],
        ["WJ-DUP-001", "重复 SKU 二", "测试", "个", 2, 0, "启用"],
      ]),
      new Set(),
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [],
      errors: [
        {
          rowNumber: 2,
          field: "SKU 编码",
          value: "WJ-DUP-001",
          reason: "文件内 SKU 编码重复。",
        },
        {
          rowNumber: 3,
          field: "SKU 编码",
          value: "WJ-DUP-001",
          reason: "文件内 SKU 编码重复。",
        },
      ],
    });
  });

  it("数据库既有 SKU 编码进入错误预览", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        ["WJ-EXISTS-001", "既有 SKU", "测试", "个", 1, 0, "启用"],
        ["WJ-NEW-001", "新 SKU", "测试", "个", 2, 0, "启用"],
      ]),
      new Set(["WJ-EXISTS-001"]),
    );

    expect(result).toMatchObject({
      status: "invalid",
      validRows: [expect.objectContaining({ rowNumber: 3, skuCode: "WJ-NEW-001" })],
      errors: [
        {
          rowNumber: 2,
          field: "SKU 编码",
          value: "WJ-EXISTS-001",
          reason: "SKU 编码已存在。",
        },
      ],
    });
  });

  it("非老板不能预览 SKU 导入文件", () => {
    expect(() =>
      previewSkuImportFile(
        sales,
        createWorkbookFile([
          ["WJ-FORBIDDEN-001", "测试 SKU", "测试", "个", 1, 0, "启用"],
        ]),
        new Set(),
      ),
    ).toThrow(
      expect.objectContaining({
        code: "FORBIDDEN",
        message: "只有老板可以使用导入工作台。",
      }) satisfies Partial<SkuImportError>,
    );
  });

  it("忽略空白行但保留后续错误的真实 Excel 行号", () => {
    const result = previewSkuImportFile(
      owner,
      createWorkbookFile([
        ["WJ-BLANK-001", "合法 SKU", "测试", "个", 1, 0, "启用"],
        [],
        ["WJ-BLANK-002", "错误 SKU", "测试", "个", "非法金额", 0, "启用"],
      ]),
      new Set(),
    );

    expect(result).toMatchObject({
      status: "invalid",
      totalRows: 2,
      validRows: [expect.objectContaining({ rowNumber: 2, skuCode: "WJ-BLANK-001" })],
      errors: [expect.objectContaining({ rowNumber: 4, field: "参考售价" })],
    });
  });
});
