import * as XLSX from "xlsx";

export type ImportFile = {
  name: string;
  bytes: Uint8Array;
};

export type ImportWorksheetTemplate = {
  templateName: string;
  worksheetName: string;
  headers: readonly string[];
};

export type ImportWorksheetRow = {
  rowNumber: number;
  values: unknown[];
  formulas: Array<{ columnIndex: number; expression: string }>;
};

export type ImportFileRejection = {
  status: "rejected";
  code:
    | "FILE_TYPE_INVALID"
    | "FILE_TOO_LARGE"
    | "EMPTY_FILE"
    | "WORKSHEET_INVALID"
    | "ROW_LIMIT_EXCEEDED"
    | "MACRO_NOT_ALLOWED"
    | "TEMPLATE_INVALID"
    | "PARSE_FAILED";
  message: string;
};

export type ImportWorksheetResult =
  | ImportFileRejection
  | { status: "ready"; rows: ImportWorksheetRow[] };

export function readImportWorksheet(
  file: ImportFile,
  template: ImportWorksheetTemplate,
): ImportWorksheetResult {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return {
      status: "rejected",
      code: "FILE_TYPE_INVALID",
      message: "只接受 .xlsx 文件。",
    };
  }
  if (file.bytes.byteLength > 10 * 1024 * 1024) {
    return {
      status: "rejected",
      code: "FILE_TOO_LARGE",
      message: "文件不能超过 10 MB。",
    };
  }
  if (
    file.bytes.byteLength < 4 ||
    file.bytes[0] !== 0x50 ||
    file.bytes[1] !== 0x4b
  ) {
    return {
      status: "rejected",
      code: "PARSE_FAILED",
      message: "无法解析工作簿，请确认文件来自固定模板且未损坏。",
    };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.bytes, {
      type: "array",
      bookVBA: true,
      cellFormula: true,
    });
  } catch {
    return {
      status: "rejected",
      code: "PARSE_FAILED",
      message: "无法解析工作簿，请确认文件来自固定模板且未损坏。",
    };
  }
  if (workbook.vbaraw) {
    return {
      status: "rejected",
      code: "MACRO_NOT_ALLOWED",
      message: "不接受包含宏的工作簿。",
    };
  }
  if (workbook.SheetNames[0] !== template.worksheetName) {
    return {
      status: "rejected",
      code: "WORKSHEET_INVALID",
      message: `第一张工作表必须命名为“${template.worksheetName}”。`,
    };
  }
  const worksheet = workbook.Sheets[template.worksheetName]!;
  const range = worksheet["!ref"]
    ? XLSX.utils.decode_range(worksheet["!ref"])
    : undefined;
  const actualHeaderWidth = Math.max(
    template.headers.length,
    (range?.e.c ?? -1) + 1,
  );
  const actualHeaders = Array.from({ length: actualHeaderWidth }, (_, column) =>
    String(worksheet[XLSX.utils.encode_cell({ r: 0, c: column })]?.v ?? "").trim(),
  );
  if (
    actualHeaders.length !== template.headers.length ||
    template.headers.some((header, index) => actualHeaders[index] !== header)
  ) {
    return {
      status: "rejected",
      code: "TEMPLATE_INVALID",
      message: `表头与 ${template.templateName} 固定模板不一致，请重新下载模板。`,
    };
  }
  const rows: ImportWorksheetRow[] = [];
  for (let worksheetRow = 1; worksheetRow <= (range?.e.r ?? 0); worksheetRow += 1) {
    const values = template.headers.map(
      (_, columnIndex) =>
        worksheet[XLSX.utils.encode_cell({ r: worksheetRow, c: columnIndex })]
          ?.v ?? null,
    );
    const formulas = template.headers.flatMap((_, columnIndex) => {
      const cell = worksheet[
        XLSX.utils.encode_cell({ r: worksheetRow, c: columnIndex })
      ];
      return typeof cell?.f === "string"
        ? [{ columnIndex, expression: cell.f }]
        : [];
    });
    const hasValue = values.some(
      (value) =>
        value !== null &&
        value !== undefined &&
        (typeof value !== "string" || value.trim().length > 0),
    );
    if (!hasValue && formulas.length === 0) continue;

    rows.push({ rowNumber: worksheetRow + 1, values, formulas });
    if (rows.length > 2_000) {
      return {
        status: "rejected",
        code: "ROW_LIMIT_EXCEEDED",
        message: "每次最多导入 2,000 行。",
      };
    }
  }
  if (rows.length === 0) {
    return {
      status: "rejected",
      code: "EMPTY_FILE",
      message: "工作表中没有可导入的数据行。",
    };
  }

  return {
    status: "ready",
    rows,
  };
}
