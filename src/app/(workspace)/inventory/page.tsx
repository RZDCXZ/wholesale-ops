import type { Metadata } from "next";
import Link from "next/link";

import { listInventory } from "@/application/inventory/inventory-service";
import { prisma } from "@/lib/db";
import { getPageActor } from "@/lib/server-authorization";

export const metadata: Metadata = { title: "库存" };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
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

function InventoryStatus({
  enabled,
  warning,
}: {
  enabled: boolean;
  warning: boolean;
}) {
  if (!enabled) {
    return <span className="inline-flex min-h-6 items-center rounded-md border border-[#d0d5dd] bg-[#f2f4f7] px-2 text-xs font-semibold text-[#667085]">已停用</span>;
  }
  return warning ? (
    <span className="inline-flex min-h-6 items-center rounded-md border border-[#f2c879] bg-[#fffaeb] px-2 text-xs font-semibold text-[#b54708]">库存预警</span>
  ) : (
    <span className="inline-flex min-h-6 items-center rounded-md border border-[#a7d9b6] bg-[#ecfdf3] px-2 text-xs font-semibold text-[#027a48]">正常</span>
  );
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, parameters] = await Promise.all([
    getPageActor("INVENTORY_VIEW"),
    searchParams,
  ]);
  const query = first(parameters.q).trim();
  const category = first(parameters.category).trim();
  const statusValue = first(parameters.status);
  const enabled =
    statusValue === "enabled"
      ? true
      : statusValue === "disabled"
        ? false
        : undefined;
  const inventoryWarning = first(parameters.warning) === "1";
  const items = await listInventory(prisma, actor, {
    query,
    category,
    enabled,
    inventoryWarning,
  });
  const filtersActive = Boolean(query || category || statusValue || inventoryWarning);
  const controlClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] font-normal text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15";

  return (
    <>
      <header className="mb-[18px] flex min-h-[58px] items-start justify-between gap-4 max-md:grid">
        <div><h1 className="text-[29px] leading-tight font-bold tracking-[-0.02em] max-md:text-[22px]">库存</h1><p className="mt-1.5 text-[13px] text-[#667085]">默认仓库 · 可用量 = 现存量 - 预占量</p></div>
        <Link href="/inventory/ledger" className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] bg-white px-4 text-sm font-semibold text-[#344054] hover:bg-[#f9fafb]">查看库存流水</Link>
      </header>

      <section className="overflow-hidden rounded-lg border border-[#e4e7ec] bg-white">
        <form method="get" className="grid items-end gap-3 border-b border-[#e4e7ec] p-3.5 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>搜索</span><input name="q" defaultValue={query} placeholder="SKU 编码或名称" className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>分类</span><input name="category" defaultValue={category} placeholder="例如：紧固件" className={controlClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#475467]"><span>启用状态</span><select name="status" defaultValue={statusValue} className={controlClass}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
          <label className="flex min-h-11 items-center gap-2 rounded-[7px] border border-[#d0d5dd] px-3 text-[13px] font-semibold text-[#344054]"><input type="checkbox" name="warning" value="1" defaultChecked={inventoryWarning} className="size-4 accent-[#2563eb]" />仅看库存预警</label>
          <div className="flex gap-2 md:col-span-2 xl:col-span-4 xl:justify-end"><button type="submit" className="min-h-11 rounded-[7px] border border-[#d0d5dd] px-4 text-[13px] font-semibold text-[#344054]">筛选</button><Link href="/inventory" className="inline-flex min-h-11 items-center justify-center rounded-[7px] px-4 text-[13px] font-semibold text-[#475467] hover:bg-[#f2f4f7]">清除</Link></div>
        </form>

        {items.length === 0 ? (
          <div className="grid min-h-72 place-items-center p-6 text-center"><div><h2 className="text-base font-semibold">{filtersActive ? "当前筛选无结果" : "系统暂无库存资料"}</h2><p className="mt-2 text-[13px] text-[#667085]">{filtersActive ? "请调整 SKU、分类、启用状态或预警条件后重试。" : "老板创建 SKU 并导入期初库存后会显示在这里。"}</p></div></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1080px] border-collapse text-left text-[13px]"><thead className="bg-[#f8fafc] text-[#475467]"><tr>{["SKU 编码", "名称", "库存单位", "现存量", "预占量", "可用量", "预警值", "库存状态", "最近变化时间", ""].map((heading, index) => <th key={`${heading}-${index}`} className="border-b border-[#e4e7ec] px-4 py-3 font-semibold whitespace-nowrap">{heading}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.skuId} className="border-b border-[#eef0f3] last:border-b-0"><td className="px-4 py-3 font-mono text-xs font-semibold text-[#1d4ed8]">{item.skuCode}</td><td className="px-4 py-3 font-semibold">{item.name}</td><td className="px-4 py-3">{item.inventoryUnit}</td><td className="px-4 py-3 text-right tabular-nums">{item.onHandQuantity}</td><td className="px-4 py-3 text-right tabular-nums">{item.reservedQuantity}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{item.availableQuantity}</td><td className="px-4 py-3 text-right tabular-nums">{item.warningThreshold}</td><td className="px-4 py-3"><InventoryStatus enabled={item.enabled} warning={item.inventoryWarning} /></td><td className="px-4 py-3 whitespace-nowrap text-[#667085]">{formatDate(item.lastChangedAt)}</td><td className="px-4 py-3"><Link href={`/inventory/ledger?skuId=${item.skuId}`} className="inline-flex min-h-11 items-center px-2 font-semibold whitespace-nowrap text-[#1d4ed8]">查看流水</Link></td></tr>)}</tbody></table></div>
            <div className="grid divide-y divide-[#e4e7ec] md:hidden">{items.map((item) => <article key={item.skuId} className="grid gap-3 p-4 text-[13px]"><div className="flex items-start justify-between gap-3"><div><span className="font-mono text-xs font-semibold text-[#1d4ed8]">{item.skuCode}</span><h2 className="mt-1 font-semibold">{item.name}</h2><p className="mt-1 text-xs text-[#667085]">{item.category} · {item.inventoryUnit}</p></div><InventoryStatus enabled={item.enabled} warning={item.inventoryWarning} /></div><dl className="grid grid-cols-4 gap-2 rounded-lg bg-[#f7f9fb] p-3 text-center"><div><dt className="text-xs text-[#667085]">现存量</dt><dd className="mt-1 font-semibold">{item.onHandQuantity}</dd></div><div><dt className="text-xs text-[#667085]">预占量</dt><dd className="mt-1 font-semibold">{item.reservedQuantity}</dd></div><div><dt className="text-xs text-[#667085]">可用量</dt><dd className="mt-1 font-semibold">{item.availableQuantity}</dd></div><div><dt className="text-xs text-[#667085]">预警值</dt><dd className="mt-1 font-semibold">{item.warningThreshold}</dd></div></dl><div className="flex items-center justify-between gap-3 text-xs text-[#667085]"><span>最近变化：{formatDate(item.lastChangedAt)}</span><Link href={`/inventory/ledger?skuId=${item.skuId}`} className="inline-flex min-h-11 items-center font-semibold text-[#1d4ed8]">查看流水</Link></div></article>)}</div>
          </>
        )}
      </section>

      <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#d7deea] bg-[#f8fafc] px-4 py-3 text-[13px] text-[#475467]"><strong>数量不可直接编辑。</strong><span>期初库存与后续销售库存活动均通过只追加流水追溯。</span></div>
    </>
  );
}
