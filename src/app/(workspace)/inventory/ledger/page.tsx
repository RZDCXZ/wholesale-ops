import type { InventoryMovementType } from "@/generated/prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listInventory,
  listInventoryMovementsPage,
  type InventoryMovementSortField,
} from "@/application/inventory/inventory-service";
import { prisma } from "@/lib/db";
import {
  formatQuantity,
  formatSignedQuantity,
} from "@/lib/format-quantity";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "库存流水" };

const movementLabels: Record<InventoryMovementType, string> = {
  OPENING: "期初库存",
  RESERVATION: "建立预占",
  RELEASE: "释放预占",
  OUTBOUND: "出库",
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

type Direction = "asc" | "desc";
type ListState = {
  skuId: string;
  movementType?: InventoryMovementType;
  from: string;
  to: string;
  reference: string;
  actorName: string;
  importId: string;
  sort: InventoryMovementSortField;
  direction: Direction;
  page: number;
  pageSize: number;
};

const sortFields = new Set<InventoryMovementSortField>([
  "occurredAt",
  "skuCode",
  "movementType",
  "onHandDelta",
  "reservedDelta",
  "onHandAfter",
  "reservedAfter",
  "actorName",
]);

function positiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function ledgerHref(state: ListState): string {
  const parameters = new URLSearchParams();
  if (state.skuId) parameters.set("skuId", state.skuId);
  if (state.movementType) parameters.set("type", state.movementType);
  if (state.from) parameters.set("from", state.from);
  if (state.to) parameters.set("to", state.to);
  if (state.reference) parameters.set("reference", state.reference);
  if (state.actorName) parameters.set("actor", state.actorName);
  if (state.importId) parameters.set("importId", state.importId);
  if (state.sort !== "occurredAt") parameters.set("sort", state.sort);
  if (state.direction !== "desc") parameters.set("direction", state.direction);
  if (state.page > 1) parameters.set("page", String(state.page));
  if (state.pageSize !== 20) parameters.set("size", String(state.pageSize));
  const queryString = parameters.toString();
  return queryString ? `/inventory/ledger?${queryString}` : "/inventory/ledger";
}

function SortHeading({
  field,
  label,
  state,
}: {
  field: InventoryMovementSortField;
  label: string;
  state: ListState;
}) {
  const active = state.sort === field;
  const direction = active && state.direction === "asc" ? "desc" : "asc";
  return <th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap"><Link href={ledgerHref({ ...state, sort: field, direction, page: 1 })} className="inline-flex min-h-8 items-center gap-1 text-[#344054] hover:text-[#1d4ed8]">{label}<span aria-hidden>{active ? (state.direction === "asc" ? "↑" : "↓") : "↕"}</span></Link></th>;
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
  const result = new Date(`${value}${suffix}`);
  return Number.isNaN(result.getTime()) ? undefined : result;
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

export default async function InventoryLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, parameters] = await Promise.all([
    getPageActor("INVENTORY_VIEW"),
    searchParams,
  ]);
  const skuIdValue = first(parameters.skuId);
  const typeValue = first(parameters.type) as InventoryMovementType;
  const movementType = typeValue in movementLabels ? typeValue : undefined;
  const from = first(parameters.from);
  const to = first(parameters.to);
  const occurredFrom = dateBoundary(from, "start");
  const occurredTo = dateBoundary(to, "end");
  const reference = first(parameters.reference).trim();
  const actorName = first(parameters.actor).trim();
  const importId = first(parameters.importId).trim();
  const sortValue = first(parameters.sort) as InventoryMovementSortField;
  const sort = sortFields.has(sortValue) ? sortValue : "occurredAt";
  const direction: Direction = first(parameters.direction) === "asc" ? "asc" : "desc";
  const page = positiveInteger(first(parameters.page));
  const requestedPageSize = positiveInteger(first(parameters.size));
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const dateError =
    (from && !occurredFrom) || (to && !occurredTo)
      ? "请输入真实有效的日期。"
      : occurredFrom && occurredTo && occurredFrom > occurredTo
        ? "开始日期不能晚于结束日期。"
        : undefined;
  const listState: ListState = { skuId: skuIdValue, movementType, from, to, reference, actorName, importId, sort, direction, page, pageSize };
  const [skus, movementsPage] = await Promise.all([
    listInventory(prisma, actor, {}),
    dateError
      ? Promise.resolve({ items: [], page: 1, pageSize, total: 0, totalPages: 1 })
      : listInventoryMovementsPage(
          prisma,
          actor,
          {
            skuId: skuIdValue || undefined,
            movementType,
            dateFrom: occurredFrom,
            dateTo: occurredTo,
            importId: importId || undefined,
            relatedReference: reference,
            actor: actorName,
          },
          { page, pageSize, sort, direction },
        ),
  ]);
  if (!dateError && page > movementsPage.totalPages) {
    redirect(ledgerHref({ ...listState, page: movementsPage.totalPages }));
  }
  const movements = movementsPage.items;
  const selectedSku = skus.find((sku) => sku.skuId === skuIdValue);
  const skuId = selectedSku?.skuId ?? "";
  const filtersActive = Boolean(skuIdValue || movementType || from || to || reference || actorName || importId);
  const pageHref = (targetPage: number) => ledgerHref({ ...listState, page: targetPage });
  const controlClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15";

  return (
    <>
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid">
        <div><p className="text-xs font-semibold text-[#2563eb]">库存 / 流水</p><h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">库存流水</h1><p className="mt-1.5 text-[13px] text-[#667085]">只追加、只读 · 期初库存与销售库存活动均可追溯</p></div>
        <Link href={selectedSku && actor.roles.includes("OWNER") ? `/skus/${selectedSku.skuId}` : "/inventory"} className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]">{selectedSku && actor.roles.includes("OWNER") ? "返回 SKU 详情" : "返回库存"}</Link>
      </header>

      {selectedSku ? <section className="mb-4 grid gap-3 rounded-lg border border-[#e4e7ec] bg-white p-4 sm:grid-cols-3"><div className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">SKU</span><strong className="mt-1 block font-mono text-sm">{selectedSku.skuCode}</strong></div><div className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">名称与单位</span><strong className="mt-1 block text-sm">{selectedSku.name} · {selectedSku.inventoryUnit}</strong></div><div className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">当前三数</span><strong className="mt-1 block text-sm">现存 {formatQuantity(selectedSku.onHandQuantity)} · 预占 {formatQuantity(selectedSku.reservedQuantity)} · 可用 {formatQuantity(selectedSku.availableQuantity)}</strong></div></section> : null}

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form method="get" className="grid items-end gap-3 border-b border-[#e4e7ec] p-3.5 md:grid-cols-2 xl:grid-cols-6">
          {importId ? <input type="hidden" name="importId" value={importId} /> : null}
          {sort !== "occurredAt" ? <input type="hidden" name="sort" value={sort} /> : null}
          {direction !== "desc" ? <input type="hidden" name="direction" value={direction} /> : null}
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>SKU</span><select name="skuId" defaultValue={skuId} className={controlClass}><option value="">全部 SKU</option>{skus.map((sku) => <option key={sku.skuId} value={sku.skuId}>{sku.skuCode} · {sku.name}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>动作类型</span><select name="type" defaultValue={movementType ?? ""} className={controlClass}><option value="">全部类型</option>{Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>开始日期</span><input type="date" name="from" defaultValue={from} className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>结束日期</span><input type="date" name="to" defaultValue={to} className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>关联编号</span><input name="reference" defaultValue={reference} placeholder="文件名或销售单编号" className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>操作者</span><input name="actor" defaultValue={actorName} placeholder="姓名" className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>每页条数</span><select name="size" defaultValue={String(pageSize)} className={controlClass}><option value="20">20 条</option><option value="50">50 条</option><option value="100">100 条</option></select></label>
          {dateError ? <p role="alert" className="col-span-full rounded-[7px] border border-[#edb1b1] bg-[#fff0f0] px-3 py-2 text-[13px] text-[#c62828]">{dateError}</p> : null}
          <div className="flex gap-2 md:col-span-2 xl:col-span-5 xl:justify-end"><button type="submit" className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-4 text-[13px] font-semibold text-[#344054]">筛选</button><Link href="/inventory/ledger" className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-4 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]">清除</Link></div>
        </form>

        {movements.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-6 text-center"><div><h2 className="text-base font-semibold">{dateError ? "日期筛选无效" : selectedSku ? "该 SKU 暂无库存流水" : filtersActive ? "当前筛选无库存流水" : "暂无库存流水"}</h2><p className="mt-2 text-[13px] leading-6 text-[#667085]">期初库存、建立或释放预占、出库发生后，记录会按发生时间展示在这里。</p></div></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1180px] border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr><SortHeading field="occurredAt" label="发生时间" state={listState} /><SortHeading field="skuCode" label="SKU" state={listState} /><SortHeading field="movementType" label="类型" state={listState} /><SortHeading field="onHandDelta" label="现存量变化" state={listState} /><SortHeading field="reservedDelta" label="预占量变化" state={listState} /><SortHeading field="onHandAfter" label="变化后现存量" state={listState} /><SortHeading field="reservedAfter" label="变化后预占量" state={listState} /><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">变化后可用量</th><th className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">关联对象</th><SortHeading field="actorName" label="操作者" state={listState} /></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id} className="border-b border-[#eef0f3] last:border-b-0"><td className="px-4 py-3 whitespace-nowrap text-[#667085]">{formatDate(movement.occurredAt)}</td><td className="px-4 py-3"><strong className="block font-mono text-xs text-[#1d4ed8]">{movement.skuCode}</strong><span className="mt-1 block text-xs text-[#667085]">{movement.skuName} · {movement.inventoryUnit}</span></td><td className="px-4 py-3 font-semibold">{movementLabels[movement.movementType]}</td><td className="px-4 py-3 text-right tabular-nums">{formatSignedQuantity(movement.onHandDelta)}</td><td className="px-4 py-3 text-right tabular-nums">{formatSignedQuantity(movement.reservedDelta)}</td><td className="px-4 py-3 text-right tabular-nums">{formatQuantity(movement.onHandAfter)}</td><td className="px-4 py-3 text-right tabular-nums">{formatQuantity(movement.reservedAfter)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatQuantity(movement.availableAfter)}</td><td className="px-4 py-3">{movement.movementType === "OPENING" ? <Link href={`/inventory/opening/${encodeURIComponent(movement.relatedId)}`} className="font-semibold text-[#1d4ed8]">{movement.relatedReference ?? "期初库存导入"}</Link> : <span>{movement.relatedReference ?? movement.relatedId}</span>}<span className="mt-1 block text-xs text-[#98a2b3]">{movement.relatedType}</span></td><td className="px-4 py-3 font-semibold">{movement.actorName}</td></tr>)}</tbody></table></div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">{movements.map((movement) => <article key={movement.id} className="grid gap-3 p-4 text-[13px]"><div className="flex items-start justify-between gap-3"><div><strong className="font-mono text-xs text-[#1d4ed8]">{movement.skuCode}</strong><h2 className="mt-1 font-semibold">{movementLabels[movement.movementType]}</h2></div><span className="text-xs text-[#667085]">{formatDate(movement.occurredAt)}</span></div><dl className="grid grid-cols-2 gap-2 rounded-lg bg-[#f7f9fb] p-3"><div><dt className="text-xs text-[#667085]">数量变化</dt><dd className="mt-1 font-semibold">现存 {formatSignedQuantity(movement.onHandDelta)} · 预占 {formatSignedQuantity(movement.reservedDelta)}</dd></div><div><dt className="text-xs text-[#667085]">变化后三数</dt><dd className="mt-1 font-semibold">{formatQuantity(movement.onHandAfter)} / {formatQuantity(movement.reservedAfter)} / {formatQuantity(movement.availableAfter)}</dd></div></dl><p className="text-[#667085]">关联：{movement.movementType === "OPENING" ? <Link href={`/inventory/opening/${encodeURIComponent(movement.relatedId)}`} className="font-semibold text-[#1d4ed8]">{movement.relatedReference ?? "期初库存导入"}</Link> : movement.relatedReference ?? movement.relatedId} · 操作者：{movement.actorName}</p></article>)}</div>
          </>
        )}

        {movementsPage.total > 0 ? <footer className="flex items-center justify-between gap-3 border-t border-[#e4e7ec] px-4 py-3 text-[13px] text-[#667085]"><span>共 {formatQuantity(movementsPage.total)} 条 · 第 {movementsPage.page}/{movementsPage.totalPages} 页</span><div className="flex gap-2">{page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">上一页</Link> : null}{page < movementsPage.totalPages ? <Link href={pageHref(page + 1)} className="inline-flex min-h-11 items-center rounded-[7px] border border-[#d0d5dd] px-3 font-semibold text-[#344054]">下一页</Link> : null}</div></footer> : null}
      </section>
    </>
  );
}
