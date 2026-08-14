import { randomUUID } from "node:crypto";

import {
  IconCircleCheck,
  IconFileInvoice,
  IconWallet,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { authorizeCapability } from "@/application/auth/access-policy";
import {
  getReceivableDetail,
  ReceivableServiceError,
} from "@/application/receivables/receivable-service";
import { PaymentDrawerTrigger } from "@/components/payment-drawer";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format-money";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "应收详情" };

const statusConfig = {
  PENDING: {
    label: "待收款",
    tone: "border-[#f0c36d] bg-[#fff8e6] text-[#8a5a00]",
  },
  PARTIAL: {
    label: "部分收款",
    tone: "border-[#f0c36d] bg-[#fff8e6] text-[#8a5a00]",
  },
  SETTLED: {
    label: "已结清",
    tone: "border-[#a7d9b6] bg-[#ecfdf3] text-[#027a48]",
  },
} as const;

const paymentMethodLabels = {
  CASH: "现金",
  BANK_TRANSFER: "银行转账",
  WECHAT: "微信",
  ALIPAY: "支付宝",
  OTHER: "其他",
} as const;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date): string {
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

function chinaToday(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function ReceivableDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ receivableId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("RECEIVABLES_PROGRESS_VIEW");
  const { receivableId } = await params;
  let receivable;
  try {
    receivable = await getReceivableDetail(prisma, actor, receivableId);
  } catch (error) {
    if (
      error instanceof ReceivableServiceError &&
      error.code === "RECEIVABLE_NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  }
  const notice = first((await searchParams).notice);
  const status = statusConfig[receivable.status];
  const canViewSalesOrder =
    authorizeCapability(actor, "SALES_ORDERS_VIEW").kind === "authorized";
  const canViewAudit =
    authorizeCapability(actor, "AUDIT_VIEW").kind === "authorized";
  const financial = receivable.visibility === "financial" ? receivable : null;

  return (
    <div className="mx-auto max-w-[1280px]">
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-5 max-md:grid">
        <div>
          <p className="text-xs font-semibold text-[#2563eb]">应收 / 详情</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[27px] leading-tight font-bold tracking-[-0.02em] max-md:text-[21px]">{receivable.receivableNumber}</h1>
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
            {receivable.overdue ? <span className="rounded-md border border-[#edb1b1] bg-[#fff0f0] px-2 py-1 text-xs font-semibold text-[#c62828]">逾期 {receivable.overdueDays} 天</span> : null}
          </div>
          <p className="mt-1.5 text-[13px] text-[#667085]">{receivable.customer.name} · 来源销售单 {receivable.salesOrder.salesOrderNumber}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {financial && financial.remainingAmountFen > 0 ? (
            <PaymentDrawerTrigger
              receivable={{
                id: financial.id,
                receivableNumber: financial.receivableNumber,
                remainingAmountFen: financial.remainingAmountFen,
              }}
              submissionKey={randomUUID()}
              today={chinaToday()}
            />
          ) : null}
          <Link href={financial ? "/receivables" : `/sales-orders/${encodeURIComponent(receivable.salesOrder.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]">{financial ? "返回列表" : "返回销售单"}</Link>
        </div>
      </header>

      {notice === "payment-recorded" && financial ? (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]">
          <IconCircleCheck aria-hidden size={19} />
          <span>收款、应收金额与状态、业务审计已在同一事务中写入。</span>
          {financial.status === "SETTLED" ? <strong>累计收款已等于原始金额，应收已自动结清。</strong> : null}
        </div>
      ) : null}

      {receivable.visibility === "progress" ? (
        <div className="mb-4 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-[13px] leading-6 text-[#1e3a8a]">
          当前销售账号只查看自己负责客户的收款进度摘要；收款方式、参考号、备注和登记操作仅向老板与财务开放。
        </div>
      ) : null}

      <section className="grid overflow-hidden rounded-lg border border-[#e4e7ec] bg-white sm:grid-cols-3 divide-x divide-[#e4e7ec] max-sm:divide-x-0 max-sm:divide-y">
        <div className="min-h-28 p-5"><span className="text-xs font-semibold text-[#667085]">原始金额</span><strong className="mt-2 block text-2xl tabular-nums">{formatMoney(receivable.originalAmountFen)}</strong></div>
        <div className="min-h-28 p-5"><span className="text-xs font-semibold text-[#667085]">有效累计收款</span><strong className="mt-2 block text-2xl tabular-nums">{formatMoney(receivable.receivedAmountFen)}</strong></div>
        <div className="min-h-28 bg-[#f6f9ff] p-5"><span className="text-xs font-semibold text-[#667085]">未收金额</span><strong className="mt-2 block text-2xl tabular-nums text-[#1d4ed8]">{formatMoney(receivable.remainingAmountFen)}</strong></div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.4fr)]">
        <section className="rounded-lg border border-[#e4e7ec] bg-white p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-bold">到期与来源</h2><p className="mt-1 text-xs text-[#667085]">逾期从到期日次日开始，已结清应收不再逾期。</p></div>{receivable.overdue ? <span className="rounded-md border border-[#edb1b1] bg-[#fff0f0] px-2 py-1 text-xs font-semibold whitespace-nowrap text-[#c62828]">逾期 {receivable.overdueDays} 天</span> : <span className="rounded-md border border-[#d0d5dd] bg-[#f8fafc] px-2 py-1 text-xs font-semibold whitespace-nowrap text-[#667085]">{receivable.status === "SETTLED" ? "已结清" : "未逾期"}</span>}</div>
          <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
            {financial ? <><div className="rounded-lg bg-[#f7f9fb] p-3"><dt className="text-xs text-[#667085]">出库日</dt><dd className="mt-1 font-semibold">{formatCalendarDate(financial.outboundAt)}</dd></div><div className="rounded-lg bg-[#f7f9fb] p-3"><dt className="text-xs text-[#667085]">账期快照</dt><dd className="mt-1 font-semibold">{financial.paymentTermDays === 0 ? "现结" : `${financial.paymentTermDays} 天`}</dd></div></> : null}
            <div className="rounded-lg bg-[#f7f9fb] p-3"><dt className="text-xs text-[#667085]">到期日</dt><dd className="mt-1 font-semibold">{formatCalendarDate(receivable.dueDate)}</dd></div>
            <div className="rounded-lg bg-[#f7f9fb] p-3"><dt className="text-xs text-[#667085]">逾期天数</dt><dd className="mt-1 font-semibold">{receivable.overdue ? `${receivable.overdueDays} 天` : "—"}</dd></div>
          </dl>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[#e4e7ec] bg-[#fafbfc] p-3.5">
            <div className="flex min-w-0 items-center gap-3"><IconFileInvoice aria-hidden className="shrink-0 text-[#2563eb]" size={21} /><span className="min-w-0"><strong className="block truncate font-mono text-xs">{receivable.salesOrder.salesOrderNumber}</strong><small className="mt-1 block text-xs text-[#667085]">已出库 · 成交总额 {formatMoney(receivable.originalAmountFen)}</small></span></div>
            {canViewSalesOrder ? <Link href={`/sales-orders/${encodeURIComponent(receivable.salesOrder.id)}`} className="inline-flex min-h-11 shrink-0 items-center rounded-[7px] border border-[#d0d5dd] px-3 text-sm font-semibold text-[#344054]">查看来源</Link> : null}
          </div>
        </section>

        {financial ? (
          <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
            <header className="border-b border-[#e4e7ec] px-5 py-4"><h2 className="text-base font-bold">收款记录</h2><p className="mt-1 text-xs text-[#667085]">记录只追加，不提供编辑或删除。</p></header>
            {financial.payments.length === 0 ? (
              <div className="grid min-h-64 place-items-center p-6 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]"><IconWallet aria-hidden size={21} /></span><h3 className="mt-3 font-semibold">尚未登记收款</h3><p className="mt-2 text-[13px] text-[#667085]">登记第一笔有效收款后，应收会自动变为部分收款。</p>{financial.remainingAmountFen > 0 ? <PaymentDrawerTrigger receivable={{ id: financial.id, receivableNumber: financial.receivableNumber, remainingAmountFen: financial.remainingAmountFen }} submissionKey={randomUUID()} today={chinaToday()} label="登记第一笔收款" className="mt-4" /> : null}</div></div>
            ) : (
              <div className="grid gap-3 p-4">
                {financial.payments.map((payment) => (
                  <article key={payment.id} className="flex items-start gap-3 rounded-lg border border-[#e4e7ec] p-4 max-sm:grid max-sm:grid-cols-[40px_1fr]">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eff6ff] text-[#2563eb]"><IconWallet aria-hidden size={19} /></span>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-base tabular-nums">收款 {formatMoney(payment.amountFen)}</strong><span className="text-xs text-[#667085]">登记于 {formatDateTime(payment.recordedAt)}</span></div><p className="mt-1.5 text-[13px] text-[#475467]">{formatCalendarDate(payment.paymentDate)} · {paymentMethodLabels[payment.method]}{payment.referenceNumber ? ` · ${payment.referenceNumber}` : ""}</p>{payment.note ? <p className="mt-2 rounded-md bg-[#f7f9fb] px-3 py-2 text-xs leading-5 text-[#475467]">备注：{payment.note}</p> : null}<p className="mt-2 text-xs text-[#667085]">登记人：{payment.recordedBy.name}</p></div>
                    {canViewAudit && payment.auditId ? <Link href={`/audit?detail=${encodeURIComponent(payment.auditId)}`} className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-semibold text-[#1d4ed8] max-sm:col-start-2 max-sm:justify-self-start">查看审计</Link> : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-lg border border-[#e4e7ec] bg-white p-5"><h2 className="text-base font-bold">收款进度</h2><p className="mt-2 text-[13px] leading-6 text-[#667085]">当前累计已收 {formatMoney(receivable.receivedAmountFen)}，尚有 {formatMoney(receivable.remainingAmountFen)} 未收，结算状态为“{status.label}”。如需核对具体收款依据，请联系财务。</p></section>
        )}
      </div>
    </div>
  );
}
