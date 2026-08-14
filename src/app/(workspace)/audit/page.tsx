import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AccountServiceError,
  getBusinessAudit,
  listBusinessAuditPage,
  type BusinessAuditListPage,
} from "@/application/accounts/account-service";
import { AuditDetailDrawer } from "@/components/audit-detail-drawer";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "业务审计" };

const actionOptions = [
  { value: "ACCOUNT_CREATED", label: "创建账号" },
  { value: "ACCOUNT_ROLES_UPDATED", label: "调整账号角色" },
  { value: "ACCOUNT_DISABLED", label: "停用账号" },
  { value: "SKU_CREATED", label: "创建 SKU" },
  { value: "SKU_UPDATED", label: "编辑 SKU" },
  { value: "SKU_DISABLED", label: "停用 SKU" },
  { value: "SKU_DELETED", label: "删除 SKU" },
  { value: "SKU_IMPORTED", label: "导入 SKU" },
  { value: "OPENING_INVENTORY_IMPORTED", label: "导入期初库存" },
  { value: "CUSTOMER_CREATED", label: "创建客户" },
  { value: "CUSTOMER_UPDATED", label: "编辑客户" },
  { value: "CUSTOMER_RESPONSIBLE_SALES_CHANGED", label: "调整客户负责人" },
  { value: "CUSTOMER_DISABLED", label: "停用客户" },
  { value: "CUSTOMER_DELETED", label: "删除客户" },
  { value: "SALES_ORDER_DRAFT_CREATED", label: "创建销售单草稿" },
  { value: "SALES_ORDER_DRAFT_UPDATED", label: "编辑销售单草稿" },
  { value: "SALES_ORDER_DRAFT_DELETED", label: "删除销售单草稿" },
  { value: "SALES_ORDER_CONFIRMED", label: "确认销售单" },
  { value: "SALES_ORDER_CANCELLED", label: "取消销售单" },
  { value: "SALES_ORDER_OUTBOUND", label: "完成整单出库" },
  { value: "PAYMENT_RECORDED", label: "登记收款" },
  { value: "PAYMENT_REVERSED", label: "撤销收款" },
  { value: "DATA_EXPORTED", label: "导出" },
] as const;
const objectOptions = [
  { value: "ACCOUNT", label: "账号" },
  { value: "SKU", label: "SKU" },
  { value: "CUSTOMER", label: "客户" },
  { value: "DATA_IMPORT", label: "导入记录" },
  { value: "SALES_ORDER", label: "销售单" },
  { value: "PAYMENT", label: "收款" },
  { value: "SALES_ORDER_EXPORT", label: "销售单导出" },
  { value: "RECEIVABLE_EXPORT", label: "应收导出" },
  { value: "INVENTORY_MOVEMENT_EXPORT", label: "库存流水导出" },
] as const;
const actionLabels = Object.fromEntries(
  actionOptions.map(({ value, label }) => [value, label]),
) as Record<string, string>;
const objectLabels = Object.fromEntries(
  objectOptions.map(({ value, label }) => [value, label]),
) as Record<string, string>;
const validActions = new Set<string>(actionOptions.map(({ value }) => value));
const validObjectTypes = new Set<string>(
  objectOptions.map(({ value }) => value),
);

