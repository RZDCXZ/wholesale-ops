import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerServiceError, getCustomerForManagement } from "@/application/customers/customer-service";
import { CustomerForm } from "@/components/customer-form";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "编辑客户" };

export default async function EditCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const actor = await getPageActor("CUSTOMERS_MANAGE");
  const { customerId } = await params;
  let customer;
  try { customer = await getCustomerForManagement(prisma, actor, customerId); } catch (error) {
    if (error instanceof CustomerServiceError && error.code === "CUSTOMER_NOT_FOUND") notFound();
    throw error;
  }
  return <div className="mx-auto max-w-4xl"><header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid"><div><p className="text-xs font-semibold text-[#2563eb]">客户 / {customer.customerCode} / 编辑</p><h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">编辑客户</h1><p className="mt-1.5 text-[13px] text-[#667085]">客户编码固定；负责人调整使用详情页的专门操作。</p></div><Link href={`/customers/${customer.id}`} className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">取消编辑</Link></header><CustomerForm customer={customer} responsibleSalesOptions={[]} /></div>;
}
