"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createSalesOrderDraft,
  deleteSalesOrderDraft,
  SalesOrderServiceError,
  updateSalesOrderDraft,
} from "@/application/sales-orders/sales-order-service";
import { prisma } from "@/lib/db";
import { getActionActor } from "@/lib/server-authorization";

const itemSchema = z.object({
  skuId: z.string().trim().min(1, "请选择 SKU。"),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+$/, "数量必须是正整数。")
    .transform((value, context) => {
      const quantity = Number(value);
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2_147_483_647) {
        context.addIssue({ code: "custom", message: "数量必须是正整数。" });
        return z.NEVER;
      }
      return quantity;
    }),
  transactionPrice: z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/,
      "成交价必须是最多两位小数的非负人民币金额。",
    ),
});
const draftSchema = z.object({
  customerId: z.string().trim().min(1, "请选择客户。"),
  items: z.array(itemSchema).min(1, "销售单草稿至少需要一条有效明细。"),
});

export type SalesOrderActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

function validationState(error: z.ZodError): SalesOrderActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "items";
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  return { status: "error", message: "请检查销售单草稿内容。", fieldErrors };
}

function serviceErrorState(error: unknown): SalesOrderActionState {
  if (error instanceof SalesOrderServiceError) {
    return {
      status: "error",
      message: error.message,
      fieldErrors: error.field ? { [error.field]: [error.message] } : undefined,
    };
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return { status: "error", message: "会话已失效，请重新登录。" };
  }
  return { status: "error", message: "操作未完成，请稍后重试。" };
}

function parseItems(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return [];
  }
}

function parseDraft(formData: FormData) {
  return draftSchema.safeParse({
    customerId: formData.get("customerId"),
    items: parseItems(formData),
  });
}

export async function createSalesOrderDraftAction(
  _previousState: SalesOrderActionState,
  formData: FormData,
): Promise<SalesOrderActionState> {
  const parsed = parseDraft(formData);
  if (!parsed.success) return validationState(parsed.error);

  let salesOrderId: string;
  try {
    const actor = await getActionActor();
    salesOrderId = (await createSalesOrderDraft(prisma, actor, parsed.data)).id;
  } catch (error) {
    return serviceErrorState(error);
  }
  revalidatePath("/sales-orders");
  revalidatePath("/audit");
  redirect(`/sales-orders/${salesOrderId}/edit?notice=created`);
}

export async function updateSalesOrderDraftAction(
  _previousState: SalesOrderActionState,
  formData: FormData,
): Promise<SalesOrderActionState> {
  const salesOrderId = String(formData.get("salesOrderId") ?? "");
  const parsed = parseDraft(formData);
  if (!salesOrderId || !parsed.success) {
    return parsed.success
      ? { status: "error", message: "销售单草稿不存在或不可编辑。" }
      : validationState(parsed.error);
  }

  try {
    const actor = await getActionActor();
    await updateSalesOrderDraft(prisma, actor, { salesOrderId, ...parsed.data });
  } catch (error) {
    return serviceErrorState(error);
  }
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${salesOrderId}/edit`);
  revalidatePath("/audit");
  redirect(`/sales-orders/${salesOrderId}/edit?notice=updated`);
}

export async function deleteSalesOrderDraftAction(
  _previousState: SalesOrderActionState,
  formData: FormData,
): Promise<SalesOrderActionState> {
  const salesOrderId = String(formData.get("salesOrderId") ?? "");
  if (!salesOrderId) return { status: "error", message: "销售单草稿不存在或不可删除。" };
  try {
    const actor = await getActionActor();
    await deleteSalesOrderDraft(prisma, actor, salesOrderId);
  } catch (error) {
    return serviceErrorState(error);
  }
  revalidatePath("/sales-orders");
  revalidatePath("/audit");
  redirect("/sales-orders?notice=deleted");
}
