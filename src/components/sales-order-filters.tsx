"use client";

import { IconFilter, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { keepFocusInDialog } from "@/lib/dialog-focus";

type FilterState = {
  query: string;
  status: string;
  responsibleSalesId: string;
  from: string;
  to: string;
  outboundOn: string;
  pageSize: number;
};

const statusOptions = [
  { value: "DRAFT", label: "草稿" },
  { value: "CONFIRMED", label: "已确认" },
  { value: "OUTBOUND", label: "已出库" },
  { value: "CANCELLED", label: "已取消" },
] as const;
const labelClass = "text-xs font-semibold text-[#475467]";

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
      {state.outboundOn ? (
        <input type="hidden" name="outboundOn" value={state.outboundOn} />
      ) : null}
      <Field className="xl:col-span-2"><FieldLabel htmlFor={`${idPrefix}-query`} className={labelClass}>销售单编号或客户</FieldLabel><Input id={`${idPrefix}-query`} name="q" defaultValue={state.query} placeholder="编号或客户名称" /></Field>
      <Field><FieldLabel htmlFor={`${idPrefix}-status`} className={labelClass}>履约状态</FieldLabel><FormSelect id={`${idPrefix}-status`} name="status" defaultValue={state.status} options={[{ value: "", label: "全部状态" }, ...statusOptions]} /></Field>
      {canFilterResponsible ? <Field><FieldLabel htmlFor={`${idPrefix}-responsible`} className={labelClass}>客户负责人</FieldLabel><FormSelect id={`${idPrefix}-responsible`} name="responsibleSalesId" defaultValue={state.responsibleSalesId} options={[{ value: "", label: "全部负责人" }, ...responsibleOptions.map((option) => ({ value: option.id, label: option.name }))]} /></Field> : null}
      <Field data-invalid={Boolean(dateError)}><FieldLabel htmlFor={`${idPrefix}-from`} className={labelClass}>开始日期</FieldLabel><DatePicker id={`${idPrefix}-from`} name="from" value={state.from} invalid={Boolean(dateError)} describedBy={dateError ? dateErrorId : undefined} /></Field>
      <Field data-invalid={Boolean(dateError)}><FieldLabel htmlFor={`${idPrefix}-to`} className={labelClass}>结束日期</FieldLabel><DatePicker id={`${idPrefix}-to`} name="to" value={state.to} invalid={Boolean(dateError)} describedBy={dateError ? dateErrorId : undefined} /></Field>
      <Field><FieldLabel htmlFor={`${idPrefix}-size`} className={labelClass}>每页条数</FieldLabel><FormSelect id={`${idPrefix}-size`} name="size" defaultValue={String(state.pageSize)} options={[{ value: "20", label: "20 条" }, { value: "50", label: "50 条" }, { value: "100", label: "100 条" }]} /></Field>
      {dateError ? <p id={dateErrorId} role="alert" className="col-span-full rounded-[7px] border border-[#edb1b1] bg-[#fff0f0] px-3 py-2 text-[13px] text-[#c62828]">{dateError}</p> : null}
    </>
  );
}

export function SalesOrderFilters({
  state,
  responsibleOptions,
  canFilterResponsible,
  dateError,
  exportHref,
  exportDisabled,
  exportDisabledMessage,
}: {
  state: FilterState;
  responsibleOptions: Array<{ id: string; name: string }>;
  canFilterResponsible: boolean;
  dateError?: string;
  exportHref: string;
  exportDisabled: boolean;
  exportDisabledMessage: string;
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
    state.outboundOn ? `出库日：${state.outboundOn}` : undefined,
  ].filter((condition): condition is string => Boolean(condition));
  const filterKey = [state.query, state.status, state.responsibleSalesId, state.from, state.to, state.outboundOn, state.pageSize].join("|");

  return (
    <>
      <form key={`desktop-${filterKey}`} method="get" className="hidden items-end gap-3 border-b border-[#e4e7ec] p-3.5 md:grid md:grid-cols-2 xl:grid-cols-6">
        <FilterFields state={state} responsibleOptions={responsibleOptions} canFilterResponsible={canFilterResponsible} dateError={dateError} idPrefix="sales-order-desktop-filter" />
        <div className="flex items-start justify-between gap-3 md:col-span-2 xl:col-span-full"><ExportButton key={exportHref} href={exportHref} entityLabel="销售单" disabled={exportDisabled} disabledMessage={exportDisabledMessage} /><div className="flex gap-2"><Button type="submit">筛选</Button><Button render={<Link href="/sales-orders" />} nativeButton={false} variant="ghost">清除</Button></div></div>
      </form>

      <div className="grid gap-3 border-b border-[#e4e7ec] p-3.5 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <button ref={openButton} type="button" aria-label="打开销售单筛选" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]"><IconFilter aria-hidden size={18} />筛选</button>
          {activeConditions.length > 0 ? <Link href="/sales-orders" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[#475467]">清除全部</Link> : <span className="text-xs text-[#667085]">暂无筛选条件</span>}
        </div>
        {activeConditions.length > 0 ? <div aria-label="已启用筛选条件" className="flex flex-wrap gap-2">{activeConditions.map((condition) => <span key={condition} className="rounded-full border border-[#a8c7fa] bg-[#eff6ff] px-2.5 py-1 text-xs font-semibold text-[#175cd3]">{condition}</span>)}</div> : null}
        <ExportButton key={exportHref} href={exportHref} entityLabel="销售单" disabled={exportDisabled} disabledMessage={exportDisabledMessage} />
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-white md:hidden">
          <section role="dialog" aria-modal="true" aria-label="筛选销售单" onKeyDown={(event) => keepFocusInDialog(event, () => setOpen(false))} className="flex h-full flex-col">
            <header className="flex min-h-[64px] items-center justify-between border-b border-[#e4e7ec] px-4"><h2 className="text-lg font-bold">筛选销售单</h2><button ref={closeButton} type="button" aria-label="关闭筛选" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-lg hover:bg-[#f2f4f7]"><IconX aria-hidden size={20} /></button></header>
            <form key={`mobile-${filterKey}`} method="get" className="flex min-h-0 flex-1 flex-col">
              <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4"><FilterFields state={state} responsibleOptions={responsibleOptions} canFilterResponsible={canFilterResponsible} dateError={dateError} idPrefix="sales-order-mobile-filter" /></div>
              <footer className="flex gap-2 border-t border-[#e4e7ec] p-4"><Button render={<Link href="/sales-orders" onClick={() => setOpen(false)} />} nativeButton={false} className="flex-1">清除</Button><Button type="submit" variant="primary" className="flex-1">应用筛选</Button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
