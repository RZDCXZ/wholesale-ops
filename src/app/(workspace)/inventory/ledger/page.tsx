import type { InventoryMovementType } from "@/generated/prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import {
  listInventory,
  listInventoryMovements,
} from "@/application/inventory/inventory-service";
import { prisma } from "@/lib/db";
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

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
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
  const dateError =
    (from && !occurredFrom) || (to && !occurredTo)
      ? "请输入真实有效的日期。"
      : occurredFrom && occurredTo && occurredFrom > occurredTo
        ? "开始日期不能晚于结束日期。"
        : undefined;
  const [skus, movements] = await Promise.all([
    listInventory(prisma, actor, {}),
    dateError
      ? Promise.resolve([])
      : listInventoryMovements(prisma, actor, {
        skuId: skuIdValue || undefined,
        movementType,
        dateFrom: occurredFrom,
        dateTo: occurredTo,
        relatedReference: reference,
        actor: actorName,
      }),
  ]);
  const selectedSku = skus.find((sku) => sku.skuId === skuIdValue);
  const skuId = selectedSku?.skuId ?? "";
  const filtersActive = Boolean(skuIdValue || movementType || from || to || reference || actorName);
  const controlClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15";

  return (
    <>
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid">
        <div><p className="text-xs font-semibold text-[#2563eb]">库存 / 流水</p><h1 className="mt-2 text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">库存流水</h1><p className="mt-1.5 text-[13px] text-[#667085]">只追加、只读 · 期初库存与销售库存活动均可追溯</p></div>
        <Link href={selectedSku && actor.roles.includes("OWNER") ? `/skus/${selectedSku.skuId}` : "/inventory"} className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]">{selectedSku && actor.roles.includes("OWNER") ? "返回 SKU 详情" : "返回库存"}</Link>
      </header>

      {selectedSku ? <section className="mb-4 grid gap-3 rounded-lg border border-[#e4e7ec] bg-white p-4 sm:grid-cols-3"><div className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">SKU</span><strong className="mt-1 block font-mono text-sm">{selectedSku.skuCode}</strong></div><div className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">名称与单位</span><strong className="mt-1 block text-sm">{selectedSku.name} · {selectedSku.inventoryUnit}</strong></div><div className="rounded-lg bg-[#f7f9fb] p-3"><span className="text-xs text-[#667085]">当前三数</span><strong className="mt-1 block text-sm">现存 {selectedSku.onHandQuantity} · 预占 {selectedSku.reservedQuantity} · 可用 {selectedSku.availableQuantity}</strong></div></section> : null}

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form method="get" className="grid items-end gap-3 border-b border-[#e4e7ec] p-3.5 md:grid-cols-2 xl:grid-cols-6">
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>SKU</span><select name="skuId" defaultValue={skuId} className={controlClass}><option value="">全部 SKU</option>{skus.map((sku) => <option key={sku.skuId} value={sku.skuId}>{sku.skuCode} · {sku.name}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>动作类型</span><select name="type" defaultValue={movementType ?? ""} className={controlClass}><option value="">全部类型</option>{Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>开始日期</span><input type="date" name="from" defaultValue={from} className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>结束日期</span><input type="date" name="to" defaultValue={to} className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>关联编号</span><input name="reference" defaultValue={reference} placeholder="文件名或销售单编号" className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>操作者</span><input name="actor" defaultValue={actorName} placeholder="姓名" className={controlClass} /></label>
          {dateError ? <p role="alert" className="col-span-full rounded-[7px] border border-[#edb1b1] bg-[#fff0f0] px-3 py-2 text-[13px] text-[#c62828]">{dateError}</p> : null}
          <div className="flex gap-2 md:col-span-2 xl:col-span-6 xl:justify-end"><button type="submit" className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-4 text-[13px] font-semibold text-[#344054]">筛选</button><Link href="/inventory/ledger" className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-4 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]">清除</Link></div>
        </form>

        {movements.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-6 text-center"><div><h2 className="text-base font-semibold">{dateError ? "日期筛选无效" : selectedSku ? "该 SKU 暂无库存流水" : filtersActive ? "当前筛选无库存流水" : "暂无库存流水"}</h2><p className="mt-2 text-[13px] leading-6 text-[#667085]">期初库存、建立或释放预占、出库发生后，记录会按发生时间展示在这里。</p></div></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1180px] border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr>{["发生时间", "SKU", "类型", "现存量变化", "预占量变化", "变化后现存量", "变化后预占量", "变化后可用量", "关联对象", "操作者"].map((heading) => <th key={heading} className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">{heading}</th>)}</tr></thead><tbody>{movements.map((movement) => <tr key={movement.id} className="border-b border-[#eef0f3] last:border-b-0"><td className="px-4 py-3 whitespace-nowrap text-[#667085]">{formatDate(movement.occurredAt)}</td><td className="px-4 py-3"><strong className="block font-mono text-xs text-[#1d4ed8]">{movement.skuCode}</strong><span className="mt-1 block text-xs text-[#667085]">{movement.skuName} · {movement.inventoryUnit}</span></td><td className="px-4 py-3 font-semibold">{movementLabels[movement.movementType]}</td><td className="px-4 py-3 text-right tabular-nums">{signed(movement.onHandDelta)}</td><td className="px-4 py-3 text-right tabular-nums">{signed(movement.reservedDelta)}</td><td className="px-4 py-3 text-right tabular-nums">{movement.onHandAfter}</td><td className="px-4 py-3 text-right tabular-nums">{movement.reservedAfter}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{movement.availableAfter}</td><td className="px-4 py-3">{movement.movementType === "OPENING" ? <Link href={`/audit?reference=${encodeURIComponent(movement.relatedReference ?? movement.relatedId)}`} className="font-semibold text-[#1d4ed8]">{movement.relatedReference ?? "期初库存导入"}</Link> : <span>{movement.relatedReference ?? movement.relatedId}</span>}<span className="mt-1 block text-xs text-[#98a2b3]">{movement.relatedType}</span></td><td className="px-4 py-3 font-semibold">{movement.actorName}</td></tr>)}</tbody></table></div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">{movements.map((movement) => <article key={movement.id} className="grid gap-3 p-4 text-[13px]"><div className="flex items-start justify-between gap-3"><div><strong className="font-mono text-xs text-[#1d4ed8]">{movement.skuCode}</strong><h2 className="mt-1 font-semibold">{movementLabels[movement.movementType]}</h2></div><span className="text-xs text-[#667085]">{formatDate(movement.occurredAt)}</span></div><dl className="grid grid-cols-2 gap-2 rounded-lg bg-[#f7f9fb] p-3"><div><dt className="text-xs text-[#667085]">数量变化</dt><dd className="mt-1 font-semibold">现存 {signed(movement.onHandDelta)} · 预占 {signed(movement.reservedDelta)}</dd></div><div><dt className="text-xs text-[#667085]">变化后三数</dt><dd className="mt-1 font-semibold">{movement.onHandAfter} / {movement.reservedAfter} / {movement.availableAfter}</dd></div></dl><p className="text-[#667085]">关联：{movement.relatedReference ?? movement.relatedId} · 操作者：{movement.actorName}</p></article>)}</div>
          </>
        )}
      </section>
    </>
  );
}
