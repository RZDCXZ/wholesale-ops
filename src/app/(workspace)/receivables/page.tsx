import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listCustomerResponsibleOptions } from "@/application/customers/customer-service";
import {
  listReceivablesPage,
  type ReceivableListItem,
} from "@/application/receivables/receivable-service";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format-money";
import { receivableStatusConfig } from "@/lib/receivable-display";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "应收" };

type ListState = {
  query: string;
  customerId: string;
  responsibleSalesId: string;
  status: string;
  overdueOnly: boolean;
  dueFrom: string;
  dueTo: string;
  page: number;
  pageSize: number;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function calendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
    ? date
    : undefined;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function receivablesHref(state: ListState, targetPage = state.page): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.customerId) params.set("customerId", state.customerId);
  if (state.responsibleSalesId) params.set("responsibleSalesId", state.responsibleSalesId);
  if (state.status) params.set("status", state.status);
  if (state.overdueOnly) params.set("overdue", "1");
  if (state.dueFrom) params.set("from", state.dueFrom);
  if (state.dueTo) params.set("to", state.dueTo);
  if (targetPage > 1) params.set("page", String(targetPage));
  if (state.pageSize !== 20) params.set("size", String(state.pageSize));
  return `/receivables${params.size ? `?${params}` : ""}`;
}

