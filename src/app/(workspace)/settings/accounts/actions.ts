"use server";

import { hashPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  AccountServiceError,
  createAccount,
  disableAccount,
  updateAccountRoles,
} from "@/application/accounts/account-service";
import { createAccountActionNotice } from "@/lib/account-action-notice";
import { prisma } from "@/lib/db";
import { getActionActor } from "@/lib/server-authorization";

const roles = ["OWNER", "SALES", "WAREHOUSE", "FINANCE"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1, "请输入姓名。").max(80, "姓名不能超过 80 个字符。"),
  email: z.email("请输入有效邮箱。").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "初始密码至少需要 8 个字符。")
    .max(128, "初始密码不能超过 128 个字符。"),
  roles: z.array(z.enum(roles)).min(1, "请至少分配一个角色。"),
});

const updateRolesSchema = z.object({
  accountId: z.string().min(1),
  roles: z.array(z.enum(roles)).min(1, "请至少分配一个角色。"),
});

const disableSchema = z.object({
  accountId: z.string().min(1),
  confirmed: z.literal("yes", { error: "请先确认停用影响。" }),
});

export type AccountActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

function validationState(error: z.ZodError): AccountActionState {
  return {
    status: "error",
    message: "请检查表单内容。",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function serviceErrorState(error: unknown): AccountActionState {
  if (error instanceof AccountServiceError) {
    if (error.code === "EMAIL_EXISTS") {
      return {
        status: "error",
        message: error.message,
        fieldErrors: { email: [error.message] },
      };
    }

    return { status: "error", message: error.message };
  }

  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return { status: "error", message: "会话已失效，请重新登录。" };
  }

  return { status: "error", message: "操作未完成，请稍后重试。" };
}

function roleValues(formData: FormData) {
  return formData.getAll("roles").map(String);
}

async function setAccountActionNotice(actorId: string, auditId: string) {
  (await cookies()).set(
    "account-action-notice",
    createAccountActionNotice(actorId, auditId),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    path: "/",
    maxAge: 60,
    },
  );
}

export async function createAccountAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    roles: roleValues(formData),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  try {
    const actor = await getActionActor();
    const result = await createAccount(prisma, actor, parsed.data, hashPassword);
    await setAccountActionNotice(actor.id, result.auditId);
  } catch (error) {
    return serviceErrorState(error);
  }

  revalidatePath("/settings/accounts");
  revalidatePath("/audit");
  redirect("/settings/accounts");
}

export async function updateAccountRolesAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = updateRolesSchema.safeParse({
    accountId: formData.get("accountId"),
    roles: roleValues(formData),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  try {
    const actor = await getActionActor();
    const result = await updateAccountRoles(prisma, actor, parsed.data);
    await setAccountActionNotice(actor.id, result.auditId);
  } catch (error) {
    return serviceErrorState(error);
  }

  revalidatePath("/settings/accounts");
  revalidatePath("/audit");
  redirect("/settings/accounts");
}

export async function disableAccountAction(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = disableSchema.safeParse({
    accountId: formData.get("accountId"),
    confirmed: formData.get("confirmed"),
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  try {
    const actor = await getActionActor();
    const result = await disableAccount(prisma, actor, {
      accountId: parsed.data.accountId,
      confirmed: true,
    });
    await setAccountActionNotice(actor.id, result.auditId);
  } catch (error) {
    return serviceErrorState(error);
  }

  revalidatePath("/settings/accounts");
  revalidatePath("/audit");
  redirect("/settings/accounts");
}
