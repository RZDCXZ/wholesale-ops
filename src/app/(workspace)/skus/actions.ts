"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createSku,
  deleteSku,
  disableSku,
  SkuServiceError,
  updateSku,
} from "@/application/skus/sku-service";
import { prisma } from "@/lib/db";
import { getActionActor } from "@/lib/server-authorization";

const skuFieldsSchema = z.object({
  name: z.string().trim().min(1, "请输入 SKU 名称。").max(160, "SKU 名称不能超过 160 个字符。"),
  category: z.string().trim().min(1, "请输入分类。").max(80, "分类不能超过 80 个字符。"),
  inventoryUnit: z.string().trim().min(1, "请输入库存单位。").max(24, "库存单位不能超过 24 个字符。"),
  referencePrice: z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, "参考售价必须是最多两位小数的非负人民币金额。"),
  warningThreshold: z
    .string()
    .trim()
    .regex(/^\d+$/, "预警值必须是非负整数。")
    .transform((value, context) => {
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647) {
        context.addIssue({ code: "custom", message: "预警值超出允许范围。" });
        return z.NEVER;
      }
      return parsed;
    }),
  enabled: z.boolean(),
});

const createSchema = skuFieldsSchema.extend({
  skuCode: z.string().trim().min(1, "请输入 SKU 编码。").max(64, "SKU 编码不能超过 64 个字符。"),
});
const updateSchema = skuFieldsSchema.extend({ skuId: z.string().min(1) });
const confirmedSchema = z.object({
  skuId: z.string().min(1),
  confirmed: z.literal("yes", { error: "请先确认操作影响。" }),
});

export type SkuActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

function validationState(error: z.ZodError): SkuActionState {
  return {
    status: "error",
    message: "请检查表单内容。",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function serviceErrorState(error: unknown): SkuActionState {
  if (error instanceof SkuServiceError) {
    return {
      status: "error",
      message: error.message,
      fieldErrors:
        error.code === "SKU_CODE_EXISTS"
          ? { skuCode: [error.message] }
          : error.code === "INVALID_REFERENCE_PRICE"
            ? { referencePrice: [error.message] }
            : error.code === "INVALID_WARNING_THRESHOLD"
              ? { warningThreshold: [error.message] }
              : undefined,
    };
  }

  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return { status: "error", message: "会话已失效，请重新登录。" };
  }

  return { status: "error", message: "操作未完成，请稍后重试。" };
}

function skuFields(formData: FormData) {
  return {
    name: formData.get("name"),
    category: formData.get("category"),
    inventoryUnit: formData.get("inventoryUnit"),
    referencePrice: formData.get("referencePrice"),
    warningThreshold: formData.get("warningThreshold"),
    enabled: formData.get("enabled") === "on",
  };
}

export async function createSkuAction(
  _previousState: SkuActionState,
  formData: FormData,
): Promise<SkuActionState> {
  const parsed = createSchema.safeParse({
    skuCode: formData.get("skuCode"),
    ...skuFields(formData),
  });
  if (!parsed.success) return validationState(parsed.error);

  let skuId: string;
  try {
    const actor = await getActionActor();
    const result = await createSku(prisma, actor, parsed.data);
    skuId = result.id;
  } catch (error) {
    return serviceErrorState(error);
  }

  revalidatePath("/skus");
  revalidatePath("/audit");
  redirect(`/skus/${skuId}?notice=created`);
}

export async function updateSkuAction(
  _previousState: SkuActionState,
  formData: FormData,
): Promise<SkuActionState> {
  const parsed = updateSchema.safeParse({
    skuId: formData.get("skuId"),
    ...skuFields(formData),
  });
  if (!parsed.success) return validationState(parsed.error);

  try {
    const actor = await getActionActor();
    await updateSku(prisma, actor, parsed.data);
  } catch (error) {
    return serviceErrorState(error);
  }

  revalidatePath("/skus");
  revalidatePath(`/skus/${parsed.data.skuId}`);
  revalidatePath("/audit");
  redirect(`/skus/${parsed.data.skuId}?notice=updated`);
}

export async function disableSkuAction(
  _previousState: SkuActionState,
  formData: FormData,
): Promise<SkuActionState> {
  const parsed = confirmedSchema.safeParse({
    skuId: formData.get("skuId"),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) return validationState(parsed.error);

  try {
    const actor = await getActionActor();
    await disableSku(prisma, actor, { skuId: parsed.data.skuId, confirmed: true });
  } catch (error) {
    return serviceErrorState(error);
  }

  revalidatePath("/skus");
  revalidatePath(`/skus/${parsed.data.skuId}`);
  revalidatePath("/audit");
  redirect(`/skus/${parsed.data.skuId}?notice=disabled`);
}

export async function deleteSkuAction(
  _previousState: SkuActionState,
  formData: FormData,
): Promise<SkuActionState> {
  const parsed = confirmedSchema.safeParse({
    skuId: formData.get("skuId"),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) return validationState(parsed.error);

  try {
    const actor = await getActionActor();
    await deleteSku(prisma, actor, { skuId: parsed.data.skuId, confirmed: true });
  } catch (error) {
    return serviceErrorState(error);
  }

  revalidatePath("/skus");
  revalidatePath("/audit");
  redirect("/skus?notice=deleted");
}
