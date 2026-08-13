import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getSkuInventorySummary,
  SkuServiceError,
} from "@/application/skus/sku-service";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "库存流水" };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function InventoryLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("INVENTORY_VIEW");
  const skuId = first((await searchParams).skuId);
  if (!skuId) notFound();

  let sku;
  try {
    sku = await getSkuInventorySummary(prisma, actor, skuId);
  } catch (error) {
    if (error instanceof SkuServiceError && error.code === "SKU_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid">
        <div><p className="text-xs font-semibold text-[#2563eb]">库存 / 流水</p><h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">库存流水</h1><p className="mt-1.5 text-[13px] text-[#667085]">{sku.skuCode} · {sku.name} · 所有数量变化均通过只读流水追溯</p></div>
        {actor.roles.includes("OWNER") ? <Link href={`/skus/${sku.id}`} className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">返回 SKU 详情</Link> : null}
      </header>

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <div className="grid gap-3 border-b border-[#e4e7ec] p-4 sm:grid-cols-3">
          <div className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">SKU</span><strong className="mt-1 block font-mono text-sm">{sku.skuCode}</strong></div>
          <div className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">名称与单位</span><strong className="mt-1 block text-sm">{sku.name} · {sku.inventoryUnit}</strong></div>
          <div className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">当前三数</span><strong className="mt-1 block text-sm">现存 {sku.onHandQuantity} · 预占 {sku.reservedQuantity} · 可用 {sku.availableQuantity}</strong></div>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr>{["发生时间", "SKU", "类型", "现存量变化", "预占量变化", "变化后现存量", "变化后预占量", "变化后可用量", "关联对象", "操作者"].map((heading) => <th key={heading} className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">{heading}</th>)}</tr></thead></table>
        </div>
        <div className="grid min-h-64 place-items-center p-6 text-center"><div><h2 className="text-base font-semibold">该 SKU 暂无库存流水</h2><p className="mt-2 text-[13px] leading-6 text-[#667085]">期初库存、建立或释放预占、出库发生后，完整记录会按发生时间展示在这里。</p></div></div>
      </section>
    </div>
  );
}
