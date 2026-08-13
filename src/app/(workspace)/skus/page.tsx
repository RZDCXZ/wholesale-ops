import { IconPlus } from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authorizeCapability } from "@/application/auth/access-policy";
import {
  listSkusPage,
  type SkuSortField,
} from "@/application/skus/sku-service";
import { SkuTableRow } from "@/components/sku-table-row";
import { prisma } from "@/lib/db";
import { formatQuantity } from "@/lib/format-quantity";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "SKU" };

type Direction = "asc" | "desc";
type ListState = {
  query: string;
  category: string;
  status: string;
  warning: boolean;
  sort: SkuSortField;
  direction: Direction;
  page: number;
  pageSize: number;
};

const sortFields = new Set<SkuSortField>([
  "skuCode",
  "name",
  "category",
  "referencePrice",
  "warningThreshold",
  "updatedAt",
]);

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function positiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function skuHref(state: ListState): string {
  const parameters = new URLSearchParams();
  if (state.query) parameters.set("q", state.query);
  if (state.category) parameters.set("category", state.category);
  if (state.status) parameters.set("status", state.status);
  if (state.warning) parameters.set("warning", "1");
  if (state.sort !== "updatedAt") parameters.set("sort", state.sort);
  if (state.direction !== "desc") parameters.set("direction", state.direction);
  if (state.page > 1) parameters.set("page", String(state.page));
  if (state.pageSize !== 20) parameters.set("size", String(state.pageSize));
  const queryString = parameters.toString();
  return queryString ? `/skus?${queryString}` : "/skus";
}

function formatMoney(fen: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(fen / 100);
}

function Status({ enabled, warning }: { enabled: boolean; warning: boolean }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {warning ? <span className="inline-flex min-h-6 items-center rounded-md border border-[#f2c879] bg-[#fffaeb] px-2 text-xs font-semibold text-[#b54708]">库存预警</span> : null}
      <span className={enabled ? "inline-flex min-h-6 items-center rounded-md border border-[#a7d9b6] bg-[#ecfdf3] px-2 text-xs font-semibold text-[#027a48]" : "inline-flex min-h-6 items-center rounded-md border border-[#edb1b1] bg-[#fff0f0] px-2 text-xs font-semibold text-[#c62828]"}>{enabled ? "启用" : "停用"}</span>
    </span>
  );
}

