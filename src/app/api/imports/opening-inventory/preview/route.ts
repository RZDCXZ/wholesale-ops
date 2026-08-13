import {
  OpeningInventoryImportError,
  previewOpeningInventoryImport,
} from "@/application/imports/opening-inventory-import";
import { prisma } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import { getImportRouteActor } from "@/lib/import-route-authorization";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const actor = await getImportRouteActor();
  if (actor instanceof Response) return actor;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { code: "INVALID_UPLOAD", message: "上传内容无法读取，请重新选择文件。" },
      { status: 400 },
    );
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { code: "FILE_REQUIRED", message: "请选择要上传的 .xlsx 文件。" },
      { status: 400 },
    );
  }

  try {
    const preview = await previewOpeningInventoryImport(
      prisma,
      actor,
      { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
      {
        secret: getServerEnvironment().BETTER_AUTH_SECRET,
        now: new Date(),
      },
    );
    return Response.json(preview, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof OpeningInventoryImportError) {
      return Response.json(
        { code: error.code, message: error.message },
        {
          status:
            error.code === "FORBIDDEN"
              ? 403
              : error.code === "OPENING_ALREADY_IMPORTED" ||
                  error.code === "SALES_INVENTORY_ACTIVITY_EXISTS"
                ? 409
                : 400,
        },
      );
    }
    throw error;
  }
}
