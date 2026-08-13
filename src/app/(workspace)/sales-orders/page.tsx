import { IconPlus } from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listSalesOrderResponsibleOptions,
  listSalesOrdersPage,
  type SalesOrderFilters,
} from "@/application/sales-orders/sales-order-service";
import { SalesOrderFilters as SalesOrderFilterPanel } from "@/components/sales-order-filters";
import { SalesOrderRecordActions } from "@/components/sales-order-record-actions";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "销售单" };

type ListState = {
  query: string;
  status: string;
  responsibleSalesId: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
};

const statusLabels = {
  DRAFT: "草稿",
  CONFIRMED: "已确认",
  OUTBOUND: "已出库",
  CANCELLED: "已取消",
} as const;
const validStatuses = new Set<keyof typeof statusLabels>(Object.keys(statusLabels) as Array<keyof typeof statusLabels>);

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
function positiveInteger(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
function dateBoundary(value: string, boundary: "start" | "end"): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const calendar = new Date(Date.UTC(year!, month! - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month! - 1 || calendar.getUTCDate() !== day) return undefined;
  return new Date(`${value}${boundary === "start" ? "T00:00:00.000+08:00" : "T23:59:59.999+08:00"}`);
}
function salesOrderHref(state: ListState, targetPage = state.page): string {
  const parameters = new URLSearchParams();
  if (state.query) parameters.set("q", state.query);
  if (state.status) parameters.set("status", state.status);
  if (state.responsibleSalesId) parameters.set("responsibleSalesId", state.responsibleSalesId);
  if (state.from) parameters.set("from", state.from);
  if (state.to) parameters.set("to", state.to);
  if (targetPage > 1) parameters.set("page", String(targetPage));
  if (state.pageSize !== 20) parameters.set("size", String(state.pageSize));
  return `/sales-orders${parameters.size ? `?${parameters}` : ""}`;
}
function formatMoney(fen: number): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(fen / 100);
}
function formatDate(date: Date, withTime = false): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}
function Status({ status }: { status: keyof typeof statusLabels }) {
  const tone = status === "DRAFT" ? "border-[#d0d5dd] bg-[#f2f4f7] text-[#475467]" : status === "CONFIRMED" ? "border-[#a7d9b6] bg-[#ecfdf3] text-[#027a48]" : status === "CANCELLED" ? "border-[#edb1b1] bg-[#fff0f0] text-[#c62828]" : "border-[#a8c7fa] bg-[#eff6ff] text-[#175cd3]";
  return <span className={`inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-semibold ${tone}`}>{statusLabels[status]}</span>;
}

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("SALES_ORDERS_VIEW");
  const parameters = await searchParams;
  const statusValue = first(parameters.status) as keyof typeof statusLabels;
  const requestedSize = positiveInteger(first(parameters.size));
  const state: ListState = {
    query: first(parameters.q).trim(),
    status: validStatuses.has(statusValue) ? statusValue : "",
    responsibleSalesId: first(parameters.responsibleSalesId),
    from: first(parameters.from),
    to: first(parameters.to),
    page: positiveInteger(first(parameters.page)),
    pageSize: [20, 50, 100].includes(requestedSize) ? requestedSize : 20,
  };
  const createdFrom = dateBoundary(state.from, "start");
  const createdTo = dateBoundary(state.to, "end");
  const dateError =
    (state.from && !createdFrom) || (state.to && !createdTo)
      ? "请输入真实有效的日期。"
      : createdFrom && createdTo && createdFrom > createdTo
        ? "开始日期不能晚于结束日期。"
        : undefined;
  const filters: SalesOrderFilters = {
    query: state.query,
    status: state.status ? (state.status as keyof typeof statusLabels) : undefined,
    responsibleSalesId: state.responsibleSalesId || undefined,
    createdFrom,
    createdTo,
  };
  const [orderPage, responsibleOptions] = await Promise.all([
    dateError
      ? Promise.resolve({ items: [], page: 1, pageSize: state.pageSize, total: 0, totalPages: 1 })
      : listSalesOrdersPage(prisma, actor, filters, { page: state.page, pageSize: state.pageSize }),
    listSalesOrderResponsibleOptions(prisma, actor),
  ]);
  if (state.page > orderPage.totalPages) redirect(salesOrderHref(state, orderPage.totalPages));

  const notice = first(parameters.notice) === "deleted" ? "销售单草稿已删除，删除动作已写入业务审计。" : undefined;
  const filtersActive = Boolean(state.query || state.status || state.responsibleSalesId || state.from || state.to);
  const canFilterResponsible = actor.roles.includes("OWNER");
  return (
    <>
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-6 max-md:grid max-md:gap-3.5">
        <div><h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">销售单</h1><p className="mt-1.5 text-[13px] text-[#667085]">查找销售单并判断当前履约状态和下一步动作</p></div>
        <Link href="/sales-orders/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]"><IconPlus aria-hidden size={17} />新建销售单</Link>
      </header>
      {notice ? <div role="status" className="mb-4 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]">{notice}</div> : null}
      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <SalesOrderFilterPanel state={state} responsibleOptions={responsibleOptions} canFilterResponsible={canFilterResponsible} dateError={dateError} />

        {orderPage.items.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-6 text-center"><div><h2 className="text-base font-semibold">{dateError ? "日期筛选无效" : filtersActive ? "当前筛选无结果" : "系统暂无销售单"}</h2><p className="mt-2 text-[13px] leading-6 text-[#667085]">{dateError ? "请修正创建日期范围后重试。" : filtersActive ? "请调整编号、客户、负责人、履约状态或日期后重试。" : "销售单会连接客户、库存与后续应收；现在可以创建第一张草稿。"}</p>{filtersActive ? <Link href="/sales-orders" className="mt-4 inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">清除筛选</Link> : <Link href="/sales-orders/new" className="mt-4 inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white">新建销售单</Link>}</div></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1080px] border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr>{["销售单编号", "客户", "创建日期", "客户负责人", "明细数", "成交金额", "履约状态", "更新时间", "操作"].map((heading) => <th key={heading} className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">{heading}</th>)}</tr></thead><tbody>{orderPage.items.map((order) => <tr key={order.id} className="border-b border-[#eef0f3] last:border-b-0"><td className="px-4 py-3 font-mono text-xs font-semibold">{order.canEdit ? <Link href={`/sales-orders/${order.id}/edit`} className="text-[#1d4ed8]">{order.salesOrderNumber}</Link> : order.salesOrderNumber}</td><td className="px-4 py-3 font-semibold">{order.customerName}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(order.createdAt)}</td><td className="px-4 py-3">{order.responsibleSalesName}</td><td className="px-4 py-3 text-right tabular-nums">{order.itemCount}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(order.totalAmountFen)}</td><td className="px-4 py-3"><Status status={order.status} /></td><td className="px-4 py-3 whitespace-nowrap text-[#667085]">{formatDate(order.updatedAt, true)}</td><td className="px-4 py-2"><div className="flex items-center gap-1">{order.canEdit ? <Link href={`/sales-orders/${order.id}/edit`} className="inline-flex min-h-11 items-center px-2 font-semibold text-[#1d4ed8]">编辑</Link> : null}{order.canDelete ? <SalesOrderRecordActions salesOrder={order} /> : null}{!order.canEdit && !order.canDelete ? <span className="text-[#98a2b3]">—</span> : null}</div></td></tr>)}</tbody></table></div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">{orderPage.items.map((order) => <article key={order.id} className="grid gap-3 p-4 text-[13px]"><div className="flex items-start justify-between gap-3"><div><span className="font-mono text-xs font-semibold text-[#1d4ed8]">{order.salesOrderNumber}</span><h2 className="mt-1 font-semibold">{order.customerName}</h2></div><Status status={order.status} /></div><dl className="grid grid-cols-3 gap-2 rounded-lg bg-[#f7f9fb] p-3"><div><dt className="text-xs text-[#667085]">负责人</dt><dd className="mt-1 font-semibold">{order.responsibleSalesName}</dd></div><div><dt className="text-xs text-[#667085]">明细</dt><dd className="mt-1 font-semibold">{order.itemCount} 行</dd></div><div><dt className="text-xs text-[#667085]">成交金额</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(order.totalAmountFen)}</dd></div></dl>{order.canEdit || order.canDelete ? <div className="flex justify-end gap-1">{order.canEdit ? <Link href={`/sales-orders/${order.id}/edit`} className="inline-flex min-h-11 items-center px-3 font-semibold text-[#1d4ed8]">编辑</Link> : null}{order.canDelete ? <SalesOrderRecordActions salesOrder={order} /> : null}</div> : null}</article>)}</div>
          </>
        )}
        {orderPage.total > 0 ? <footer className="flex items-center justify-between gap-3 border-t border-[#e4e7ec] px-4 py-3 text-[13px] text-[#667085]"><span>共 {orderPage.total} 张 · 第 {orderPage.page}/{orderPage.totalPages} 页</span><div className="flex gap-2">{state.page > 1 ? <Link href={salesOrderHref(state, state.page - 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">上一页</Link> : null}{state.page < orderPage.totalPages ? <Link href={salesOrderHref(state, state.page + 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">下一页</Link> : null}</div></footer> : null}
      </section>
    </>
  );
}
