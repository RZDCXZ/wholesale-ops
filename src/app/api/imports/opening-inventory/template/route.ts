import { createOpeningInventoryImportTemplate } from "@/application/imports/opening-inventory-import";
import { getImportRouteActor } from "@/lib/import-route-authorization";

export const runtime = "nodejs";

export async function GET() {
  const actor = await getImportRouteActor();
  if (actor instanceof Response) return actor;

  const template = createOpeningInventoryImportTemplate();
  const body = template.buffer.slice(
    template.byteOffset,
    template.byteOffset + template.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-disposition":
        'attachment; filename="opening-inventory-template.xlsx"',
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
