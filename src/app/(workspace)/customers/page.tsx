import { IconPlus } from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCustomerPermissions,
  listCustomerResponsibleOptions,
  listCustomersPage,
  type CustomerSortField,
} from "@/application/customers/customer-service";
import { CustomerTableRow } from "@/components/customer-table-row";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "客户" };
type Direction = "asc" | "desc";
type ListState = { query: string; responsibleSalesId: string; status: string; sort: CustomerSortField; direction: Direction; page: number; pageSize: number };

function first(value: string | string[] | undefined): string { return Array.isArray(value) ? (value[0] ?? "") : (value ?? ""); }
function positiveInteger(value: string): number { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : 1; }
function paymentTerm(days: number): string { return days === 0 ? "现结" : `${days} 天`; }
function customerHref(state: ListState): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.responsibleSalesId) params.set("responsibleSalesId", state.responsibleSalesId);
  if (state.status) params.set("status", state.status);
  if (state.sort !== "updatedAt") params.set("sort", state.sort);
  if (state.direction !== "desc") params.set("direction", state.direction);
  if (state.page !== 1) params.set("page", String(state.page));
  if (state.pageSize !== 20) params.set("size", String(state.pageSize));
  return `/customers${params.size ? `?${params}` : ""}`;
}
function SortHeading({ field, label, state }: { field: CustomerSortField; label: string; state: ListState }) {
  const active = state.sort === field;
  const direction: Direction = active && state.direction === "asc" ? "desc" : "asc";
  return <th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap"><Link href={customerHref({ ...state, sort: field, direction, page: 1 })} className="inline-flex min-h-8 items-center gap-1 text-[#344054] hover:text-[#1d4ed8]">{label}<span aria-hidden>{active ? (state.direction === "asc" ? "↑" : "↓") : "↕"}</span></Link></th>;
}
function Status({ enabled }: { enabled: boolean }) { return <span className={enabled ? "rounded-md border border-[#a7d9b6] bg-[#ecfdf3] px-2 py-1 text-xs font-semibold text-[#027a48]" : "rounded-md border border-[#edb1b1] bg-[#fff0f0] px-2 py-1 text-xs font-semibold text-[#c62828]"}>{enabled ? "启用" : "停用"}</span>; }

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getPageActor("CUSTOMERS_VIEW");
  const parameters = await searchParams;
  const query = first(parameters.q).trim();
  const responsibleSalesId = first(parameters.responsibleSalesId);
  const statusValue = first(parameters.status);
  const status = ["enabled", "disabled"].includes(statusValue) ? statusValue : "";
  const sortValue = first(parameters.sort) as CustomerSortField;
  const sortFields = new Set<CustomerSortField>(["customerCode", "name", "responsibleSales", "paymentTermDays", "updatedAt"]);
  const sort = sortFields.has(sortValue) ? sortValue : "updatedAt";
  const direction: Direction = first(parameters.direction) === "asc" ? "asc" : "desc";
  const page = positiveInteger(first(parameters.page));
  const requestedSize = positiveInteger(first(parameters.size));
  const pageSize = [20, 50, 100].includes(requestedSize) ? requestedSize : 20;
  const state: ListState = { query, responsibleSalesId, status, sort, direction, page, pageSize };
  const [customerPage, salesOptions] = await Promise.all([
    listCustomersPage(prisma, actor, { query, responsibleSalesId: responsibleSalesId || undefined, enabled: status === "enabled" ? true : status === "disabled" ? false : undefined }, { page, pageSize, sort, direction }),
    listCustomerResponsibleOptions(prisma, actor),
  ]);
  if (page > customerPage.totalPages) redirect(customerHref({ ...state, page: customerPage.totalPages }));

  const permissions = getCustomerPermissions(actor);
  const notice = first(parameters.notice) === "deleted" ? "客户已删除，删除动作已写入业务审计。" : undefined;
  const filtersActive = Boolean(query || responsibleSalesId || status);
  const controlClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15";
  const labelClass = "grid gap-1.5 text-xs font-semibold text-[#475467]";

  return <>
    <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-6 max-md:grid max-md:gap-3.5"><div><h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">客户</h1><p className="mt-1.5 text-[13px] text-[#667085]">按负责人和状态查找客户</p></div>{permissions.canCreate ? <Link href="/customers/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]"><IconPlus aria-hidden size={17} />新建客户</Link> : null}</header>
    {notice ? <div role="status" className="mb-4 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]">{notice}</div> : null}
    <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
      <form method="get" className="grid items-end gap-3 border-b border-[#e4e7ec] p-3.5 md:grid-cols-2 xl:grid-cols-4">
        <label className={labelClass}><span>搜索</span><input name="q" defaultValue={query} placeholder="客户编码或名称" className={controlClass} /></label>
        <label className={labelClass}><span>客户负责人</span><select name="responsibleSalesId" defaultValue={responsibleSalesId} className={controlClass}><option value="">{permissions.hasGlobalReadScope ? "全部负责人" : "我的客户"}</option>{salesOptions.map((option) => <option key={option.id} value={option.id}>{option.name}{option.enabled ? "" : "（已停用）"}</option>)}</select></label>
        <label className={labelClass}><span>启用状态</span><select name="status" defaultValue={status} className={controlClass}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
        <label className={labelClass}><span>每页条数</span><select name="size" defaultValue={String(pageSize)} className={controlClass}><option value="20">20 条</option><option value="50">50 条</option><option value="100">100 条</option></select></label>
        <div className="flex gap-2 md:col-span-2 xl:col-span-4 xl:justify-end"><button type="submit" className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-4 text-[13px] font-semibold text-[#344054]">筛选</button><Link href="/customers" className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-4 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]">清除</Link></div>
      </form>
      {customerPage.items.length === 0 ? <div className="grid min-h-72 place-items-center p-6 text-center"><div><h2 className="text-base font-semibold">{filtersActive ? "当前筛选无结果" : "系统暂无客户"}</h2><p className="mt-2 text-[13px] text-[#667085]">{filtersActive ? "请调整客户编码、名称、负责人或启用状态后重试。" : permissions.canCreate ? "创建第一个客户，为后续销售关系准备基础资料。" : "有权用户创建客户后会显示在这里。"}</p>{filtersActive ? <Link href="/customers" className="mt-4 inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">清除筛选</Link> : permissions.canCreate ? <Link href="/customers/new" className="mt-4 inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white">新建客户</Link> : null}</div></div> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr><SortHeading field="customerCode" label="客户编码" state={state} /><SortHeading field="name" label="客户名称" state={state} /><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold">联系人</th><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold">电话</th><SortHeading field="responsibleSales" label="客户负责人" state={state} /><SortHeading field="paymentTermDays" label="默认账期" state={state} /><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold">未收金额</th><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold">状态</th><th className="border-b border-[#e4e7ec] px-4 py-3"><span className="sr-only">操作</span></th></tr></thead><tbody>{customerPage.items.map((customer) => { const href = `/customers/${customer.id}`; return <CustomerTableRow key={customer.id} href={href}><td className="px-4 py-3 font-mono text-xs"><Link href={href} className="font-semibold text-[#1d4ed8]">{customer.customerCode}</Link></td><td className="px-4 py-3 font-semibold">{customer.name}</td><td className="px-4 py-3">{customer.contactName}</td><td className="px-4 py-3 whitespace-nowrap">{customer.phone}</td><td className="px-4 py-3">{customer.responsibleSales.name}</td><td className="px-4 py-3">{paymentTerm(customer.paymentTermDays)}</td><td className="px-4 py-3 text-[#667085]">—</td><td className="px-4 py-3"><Status enabled={customer.enabled} /></td><td className="px-4 py-3"><Link href={href} className="inline-flex min-h-11 items-center px-2 font-semibold whitespace-nowrap text-[#1d4ed8]">查看详情</Link></td></CustomerTableRow>; })}</tbody></table></div>
        <div className="grid divide-y divide-[#e4e7ec] md:hidden">{customerPage.items.map((customer) => <Link key={customer.id} href={`/customers/${customer.id}`} className="block hover:bg-[#fafbfc]"><article className="grid gap-3 p-4 text-[13px]"><div className="flex items-start justify-between gap-3"><div><span className="font-mono text-xs font-semibold text-[#1d4ed8]">{customer.customerCode}</span><h2 className="mt-1 font-semibold">{customer.name}</h2></div><Status enabled={customer.enabled} /></div><p className="text-[#667085]">{customer.contactName} · {customer.phone}</p><dl className="grid grid-cols-3 gap-2 rounded-lg bg-[#f7f9fb] p-3"><div><dt className="text-xs text-[#667085]">负责人</dt><dd className="mt-1 font-semibold">{customer.responsibleSales.name}</dd></div><div><dt className="text-xs text-[#667085]">账期</dt><dd className="mt-1 font-semibold">{paymentTerm(customer.paymentTermDays)}</dd></div><div><dt className="text-xs text-[#667085]">未收金额</dt><dd className="mt-1 font-semibold text-[#98a2b3]">—</dd></div></dl></article></Link>)}</div>
      </>}
      {customerPage.total > 0 ? <footer className="flex items-center justify-between gap-3 border-t border-[#e4e7ec] px-4 py-3 text-[13px] text-[#667085]"><span>共 {customerPage.total} 条 · 第 {customerPage.page}/{customerPage.totalPages} 页</span><div className="flex gap-2">{page > 1 ? <Link href={customerHref({ ...state, page: page - 1 })} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">上一页</Link> : null}{page < customerPage.totalPages ? <Link href={customerHref({ ...state, page: page + 1 })} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">下一页</Link> : null}</div></footer> : null}
    </section>
  </>;
}
