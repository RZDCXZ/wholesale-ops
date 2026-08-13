import {
  IconPackageExport,
  IconSearch,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { Metadata } from "next";
import Link from "next/link";

import { listPendingOutboundSalesOrders } from "@/application/outbound/outbound-service";
import { OutboundConfirmTrigger } from "@/components/outbound-confirm-dialog";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "待出库" };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function dateBoundary(value: string, boundary: "start" | "end") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return new Date(
    `${value}${boundary === "start" ? "T00:00:00.000+08:00" : "T23:59:59.999+08:00"}`,
  );
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

export default async function OutboundPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, parameters] = await Promise.all([
    getPageActor("OUTBOUND_VIEW"),
    searchParams,
  ]);
  const query = first(parameters.q).trim();
  const from = first(parameters.from);
  const to = first(parameters.to);
  const confirmedFrom = dateBoundary(from, "start");
  const confirmedTo = dateBoundary(to, "end");
  const dateError =
    (from && !confirmedFrom) || (to && !confirmedTo)
      ? "请输入真实有效的日期。"
      : confirmedFrom && confirmedTo && confirmedFrom > confirmedTo
        ? "开始日期不能晚于结束日期。"
        : undefined;
  const tasks = dateError
    ? []
    : await listPendingOutboundSalesOrders(prisma, actor, {
        query,
        confirmedFrom,
        confirmedTo,
      });
  const notice = first(parameters.notice);
  const reference = first(parameters.reference);
  const filtersActive = Boolean(query || from || to);
  const controlClass =
    "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15";

  return (
    <div className="mx-auto max-w-[1320px]">
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-5 max-md:grid">
        <div>
          <h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">
            待出库工作台
          </h1>
          <p className="mt-1.5 text-[13px] text-[#667085]">
            默认仓库 · 只处理已确认销售单的完整交付
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center rounded-md border border-[#a8c7fa] bg-[#eff6ff] px-3 text-sm font-semibold text-[#175cd3]">
          {tasks.length} 张待处理
        </span>
      </header>

      {notice === "outbound" ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]"
        >
          <IconPackageExport aria-hidden className="mt-0.5 shrink-0" size={19} />
          <span>
            {reference ? `${reference} 已完成整单出库。` : "已完成整单出库。"}
            任务已从工作台移除，库存活动与业务审计已同步记录。
          </span>
        </div>
      ) : null}

      <div className="mb-[18px] flex min-h-[54px] items-start gap-3 rounded-lg border border-[#e4e7ec] bg-[#f8fafc] px-4 py-3 text-[13px] text-[#475467]">
        <IconShieldCheck aria-hidden className="mt-0.5 shrink-0" size={19} />
        <div>
          <strong>仓库隐私边界</strong>
          <p className="mt-1 leading-5">
            本工作台仅展示完整交付所需快照，经营与结算字段已在服务端排除。
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form
          action="/warehouse/outbound"
          className="grid gap-3 border-b border-[#e4e7ec] p-3.5 lg:grid-cols-[minmax(260px,1fr)_180px_180px_auto] lg:items-end"
        >
          <label className="grid gap-1.5 text-[13px] font-semibold text-[#475467]">
            <span>销售单编号或客户名称</span>
            <span className="relative">
              <IconSearch
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#98a2b3]"
                size={17}
              />
              <input
                name="q"
                defaultValue={query}
                placeholder="搜索销售单或客户"
                className={`${controlClass} w-full pl-9`}
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-[13px] font-semibold text-[#475467]">
            <span>确认开始日期</span>
            <input name="from" type="date" defaultValue={from} className={controlClass} />
          </label>
          <label className="grid gap-1.5 text-[13px] font-semibold text-[#475467]">
            <span>确认结束日期</span>
            <input name="to" type="date" defaultValue={to} className={controlClass} />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-[7px] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
            >
              筛选
            </button>
            {filtersActive ? (
              <Link
                href="/warehouse/outbound"
                className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]"
              >
                清除
              </Link>
            ) : null}
          </div>
        </form>

        {dateError ? (
          <div className="grid min-h-64 place-items-center p-6 text-center">
            <div>
              <h2 className="font-semibold">确认日期筛选无效</h2>
              <p className="mt-2 text-[13px] text-[#c62828]">{dateError}</p>
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-6 text-center">
            <div>
              <IconPackageExport
                aria-hidden
                className="mx-auto text-[#98a2b3]"
                size={28}
              />
              <h2 className="mt-3 font-semibold">
                {filtersActive ? "当前筛选无待出库任务" : "当前没有待出库销售单"}
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-[#667085]">
                {filtersActive
                  ? "请调整销售单、客户或确认日期条件。"
                  : "销售单确认并建立全部库存预占后，会出现在这里。"}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1120px] border-collapse text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[#475467]">
                  <tr>
                    {["销售单编号", "客户名称", "联系人", "电话", "履约地址", "确认时间", "明细", "操作"].map(
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
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-[#eef0f3] align-top last:border-b-0"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1d4ed8]">
                        {task.salesOrderNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold">{task.customer.name}</td>
                      <td className="px-4 py-3">{task.customer.contactName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{task.customer.phone}</td>
                      <td className="max-w-[280px] px-4 py-3 leading-5">{task.customer.address}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDate(task.confirmedAt)}
                        <span className="mt-1 block text-xs text-[#667085]">
                          {task.confirmedByName}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {task.items.length} 行
                      </td>
                      <td className="px-4 py-2">
                        <OutboundConfirmTrigger task={task} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">
              {tasks.map((task) => (
                <article key={task.id} className="grid gap-3 p-4 text-[13px]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="font-mono text-xs text-[#1d4ed8]">
                        {task.salesOrderNumber}
                      </strong>
                      <h2 className="mt-1 font-semibold">{task.customer.name}</h2>
                    </div>
                    <span className="rounded-md bg-[#eff6ff] px-2 py-1 text-xs font-semibold text-[#175cd3]">
                      {task.items.length} 行
                    </span>
                  </div>
                  <dl className="grid gap-2 rounded-lg bg-[#f7f9fb] p-3">
                    <div>
                      <dt className="text-xs text-[#667085]">联系人与电话</dt>
                      <dd className="mt-1 font-semibold">
                        {task.customer.contactName} · {task.customer.phone}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#667085]">履约地址</dt>
                      <dd className="mt-1 leading-5">{task.customer.address}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#667085]">确认记录</dt>
                      <dd className="mt-1">
                        {formatDate(task.confirmedAt)} · {task.confirmedByName}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex justify-end">
                    <OutboundConfirmTrigger task={task} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      {tasks.length > 0 ? (
        <p className="mt-3 text-xs text-[#667085]">
          当前共 {tasks.length} 张已确认销售单 · 共 {tasks.reduce((total, task) => total + task.items.length, 0)} 条 SKU 明细 · 数量按各自库存单位展示
        </p>
      ) : null}
    </div>
  );
}
