import {
  IconAlertTriangle,
  IconChevronRight,
  IconPackage,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getOperationsOverview } from "@/application/overview/operations-overview-service";
import { OverviewRefreshButton } from "@/components/overview-refresh-button";
import { PaymentTrendChart } from "@/components/payment-trend-chart";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format-money";
import { formatQuantity } from "@/lib/format-quantity";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = {
  title: "经营总览",
};

export default async function OverviewPage() {
  const actor = await getPageActor("OVERVIEW_VIEW");
  const overview = await getOperationsOverview(prisma, actor);
  const metrics = [
    {
      label: "今日销售额",
      value: formatMoney(overview.todaySales.amountFen),
      detail: `${formatQuantity(overview.todaySales.count)} 张已出库销售单`,
      href: `/sales-orders?status=OUTBOUND&outboundOn=${overview.asOfDate}`,
    },
    {
      label: "今日收款额",
      value: formatMoney(overview.todayPayments.amountFen),
      detail: `${formatQuantity(overview.todayPayments.count)} 笔有效收款`,
      href: `/receivables?paymentRecordedOn=${overview.asOfDate}`,
    },
    {
      label: "未收金额",
      value: formatMoney(overview.receivables.remainingAmountFen),
      detail: `${formatQuantity(overview.receivables.unsettledCount)} 笔未结清应收`,
      href: "/receivables?outstanding=1",
    },
    {
      label: "逾期金额",
      value: formatMoney(overview.receivables.overdueAmountFen),
      detail: `${formatQuantity(overview.receivables.overdueCount)} 笔逾期应收`,
      href: "/receivables?overdue=1",
      risk: true,
    },
  ];
  const warningItems = overview.inventoryWarnings.items.slice(0, 5);

  return (
    <>
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-[430px]:items-center">
        <div>
          <h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">
            经营总览
          </h1>
          <p className="mt-1.5 text-[13px] text-[#667085]">
            {overview.asOfDate} · 今日按中国标准时间统计
          </p>
        </div>
        <OverviewRefreshButton />
      </header>

      <section aria-label="经营指标" className="mb-[18px] grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Link
            key={metric.label}
            href={metric.href}
            className="group flex min-h-[130px] min-w-0 flex-col items-start rounded-lg border border-[#e4e7ec] bg-white p-[18px] text-left hover:border-[#b6d2ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] max-[430px]:min-h-[104px] max-[430px]:p-3.5"
          >
            <span className="flex w-full items-center justify-between gap-2 text-[13px] text-[#667085]">
              {metric.label}
              <IconChevronRight
                aria-hidden
                size={16}
                className="shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </span>
            <strong
              className={`mt-3 mb-2 text-[25px] leading-tight font-bold tracking-[-0.02em] tabular-nums max-[430px]:text-xl ${metric.risk ? "text-[#c62828]" : "text-[#17202a]"}`}
            >
              {metric.value}
            </strong>
            <small className="text-xs text-[#667085]">{metric.detail}</small>
          </Link>
        ))}
      </section>

      <div className="grid min-w-0 gap-[18px] xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
          <header className="flex min-h-[70px] items-start justify-between gap-4 border-b border-[#e4e7ec] px-[18px] py-4">
            <div>
              <h2 className="text-base font-semibold">最近 30 天收款趋势</h2>
              <p className="mt-1 text-xs text-[#667085]">
                按收款日期汇总有效收款金额
              </p>
            </div>
            <span className="inline-flex min-h-6 items-center rounded-md border border-[#d0d5dd] bg-[#f8fafc] px-2 text-xs font-semibold text-[#475467]">
              人民币
            </span>
          </header>
          <PaymentTrendChart data={overview.paymentTrend} />
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
          <header className="flex min-h-[70px] items-start justify-between gap-3 border-b border-[#e4e7ec] px-[18px] py-4">
            <div>
              <h2 className="text-base font-semibold">库存预警</h2>
              <p className="mt-1 text-xs text-[#667085]">
                可用量小于或等于预警值
              </p>
            </div>
            <Link
              href="/inventory?status=enabled&warning=1"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold text-[#b54708]"
            >
              {formatQuantity(overview.inventoryWarnings.count)} 个 SKU
              <IconChevronRight aria-hidden size={18} />
            </Link>
          </header>

          {warningItems.length === 0 ? (
            <div className="grid min-h-[278px] place-items-center p-6 text-center">
              <div className="grid justify-items-center">
                <span className="grid size-12 place-items-center rounded-full bg-[#f2f4f7] text-[#667085]">
                  <IconPackage aria-hidden size={23} />
                </span>
                <h3 className="mt-3 text-sm font-semibold">当前没有库存预警</h3>
                <p className="mt-1 text-xs leading-5 text-[#667085]">
                  启用 SKU 的可用量都高于各自预警值。
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full table-fixed border-collapse text-left text-[13px]">
                  <thead className="bg-[#f8fafc] text-[#475467]">
                    <tr>
                      {["SKU 编码", "名称", "可用量", "预警值"].map(
                        (heading) => (
                          <th
                            key={heading}
                            className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap"
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {warningItems.map((item) => (
                      <tr
                        key={item.skuId}
                        className="border-b border-[#eef0f3] last:border-b-0"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap text-[#1d4ed8]">
                          {item.skuCode}
                        </td>
                        <td className="px-4 py-3 font-semibold">{item.name}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {formatQuantity(item.availableQuantity)} {item.inventoryUnit}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatQuantity(item.warningThreshold)} {item.inventoryUnit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid divide-y divide-[#e4e7ec] sm:hidden">
                {warningItems.map((item) => (
                  <article key={item.skuId} className="grid gap-3 p-4 text-[13px]">
                    <div className="flex items-start gap-3">
                      <IconAlertTriangle
                        aria-hidden
                        size={18}
                        className="mt-0.5 shrink-0 text-[#b54708]"
                      />
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-[#1d4ed8]">
                          {item.skuCode}
                        </span>
                        <h3 className="mt-1 font-semibold">{item.name}</h3>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 rounded-lg bg-[#f7f9fb] p-3 text-center">
                      <div>
                        <dt className="text-xs text-[#667085]">可用量</dt>
                        <dd className="mt-1 font-semibold tabular-nums">
                          {formatQuantity(item.availableQuantity)} {item.inventoryUnit}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[#667085]">预警值</dt>
                        <dd className="mt-1 font-semibold tabular-nums">
                          {formatQuantity(item.warningThreshold)} {item.inventoryUnit}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
