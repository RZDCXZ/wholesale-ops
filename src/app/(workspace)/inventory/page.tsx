import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listInventoryPage,
  type InventorySortField,
} from "@/application/inventory/inventory-service";
import { prisma } from "@/lib/db";
import { formatQuantity } from "@/lib/format-quantity";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "库存" };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

type Direction = "asc" | "desc";
type ListState = {
  query: string;
  category: string;
  status: string;
  warning: boolean;
  sort: InventorySortField;
  direction: Direction;
  page: number;
  pageSize: number;
};

const sortFields = new Set<InventorySortField>([
  "skuCode",
  "name",
  "inventoryUnit",
  "onHandQuantity",
  "reservedQuantity",
  "warningThreshold",
  "lastChangedAt",
]);

function positiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function inventoryHref(state: ListState): string {
  const parameters = new URLSearchParams();
  if (state.query) parameters.set("q", state.query);
  if (state.category) parameters.set("category", state.category);
  if (state.status) parameters.set("status", state.status);
  if (state.warning) parameters.set("warning", "1");
  if (state.sort !== "skuCode") parameters.set("sort", state.sort);
  if (state.direction !== "asc") parameters.set("direction", state.direction);
  if (state.page > 1) parameters.set("page", String(state.page));
  if (state.pageSize !== 20) parameters.set("size", String(state.pageSize));
  const queryString = parameters.toString();
  return queryString ? `/inventory?${queryString}` : "/inventory";
}

