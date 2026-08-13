import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getOpeningInventorySource,
  InventoryServiceError,
} from "@/application/inventory/inventory-service";
import { prisma } from "@/lib/db";
import { formatQuantity } from "@/lib/format-quantity";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "期初库存来源" };

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "long",
    timeStyle: "medium",
  }).format(date);
}

export default async function OpeningInventorySourcePage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const actor = await getPageActor("INVENTORY_VIEW");
  const { importId } = await params;
  let source;
  try {
    source = await getOpeningInventorySource(prisma, actor, importId);
  } catch (error) {
    if (
      error instanceof InventoryServiceError &&
      error.code === "OPENING_SOURCE_NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid">
        <div>
          <p className="text-xs font-semibold text-[#2563eb]">库存 / 期初来源</p>
          <h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">期初库存导入记录</h1>
          <p className="mt-1.5 text-[13px] text-[#667085]">只读来源记录 · 对应库存流水不可修改</p>
        </div>
        <Link href={`/inventory/ledger?importId=${encodeURIComponent(source.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]">查看对应流水</Link>
      </header>

      <section className="grid gap-3 rounded-lg border border-[#e4e7ec] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["文件名", source.fileName],
          ["导入行数", `${formatQuantity(source.rowCount)} 行`],
          ["确认人", source.actor.name],
          ["确认时间", formatDate(source.confirmedAt)],
        ].map(([label, value]) => <div key={label} className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">{label}</span><strong className="mt-1 block break-words text-sm">{value}</strong></div>)}
      </section>

      <section className="mt-5 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <div className="border-b border-[#e4e7ec] px-4 py-3"><h2 className="font-semibold">导入明细</h2><p className="mt-1 text-xs text-[#667085]">共 {formatQuantity(source.rows.length)} 个 SKU</p></div>
        <div className="hidden overflow-x-auto sm:block"><table className="w-full border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr>{["SKU 编码", "名称", "库存单位", "期初库存数量"].map((heading) => <th key={heading} className="border-b border-[#e4e7ec] px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody>{source.rows.map((row) => <tr key={row.skuId} className="border-b border-[#eef0f3] last:border-b-0"><td className="px-4 py-3 font-mono text-xs font-semibold text-[#1d4ed8]">{row.skuCode}</td><td className="px-4 py-3 font-semibold">{row.skuName}</td><td className="px-4 py-3">{row.inventoryUnit}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQuantity(row.quantity)}</td></tr>)}</tbody></table></div>
        <div className="grid divide-y divide-[#e4e7ec] sm:hidden">{source.rows.map((row) => <article key={row.skuId} className="p-4 text-[13px]"><span className="font-mono text-xs font-semibold text-[#1d4ed8]">{row.skuCode}</span><h2 className="mt-1 font-semibold">{row.skuName}</h2><p className="mt-2 text-[#667085]">期初库存：<strong className="text-[#344054]">{formatQuantity(row.quantity)} {row.inventoryUnit}</strong></p></article>)}</div>
      </section>
    </div>
  );
}
