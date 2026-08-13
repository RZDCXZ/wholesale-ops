import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  AccountServiceError,
  getAccount,
} from "@/application/accounts/account-service";
import { AccountForm } from "@/components/account-form";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "调整账号角色" };

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const actor = await getPageActor("ACCOUNTS_MANAGE");
  const { accountId } = await params;
  let account;

  try {
    account = await getAccount(prisma, actor, accountId);
  } catch (error) {
    if (
      error instanceof AccountServiceError &&
      error.code === "ACCOUNT_NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-[18px] min-h-[58px]">
        <p className="text-xs font-semibold text-[#2563eb]">账号与角色 / 编辑</p>
        <h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">
          调整账号角色
        </h1>
        <p className="mt-1.5 text-[13px] text-[#667085]">
          账号登录后使用全部已分配角色的权限并集
        </p>
      </header>
      <AccountForm
        mode="edit"
        account={{
          id: account.id,
          name: account.name,
          email: account.email,
          roles: account.roles,
        }}
      />
    </div>
  );
}
