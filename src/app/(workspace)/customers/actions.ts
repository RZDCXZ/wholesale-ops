"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createCustomer,
  CustomerServiceError,
  deleteCustomer,
  disableCustomer,
  reassignCustomer,
  updateCustomer,
} from "@/application/customers/customer-service";
import { prisma } from "@/lib/db";
import { getActionActor } from "@/lib/server-authorization";

const paymentTermDaysSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "默认账期必须是现结或非负整数天数。")
  .transform((value, context) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647) {
      context.addIssue({ code: "custom", message: "默认账期超出允许范围。" });
      return z.NEVER;
    }
    return parsed;
  });

const customerFieldsSchema = z.object({
  name: z.string().trim().min(1, "请输入客户名称。").max(160, "客户名称不能超过 160 个字符。"),
  contactName: z.string().trim().min(1, "请输入联系人。").max(80, "联系人不能超过 80 个字符。"),
  phone: z.string().trim().min(1, "请输入电话。").max(80, "电话不能超过 80 个字符。"),
  address: z.string().trim().min(1, "请输入地址。").max(500, "地址不能超过 500 个字符。"),
  paymentTermDays: paymentTermDaysSchema,
});
const createSchema = customerFieldsSchema.extend({
  customerCode: z.string().trim().min(1, "请输入客户编码。").max(64, "客户编码不能超过 64 个字符。"),
  responsibleSalesId: z.string().trim().optional(),
  enabled: z.boolean(),
});
const updateSchema = customerFieldsSchema.extend({ customerId: z.string().min(1) });
const confirmedSchema = z.object({
  customerId: z.string().min(1),
  confirmed: z.literal("yes", { error: "请先确认操作影响。" }),
});
const reassignSchema = confirmedSchema.extend({ responsibleSalesId: z.string().min(1, "请选择新的客户负责人。") });

export type CustomerActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

function validationState(error: z.ZodError): CustomerActionState {
  return {
    status: "error",
    message: "请检查表单内容。",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function serviceErrorState(error: unknown): CustomerActionState {
  if (error instanceof CustomerServiceError) {
    return {
      status: "error",
      message: error.message,
      fieldErrors:
        error.code === "CUSTOMER_CODE_EXISTS"
          ? { customerCode: [error.message] }
          : error.code === "INVALID_RESPONSIBLE_SALES"
            ? { responsibleSalesId: [error.message] }
            : error.code === "INVALID_PAYMENT_TERM"
              ? { paymentTermDays: [error.message] }
              : undefined,
    };
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return { status: "error", message: "会话已失效，请重新登录。" };
  }
  return { status: "error", message: "操作未完成，请稍后重试。" };
}

function fields(formData: FormData) {
  const paymentTermType = formData.get("paymentTermType");
  return {
    name: formData.get("name"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    paymentTermDays: paymentTermType === "cash" ? "0" : formData.get("paymentTermDays"),
  };
}

export async function createCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = createSchema.safeParse({
    customerCode: formData.get("customerCode"),
    responsibleSalesId: String(formData.get("responsibleSalesId") ?? "") || undefined,
    enabled: formData.get("enabled") === "on",
    ...fields(formData),
  });
  if (!parsed.success) return validationState(parsed.error);

  let customerId: string;
  try {
    const actor = await getActionActor();
    customerId = (await createCustomer(prisma, actor, parsed.data)).id;
  } catch (error) {
    return serviceErrorState(error);
  }
  revalidatePath("/customers");
  revalidatePath("/audit");
  redirect(`/customers/${customerId}?notice=created`);
}

export async function updateCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = updateSchema.safeParse({ customerId: formData.get("customerId"), ...fields(formData) });
  if (!parsed.success) return validationState(parsed.error);
  try {
    const actor = await getActionActor();
    await updateCustomer(prisma, actor, parsed.data);
  } catch (error) {
    return serviceErrorState(error);
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${parsed.data.customerId}`);
  revalidatePath("/audit");
  redirect(`/customers/${parsed.data.customerId}?notice=updated`);
}

export async function reassignCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = reassignSchema.safeParse({
    customerId: formData.get("customerId"),
    responsibleSalesId: formData.get("responsibleSalesId"),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) return validationState(parsed.error);
  try {
    const actor = await getActionActor();
    await reassignCustomer(prisma, actor, { ...parsed.data, confirmed: true });
  } catch (error) {
    return serviceErrorState(error);
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${parsed.data.customerId}`);
  revalidatePath("/audit");
  redirect(`/customers/${parsed.data.customerId}?notice=reassigned`);
}

export async function disableCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = confirmedSchema.safeParse({ customerId: formData.get("customerId"), confirmed: formData.get("confirmed") });
  if (!parsed.success) return validationState(parsed.error);
  try {
    const actor = await getActionActor();
    await disableCustomer(prisma, actor, { customerId: parsed.data.customerId, confirmed: true });
  } catch (error) {
    return serviceErrorState(error);
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${parsed.data.customerId}`);
  revalidatePath("/audit");
  redirect(`/customers/${parsed.data.customerId}?notice=disabled`);
}

export async function deleteCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = confirmedSchema.safeParse({ customerId: formData.get("customerId"), confirmed: formData.get("confirmed") });
  if (!parsed.success) return validationState(parsed.error);
  try {
    const actor = await getActionActor();
    await deleteCustomer(prisma, actor, { customerId: parsed.data.customerId, confirmed: true });
  } catch (error) {
    return serviceErrorState(error);
  }
  revalidatePath("/customers");
  revalidatePath("/audit");
  redirect("/customers?notice=deleted");
}
