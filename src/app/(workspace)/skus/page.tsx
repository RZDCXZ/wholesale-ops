import { IconPlus } from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listSkusPage } from "@/application/skus/sku-service";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "SKU" };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function positiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function skuHref({
  query,
  category,
  status,
  page,
  pageSize,
}: {
  query: string;
  category: string;
  status: string;
  page: number;
  pageSize: number;
}): string {
  const parameters = new URLSearchParams();
  if (query) parameters.set("q", query);
  if (category) parameters.set("category", category);
  if (status) parameters.set("status", status);
  if (page > 1) parameters.set("page", String(page));
  if (pageSize !== 20) parameters.set("size", String(pageSize));
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

function Status({ enabled }: { enabled: boolean }) {
  return (
    <span className={enabled ? "inline-flex min-h-6 items-center rounded-md border border-[#a7d9b6] bg-[#ecfdf3] px-2 text-xs font-semibold text-[#027a48]" : "inline-flex min-h-6 items-center rounded-md border border-[#edb1b1] bg-[#fff0f0] px-2 text-xs font-semibold text-[#c62828]"}>
      {enabled ? "启用" : "停用"}
    </span>
  );
}

export default async function SkusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("SKUS_VIEW");
  const parameters = await searchParams;
  const query = first(parameters.q).trim();
  const category = first(parameters.category).trim();
  const statusValue = first(parameters.status);
  const status = ["enabled", "disabled"].includes(statusValue) ? statusValue : "";
  const enabled = status === "enabled" ? true : status === "disabled" ? false : undefined;
  const page = positiveInteger(first(parameters.page));
  const requestedPageSize = positiveInteger(first(parameters.size));
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const skuPage = await listSkusPage(
    prisma,
    actor,
    { query, category, enabled },
    { page, pageSize },
  );

  if (page > skuPage.totalPages) {
    redirect(skuHref({ query, category, status, page: skuPage.totalPages, pageSize }));
  }

  const canManage = actor.roles.includes("OWNER");
  const noticeValue = first(parameters.notice);
  const notice = noticeValue === "deleted" ? "SKU 已删除，删除动作已写入业务审计。" : undefined;
  const filtersActive = Boolean(query || category || status);
  const pageHref = (targetPage: number) =>
    skuHref({ query, category, status, page: targetPage, pageSize });

  return (
    <>
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-6 max-md:grid max-md:gap-3.5">
        <div>
          <h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">SKU</h1>
          <p className="mt-1.5 text-[13px] text-[#667085]">查找 SKU 并比较基础资料与库存状态</p>
        </div>
        {canManage ? (
          <Link href="/skus/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]">
            <IconPlus aria-hidden size={17} />
            新建 SKU
          </Link>
        ) : null}
      </header>

      {notice ? <div role="status" className="mb-4 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]">{notice}</div> : null}

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form method="get" className="grid gap-2.5 border-b border-[#e4e7ec] p-3.5 md:grid-cols-[minmax(220px,1fr)_minmax(150px,0.45fr)_150px_130px_auto_auto]">
          <input name="q" defaultValue={query} placeholder="搜索 SKU 编码或名称" className="min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] px-3 text-[13px] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15" />
          <input name="category" defaultValue={category} placeholder="分类" aria-label="分类" className="min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] px-3 text-[13px]" />
          <select name="status" defaultValue={status} aria-label="启用状态" className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] text-[#344054]">
            <option value="">全部状态</option>
            <option value="enabled">启用</option>
            {canManage ? <option value="disabled">停用</option> : null}
          </select>
          <select name="size" defaultValue={String(pageSize)} aria-label="每页条数" className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] text-[#344054]">
            <option value="20">每页 20 条</option>
            <option value="50">每页 50 条</option>
            <option value="100">每页 100 条</option>
          </select>
          <button type="submit" className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-3 text-[13px] font-semibold text-[#344054]">筛选</button>
          <Link href="/skus" className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-3 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]">清除</Link>
        </form>

        {skuPage.items.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-6 text-center">
            <div>
              <h2 className="text-base font-semibold">{filtersActive ? "当前筛选无结果" : "系统暂无 SKU"}</h2>
              <p className="mt-2 text-[13px] text-[#667085]">{filtersActive ? "请调整 SKU 编码、名称、分类或启用状态后重试。" : canManage ? "创建第一个 SKU，为后续销售和库存流程准备基础资料。" : "老板创建并启用 SKU 后会显示在这里。"}</p>
              {filtersActive ? <Link href="/skus" className="mt-4 inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">清除筛选</Link> : canManage ? <Link href="/skus/new" className="mt-4 inline-flex min-h-11 items-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white">新建 SKU</Link> : null}
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1120px] border-collapse text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[#475467]"><tr>{["SKU 编码", "名称", "分类", "库存单位", "参考售价", "现存量", "预占量", "可用量", "预警值", "状态", ""].map((heading, index) => <th key={`${heading}-${index}`} className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">{heading}</th>)}</tr></thead>
                <tbody>{skuPage.items.map((sku) => (
                  <tr key={sku.id} className="border-b border-[#eef0f3] last:border-b-0 hover:bg-[#fafbfc]">
                    <td className="px-4 py-3 font-mono text-xs"><Link href={`/skus/${sku.id}`} className="font-semibold text-[#1d4ed8]">{sku.skuCode}</Link></td>
                    <td className="px-4 py-3 font-semibold">{sku.name}</td><td className="px-4 py-3 text-[#475467]">{sku.category}</td><td className="px-4 py-3">{sku.inventoryUnit}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(sku.referencePriceFen)}</td><td className="px-4 py-3 text-right tabular-nums">{sku.onHandQuantity}</td><td className="px-4 py-3 text-right tabular-nums">{sku.reservedQuantity}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{sku.availableQuantity}</td><td className="px-4 py-3 text-right tabular-nums">{sku.warningThreshold}</td><td className="px-4 py-3"><Status enabled={sku.enabled} /></td>
                    <td className="px-4 py-3"><Link href={`/skus/${sku.id}`} className="inline-flex min-h-11 items-center px-2 font-semibold whitespace-nowrap text-[#1d4ed8]">{canManage ? "查看与编辑" : "查看详情"}</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">{skuPage.items.map((sku) => (
              <article key={sku.id} className="grid gap-3 p-4 text-[13px]">
                <div className="flex items-start justify-between gap-3"><div><Link href={`/skus/${sku.id}`} className="font-mono text-xs font-semibold text-[#1d4ed8]">{sku.skuCode}</Link><h2 className="mt-1 font-semibold">{sku.name}</h2></div><Status enabled={sku.enabled} /></div>
                <p className="text-[#667085]">{sku.category} · {sku.inventoryUnit} · {formatMoney(sku.referencePriceFen)}</p>
                <dl className="grid grid-cols-4 gap-2 rounded-lg bg-[#f7f9fb] p-3 text-center"><div><dt className="text-xs text-[#667085]">现存量</dt><dd className="mt-1 font-semibold">{sku.onHandQuantity}</dd></div><div><dt className="text-xs text-[#667085]">预占量</dt><dd className="mt-1 font-semibold">{sku.reservedQuantity}</dd></div><div><dt className="text-xs text-[#667085]">可用量</dt><dd className="mt-1 font-semibold">{sku.availableQuantity}</dd></div><div><dt className="text-xs text-[#667085]">预警值</dt><dd className="mt-1 font-semibold">{sku.warningThreshold}</dd></div></dl>
              </article>
            ))}</div>
          </>
        )}

        {skuPage.total > 0 ? <footer className="flex items-center justify-between gap-3 border-t border-[#e4e7ec] px-4 py-3 text-[13px] text-[#667085]"><span>共 {skuPage.total} 条 · 第 {skuPage.page}/{skuPage.totalPages} 页</span><div className="flex gap-2">{page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">上一页</Link> : null}{page < skuPage.totalPages ? <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">下一页</Link> : null}</div></footer> : null}
      </section>
    </>
  );
}
