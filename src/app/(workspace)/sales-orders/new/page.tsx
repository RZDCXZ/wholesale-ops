import type { Metadata } from "next";

import { listCustomers } from "@/application/customers/customer-service";
import { listSkus } from "@/application/skus/sku-service";
import { SalesOrderDraftForm } from "@/components/sales-order-draft-form";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "新建销售单" };

export default async function NewSalesOrderPage() {
  const actor = await getPageActor("SALES_ORDERS_VIEW");
  const [customers, skus] = await Promise.all([
    listCustomers(prisma, actor, { enabled: true }),
    listSkus(prisma, actor, { enabled: true }),
  ]);
  const customerOptions = customers.map((customer) => ({
    id: customer.id,
    customerCode: customer.customerCode,
    name: customer.name,
    contactName: customer.contactName,
    phone: customer.phone,
    address: customer.address,
    responsibleSales: customer.responsibleSales,
    paymentTermDays: customer.paymentTermDays,
  }));
  const skuOptions = skus.map((sku) => ({
    id: sku.id,
    skuCode: sku.skuCode,
    name: sku.name,
    inventoryUnit: sku.inventoryUnit,
    referencePriceFen: sku.referencePriceFen,
    availableQuantity: sku.availableQuantity,
  }));
  return (
    <div className="mx-auto max-w-[1280px] pb-16 max-md:pb-24">
      <header className="mb-[18px] min-h-[58px]"><p className="text-xs font-semibold text-[#2563eb]">销售单 / 新建</p><h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">新建销售单</h1><p className="mt-1.5 text-[13px] text-[#667085]">草稿会保存客户与账期快照；库存不足风险也可以保存并继续核对。</p></header>
      <SalesOrderDraftForm customers={customerOptions} skus={skuOptions} />
    </div>
  );
}
