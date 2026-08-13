import { z } from "zod";

import {
  confirmOpeningInventoryImport,
  OpeningInventoryImportError,
} from "@/application/imports/opening-inventory-import";
import { prisma } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";
import { getImportRouteActor } from "@/lib/import-route-authorization";

export const runtime = "nodejs";

const requestSchema = z.object({
  previewToken: z.string().min(1).max(4_000_000),
});

export async function POST(request: Request) {
  const actor = await getImportRouteActor();
  if (actor instanceof Response) return actor;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { code: "INVALID_REQUEST", message: "确认请求格式无效。" },
      { status: 400 },
    );
  }
  const validation = requestSchema.safeParse(input);
  if (!validation.success) {
    return Response.json(
      { code: "INVALID_REQUEST", message: "确认请求格式无效。" },
      { status: 400 },
    );
  }

  try {
    const result = await confirmOpeningInventoryImport(
      prisma,
      actor,
      validation.data.previewToken,
      {
        secret: getServerEnvironment().BETTER_AUTH_SECRET,
        now: new Date(),
      },
    );
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof OpeningInventoryImportError) {
      const status =
        error.code === "FORBIDDEN" || error.code === "PREVIEW_FORBIDDEN"
          ? 403
          : error.code === "DUPLICATE_SUBMISSION" ||
              error.code === "PREVIEW_STALE" ||
              error.code === "OPENING_ALREADY_IMPORTED" ||
              error.code === "SALES_INVENTORY_ACTIVITY_EXISTS"
            ? 409
            : 400;
      return Response.json(
        { code: error.code, message: error.message },
        { status },
      );
    }
    throw error;
  }
}
