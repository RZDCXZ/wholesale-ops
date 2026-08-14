import "server-only";

import {
  ExportRequestError,
  type FilteredExportKind,
  parseFilteredExportRequest,
} from "@/application/exports/export-request";
import {
  exportFilteredWorkbook,
  FilteredExportError,
} from "@/application/exports/filtered-export-service";
import { getCurrentActor } from "@/lib/current-actor";
import { prisma } from "@/lib/db";

const xlsxContentType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function handleFilteredExportRequest(
  request: Request,
  kind: FilteredExportKind,
): Promise<Response> {
  const authentication = await getCurrentActor();
  if (authentication.kind !== "authenticated") {
    return Response.json(
      { code: "UNAUTHENTICATED", message: "请先登录。" },
      { status: 401 },
    );
  }

  try {
    const parameters = new URL(request.url).searchParams;
    const exportRequest = parseFilteredExportRequest(kind, parameters);
    const result = await exportFilteredWorkbook(
      prisma,
      authentication.actor,
      exportRequest,
    );
    const body = result.bytes.buffer.slice(
      result.bytes.byteOffset,
      result.bytes.byteOffset + result.bytes.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        "content-type": xlsxContentType,
        "x-export-row-count": String(result.rowCount),
      },
    });
  } catch (error) {
    if (error instanceof ExportRequestError) {
      return Response.json(
        { code: error.code, message: error.message },
        { status: 400 },
      );
    }
    if (error instanceof FilteredExportError) {
      return Response.json(
        { code: error.code, message: error.message },
        { status: error.code === "FORBIDDEN" ? 403 : 422 },
      );
    }
    throw error;
  }
}
