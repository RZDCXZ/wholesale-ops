import type { Metadata } from "next";

import { AccountForm } from "@/components/account-form";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "新建账号" };

export default async function NewAccountPage() {
  await getPageActor("ACCOUNTS_MANAGE");

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-[18px] min-h-[58px]">
        <p className="text-xs font-semibold text-[#2563eb]">账号与角色 / 新建</p>
        <h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">
          新建账号
        </h1>
        <p className="mt-1.5 text-[13px] text-[#667085]">
          设置登录身份与至少一个固定角色
        </p>
      </header>
      <AccountForm mode="create" />
    </div>
  );
}