type AuditFilters = {
  from: string;
  to: string;
  actor: string;
  action: string;
  objectType: string;
  reference: string;
  pageSize: number;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function positiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function dateBoundary(value: string, boundary: "start" | "end") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year!, month! - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month! - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return undefined;
  }
  const suffix = boundary === "start" ? "T00:00:00.000+08:00" : "T23:59:59.999+08:00";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function auditHref(
  filters: AuditFilters,
  page = 1,
  detail?: string,
): string {
  const parameters = new URLSearchParams();
  if (filters.from) parameters.set("from", filters.from);
  if (filters.to) parameters.set("to", filters.to);
  if (filters.actor) parameters.set("actor", filters.actor);
  if (filters.action) parameters.set("action", filters.action);
  if (filters.objectType) parameters.set("objectType", filters.objectType);
  if (filters.reference) parameters.set("reference", filters.reference);
  if (page > 1) parameters.set("page", String(page));
  if (filters.pageSize !== 20) parameters.set("size", String(filters.pageSize));
  if (detail) parameters.set("detail", detail);
  const queryString = parameters.toString();
  return queryString ? `/audit?${queryString}` : "/audit";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getPageActor("AUDIT_VIEW");
  const parameters = await searchParams;
  const actionValue = first(parameters.action);
  const objectTypeValue = first(parameters.objectType);
  const requestedPageSize = positiveInteger(first(parameters.size));
  const pageSize = [20, 50, 100].includes(requestedPageSize)
    ? requestedPageSize
    : 20;
  const filters: AuditFilters = {
    from: first(parameters.from),
    to: first(parameters.to),
    actor: first(parameters.actor).trim(),
    action: validActions.has(actionValue) ? actionValue : "",
    objectType: validObjectTypes.has(objectTypeValue) ? objectTypeValue : "",
    reference: first(parameters.reference).trim(),
    pageSize,
  };
  const page = positiveInteger(first(parameters.page));
  const occurredFrom = dateBoundary(filters.from, "start");
  const occurredTo = dateBoundary(filters.to, "end");
  const dateError =
    (filters.from && !occurredFrom) || (filters.to && !occurredTo)
      ? "请输入真实有效的日期。"
      : occurredFrom && occurredTo && occurredFrom > occurredTo
        ? "开始日期不能晚于结束日期。"
        : undefined;
  const auditPage: BusinessAuditListPage = dateError
    ? { items: [], page: 1, pageSize, total: 0, totalPages: 1 }
    : await listBusinessAuditPage(
        prisma,
        actor,
        {
          occurredFrom,
          occurredTo,
          actor: filters.actor,
          action: filters.action,
          objectType: filters.objectType,
          referenceCode: filters.reference,
        },
        { page, pageSize },
      );

  if (page > auditPage.totalPages) {
    redirect(auditHref(filters, auditPage.totalPages));
  }

  const detailId = first(parameters.detail);
  let detailAudit;
  if (detailId) {
    try {
      detailAudit = await getBusinessAudit(prisma, actor, detailId);
    } catch (error) {
      if (error instanceof AccountServiceError) {
        redirect(auditHref(filters, page));
      }
      throw error;
    }
  }

  const filtersActive = Boolean(
    filters.from ||
      filters.to ||
      filters.actor ||
      filters.action ||
      filters.objectType ||
      filters.reference,
  );
  const pageHref = (targetPage: number) => auditHref(filters, targetPage);

  return (
    <>
      <header className="mb-[18px] min-h-[58px]">
        <h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">
          业务审计
        </h1>
        <p className="mt-1.5 text-[13px] text-[#667085]">
          关键经营动作的只追加记录，不代表防篡改或合规认证
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form
          method="get"
          className="grid grid-cols-6 gap-2.5 border-b border-[#e4e7ec] p-3.5 max-xl:grid-cols-3 max-md:grid-cols-2"
        >
          <label className="grid gap-1 text-xs font-semibold text-[#475467]">
            开始日期
            <input
              type="date"
              name="from"
              defaultValue={filters.from}
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? "audit-date-error" : undefined}
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-3 font-normal text-[#344054]"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#475467]">
            结束日期
            <input
              type="date"
              name="to"
              defaultValue={filters.to}
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? "audit-date-error" : undefined}
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-3 font-normal text-[#344054]"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#475467]">
            操作者
            <input
              name="actor"
              defaultValue={filters.actor}
              placeholder="姓名"
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-3 font-normal text-[#344054]"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#475467]">
            动作
            <select
              name="action"
              defaultValue={filters.action}
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 font-normal text-[#344054]"
            >
              <option value="">全部动作</option>
              {actionOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#475467]">
            对象类型
            <select
              name="objectType"
              defaultValue={filters.objectType}
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 font-normal text-[#344054]"
            >
              <option value="">全部对象</option>
              {objectOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#475467]">
            关联编号
            <input
              name="reference"
              defaultValue={filters.reference}
              placeholder="邮箱或业务编号"
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-3 font-normal text-[#344054]"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#475467]">
            每页条数
            <select
              name="size"
              defaultValue={String(filters.pageSize)}
              className="min-h-11 rounded-[7px] border border-[#d0d5dd] bg-white px-3 font-normal text-[#344054]"
            >
              <option value="20">20 条</option>
              <option value="50">50 条</option>
              <option value="100">100 条</option>
            </select>
          </label>
          {dateError ? (
            <p
              id="audit-date-error"
              role="alert"
              className="col-span-full rounded-[7px] border border-[#edb1b1] bg-[#fff0f0] px-3 py-2 text-[13px] text-[#c62828]"
            >
              {dateError}
            </p>
          ) : null}
          <div className="col-span-full flex justify-end gap-2">
            <Link
              href="/audit"
              className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-3 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]"
            >
              清除筛选
            </Link>
            <Button type="submit">筛选</Button>
          </div>
        </form>

        {auditPage.items.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-6 text-center">
            <div>
              <h2 className="text-base font-semibold">
                {dateError
                  ? "日期筛选无效"
                  : filtersActive
                    ? "当前筛选无结果"
                    : "暂无业务审计"}
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-[#667085]">
                {dateError
                  ? "请修正日期范围后重试。"
                  : filtersActive
                  ? "请调整时间、操作者、动作、对象或关联编号后重试。"
                  : "账号和 SKU 等关键资料发生变更后会在这里留下记录。"}
              </p>
              {filtersActive ? (
                <Link
                  href="/audit"
                  className="mt-4 inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]"
                >
                  清除筛选
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="bg-[#f8fafc] text-[#475467]">
                  <tr>
                    {["发生时间", "操作者", "动作", "对象", "关联编号", "原因 / 变更摘要", ""].map(
                      (heading, index) => (
                        <th
                          key={`${heading}-${index}`}
                          className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {auditPage.items.map((audit) => (
                    <tr key={audit.id} className="border-b border-[#eef0f3] last:border-b-0">
                      <td className="px-4 py-3 whitespace-nowrap text-[#475467]">
                        {formatDate(audit.occurredAt)}
                      </td>
                      <td className="px-4 py-3 font-semibold">{audit.actorName}</td>
                      <td className="px-4 py-3">
                        {actionLabels[audit.action] ?? audit.action}
                      </td>
                      <td className="px-4 py-3">
                        {objectLabels[audit.objectType] ?? audit.objectType}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#344054]">
                        {audit.referenceCode ?? "—"}
                      </td>
                      <td className="max-w-md px-4 py-3 leading-5 text-[#667085]">
                        {audit.reason ? (
                          <span className="block">原因：{audit.reason}</span>
                        ) : null}
                        {audit.summary ? (
                          <span className="block">变更：{audit.summary}</span>
                        ) : null}
                        {!audit.reason && !audit.summary ? "—" : null}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          data-audit-trigger={audit.id}
                          href={auditHref(filters, page, audit.id)}
                          className="inline-flex min-h-11 items-center px-2 font-semibold whitespace-nowrap text-[#1d4ed8]"
                        >
                          查看详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid divide-y divide-[#e4e7ec] md:hidden">
              {auditPage.items.map((audit) => (
                <article key={audit.id} className="grid gap-2.5 p-4 text-[13px]">
                  <div className="flex items-start justify-between gap-3">
                    <strong>{actionLabels[audit.action] ?? audit.action}</strong>
                    <span className="text-xs whitespace-nowrap text-[#667085]">
                      {formatDate(audit.occurredAt)}
                    </span>
                  </div>
                  <span>
                    操作者：<b>{audit.actorName}</b>
                  </span>
                  <span className="text-[#475467]">
                    对象：{objectLabels[audit.objectType] ?? audit.objectType} · 关联编号：
                    {audit.referenceCode ?? "—"}
                  </span>
                  <p className="leading-5 text-[#667085]">
                    {audit.reason ? `原因：${audit.reason}` : null}
                    {audit.reason && audit.summary ? "；" : null}
                    {audit.summary ? `变更：${audit.summary}` : null}
                    {!audit.reason && !audit.summary ? "—" : null}
                  </p>
                  <Link
                    data-audit-trigger={audit.id}
                    href={auditHref(filters, page, audit.id)}
                    className="inline-flex min-h-11 w-fit items-center font-semibold text-[#1d4ed8]"
                  >
                    查看详情
                  </Link>
                </article>
              ))}
            </div>
          </>
        )}

        {auditPage.total > 0 ? (
          <footer className="flex items-center justify-between gap-3 border-t border-[#e4e7ec] px-4 py-3 text-[13px] text-[#667085]">
            <span>
              共 {auditPage.total} 条记录 · 第 {auditPage.page}/{auditPage.totalPages} 页
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]"
                >
                  上一页
                </Link>
              ) : null}
              {page < auditPage.totalPages ? (
                <Link
                  href={pageHref(page + 1)}
                  className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]"
                >
                  下一页
                </Link>
              ) : null}
            </div>
          </footer>
        ) : null}
      </section>

      {detailAudit ? (
        <AuditDetailDrawer
          closeHref={auditHref(filters, page)}
          returnFocusId={detailAudit.id}
          audit={{
            id: detailAudit.id,
            title: actionLabels[detailAudit.action] ?? detailAudit.action,
            occurredAt: formatDate(detailAudit.occurredAt),
            actorName: detailAudit.actorName,
            action: actionLabels[detailAudit.action] ?? detailAudit.action,
            objectType:
              objectLabels[detailAudit.objectType] ?? detailAudit.objectType,
            referenceCode: detailAudit.referenceCode ?? "—",
            reason: detailAudit.reason ?? "—",
            summary: detailAudit.summary ?? "—",
            accountHref:
              detailAudit.objectType === "ACCOUNT"
                ? `/settings/accounts/${detailAudit.objectId}`
                : detailAudit.objectType === "SKU" && detailAudit.action !== "SKU_DELETED"
                  ? `/skus/${detailAudit.objectId}`
                  : detailAudit.objectType === "CUSTOMER" && detailAudit.action !== "CUSTOMER_DELETED"
                    ? `/customers/${detailAudit.objectId}`
                  : detailAudit.objectType === "SALES_ORDER" && detailAudit.action !== "SALES_ORDER_DRAFT_DELETED"
                    ? `/sales-orders/${detailAudit.objectId}`
                : undefined,
          }}
        />
      ) : null}
    </>
  );
}
