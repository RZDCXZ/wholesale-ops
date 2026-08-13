import type { Metadata } from "next";

import { SkuImportWorkbench } from "@/components/sku-import-workbench";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "导入工作台" };

export default async function ImportsPage() {
  await getPageActor("IMPORTS_MANAGE");

  return (
    <>
      <header className="mb-[18px]">
        <h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">
          导入工作台
        </h1>
        <p className="mt-1.5 text-[13px] text-[#667085]">
          SKU、客户与期初库存使用固定 .xlsx 模板
        </p>
      </header>
      <SkuImportWorkbench />
    </>
  );
}