function SettlementStatus({ status }: Pick<ReceivableListItem, "status">) {
  const config = receivableStatusConfig[status];
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold whitespace-nowrap ${config.tone}`}>
      {config.label}
    </span>
  );
}

function OverdueStatus({ item }: { item: ReceivableListItem }) {
  return item.overdue ? (
    <span className="inline-flex rounded-md border border-[#edb1b1] bg-[#fff0f0] px-2 py-1 text-xs font-semibold whitespace-nowrap text-[#c62828]">
      逾期 {item.overdueDays} 天
    </span>
  ) : (
    <span className="text-xs text-[#98a2b3]">—</span>
  );
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("RECEIVABLES_VIEW");
  const parameters = await searchParams;
  const statusValue = first(parameters.status);
  const dueFromValue = first(parameters.from);
  const dueToValue = first(parameters.to);
  const dueFrom = dueFromValue ? calendarDate(dueFromValue) : undefined;
  const dueTo = dueToValue ? calendarDate(dueToValue) : undefined;
  const dateError =
    (dueFromValue && !dueFrom) || (dueToValue && !dueTo)
      ? "请输入真实有效的到期日期。"
      : dueFrom && dueTo && dueFrom > dueTo
        ? "开始日期不能晚于结束日期。"
        : undefined;
  const requestedSize = positiveInteger(first(parameters.size));
  const state: ListState = {
    query: first(parameters.q).trim(),
    customerId: first(parameters.customerId),
    responsibleSalesId: first(parameters.responsibleSalesId),
    status: ["PENDING", "PARTIAL", "SETTLED"].includes(statusValue)
      ? statusValue
      : "",
    overdueOnly: first(parameters.overdue) === "1",
    dueFrom: dueFromValue,
    dueTo: dueToValue,
    page: positiveInteger(first(parameters.page)),
    pageSize: [20, 50, 100].includes(requestedSize) ? requestedSize : 20,
  };
  const [receivablePage, salesOptions] = await Promise.all([
    dateError
      ? Promise.resolve({ items: [], page: 1, pageSize: state.pageSize, total: 0, totalPages: 1 })
      : listReceivablesPage(
          prisma,
          actor,
          {
            query: state.query,
            customerId: state.customerId || undefined,
            responsibleSalesId: state.responsibleSalesId || undefined,
            status: state.status
              ? (state.status as "PENDING" | "PARTIAL" | "SETTLED")
              : undefined,
            overdueOnly: state.overdueOnly,
            dueFrom,
            dueTo,
          },
          { page: state.page, pageSize: state.pageSize },
        ),
    listCustomerResponsibleOptions(prisma, actor),
  ]);
  if (state.page > receivablePage.totalPages) {
    redirect(receivablesHref(state, receivablePage.totalPages));
  }

  const filtersActive = Boolean(
    state.query ||
      state.customerId ||
      state.responsibleSalesId ||
      state.status ||
      state.overdueOnly ||
      state.dueFrom ||
      state.dueTo,
  );
  const controlClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15";
  const labelClass = "grid gap-1.5 text-xs font-semibold text-[#475467]";

  return (
    <>
      <header className="mb-[18px] min-h-[58px]">
        <h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">应收</h1>
        <p className="mt-1.5 text-[13px] text-[#667085]">识别待收款、部分收款、已结清和逾期应收</p>
      </header>

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form method="get" className="grid items-end gap-3 border-b border-[#e4e7ec] p-3.5 md:grid-cols-2 xl:grid-cols-4">
          {state.customerId ? <input type="hidden" name="customerId" value={state.customerId} /> : null}
          <label className={labelClass}>
            <span>搜索</span>
            <input name="q" defaultValue={state.query} placeholder="应收编号、销售单编号或客户" className={controlClass} />
          </label>
          <label className={labelClass}>
            <span>结算状态</span>
            <select name="status" defaultValue={state.status} className={controlClass}>
              <option value="">全部状态</option>
              <option value="PENDING">待收款</option>
              <option value="PARTIAL">部分收款</option>
              <option value="SETTLED">已结清</option>
            </select>
          </label>
          <label className={labelClass}>
            <span>客户负责人</span>
            <select name="responsibleSalesId" defaultValue={state.responsibleSalesId} className={controlClass}>
              <option value="">全部负责人</option>
              {salesOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}{option.enabled ? "" : "（已停用）"}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span>每页条数</span>
            <select name="size" defaultValue={String(state.pageSize)} className={controlClass}>
              <option value="20">20 条</option>
              <option value="50">50 条</option>
              <option value="100">100 条</option>
            </select>
          </label>
          <label className={labelClass}>
            <span>到期日开始</span>
            <input type="date" name="from" defaultValue={state.dueFrom} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "receivable-date-error" : undefined} className={controlClass} />
          </label>
          <label className={labelClass}>
            <span>到期日结束</span>
            <input type="date" name="to" defaultValue={state.dueTo} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "receivable-date-error" : undefined} className={controlClass} />
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-3 text-[13px] font-semibold text-[#475467]">
            <input type="checkbox" name="overdue" value="1" defaultChecked={state.overdueOnly} className="size-4 accent-[#2563eb]" />
            仅看逾期
          </label>
          <div className="flex gap-2 xl:justify-end">
            <button type="submit" className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-4 text-[13px] font-semibold text-[#344054]">筛选</button>
            <Link href="/receivables" className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-4 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]">清除</Link>
          </div>
          {dateError ? <p id="receivable-date-error" role="alert" className="text-xs font-semibold text-[#c62828] md:col-span-2 xl:col-span-4">{dateError}</p> : null}
        </form>

        {receivablePage.items.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-6 text-center">
            <div>
              <h2 className="text-base font-semibold">{dateError ? "到期日期无效" : filtersActive ? "当前筛选无结果" : "系统暂无应收"}</h2>
              <p className="mt-2 text-[13px] leading-6 text-[#667085]">{dateError ? "请修正到期日期后重试。" : filtersActive ? "请调整编号、客户、结算状态、逾期或到期日条件后重试。" : "销售单完成整单出库后，会自动生成一笔经营应收。"}</p>
              {filtersActive || dateError ? <Link href="/receivables" className="mt-4 inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">清除筛选</Link> : null}
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1320px] border-collapse text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[#475467]"><tr>{["应收编号", "客户", "销售单编号", "原始金额", "累计收款", "未收金额", "到期日", "结算状态", "逾期状态", "操作"].map((heading) => <th key={heading} className={`border-b border-[#e4e7ec] px-4 py-3 font-semibold ${["原始金额", "累计收款", "未收金额"].includes(heading) ? "text-right" : ""}`}>{heading}</th>)}</tr></thead>
                <tbody>{receivablePage.items.map((item) => {
                  const href = `/receivables/${encodeURIComponent(item.id)}`;
                  return <tr key={item.id} className="border-b border-[#eef0f3] last:border-b-0 hover:bg-[#fafbfc]"><td className="px-4 py-3"><Link href={href} className="font-mono text-xs font-semibold whitespace-nowrap text-[#1d4ed8]">{item.receivableNumber}</Link></td><td className="px-4 py-3"><strong className="block font-semibold">{item.customerName}</strong><span className="mt-1 block text-xs text-[#667085]">{item.customerCode} · {item.responsibleSalesName}</span></td><td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{item.salesOrderNumber}</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(item.originalAmountFen)}</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(item.receivedAmountFen)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(item.remainingAmountFen)}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(item.dueDate)}</td><td className="px-4 py-3"><SettlementStatus status={item.status} /></td><td className="px-4 py-3"><OverdueStatus item={item} /></td><td className="px-4 py-3"><Link href={href} className="inline-flex min-h-11 items-center px-2 font-semibold whitespace-nowrap text-[#1d4ed8]">查看详情</Link></td></tr>;
                })}</tbody>
              </table>
            </div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">
              {receivablePage.items.map((item) => <Link key={item.id} href={`/receivables/${encodeURIComponent(item.id)}`} className="block hover:bg-[#fafbfc]"><article className="grid gap-3 p-4 text-[13px]"><div className="flex items-start justify-between gap-3"><div><span className="font-mono text-xs font-semibold text-[#1d4ed8]">{item.receivableNumber}</span><h2 className="mt-1 font-semibold">{item.customerName}</h2><p className="mt-1 text-xs text-[#667085]">{item.salesOrderNumber}</p></div><div className="grid justify-items-end gap-1"><SettlementStatus status={item.status} /><OverdueStatus item={item} /></div></div><dl className="grid grid-cols-3 gap-2 rounded-lg bg-[#f7f9fb] p-3"><div><dt className="text-xs text-[#667085]">原始金额</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(item.originalAmountFen)}</dd></div><div><dt className="text-xs text-[#667085]">累计收款</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(item.receivedAmountFen)}</dd></div><div><dt className="text-xs text-[#667085]">未收金额</dt><dd className="mt-1 font-semibold tabular-nums text-[#1d4ed8]">{formatMoney(item.remainingAmountFen)}</dd></div></dl><p className="text-xs text-[#667085]">到期日 {formatDate(item.dueDate)} · 客户负责人 {item.responsibleSalesName}</p></article></Link>)}
            </div>
          </>
        )}

        {receivablePage.total > 0 ? <footer className="flex items-center justify-between gap-3 border-t border-[#e4e7ec] px-4 py-3 text-[13px] text-[#667085]"><span>共 {receivablePage.total} 条 · 第 {receivablePage.page}/{receivablePage.totalPages} 页</span><div className="flex gap-2">{state.page > 1 ? <Link href={receivablesHref(state, state.page - 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">上一页</Link> : null}{state.page < receivablePage.totalPages ? <Link href={receivablesHref(state, state.page + 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">下一页</Link> : null}</div></footer> : null}
      </section>
    </>
  );
}
