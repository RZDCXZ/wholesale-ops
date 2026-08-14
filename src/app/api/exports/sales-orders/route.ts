import { handleFilteredExportRequest } from "@/lib/export-route";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleFilteredExportRequest(request, "SALES_ORDERS");
}
