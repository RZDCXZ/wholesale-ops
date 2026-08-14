"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  ReceivableServiceError,
  recordPayment,
  reversePayment,
} from "@/application/receivables/receivable-service";
import { prisma } from "@/lib/db";
import { paymentMethodValues } from "@/lib/receivable-display";
import { getActionActor } from "@/lib/server-authorization";

const paymentDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "请选择有效的收款日期。")
  .transform((value, context) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month! - 1 ||
      date.getUTCDate() !== day
    ) {
      context.addIssue({ code: "custom", message: "请选择有效的收款日期。" });
      return z.NEVER;
    }
    return date;
  });

const amountSchema = z
  .string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/,
    "收款金额必须是最多两位小数的人民币金额。",
  )
  .transform((value, context) => {
    const [yuan, fraction = ""] = value.split(".");
    const amountFen = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(amountFen) || amountFen <= 0 || amountFen > 2_147_483_647) {
      context.addIssue({ code: "custom", message: "收款金额必须大于零。" });
      return z.NEVER;
    }
    return amountFen;
  });

const paymentSchema = z.object({
  receivableId: z.string().trim().min(1),
  paymentDate: paymentDateSchema,
  amountFen: amountSchema,
  method: z.enum(paymentMethodValues, {
    error: "请选择有效的收款方式。",
  }),
  referenceNumber: z.string().trim().max(160, "参考号不能超过 160 个字符。"),
  note: z.string().trim().max(1_000, "备注不能超过 1000 个字符。"),
  idempotencyKey: z.string().trim().min(1).max(128),
});

const paymentReversalSchema = z.object({
  paymentId: z.string().trim().min(1),
  reason: z
    .string()
    .trim()
    .min(1, "请填写撤销原因。")
    .max(1_000, "撤销原因不能超过 1000 个字符。"),
  idempotencyKey: z.string().trim().min(1).max(128),
});

export type PaymentActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export type PaymentReversalActionState = PaymentActionState;

function validationState(
  error: z.ZodError,
  message = "请检查收款信息。",
): PaymentActionState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  return {
    status: "error",
    message,
    fieldErrors,
  };
}

function serviceErrorState(
  error: unknown,
  fallbackMessage = "收款未登记，请稍后重试。",
): PaymentActionState {
  if (error instanceof ReceivableServiceError) {
    const field =
      error.code === "INVALID_AMOUNT" || error.code === "AMOUNT_EXCEEDS_REMAINING"
        ? "amountFen"
        : error.code === "INVALID_PAYMENT_DATE"
          ? "paymentDate"
          : error.code === "INVALID_PAYMENT_METHOD"
            ? "method"
            : undefined;
    return {
      status: "error",
      message: error.message,
      fieldErrors: field ? { [field]: [error.message] } : undefined,
    };
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return { status: "error", message: "会话已失效，请重新登录。" };
  }
  return { status: "error", message: fallbackMessage };
}

export async function recordPaymentAction(
  _previousState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const parsed = paymentSchema.safeParse({
    receivableId: formData.get("receivableId"),
    paymentDate: formData.get("paymentDate"),
    amountFen: formData.get("amountFen"),
    method: formData.get("method"),
    referenceNumber: formData.get("referenceNumber") ?? "",
    note: formData.get("note") ?? "",
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return validationState(parsed.error);

  try {
    const actor = await getActionActor();
    await recordPayment(prisma, actor, {
      receivableId: parsed.data.receivableId,
      paymentDate: parsed.data.paymentDate,
      amountFen: parsed.data.amountFen,
      method: parsed.data.method,
      referenceNumber: parsed.data.referenceNumber,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error) {
    return serviceErrorState(error);
  }

  revalidatePath("/receivables");
  revalidatePath(`/receivables/${parsed.data.receivableId}`);
  revalidatePath("/sales-orders");
  revalidatePath("/customers");
  revalidatePath("/audit");
  redirect(
    `/receivables/${encodeURIComponent(parsed.data.receivableId)}?notice=payment-recorded`,
  );
}

export async function reversePaymentAction(
  _previousState: PaymentReversalActionState,
  formData: FormData,
): Promise<PaymentReversalActionState> {
  const parsed = paymentReversalSchema.safeParse({
    paymentId: formData.get("paymentId"),
    reason: formData.get("reason"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return validationState(parsed.error, "请检查撤销信息。");

  let receivableId: string;
  let duplicate: boolean;
  try {
    const actor = await getActionActor();
    const result = await reversePayment(prisma, actor, parsed.data);
    receivableId = result.receivable.id;
    duplicate = result.duplicate;
  } catch (error) {
    const state = serviceErrorState(
      error,
      "撤销收款未完成，请稍后重试。",
    );
    if (
      error instanceof ReceivableServiceError &&
      error.code === "INVALID_REVERSAL_REASON"
    ) {
      return { ...state, fieldErrors: { reason: [error.message] } };
    }
    return state;
  }

  revalidatePath("/receivables");
  revalidatePath(`/receivables/${receivableId}`);
  revalidatePath("/sales-orders");
  revalidatePath("/customers");
  revalidatePath("/audit");
  redirect(
    `/receivables/${encodeURIComponent(receivableId)}?notice=${duplicate ? "payment-already-reversed" : "payment-reversed"}`,
  );
}
