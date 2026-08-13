import {
  IconCheck,
  IconCircleCheck,
  IconLock,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { authorizeCapability } from "@/application/auth/access-policy";
import {
  getSalesOrderDetail,
  SalesOrderServiceError,
} from "@/application/sales-orders/sales-order-service";
import { SalesOrderConfirmDialog } from "@/components/sales-order-confirm-dialog";
import { prisma } from "@/lib/db";
import { formatQuantity, formatSignedQuantity } from "@/lib/format-quantity";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "销售单详情" };

const statusConfig = {
  DRAFT: {
    label: "草稿",
    tone: "border-[#d0d5dd] bg-[#f2f4f7] text-[#475467]",
  },
  CONFIRMED: {
    label: "已确认",
    tone: "border-[#a7d9b6] bg-[#ecfdf3] text-[#027a48]",
  },
  OUTBOUND: {
    label: "已出库",
    tone: "border-[#a8c7fa] bg-[#eff6ff] text-[#175cd3]",
  },
  CANCELLED: {
    label: "已取消",
    tone: "border-[#edb1b1] bg-[#fff0f0] text-[#c62828]",
  },
} as const;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatMoney(fen: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(fen / 100);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function paymentTerm(days: number): string {
  return days === 0 ? "现结（交付当天到期）" : `${days} 天`;
}

export default async function SalesOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ salesOrderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("SALES_ORDERS_VIEW");
  const { salesOrderId } = await params;
  let salesOrder;
  try {
    salesOrder = await getSalesOrderDetail(prisma, actor, salesOrderId);
  } catch (error) {
    if (
      error instanceof SalesOrderServiceError &&
      error.code === "ORDER_NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  }
  const parameters = await searchParams;
  const confirmedNotice =
    first(parameters.notice) === "confirmed" && salesOrder.status === "CONFIRMED";
  const status = statusConfig[salesOrder.status];
  const canViewInventory =
    authorizeCapability(actor, "INVENTORY_VIEW").kind === "authorized";
  const canViewAudit =
    authorizeCapability(actor, "AUDIT_VIEW").kind === "authorized";
  const confirmable = {
    id: salesOrder.id,
    salesOrderNumber: salesOrder.salesOrderNumber,
    customerName: salesOrder.customerSnapshot.name,
    totalAmountFen: salesOrder.totalAmountFen,
    items: salesOrder.items.map((item) => ({
      skuId: item.skuId,
      skuCode: item.skuCode,
      skuName: item.skuName,
      inventoryUnit: item.inventoryUnit,
      quantity: item.quantity,
      onHandQuantity: item.currentInventory.onHandQuantity,
      reservedQuantity: item.currentInventory.reservedQuantity,
      availableQuantity: item.currentInventory.availableQuantity,
    })),
  };

  return (
    <div className="mx-auto max-w-[1280px]">
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-5 max-md:grid">
        <div>
          <p className="text-xs font-semibold text-[#2563eb]">销售单 / 详情</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[27px] leading-tight font-bold tracking-[-0.02em] max-md:text-[21px]">
              {salesOrder.salesOrderNumber}
            </h1>
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${status.tone}`}>
              {status.label}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-[#667085]">
            客户：{salesOrder.customerSnapshot.name}　创建时间：{formatDate(salesOrder.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {salesOrder.canConfirm ? (
            <SalesOrderConfirmDialog salesOrder={confirmable} />
          ) : null}
          {salesOrder.canEdit ? (
            <Link
              href={`/sales-orders/${encodeURIComponent(salesOrder.id)}/edit`}
              className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]"
            >
              编辑草稿
            </Link>
          ) : null}
          <Link
            href="/sales-orders"
            className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]"
          >
            返回列表
          </Link>
        </div>
      </header>

      {confirmedNotice ? (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]">
          <IconCircleCheck aria-hidden size={19} />
          <span>销售单已确认，库存预占、库存活动和业务审计已在同一事务中写入。</span>
          {canViewAudit && salesOrder.confirmation ? (
            <Link href={`/audit?detail=${encodeURIComponent(salesOrder.confirmation.auditId)}`} className="ml-auto underline underline-offset-2">查看业务审计</Link>
          ) : null}
        </div>
      ) : null}

      <section className="grid overflow-hidden rounded-lg border border-[#e4e7ec] bg-white sm:grid-cols-2 lg:grid-cols-5 divide-x divide-[#e4e7ec] max-sm:divide-x-0 max-sm:divide-y">
        {[
          ["客户编码", salesOrder.customerSnapshot.customerCode],
          ["客户负责人", salesOrder.customerSnapshot.responsibleSalesName],
          ["账期", paymentTerm(salesOrder.customerSnapshot.paymentTermDays)],
          ["明细", `${salesOrder.items.length} 行`],
          ["成交总额", formatMoney(salesOrder.totalAmountFen)],
        ].map(([label, value]) => (
          <div key={label} className="p-4">
            <span className="text-xs font-semibold text-[#667085]">{label}</span>
            <strong className="mt-2 block text-sm tabular-nums">{value}</strong>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <main className="grid min-w-0 gap-5">
          <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
            <header className="flex items-center justify-between gap-4 border-b border-[#e4e7ec] px-4 py-3.5">
              <h2 className="text-base font-bold">销售明细（共 {salesOrder.items.length} 行）</h2>
              {salesOrder.status !== "DRAFT" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#667085]"><IconLock aria-hidden size={15} />内容已冻结</span>
              ) : null}
            </header>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[780px] border-collapse text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[#475467]"><tr>{["SKU", "商品名称", "单位", "数量", "成交价", "小计"].map((heading) => <th key={heading} className="border-b border-[#e4e7ec] px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
                <tbody>{salesOrder.items.map((item) => <tr key={item.id} className="border-b border-[#eef0f3] last:border-b-0"><td className="px-4 py-3"><Link href={`/skus/${encodeURIComponent(item.skuId)}`} className="font-mono text-xs font-semibold text-[#1d4ed8]">{item.skuCode}</Link></td><td className="px-4 py-3 font-semibold">{item.skuName}</td><td className="px-4 py-3">{item.inventoryUnit}</td><td className="px-4 py-3 text-right tabular-nums">{formatQuantity(item.quantity)}</td><td className="px-4 py-3 text-right tabular-nums">{formatMoney(item.transactionPriceFen)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(item.subtotalFen)}</td></tr>)}</tbody>
                <tfoot><tr className="border-t border-[#d0d5dd] bg-[#fafbfc]"><td colSpan={5} className="px-4 py-3 text-right font-semibold">合计（含税）</td><td className="px-4 py-3 text-right text-base font-bold tabular-nums">{formatMoney(salesOrder.totalAmountFen)}</td></tr></tfoot>
              </table>
            </div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">{salesOrder.items.map((item) => <article key={item.id} className="grid gap-3 p-4 text-[13px]"><div><Link href={`/skus/${encodeURIComponent(item.skuId)}`} className="font-mono text-xs font-semibold text-[#1d4ed8]">{item.skuCode}</Link><h3 className="mt-1 font-semibold">{item.skuName}</h3></div><dl className="grid grid-cols-3 gap-2 rounded-lg bg-[#f7f9fb] p-3"><div><dt className="text-xs text-[#667085]">数量</dt><dd className="mt-1 font-semibold">{formatQuantity(item.quantity)} {item.inventoryUnit}</dd></div><div><dt className="text-xs text-[#667085]">成交价</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(item.transactionPriceFen)}</dd></div><div><dt className="text-xs text-[#667085]">小计</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(item.subtotalFen)}</dd></div></dl></article>)}</div>
          </section>

          <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e7ec] px-4 py-3.5">
              <div><h2 className="text-base font-bold">库存影响{salesOrder.status === "DRAFT" ? "（确认前预估）" : "（建立预占）"}</h2><p className="mt-1 text-xs text-[#667085]">可用量 = 现存量 - 预占量；当前库存数字来自服务端。</p></div>
              {canViewInventory ? <Link href={`/inventory/ledger?reference=${encodeURIComponent(salesOrder.salesOrderNumber)}`} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 text-sm font-semibold text-[#344054]">查看相关库存活动</Link> : null}
            </header>
            <div className="grid gap-3 p-4">
              {salesOrder.items.map((item) => {
                const impact = item.confirmationImpact ?? {
                  onHandBefore: item.currentInventory.onHandQuantity,
                  onHandAfter: item.currentInventory.onHandQuantity,
                  reservedBefore: item.currentInventory.reservedQuantity,
                  reservedAfter: item.currentInventory.reservedQuantity + item.quantity,
                  availableBefore: item.currentInventory.availableQuantity,
                  availableAfter: item.currentInventory.availableQuantity - item.quantity,
                };
                const shortage = Math.max(0, item.quantity - item.currentInventory.availableQuantity);
                return <article key={item.id} className={`grid gap-3 rounded-lg border p-3.5 text-[13px] lg:grid-cols-[minmax(180px,1.2fr)_repeat(3,minmax(130px,1fr))] lg:items-center ${shortage > 0 && salesOrder.status === "DRAFT" ? "border-[#edb1b1] bg-[#fff8f8]" : "border-[#e4e7ec]"}`}><div><strong className="font-mono text-xs text-[#1d4ed8]">{item.skuCode}</strong><span className="mt-1 block font-semibold">{item.skuName}</span>{shortage > 0 && salesOrder.status === "DRAFT" ? <small className="mt-1 block font-semibold text-[#c62828]">需要 {item.quantity}，当前可用 {item.currentInventory.availableQuantity}，缺少 {shortage} {item.inventoryUnit}</small> : null}</div><div className="rounded-md bg-[#f7f9fb] px-3 py-2"><span className="text-xs text-[#667085]">现存量</span><strong className="mt-1 block tabular-nums">{impact.onHandBefore} → {impact.onHandAfter} <small className="text-[#667085]">不变</small></strong></div><div className="rounded-md bg-[#f7f9fb] px-3 py-2"><span className="text-xs text-[#667085]">预占量</span><strong className="mt-1 block tabular-nums">{impact.reservedBefore} → {impact.reservedAfter} <small className="text-[#027a48]">{formatSignedQuantity(item.quantity)}</small></strong></div><div className={impact.availableAfter < 0 ? "rounded-md bg-[#fff0f0] px-3 py-2 text-[#c62828]" : "rounded-md bg-[#ecfdf3] px-3 py-2 text-[#027a48]"}><span className="text-xs">可用量</span><strong className="mt-1 block tabular-nums">{impact.availableBefore} → {impact.availableAfter} <small>{formatSignedQuantity(-item.quantity)}</small></strong></div></article>;
              })}
            </div>
          </section>

          {salesOrder.status !== "DRAFT" ? <p className="flex items-center gap-2 rounded-lg bg-[#f7f9fb] px-4 py-3 text-[13px] text-[#667085]"><IconLock aria-hidden size={16} />已确认内容被冻结，仅支持通过后续业务动作继续流转。</p> : null}
        </main>

        <aside className="grid content-start gap-5">
          <section className="rounded-lg border border-[#e4e7ec] bg-white p-5">
            <h2 className="text-base font-bold">履约记录</h2>
            <div className="mt-4 grid gap-0 text-[13px]">
              <div className="relative grid grid-cols-[24px_1fr] gap-3 pb-5 before:absolute before:top-6 before:bottom-0 before:left-[11px] before:w-px before:bg-[#a7d9b6]"><span className="grid size-6 place-items-center rounded-full bg-[#027a48] text-white"><IconCheck aria-hidden size={14} /></span><div><strong>创建销售单</strong><span className="mt-1 block text-xs text-[#667085]">{formatDate(salesOrder.createdAt)}</span></div></div>
              {salesOrder.confirmation ? <div className="relative grid grid-cols-[24px_1fr] gap-3 pb-5 before:absolute before:top-6 before:bottom-0 before:left-[11px] before:w-px before:bg-[#a7d9b6]"><span className="grid size-6 place-items-center rounded-full bg-[#027a48] text-white"><IconCheck aria-hidden size={14} /></span><div><strong>确认并预占库存</strong><span className="mt-1 block text-xs text-[#667085]">{formatDate(salesOrder.confirmation.occurredAt)} · {salesOrder.confirmation.actorName}</span>{canViewAudit ? <Link href={`/audit?detail=${encodeURIComponent(salesOrder.confirmation.auditId)}`} className="mt-2 inline-block font-semibold text-[#1d4ed8]">查看业务审计</Link> : null}</div></div> : <div className="grid grid-cols-[24px_1fr] gap-3"><span className="mt-1 size-3 justify-self-center rounded-full border-2 border-[#98a2b3] bg-white" /><div><strong>等待确认</strong><span className="mt-1 block text-xs text-[#667085]">确认后建立全部 SKU 预占</span></div></div>}
              {salesOrder.status === "CONFIRMED" ? <div className="grid grid-cols-[24px_1fr] gap-3"><span className="mt-1 size-3 justify-self-center rounded-full border-2 border-[#98a2b3] bg-white" /><div><strong>等待完整出库</strong><span className="mt-1 block text-xs text-[#667085]">下一步</span></div></div> : null}
            </div>
          </section>

          <section className="rounded-lg border border-[#e4e7ec] bg-white p-5 text-[13px]">
            <h2 className="text-base font-bold">客户快照</h2>
            <dl className="mt-4 grid gap-3"><div><dt className="text-xs text-[#667085]">客户</dt><dd className="mt-1 font-semibold">{salesOrder.customerSnapshot.name}</dd></div><div><dt className="text-xs text-[#667085]">联系人与电话</dt><dd className="mt-1 font-semibold">{salesOrder.customerSnapshot.contactName} · {salesOrder.customerSnapshot.phone}</dd></div><div><dt className="text-xs text-[#667085]">履约地址</dt><dd className="mt-1 font-semibold leading-5">{salesOrder.customerSnapshot.address}</dd></div></dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
