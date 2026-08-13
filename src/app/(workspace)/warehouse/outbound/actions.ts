"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  outboundSalesOrder,
  OutboundServiceError,
} from "@/application/outbound/outbound-service";
import { prisma } from "@/lib/db";
import { getActionActor } from "@/lib/server-authorization";

export type OutboundActionState = {
  status: "idle" | "error";
  message?: string;
};

export async function outboundSalesOrderAction(
  _previousState: OutboundActionState,
  formData: FormData,
): Promise<OutboundActionState> {
  const salesOrderId = String(formData.get("salesOrderId") ?? "").trim();
  const returnTo =
    formData.get("returnTo") === "sales-order"
      ? "sales-order"
      : "workbench";
  if (!salesOrderId) {
    return { status: "error", message: "销售单不存在或不可出库。" };
  }

  let salesOrderNumber: string;
  try {
    const actor = await getActionActor();
    const result = await outboundSalesOrder(prisma, actor, salesOrderId);
    salesOrderNumber = result.salesOrderNumber;
  } catch (error) {
    if (error instanceof OutboundServiceError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return { status: "error", message: "会话已失效，请重新登录。" };
    }
    return { status: "error", message: "出库未完成，请稍后重试。" };
  }

  revalidatePath("/warehouse/outbound");
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${salesOrderId}`);
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
  revalidatePath("/skus");
  revalidatePath("/receivables");
  revalidatePath("/audit");
  redirect(
    returnTo === "sales-order"
      ? `/sales-orders/${encodeURIComponent(salesOrderId)}?notice=outbound`
      : `/warehouse/outbound?notice=outbound&reference=${encodeURIComponent(salesOrderNumber)}`,
  );
}
