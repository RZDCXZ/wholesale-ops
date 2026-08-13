import type { Metadata } from "next";

import { getCustomerPermissions, listResponsibleSalesOptions } from "@/application/customers/customer-service";
import { CustomerForm } from "@/components/customer-form";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "新建客户" };

export default async function NewCustomerPage() {
  const actor = await getPageActor("CUSTOMERS_MANAGE");
  const options = await listResponsibleSalesOptions(prisma, actor);
  const currentSales = getCustomerPermissions(actor).canReassign
    ? undefined
    : { id: actor.id, name: actor.name };
  return <div className="mx-auto max-w-4xl"><header className="mb-[18px] min-h-[58px]"><p className="text-xs font-semibold text-[#2563eb]">客户 / 新建</p><h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">新建客户</h1><p className="mt-1.5 text-[13px] text-[#667085]">建立客户联系方式、负责人和默认账期</p></header><CustomerForm responsibleSalesOptions={options} currentSales={currentSales} /></div>;
}
