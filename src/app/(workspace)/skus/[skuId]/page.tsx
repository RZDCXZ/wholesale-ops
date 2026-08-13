import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getSku, SkuServiceError } from "@/application/skus/sku-service";
import { SkuForm } from "@/components/sku-form";
import { SkuRecordActions } from "@/components/sku-record-actions";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "SKU 详情" };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatMoneyInput(fen: number): string {
  return (fen / 100).toFixed(2);
}

export default async function SkuDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ skuId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("SKUS_VIEW");
  const { skuId } = await params;
  let sku;
  try {
    sku = await getSku(prisma, actor, skuId);
  } catch (error) {
    if (error instanceof SkuServiceError && error.code === "SKU_NOT_FOUND") notFound();
    throw error;
  }

  const canManage = actor.roles.includes("OWNER");
  const noticeValue = first((await searchParams).notice);
  const notice = noticeValue === "created" ? "SKU 已创建，资料和业务审计已同时写入。" : noticeValue === "updated" ? "SKU 资料已更新，SKU 编码保持不变。" : noticeValue === "disabled" ? "SKU 已停用，不再提供给销售选择。" : undefined;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid">
        <div><p className="text-xs font-semibold text-[#2563eb]">SKU / {sku.skuCode}</p><div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">{sku.skuCode}</h1><span className={sku.enabled ? "rounded-md border border-[#a7d9b6] bg-[#ecfdf3] px-2 py-1 text-xs font-semibold text-[#027a48]" : "rounded-md border border-[#edb1b1] bg-[#fff0f0] px-2 py-1 text-xs font-semibold text-[#c62828]"}>{sku.enabled ? "启用" : "停用"}</span></div><p className="mt-1.5 text-[13px] text-[#667085]">{sku.name}</p></div>
        <Link href="/skus" className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">返回列表</Link>
      </header>

      {notice ? <div role="status" className="mb-4 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]">{notice}</div> : null}

      <section className="mb-5 grid grid-cols-3 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white max-sm:grid-cols-1 max-sm:divide-x-0 max-sm:divide-y divide-x divide-[#e4e7ec]">
        {[['现存量', sku.onHandQuantity], ['预占量', sku.reservedQuantity], ['可用量', sku.availableQuantity]].map(([label, value]) => <div key={String(label)} className="p-5"><span className="text-xs font-semibold text-[#667085]">{label}</span><strong className="mt-2 block text-2xl tabular-nums">{value} <small className="text-sm font-medium text-[#667085]">{sku.inventoryUnit}</small></strong></div>)}
      </section>

      {canManage ? (
        <>
          <SkuForm sku={{ id: sku.id, skuCode: sku.skuCode, name: sku.name, category: sku.category, inventoryUnit: sku.inventoryUnit, referencePrice: formatMoneyInput(sku.referencePriceFen), warningThreshold: sku.warningThreshold, enabled: sku.enabled }} />
          <section className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-[#edb1b1] bg-white p-5 max-sm:grid"><div><h2 className="font-semibold">停用或删除</h2><p className="mt-1 text-[13px] leading-5 text-[#667085]">被业务记录引用后只能停用；未被引用时允许删除并保留审计记录。</p></div><SkuRecordActions sku={{ id: sku.id, skuCode: sku.skuCode, name: sku.name, enabled: sku.enabled }} /></section>
        </>
      ) : (
        <section className="rounded-lg border border-[#e4e7ec] bg-white p-5"><div className="mb-4"><h2 className="text-base font-semibold">基本资料</h2><p className="mt-1 text-[13px] text-[#667085]">销售只读取启用 SKU，资料维护由老板负责。</p></div><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[["SKU 编码", sku.skuCode], ["名称", sku.name], ["分类", sku.category], ["库存单位", sku.inventoryUnit], ["参考售价", `¥${formatMoneyInput(sku.referencePriceFen)}`], ["预警值", String(sku.warningThreshold)]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#f7f9fb] p-3"><dt className="text-xs text-[#667085]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl></section>
      )}

      <section className="mt-5 rounded-lg border border-[#e4e7ec] bg-white p-5"><h2 className="text-base font-semibold">最近库存流水</h2><p className="mt-2 text-[13px] leading-6 text-[#667085]">尚无库存活动。期初库存与后续销售库存活动接入后，将在这里展示可追溯流水。</p></section>
    </div>
  );
}