function SortHeading({
  field,
  label,
  state,
}: {
  field: InventorySortField;
  label: string;
  state: ListState;
}) {
  const active = state.sort === field;
  const direction = active && state.direction === "asc" ? "desc" : "asc";
  return <th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap"><Link href={inventoryHref({ ...state, sort: field, direction, page: 1 })} className="inline-flex min-h-8 items-center gap-1 text-[#344054] hover:text-[#1d4ed8]">{label}<span aria-hidden>{active ? (state.direction === "asc" ? "↑" : "↓") : "↕"}</span></Link></th>;
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function InventoryStatus({
  enabled,
  warning,
}: {
  enabled: boolean;
  warning: boolean;
}) {
  if (!enabled) {
    return <span className="inline-flex min-h-6 items-center rounded-md border border-[#d0d5dd] bg-[#f2f4f7] px-2 text-xs font-semibold text-[#667085]">已停用</span>;
  }
  return warning ? (
    <span className="inline-flex min-h-6 items-center rounded-md border border-[#f2c879] bg-[#fffaeb] px-2 text-xs font-semibold text-[#b54708]">库存预警</span>
  ) : (
    <span className="inline-flex min-h-6 items-center rounded-md border border-[#a7d9b6] bg-[#ecfdf3] px-2 text-xs font-semibold text-[#027a48]">正常</span>
  );
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, parameters] = await Promise.all([
    getPageActor("INVENTORY_VIEW"),
    searchParams,
  ]);
  const query = first(parameters.q).trim();
  const category = first(parameters.category).trim();
  const statusValue = first(parameters.status);
  const enabled =
    statusValue === "enabled"
      ? true
      : statusValue === "disabled"
        ? false
        : undefined;
  const inventoryWarning = first(parameters.warning) === "1";
  const sortValue = first(parameters.sort) as InventorySortField;
  const sort = sortFields.has(sortValue) ? sortValue : "skuCode";
  const direction: Direction = first(parameters.direction) === "desc" ? "desc" : "asc";
  const page = positiveInteger(first(parameters.page));
  const requestedPageSize = positiveInteger(first(parameters.size));
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const listState: ListState = { query, category, status: statusValue, warning: inventoryWarning, sort, direction, page, pageSize };
  const inventoryPage = await listInventoryPage(
    prisma,
    actor,
    { query, category, enabled, inventoryWarning },
    { page, pageSize, sort, direction },
  );
  if (page > inventoryPage.totalPages) {
    redirect(inventoryHref({ ...listState, page: inventoryPage.totalPages }));
  }
  const items = inventoryPage.items;
  const filtersActive = Boolean(query || category || statusValue || inventoryWarning);
  const pageHref = (targetPage: number) => inventoryHref({ ...listState, page: targetPage });
  const controlClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15";

  return (
    <>
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid">
        <div><h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">库存</h1><p className="mt-1.5 text-[13px] text-[#667085]">默认仓库 · 可用量 = 现存量 - 预占量</p></div>
        <Link href="/inventory/ledger" className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]">查看库存流水</Link>
      </header>

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form method="get" className="grid items-end gap-3 border-b border-[#e4e7ec] p-3.5 md:grid-cols-2 xl:grid-cols-4">
          {sort !== "skuCode" ? <input type="hidden" name="sort" value={sort} /> : null}
          {direction !== "asc" ? <input type="hidden" name="direction" value={direction} /> : null}
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>搜索</span><input name="q" defaultValue={query} placeholder="SKU 编码或名称" className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>分类</span><input name="category" defaultValue={category} placeholder="例如：紧固件" className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>启用状态</span><select name="status" defaultValue={statusValue} className={controlClass}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
          <label className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-3 text-[13px] font-semibold text-[#344054]"><input type="checkbox" name="warning" value="1" defaultChecked={inventoryWarning} className="size-4 accent-[#2563eb]" />仅看库存预警</label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>每页条数</span><select name="size" defaultValue={String(pageSize)} className={controlClass}><option value="20">20 条</option><option value="50">50 条</option><option value="100">100 条</option></select></label>
          <div className="flex gap-2 md:col-span-2 xl:col-span-3 xl:justify-end"><button type="submit" className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-4 text-[13px] font-semibold text-[#344054]">筛选</button><Link href="/inventory" className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-4 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]">清除</Link></div>
        </form>

        {items.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-6 text-center"><div><h2 className="text-base font-semibold">{filtersActive ? "当前筛选无结果" : "系统暂无库存资料"}</h2><p className="mt-2 text-[13px] text-[#667085]">{filtersActive ? "请调整 SKU、分类、启用状态或预警条件后重试。" : "老板创建 SKU 并导入期初库存后会显示在这里。"}</p></div></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1080px] border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr><SortHeading field="skuCode" label="SKU 编码" state={listState} /><SortHeading field="name" label="名称" state={listState} /><SortHeading field="inventoryUnit" label="库存单位" state={listState} /><SortHeading field="onHandQuantity" label="现存量" state={listState} /><SortHeading field="reservedQuantity" label="预占量" state={listState} /><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">可用量</th><SortHeading field="warningThreshold" label="预警值" state={listState} /><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">库存状态</th><SortHeading field="lastChangedAt" label="最近变化时间" state={listState} /><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold"><span className="sr-only">操作</span></th></tr></thead><tbody>{items.map((item) => <tr key={item.skuId} className="border-b border-[#eef0f3] last:border-b-0"><td className="px-4 py-3 font-mono text-xs font-semibold text-[#1d4ed8]">{item.skuCode}</td><td className="px-4 py-3 font-semibold">{item.name}</td><td className="px-4 py-3">{item.inventoryUnit}</td><td className="px-4 py-3 text-right tabular-nums">{formatQuantity(item.onHandQuantity)}</td><td className="px-4 py-3 text-right tabular-nums">{formatQuantity(item.reservedQuantity)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQuantity(item.availableQuantity)}</td><td className="px-4 py-3 text-right tabular-nums">{formatQuantity(item.warningThreshold)}</td><td className="px-4 py-3"><InventoryStatus enabled={item.enabled} warning={item.inventoryWarning} /></td><td className="px-4 py-3 whitespace-nowrap text-[#667085]">{formatDate(item.lastChangedAt)}</td><td className="px-4 py-3"><Link href={`/inventory/ledger?skuId=${item.skuId}`} className="inline-flex min-h-11 items-center px-2 font-semibold whitespace-nowrap text-[#1d4ed8]">查看流水</Link></td></tr>)}</tbody></table></div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">{items.map((item) => <article key={item.skuId} className="grid gap-3 p-4 text-[13px]"><div className="flex items-start justify-between gap-3"><div><span className="font-mono text-xs font-semibold text-[#1d4ed8]">{item.skuCode}</span><h2 className="mt-1 font-semibold">{item.name}</h2><p className="mt-1 text-xs text-[#667085]">{item.category} · {item.inventoryUnit}</p></div><InventoryStatus enabled={item.enabled} warning={item.inventoryWarning} /></div><dl className="grid grid-cols-4 gap-2 rounded-lg bg-[#f7f9fb] p-3 text-center"><div><dt className="text-xs text-[#667085]">现存量</dt><dd className="mt-1 font-semibold">{formatQuantity(item.onHandQuantity)}</dd></div><div><dt className="text-xs text-[#667085]">预占量</dt><dd className="mt-1 font-semibold">{formatQuantity(item.reservedQuantity)}</dd></div><div><dt className="text-xs text-[#667085]">可用量</dt><dd className="mt-1 font-semibold">{formatQuantity(item.availableQuantity)}</dd></div><div><dt className="text-xs text-[#667085]">预警值</dt><dd className="mt-1 font-semibold">{formatQuantity(item.warningThreshold)}</dd></div></dl><div className="flex items-center justify-between gap-3 text-xs text-[#667085]"><span>最近变化：{formatDate(item.lastChangedAt)}</span><Link href={`/inventory/ledger?skuId=${item.skuId}`} className="inline-flex min-h-11 items-center font-semibold text-[#1d4ed8]">查看流水</Link></div></article>)}</div>
          </>
        )}

        {inventoryPage.total > 0 ? <footer className="flex items-center justify-between gap-3 border-t border-[#e4e7ec] px-4 py-3 text-[13px] text-[#667085]"><span>共 {formatQuantity(inventoryPage.total)} 条 · 第 {inventoryPage.page}/{inventoryPage.totalPages} 页</span><div className="flex gap-2">{page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">上一页</Link> : null}{page < inventoryPage.totalPages ? <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">下一页</Link> : null}</div></footer> : null}
      </section>

      <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#d7deea] bg-[#f8fafc] px-4 py-3 text-[13px] text-[#475467]"><strong>数量不可直接编辑。</strong><span>期初库存与后续销售库存活动均通过只追加流水追溯。</span></div>
    </>
  );
}
