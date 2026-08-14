import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CustomerServiceError,
  getCustomerPermissions,
  getCustomer,
  listResponsibleSalesOptions,
} from "@/application/customers/customer-service";
import { CustomerRecordActions } from "@/components/customer-record-actions";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "客户详情" };
function first(value: string | string[] | undefined): string { return Array.isArray(value) ? (value[0] ?? "") : (value ?? ""); }
function paymentTerm(days: number): string { return days === 0 ? "现结（交付当天到期）" : `${days} 天`; }

export default async function CustomerDetailPage({ params, searchParams }: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("CUSTOMERS_VIEW");
  const { customerId } = await params;
  const actorPermissions = getCustomerPermissions(actor);
  let customer;
  let salesOptions: Array<{ id: string; name: string }>;
  try {
    [customer, salesOptions] = await Promise.all([
      getCustomer(prisma, actor, customerId),
      actorPermissions.canReassign
        ? listResponsibleSalesOptions(prisma, actor)
        : Promise.resolve([]),
    ]);
  } catch (error) {
    if (error instanceof CustomerServiceError && error.code === "CUSTOMER_NOT_FOUND") notFound();
    throw error;
  }
  const permissions = getCustomerPermissions(actor, customer);
  const noticeValue = first((await searchParams).notice);
  const notice = noticeValue === "created" ? "客户已创建，资料和业务审计已同时写入。" : noticeValue === "updated" ? "客户资料已更新，客户编码与负责人保持不变。" : noticeValue === "reassigned" ? "客户负责人已调整，服务端数据范围立即生效。" : noticeValue === "disabled" ? "客户已停用，不再提供给新销售单选择。" : undefined;
  const facts = [
    ["客户编码", customer.customerCode], ["客户名称", customer.name], ["联系人", customer.contactName], ["电话", customer.phone], ["客户负责人", customer.responsibleSales.name], ["默认账期", paymentTerm(customer.paymentTermDays)], ["地址", customer.address],
  ];

  return <div className="mx-auto max-w-5xl">
    <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid"><div><p className="text-xs font-semibold text-[#2563eb]">客户 / {customer.customerCode}</p><div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">{customer.customerCode} · {customer.name}</h1><span className={customer.enabled ? "rounded-md border border-[#a7d9b6] bg-[#ecfdf3] px-2 py-1 text-xs font-semibold text-[#027a48]" : "rounded-md border border-[#edb1b1] bg-[#fff0f0] px-2 py-1 text-xs font-semibold text-[#c62828]"}>{customer.enabled ? "启用" : "停用"}</span></div><p className="mt-1.5 text-[13px] text-[#667085]">客户负责人：{customer.responsibleSales.name}</p></div><div className="flex flex-wrap gap-2.5">{permissions.canEdit ? <Link href={`/customers/${customer.id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]">编辑资料</Link> : null}<Link href="/customers" className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">返回列表</Link></div></header>
    {notice ? <div role="status" className="mb-4 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]">{notice}</div> : null}
    <section className="rounded-lg border border-[#e4e7ec] bg-white p-5"><div className="mb-4"><h2 className="text-base font-semibold">基本资料</h2><p className="mt-1 text-[13px] text-[#667085]">客户编码创建后不可修改；负责人调整使用独立业务动作。</p></div><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{facts.map(([label, value]) => <div key={label} className={`rounded-lg bg-[#f7f9fb] p-3 ${label === "地址" ? "sm:col-span-2 lg:col-span-3" : ""}`}><dt className="text-xs text-[#667085]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl></section>
    <section className="mt-5 grid grid-cols-4 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white max-sm:grid-cols-2 divide-x divide-[#e4e7ec] max-sm:[&>*:nth-child(odd)]:border-l-0">{["销售单数量", "最近交易", "未收金额", "逾期金额"].map((label) => <div key={label} className="p-5"><span className="text-xs font-semibold text-[#667085]">{label}</span><strong className="mt-2 block text-xl text-[#98a2b3]">—</strong><small className="mt-1 block text-xs text-[#667085]">后续业务记录接入后显示</small></div>)}</section>
    <section className="mt-5 rounded-lg border border-[#e4e7ec] bg-white p-5"><div className="flex items-start justify-between gap-4 max-sm:grid"><div><h2 className="text-base font-semibold">相关业务</h2><p className="mt-2 text-[13px] leading-6 text-[#667085]">销售通过自己负责客户的销售单查看收款进度；老板与财务可进入完整应收列表。</p></div><div className="flex flex-wrap gap-2"><Link href={`/sales-orders?customerId=${encodeURIComponent(customer.id)}`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">查看销售单</Link>{actorPermissions.hasGlobalReadScope ? <Link href={`/receivables?customerId=${encodeURIComponent(customer.id)}`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">查看应收</Link> : null}</div></div></section>
    {permissions.canDisable ? <section className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-[#edb1b1] bg-white p-5 max-sm:grid"><div><h2 className="font-semibold">负责人、停用与删除</h2><p className="mt-1 text-[13px] leading-5 text-[#667085]">{customer.hasBusinessReferences ? "该客户已被业务记录引用，因此不提供删除入口；可以停用并保留历史资料。" : permissions.canReassign ? "老板可调整负责人、停用或删除未引用客户；销售可停用自己负责的客户。" : "你可以维护和停用自己负责的客户。"}</p></div><CustomerRecordActions customer={{ id: customer.id, customerCode: customer.customerCode, name: customer.name, enabled: customer.enabled, responsibleSalesId: customer.responsibleSales.id }} salesOptions={salesOptions} canReassign={permissions.canReassign} canDelete={permissions.canDelete && !customer.hasBusinessReferences} /></section> : null}
  </div>;
}
