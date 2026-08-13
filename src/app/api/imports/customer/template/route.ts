import { createCustomerImportTemplate } from "@/application/imports/customer-import";
import { getImportRouteActor } from "@/lib/import-route-authorization";

export const runtime = "nodejs";

export async function GET() {
  const actor = await getImportRouteActor();
  if (actor instanceof Response) return actor;

  const template = createCustomerImportTemplate();
  const body = template.buffer.slice(
    template.byteOffset,
    template.byteOffset + template.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-disposition":
        'attachment; filename="customer-import-template.xlsx"',
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
