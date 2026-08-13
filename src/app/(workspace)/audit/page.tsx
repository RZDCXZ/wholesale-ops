import type { Metadata } from "next";
import Link from "next/link";

import { listBusinessAudit } from "@/application/accounts/account-service";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "业务审计" };

const actionLabels: Record<string, string> = {
  ACCOUNT_CREATED: "创建账号",
  ACCOUNT_ROLES_UPDATED: "调整账号角色",
  ACCOUNT_DISABLED: "停用账号",
};

const objectLabels: Record<string, string> = {
  ACCOUNT: "账号",
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("AUDIT_VIEW");
  const query = first((await searchParams).q).trim();
  const audits = await listBusinessAudit(prisma, actor, { query });

  return (
    <>
      <header className="mb-[18px] min-h-[58px]">
        <h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">
          业务审计
        </h1>
        <p className="mt-1.5 text-[13px] text-[#667085]">
          关键经营动作的只追加记录，不代表防篡改或合规认证
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form
          method="get"
          className="flex items-center gap-2.5 border-b border-[#e4e7ec] p-3.5 max-sm:grid max-sm:grid-cols-[1fr_auto]"
        >
          <input
            name="q"
            defaultValue={query}
            placeholder="搜索操作者或关联编号"
            className="min-h-11 min-w-0 flex-1 rounded-[7px] border border-[#d0d5dd] px-3 text-[13px] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15"
          />
          <Button type="submit">筛选</Button>
          <Link
            href="/audit"
            className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-3 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7] max-sm:col-span-2"
          >
            清除筛选
          </Link>
        </form>

        {audits.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-6 text-center">
            <div>
              <h2 className="text-base font-semibold">
                {query ? "当前筛选无结果" : "暂无业务审计"}
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-[#667085]">
                {query
                  ? "请调整操作者或关联编号后重试。"
                  : "账号创建、角色调整和停用后会在这里留下记录。"}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[#475467]">
                  <tr>
                    {[
                      "发生时间",
                      "操作者",
                      "动作",
                      "对象",
                      "关联编号",
                      "原因或摘要",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audits.map((audit) => (
                    <tr key={audit.id} className="border-b border-[#eef0f3] last:border-b-0">
                      <td className="px-4 py-3 whitespace-nowrap text-[#475467]">
                        {formatDate(audit.occurredAt)}
                      </td>
                      <td className="px-4 py-3 font-semibold">{audit.actorName}</td>
                      <td className="px-4 py-3">
                        {actionLabels[audit.action] ?? audit.action}
                      </td>
                      <td className="px-4 py-3">
                        {objectLabels[audit.objectType] ?? audit.objectType}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#344054]">
                        {audit.referenceCode ?? "—"}
                      </td>
                      <td className="max-w-md px-4 py-3 leading-5 text-[#667085]">
                        {audit.reason ?? audit.summary ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid divide-y divide-[#e4e7ec] md:hidden">
              {audits.map((audit) => (
                <article key={audit.id} className="grid gap-2.5 p-4 text-[13px]">
                  <div className="flex items-start justify-between gap-3">
                    <strong>{actionLabels[audit.action] ?? audit.action}</strong>
                    <span className="text-xs whitespace-nowrap text-[#667085]">
                      {formatDate(audit.occurredAt)}
                    </span>
                  </div>
                  <span>
                    操作者：<b>{audit.actorName}</b>
                  </span>
                  <span className="text-[#475467]">
                    对象：{objectLabels[audit.objectType] ?? audit.objectType} · 关联编号：
                    {audit.referenceCode ?? "—"}
                  </span>
                  <p className="leading-5 text-[#667085]">
                    {audit.reason ?? audit.summary ?? "—"}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
