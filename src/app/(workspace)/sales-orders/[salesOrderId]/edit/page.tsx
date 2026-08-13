import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listCustomers } from "@/application/customers/customer-service";
import {
  getSalesOrderDraftForEditing,
  SalesOrderServiceError,
} from "@/application/sales-orders/sales-order-service";
import { listSkus } from "@/application/skus/sku-service";
import { SalesOrderDraftForm } from "@/components/sales-order-draft-form";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "编辑销售单草稿" };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function EditSalesOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ salesOrderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("SALES_ORDERS_VIEW");
  const { salesOrderId } = await params;
  let data;
  try {
    data = await Promise.all([
      getSalesOrderDraftForEditing(prisma, actor, salesOrderId),
      listCustomers(prisma, actor, { enabled: true }),
      listSkus(prisma, actor, { enabled: true }),
      searchParams,
    ]);
  } catch (error) {
    if (error instanceof SalesOrderServiceError && error.code === "DRAFT_NOT_FOUND") notFound();
    throw error;
  }
  const [draft, customers, skus, parameters] = data;
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
  const noticeValue = first(parameters.notice);
  const notice = noticeValue === "created"
    ? "销售单草稿已保存，客户快照、销售明细和业务审计已同时写入。"
    : noticeValue === "updated"
      ? "销售单草稿已更新，修改内容和业务审计已同时写入。"
      : undefined;

  return (
    <div className="mx-auto max-w-[1280px] pb-16 max-md:pb-24">
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid"><div><p className="text-xs font-semibold text-[#2563eb]">销售单 / {draft.salesOrderNumber} / 编辑</p><div className="mt-2 flex items-center gap-2"><h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">编辑销售单草稿</h1><span className="rounded-md border border-[#d0d5dd] bg-[#f2f4f7] px-2 py-1 text-xs font-semibold text-[#475467]">草稿</span></div><p className="mt-1.5 text-[13px] text-[#667085]">尚未预占库存；保存后可继续进入确认流程。</p></div><Link href="/sales-orders" className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054]">返回销售单列表</Link></header>
      <SalesOrderDraftForm customers={customerOptions} skus={skuOptions} draft={draft} notice={notice} />
    </div>
  );
}
