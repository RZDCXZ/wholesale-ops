"use client";

import { IconFilter, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { keepFocusInDialog } from "@/lib/dialog-focus";

type FilterState = {
  query: string;
  status: string;
  responsibleSalesId: string;
  from: string;
  to: string;
  pageSize: number;
};

const statusOptions = [
  { value: "DRAFT", label: "草稿" },
  { value: "CONFIRMED", label: "已确认" },
  { value: "OUTBOUND", label: "已出库" },
  { value: "CANCELLED", label: "已取消" },
] as const;
const labelClass = "grid gap-1.5 text-xs font-semibold text-[#475467]";
const controlClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15";

function FilterFields({
  state,
  responsibleOptions,
  canFilterResponsible,
  dateError,
  idPrefix,
}: {
  state: FilterState;
  responsibleOptions: Array<{ id: string; name: string }>;
  canFilterResponsible: boolean;
  dateError?: string;
  idPrefix: string;
}) {
  const dateErrorId = `${idPrefix}-date-error`;
  return (
    <>
      <label className={`${labelClass} xl:col-span-2`}><span>销售单编号或客户</span><input name="q" defaultValue={state.query} placeholder="编号或客户名称" className={controlClass} /></label>
      <label className={labelClass}><span>履约状态</span><select name="status" defaultValue={state.status} className={controlClass}><option value="">全部状态</option>{statusOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
      {canFilterResponsible ? <label className={labelClass}><span>客户负责人</span><select name="responsibleSalesId" defaultValue={state.responsibleSalesId} className={controlClass}><option value="">全部负责人</option>{responsibleOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label> : null}
      <label className={labelClass}><span>开始日期</span><input type="date" name="from" defaultValue={state.from} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? dateErrorId : undefined} className={controlClass} /></label>
      <label className={labelClass}><span>结束日期</span><input type="date" name="to" defaultValue={state.to} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? dateErrorId : undefined} className={controlClass} /></label>
      <label className={labelClass}><span>每页条数</span><select name="size" defaultValue={String(state.pageSize)} className={controlClass}><option value="20">20 条</option><option value="50">50 条</option><option value="100">100 条</option></select></label>
      {dateError ? <p id={dateErrorId} role="alert" className="col-span-full rounded-[7px] border border-[#edb1b1] bg-[#fff0f0] px-3 py-2 text-[13px] text-[#c62828]">{dateError}</p> : null}
    </>
  );
}

export function SalesOrderFilters({
  state,
  responsibleOptions,
  canFilterResponsible,
  dateError,
}: {
  state: FilterState;
  responsibleOptions: Array<{ id: string; name: string }>;
  canFilterResponsible: boolean;
  dateError?: string;
}) {
  const [open, setOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const hasOpened = useRef(false);

  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      closeButton.current?.focus();
    } else if (hasOpened.current) {
      openButton.current?.focus();
    }
  }, [open]);

  const activeConditions = [
    state.query ? `搜索：${state.query}` : undefined,
    state.status ? `履约状态：${statusOptions.find(({ value }) => value === state.status)?.label ?? state.status}` : undefined,
    state.responsibleSalesId ? `客户负责人：${responsibleOptions.find(({ id }) => id === state.responsibleSalesId)?.name ?? "已选择"}` : undefined,
    state.from ? `开始：${state.from}` : undefined,
    state.to ? `结束：${state.to}` : undefined,
  ].filter((condition): condition is string => Boolean(condition));

  return (
    <>
      <form method="get" className="hidden items-end gap-3 border-b border-[#e4e7ec] p-3.5 md:grid md:grid-cols-2 xl:grid-cols-6">
        <FilterFields state={state} responsibleOptions={responsibleOptions} canFilterResponsible={canFilterResponsible} dateError={dateError} idPrefix="sales-order-desktop-filter" />
        <div className="flex gap-2 md:col-span-2 xl:col-span-full xl:justify-end"><button type="submit" className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-4 text-[13px] font-semibold text-[#344054]">筛选</button><Link href="/sales-orders" className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-4 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]">清除</Link></div>
      </form>

      <div className="grid gap-3 border-b border-[#e4e7ec] p-3.5 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <button ref={openButton} type="button" aria-label="打开销售单筛选" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]"><IconFilter aria-hidden size={18} />筛选</button>
          {activeConditions.length > 0 ? <Link href="/sales-orders" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[#475467]">清除全部</Link> : <span className="text-xs text-[#667085]">暂无筛选条件</span>}
        </div>
        {activeConditions.length > 0 ? <div aria-label="已启用筛选条件" className="flex flex-wrap gap-2">{activeConditions.map((condition) => <span key={condition} className="rounded-full border border-[#a8c7fa] bg-[#eff6ff] px-2.5 py-1 text-xs font-semibold text-[#175cd3]">{condition}</span>)}</div> : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <section role="dialog" aria-modal="true" aria-label="筛选销售单" onKeyDown={(event) => keepFocusInDialog(event, () => setOpen(false))} className="flex h-full flex-col">
            <header className="flex min-h-[64px] items-center justify-between border-b border-[#e4e7ec] px-4"><h2 className="text-lg font-bold">筛选销售单</h2><button ref={closeButton} type="button" aria-label="关闭筛选" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-lg hover:bg-[#f2f4f7]"><IconX aria-hidden size={20} /></button></header>
            <form method="get" className="flex min-h-0 flex-1 flex-col">
              <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4"><FilterFields state={state} responsibleOptions={responsibleOptions} canFilterResponsible={canFilterResponsible} dateError={dateError} idPrefix="sales-order-mobile-filter" /></div>
              <footer className="flex gap-2 border-t border-[#e4e7ec] p-4"><Link href="/sales-orders" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#475467]">清除</Link><button type="submit" className="min-h-11 flex-1 rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white">应用筛选</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
