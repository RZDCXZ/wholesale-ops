import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getSku, SkuServiceError } from "@/application/skus/sku-service";
import { SkuForm } from "@/components/sku-form";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "编辑 SKU" };

export default async function EditSkuPage({
  params,
}: {
  params: Promise<{ skuId: string }>;
}) {
  const actor = await getPageActor("SKUS_MANAGE");
  const { skuId } = await params;
  let sku;
  try {
    sku = await getSku(prisma, actor, skuId);
  } catch (error) {
    if (error instanceof SkuServiceError && error.code === "SKU_NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid">
        <div><p className="text-xs font-semibold text-[#2563eb]">SKU / {sku.skuCode} / 编辑</p><h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">编辑 SKU</h1><p className="mt-1.5 text-[13px] text-[#667085]">SKU 编码与库存单位固定；其他资料保存后写入业务审计。</p></div>
        <Link href={`/skus/${sku.id}`} data-navigation-action className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">取消编辑</Link>
      </header>
      <SkuForm sku={{ id: sku.id, skuCode: sku.skuCode, name: sku.name, category: sku.category, inventoryUnit: sku.inventoryUnit, referencePrice: (sku.referencePriceFen / 100).toFixed(2), warningThreshold: sku.warningThreshold, enabled: sku.enabled }} />
    </div>
  );
}
