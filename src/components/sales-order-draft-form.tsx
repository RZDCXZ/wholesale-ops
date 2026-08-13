"use client";

import { IconAlertCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  createSalesOrderDraftAction,
  type SalesOrderActionState,
  updateSalesOrderDraftAction,
} from "@/app/(workspace)/sales-orders/actions";
import { Button } from "@/components/ui/button";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

export type SalesOrderCustomerOption = {
  id: string;
  customerCode: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  responsibleSales: { id: string; name: string };
  paymentTermDays: number;
};
export type SalesOrderSkuOption = {
  id: string;
  skuCode: string;
  name: string;
  inventoryUnit: string;
  referencePriceFen: number;
  availableQuantity: number;
};
type EditableDraft = {
  id: string;
  salesOrderNumber: string;
  customerId: string;
  customerSnapshot: {
    customerCode: string;
    name: string;
    contactName: string;
    phone: string;
    address: string;
    responsibleSalesId: string;
    responsibleSalesName: string;
    paymentTermDays: number;
  };
  items: Array<{
    id: string;
    skuId: string;
    skuCode: string;
    skuName: string;
    inventoryUnit: string;
    referencePriceFen: number;
    availableQuantity: number;
    quantity: number;
    transactionPriceFen: number;
  }>;
};
type DraftRow = {
  clientId: string;
  skuId: string;
  skuQuery: string;
  quantity: string;
  transactionPrice: string;
  fallbackSku?: SalesOrderSkuOption;
};

const initialActionState: SalesOrderActionState = { status: "idle" };
const controlClass = "min-h-11 min-w-0 rounded-[7px] border border-[#d0d5dd] bg-white px-3 text-[13px] text-[#344054] outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-blue-500/15 disabled:bg-[#f2f4f7]";
const positiveIntegerPattern = /^\d+$/;
const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

function formatMoney(fen: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(fen / 100);
}

function moneyToFen(value: string): number | undefined {
  if (!moneyPattern.test(value.trim())) return undefined;
  const [yuan, fractional = ""] = value.trim().split(".");
  const fen = Number(yuan) * 100 + Number(fractional.padEnd(2, "0"));
  return Number.isSafeInteger(fen) ? fen : undefined;
}

function paymentTerm(days: number): string {
  return days === 0 ? "现结（交付当天到期）" : `${days} 天`;
}