function SortHeading({
  field,
  label,
  state,
}: {
  field: SkuSortField;
  label: string;
  state: ListState;
}) {
  const active = state.sort === field;
  const direction = active && state.direction === "asc" ? "desc" : "asc";
  return (
    <th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">
      <Link href={skuHref({ ...state, sort: field, direction, page: 1 })} className="inline-flex min-h-8 items-center gap-1 text-[#344054] hover:text-[#1d4ed8]">
        {label}<span aria-hidden>{active ? (state.direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </Link>
    </th>
  );
}

export default async function SkusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("SKUS_VIEW");
  const parameters = await searchParams;
  const canManage = actor.roles.includes("OWNER");
  const canViewInventory = authorizeCapability(actor, "INVENTORY_VIEW").kind === "authorized";
  const query = first(parameters.q).trim();
  const category = first(parameters.category).trim();
  const statusValue = first(parameters.status);
  const status = ["enabled", "disabled"].includes(statusValue) ? statusValue : "";
  const enabled = status === "enabled" ? true : status === "disabled" ? false : undefined;
  const warning = canViewInventory && first(parameters.warning) === "1";
  const sortValue = first(parameters.sort) as SkuSortField;
  const sort = sortFields.has(sortValue) ? sortValue : "updatedAt";
  const direction: Direction = first(parameters.direction) === "asc" ? "asc" : "desc";
  const page = positiveInteger(first(parameters.page));
  const requestedPageSize = positiveInteger(first(parameters.size));
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const listState: ListState = { query, category, status, warning, sort, direction, page, pageSize };
  const skuPage = await listSkusPage(
    prisma,
    actor,
    { query, category, enabled, inventoryWarning: warning },
    { page, pageSize, sort, direction },
  );

  if (page > skuPage.totalPages) {
    redirect(skuHref({ ...listState, page: skuPage.totalPages }));
  }

  const noticeValue = first(parameters.notice);
  const notice = noticeValue === "deleted" ? "SKU 已删除，删除动作已写入业务审计。" : undefined;
  const filtersActive = Boolean(query || category || status || warning);
  const pageHref = (targetPage: number) => skuHref({ ...listState, page: targetPage });
  const labelClass = "grid gap-1.5 text-xs font-semibold text-[#475467]";
  const controlClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15";

  return (
    <>
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-6 max-md:grid max-md:gap-3.5">
        <div><h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">SKU</h1><p className="mt-1.5 text-[13px] text-[#667085]">查找 SKU 并比较基础资料与库存状态</p></div>
        {canManage ? <Link href="/skus/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]"><IconPlus aria-hidden size={17} />新建 SKU</Link> : null}
      </header>

      {notice ? <div role="status" className="mb-4 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]">{notice}</div> : null}

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form method="get" className="grid items-end gap-3 border-b border-[#e4e7ec] p-3.5 md:grid-cols-2 xl:grid-cols-4">
          {sort !== "updatedAt" ? <input type="hidden" name="sort" value={sort} /> : null}
          {direction !== "desc" ? <input type="hidden" name="direction" value={direction} /> : null}
          <label className={labelClass}><span>搜索</span><input name="q" defaultValue={query} placeholder="SKU 编码或名称" className={controlClass} /></label>
          <label className={labelClass}><span>分类</span><input name="category" defaultValue={category} placeholder="例如：紧固件" className={controlClass} /></label>
          <label className={labelClass}><span>启用状态</span><select name="status" defaultValue={status} className={controlClass}><option value="">全部状态</option><option value="enabled">启用</option>{canManage ? <option value="disabled">停用</option> : null}</select></label>
          <label className={labelClass}><span>每页条数</span><select name="size" defaultValue={String(pageSize)} className={controlClass}><option value="20">20 条</option><option value="50">50 条</option><option value="100">100 条</option></select></label>
          {canViewInventory ? <label className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-3 text-[13px] font-semibold text-[#344054]"><input type="checkbox" name="warning" value="1" defaultChecked={warning} className="size-4 accent-[#2563eb]" />仅看库存预警</label> : null}
          <div className={`flex gap-2 xl:justify-end ${canViewInventory ? "xl:col-span-3" : "xl:col-span-4"}`}><button type="submit" className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-4 text-[13px] font-semibold text-[#344054]">筛选</button><Link href="/skus" className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-4 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]">清除</Link></div>
        </form>

        {skuPage.items.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-6 text-center"><div><h2 className="text-base font-semibold">{filtersActive ? "当前筛选无结果" : "系统暂无 SKU"}</h2><p className="mt-2 text-[13px] text-[#667085]">{filtersActive ? "请调整搜索、分类、启用状态或库存预警条件后重试。" : canManage ? "创建第一个 SKU，为后续销售和库存流程准备基础资料。" : "老板创建并启用 SKU 后会显示在这里。"}</p>{filtersActive ? <Link href="/skus" className="mt-4 inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">清除筛选</Link> : canManage ? <Link href="/skus/new" className="mt-4 inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white">新建 SKU</Link> : null}</div></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1120px] border-collapse text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[#475467]"><tr><SortHeading field="skuCode" label="SKU 编码" state={listState} /><SortHeading field="name" label="名称" state={listState} /><SortHeading field="category" label="分类" state={listState} /><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">库存单位</th><SortHeading field="referencePrice" label="参考售价" state={listState} />{canViewInventory ? <><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">现存量</th><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">预占量</th></> : null}<th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">可用量</th>{canViewInventory ? <SortHeading field="warningThreshold" label="预警值" state={listState} /> : null}<th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">状态</th><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold"><span className="sr-only">操作</span></th></tr></thead>
                <tbody>{skuPage.items.map((sku) => {
                  const href = `/skus/${sku.id}`;
                  const inventoryWarning = sku.enabled && sku.availableQuantity <= sku.warningThreshold;
                  return <SkuTableRow key={sku.id} href={href}><td className="px-4 py-3 font-mono text-xs"><Link href={href} className="font-semibold text-[#1d4ed8]">{sku.skuCode}</Link></td><td className="px-4 py-3 font-semibold">{sku.name}</td><td className="px-4 py-3 text-[#475467]">{sku.category}</td><td className="px-4 py-3">{sku.inventoryUnit}</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(sku.referencePriceFen)}</td>{canViewInventory ? <><td className="px-4 py-3 text-right tabular-nums">{formatQuantity(sku.onHandQuantity)}</td><td className="px-4 py-3 text-right tabular-nums">{formatQuantity(sku.reservedQuantity)}</td></> : null}<td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQuantity(sku.availableQuantity)}</td>{canViewInventory ? <td className="px-4 py-3 text-right tabular-nums">{formatQuantity(sku.warningThreshold)}</td> : null}<td className="px-4 py-3"><Status enabled={sku.enabled} warning={canViewInventory && inventoryWarning} /></td><td className="px-4 py-3"><Link href={href} className="inline-flex min-h-11 items-center px-2 font-semibold whitespace-nowrap text-[#1d4ed8]">查看详情</Link></td></SkuTableRow>;
                })}</tbody>
              </table>
            </div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">{skuPage.items.map((sku) => {
              const inventoryWarning = sku.enabled && sku.availableQuantity <= sku.warningThreshold;
              return <Link key={sku.id} href={`/skus/${sku.id}`} className="block hover:bg-[#fafbfc]"><article className="grid gap-3 p-4 text-[13px]"><div className="flex items-start justify-between gap-3"><div><span className="font-mono text-xs font-semibold text-[#1d4ed8]">{sku.skuCode}</span><h2 className="mt-1 font-semibold">{sku.name}</h2></div><Status enabled={sku.enabled} warning={canViewInventory && inventoryWarning} /></div><p className="text-[#667085]">{sku.category} · {sku.inventoryUnit} · {formatMoney(sku.referencePriceFen)}</p><dl className={`${canViewInventory ? "grid-cols-4" : "grid-cols-1"} grid gap-2 rounded-lg bg-[#f7f9fb] p-3 text-center`}>{canViewInventory ? <><div><dt className="text-xs text-[#667085]">现存量</dt><dd className="mt-1 font-semibold">{formatQuantity(sku.onHandQuantity)}</dd></div><div><dt className="text-xs text-[#667085]">预占量</dt><dd className="mt-1 font-semibold">{formatQuantity(sku.reservedQuantity)}</dd></div></> : null}<div><dt className="text-xs text-[#667085]">可用量</dt><dd className="mt-1 font-semibold">{formatQuantity(sku.availableQuantity)}</dd></div>{canViewInventory ? <div><dt className="text-xs text-[#667085]">预警值</dt><dd className="mt-1 font-semibold">{formatQuantity(sku.warningThreshold)}</dd></div> : null}</dl></article></Link>;
            })}</div>
          </>
        )}

        {skuPage.total > 0 ? <footer className="flex items-center justify-between gap-3 border-t border-[#e4e7ec] px-4 py-3 text-[13px] text-[#667085]"><span>共 {skuPage.total} 条 · 第 {skuPage.page}/{skuPage.totalPages} 页</span><div className="flex gap-2">{page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">上一页</Link> : null}{page < skuPage.totalPages ? <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">下一页</Link> : null}</div></footer> : null}
      </section>
    </>
  );
}
