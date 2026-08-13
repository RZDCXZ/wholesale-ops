import type { Metadata } from "next";

import { SkuForm } from "@/components/sku-form";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "新建 SKU" };

export default async function NewSkuPage() {
  await getPageActor("SKUS_MANAGE");

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-[18px] min-h-[58px]">
        <p className="text-xs font-semibold text-[#2563eb]">SKU / 新建</p>
        <h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">新建 SKU</h1>
        <p className="mt-1.5 text-[13px] text-[#667085]">建立供销售和库存流程使用的稳定 SKU 资料</p>
      </header>
      <SkuForm />
    </div>
  );
}