export function SalesOrderDraftForm({
  customers,
  skus,
  draft,
  notice,
}: {
  customers: SalesOrderCustomerOption[];
  skus: SalesOrderSkuOption[];
  draft?: EditableDraft;
  notice?: string;
}) {
  const mode = draft ? "edit" : "create";
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createSalesOrderDraftAction : updateSalesOrderDraftAction,
    initialActionState,
  );
  const nextRowId = useRef((draft?.items.length ?? 0) + 1);
  const [customerId, setCustomerId] = useState(draft?.customerId ?? "");
  const [rows, setRows] = useState<DraftRow[]>(() =>
    draft?.items.length
      ? draft.items.map((item, index) => ({
          clientId: `saved-${item.id}-${index}`,
          skuId: item.skuId,
          skuQuery: "",
          quantity: String(item.quantity),
          transactionPrice: (item.transactionPriceFen / 100).toFixed(2),
          fallbackSku: {
            id: item.skuId,
            skuCode: item.skuCode,
            name: item.skuName,
            inventoryUnit: item.inventoryUnit,
            referencePriceFen: item.referencePriceFen,
            availableQuantity: item.availableQuantity,
          },
        }))
      : [{ clientId: "new-1", skuId: "", skuQuery: "", quantity: "1", transactionPrice: "" }],
  );
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty);
  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const skuById = useMemo(
    () => new Map(skus.map((sku) => [sku.id, sku])),
    [skus],
  );

  useEffect(() => {
    if (state.status === "error") {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    }
  }, [state]);

  const selectedCustomer = useMemo(() => {
    if (draft && customerId === draft.customerId) {
      return {
        id: draft.customerId,
        customerCode: draft.customerSnapshot.customerCode,
        name: draft.customerSnapshot.name,
        contactName: draft.customerSnapshot.contactName,
        phone: draft.customerSnapshot.phone,
        address: draft.customerSnapshot.address,
        responsibleSales: {
          id: draft.customerSnapshot.responsibleSalesId,
          name: draft.customerSnapshot.responsibleSalesName,
        },
        paymentTermDays: draft.customerSnapshot.paymentTermDays,
      };
    }
    return customerById.get(customerId);
  }, [customerById, customerId, draft]);

  const skuForRow = (row: DraftRow) =>
    skuById.get(row.skuId) ?? row.fallbackSku;
  const rowSubtotal = (row: DraftRow) => {
    const quantity = positiveIntegerPattern.test(row.quantity) ? Number(row.quantity) : undefined;
    const priceFen = moneyToFen(row.transactionPrice);
    return quantity && Number.isSafeInteger(quantity) && priceFen !== undefined
      ? quantity * priceFen
      : undefined;
  };
  const subtotals = rows.map(rowSubtotal);
  const totalAmountFen = subtotals.every((subtotal) => subtotal !== undefined)
    ? (subtotals as number[]).reduce((total, subtotal) => total + subtotal, 0)
    : undefined;
  const errorFor = (field: string) => state.fieldErrors?.[field]?.[0];

  const updateRow = (clientId: string, changes: Partial<DraftRow>) => {
    setDirty(true);
    setRows((current) =>
      current.map((row) => (row.clientId === clientId ? { ...row, ...changes } : row)),
    );
  };
  const selectSku = (row: DraftRow, skuId: string) => {
    const sku = skuById.get(skuId);
    updateRow(row.clientId, {
      skuId,
      fallbackSku: undefined,
      transactionPrice: sku ? (sku.referencePriceFen / 100).toFixed(2) : "",
    });
  };
  const addRow = () => {
    nextRowId.current += 1;
    setDirty(true);
    setRows((current) => [
      ...current,
      {
        clientId: `new-${nextRowId.current}`,
        skuId: "",
        skuQuery: "",
        quantity: "1",
        transactionPrice: "",
      },
    ]);
  };

  return (
    <form action={formAction} className="grid gap-5">
      {draft ? <input type="hidden" name="salesOrderId" value={draft.id} /> : null}
      <input type="hidden" name="customerId" value={customerId} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          rows.map(({ skuId, quantity, transactionPrice }) => ({
            skuId,
            quantity,
            transactionPrice,
          })),
        )}
      />

      {notice ? (
        <div role="status" className="rounded-lg border border-[#a7d9b6] bg-[#ecfdf3] px-4 py-3 text-[13px] font-semibold text-[#027a48]">
          {notice}
        </div>
      ) : null}
      {state.status === "error" && state.message ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-[#edb1b1] bg-[#fff0f0] px-3 py-2.5 text-[13px] text-[#c62828]">
          <IconAlertCircle aria-hidden size={18} />
          {state.message}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-lg border border-[#e4e7ec] bg-white p-4 md:p-5">
        <div>
          <h2 className="text-base font-bold">1. 客户与账期</h2>
          <p className="mt-1 text-xs leading-5 text-[#667085]">草稿保存交易快照；后续客户资料变化不会改写已保存快照。</p>
        </div>
        <label className="grid gap-1.5 text-[13px] font-semibold text-[#475467]">
          <span>客户 <b className="text-[#c62828]">*</b></span>
          <select
            aria-label="客户"
            value={customerId}
            onChange={(event) => {
              setDirty(true);
              setCustomerId(event.target.value);
            }}
            aria-invalid={Boolean(errorFor("customerId"))}
            aria-describedby={errorFor("customerId") ? "sales-order-customer-error" : undefined}
            className={controlClass}
          >
            <option value="">请选择当前可操作且启用的客户</option>
            {draft ? (
              <option value={draft.customerId}>{draft.customerSnapshot.customerCode} · {draft.customerSnapshot.name}{customerById.has(draft.customerId) ? "（草稿快照）" : "（当前不可用）"}</option>
            ) : null}
            {customers.filter((customer) => customer.id !== draft?.customerId).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.customerCode} · {customer.name}
              </option>
            ))}
          </select>
          {errorFor("customerId") ? <span id="sales-order-customer-error" className="text-xs font-normal text-[#c62828]">{errorFor("customerId")}</span> : null}
        </label>
        {selectedCustomer ? (
          <dl className="grid gap-px overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#e4e7ec] text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-[#fafbfc] p-3"><dt className="text-xs text-[#667085]">联系人与电话</dt><dd className="mt-1 font-semibold">{selectedCustomer.contactName} · {selectedCustomer.phone}</dd></div>
            <div className="bg-[#fafbfc] p-3"><dt className="text-xs text-[#667085]">客户负责人</dt><dd className="mt-1 font-semibold">{selectedCustomer.responsibleSales.name}</dd></div>
            <div className="bg-[#fafbfc] p-3"><dt className="text-xs text-[#667085]">账期快照</dt><dd className="mt-1 font-semibold">{paymentTerm(selectedCustomer.paymentTermDays)}</dd></div>
            <div className="bg-[#fafbfc] p-3 sm:col-span-2 lg:col-span-1"><dt className="text-xs text-[#667085]">履约地址</dt><dd className="mt-1 font-semibold leading-5">{selectedCustomer.address}</dd></div>
          </dl>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border border-[#e4e7ec] bg-white p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-base font-bold">2. 销售明细</h2><p className="mt-1 text-xs text-[#667085]">参考售价仅用于默认值；库存不足可以保存草稿，但会明确标记风险。</p></div>
          <Button onClick={addRow} disabled={pending}><IconPlus aria-hidden size={17} />添加明细</Button>
        </div>
        {errorFor("items") ? <p id="sales-order-items-error" className="text-xs text-[#c62828]">{errorFor("items")}</p> : null}

        <div className="grid gap-3">
          {rows.map((row, index) => {
            const sku = skuForRow(row);
            const quantity = positiveIntegerPattern.test(row.quantity) ? Number(row.quantity) : 0;
            const shortage = sku ? Math.max(0, quantity - sku.availableQuantity) : 0;
            const subtotal = subtotals[index];
            const skuError = errorFor(`items.${index}.skuId`);
            const quantityError = errorFor(`items.${index}.quantity`);
            const priceError = errorFor(`items.${index}.transactionPrice`);
            const skuErrorId = `sales-order-item-${index}-sku-error`;
            const quantityErrorId = `sales-order-item-${index}-quantity-error`;
            const priceErrorId = `sales-order-item-${index}-price-error`;
            const normalizedSkuQuery = row.skuQuery.trim().toLocaleLowerCase("zh-CN");
            const visibleSkus = skus.filter((option) =>
              option.id === row.skuId ||
              !normalizedSkuQuery ||
              `${option.skuCode} ${option.name}`.toLocaleLowerCase("zh-CN").includes(normalizedSkuQuery),
            );
            return (
              <article
                key={row.clientId}
                data-testid="sales-order-item"
                className={`grid gap-3 rounded-lg border p-3.5 lg:grid-cols-[minmax(250px,2fr)_minmax(160px,1fr)_110px_130px_120px_44px] lg:items-start ${shortage > 0 ? "border-[#edb1b1] bg-[#fff8f8]" : "border-[#e4e7ec]"}`}
              >
                <div className="grid gap-1.5 text-xs font-semibold text-[#475467] lg:col-span-1">
                  <span>SKU</span>
                  <input aria-label="搜索 SKU" type="search" value={row.skuQuery} onChange={(event) => updateRow(row.clientId, { skuQuery: event.target.value })} placeholder="按编码或名称搜索" className={controlClass} />
                  <select aria-label="SKU" value={row.skuId} onChange={(event) => selectSku(row, event.target.value)} aria-invalid={Boolean(skuError)} aria-describedby={skuError ? skuErrorId : undefined} className={controlClass}>
                    <option value="">请选择 SKU</option>
                    {row.fallbackSku && !skuById.has(row.fallbackSku.id) ? <option value={row.fallbackSku.id}>{row.fallbackSku.skuCode} · {row.fallbackSku.name}（当前不可用）</option> : null}
                    {visibleSkus.map((option) => <option key={option.id} value={option.id}>{option.skuCode} · {option.name}</option>)}
                  </select>
                  {skuError ? <span id={skuErrorId} className="font-normal text-[#c62828]">{skuError}</span> : null}
                </div>
                <div className="grid min-h-11 content-center gap-1 rounded-[7px] bg-[#f7f9fb] px-3 text-xs">
                  {sku ? <><span className={shortage > 0 ? "font-semibold text-[#c62828]" : "font-semibold text-[#027a48]"}>当前可用量 {sku.availableQuantity} {sku.inventoryUnit}</span><span className="text-[#667085]">参考售价 {formatMoney(sku.referencePriceFen)}</span>{shortage > 0 ? <span className="font-semibold text-[#c62828]">缺少 {shortage} {sku.inventoryUnit}</span> : null}</> : <span className="text-[#98a2b3]">选择后显示可用量与参考售价</span>}
                </div>
                <label className="grid gap-1.5 text-xs font-semibold text-[#475467]">数量<input aria-label="数量" inputMode="numeric" value={row.quantity} onChange={(event) => updateRow(row.clientId, { quantity: event.target.value })} aria-invalid={Boolean(quantityError)} aria-describedby={quantityError ? quantityErrorId : undefined} className={controlClass} />{quantityError ? <span id={quantityErrorId} className="font-normal text-[#c62828]">{quantityError}</span> : null}</label>
                <label className="grid gap-1.5 text-xs font-semibold text-[#475467]">成交价<input aria-label="成交价" inputMode="decimal" value={row.transactionPrice} onChange={(event) => updateRow(row.clientId, { transactionPrice: event.target.value })} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? priceErrorId : undefined} className={controlClass} />{priceError ? <span id={priceErrorId} className="font-normal text-[#c62828]">{priceError}</span> : null}</label>
                <div className="grid min-h-11 content-center gap-1 text-right"><span className="text-xs text-[#667085]">小计</span><strong className="tabular-nums">{subtotal === undefined ? "—" : formatMoney(subtotal)}</strong></div>
                <Button aria-label="删除明细" size="icon" variant="ghost" disabled={pending || rows.length === 1} onClick={() => { setDirty(true); setRows((current) => current.filter(({ clientId }) => clientId !== row.clientId)); }} className="text-[#c62828]"><IconTrash aria-hidden size={18} /></Button>
              </article>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-[#e4e7ec] pt-4 text-[13px] text-[#667085]"><span>明细 {rows.length} 行</span><span>成交总额 <strong className="ml-2 text-xl text-[#17202a] tabular-nums">{totalAmountFen === undefined ? "—" : formatMoney(totalAmountFen)}</strong></span></div>
      </section>

      <div className="sticky bottom-3 z-10 flex items-center justify-end gap-2.5 rounded-lg border border-[#e4e7ec] bg-white/95 p-3 shadow-[0_10px_30px_rgba(16,24,40,0.1)] backdrop-blur max-md:fixed max-md:right-0 max-md:bottom-0 max-md:left-0 max-md:rounded-none">
        <Link href="/sales-orders" className="mr-auto inline-flex min-h-11 items-center justify-center rounded-[7px] px-4 text-sm font-semibold text-[#475467] hover:bg-[#f2f4f7] max-md:hidden">返回销售单列表</Link>
        <span className="text-xs text-[#667085] max-sm:hidden">草稿尚未预占库存；保存后可继续核对并确认。</span>
        {draft ? <Link href={`/sales-orders/${encodeURIComponent(draft.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">查看并确认</Link> : null}
        <Button variant="primary" type="submit" disabled={pending}>{pending ? "保存中…" : "保存草稿"}</Button>
      </div>
    </form>
  );
}
